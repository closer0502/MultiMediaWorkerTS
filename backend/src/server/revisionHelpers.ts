import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { AgentRequest } from '../agent/index.js';

type RevisionRecord = Record<string, any>;

export async function prepareRevisionFiles(baseRecord: RevisionRecord): Promise<AgentRequest['files']> {
  const collected: NonNullable<AgentRequest['files']> = [];
  const seen = new Set<string>();

  const inputs = Array.isArray(baseRecord.uploadedFiles) ? baseRecord.uploadedFiles : [];
  for (let index = 0; index < inputs.length; index += 1) {
    const descriptor = await createRevisionFileDescriptor(inputs[index], `input-${index}`, seen);
    if (descriptor) {
      collected.push(descriptor);
    }
  }

  const outputs = Array.isArray(baseRecord.result?.resolvedOutputs) ? baseRecord.result.resolvedOutputs : [];
  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index];
    if (!output || !output.exists) {
      continue;
    }
    const descriptor = await createRevisionFileDescriptor(
      {
        id: `output-${index}`,
        originalName: output.absolutePath
          ? path.basename(output.absolutePath)
          : path.basename(output.path || `output-${index}`),
        absolutePath: output.absolutePath || output.path,
        size: typeof output.size === 'number' ? output.size : undefined,
        mimeType: undefined
      },
      `output-${index}`,
      seen
    );
    if (descriptor) {
      collected.push(descriptor);
    }
  }

  return collected;
}

export function composeRevisionTask(originalTask: string, complaint: string, historyRecords: RevisionRecord[]) {
  const baseTask = originalTask || 'Original request is not recorded.';
  const historyTable = buildRevisionHistoryTable(historyRecords || [], complaint);

  return [
    'This is a revision request.',
    `Original request:\n${baseTask}`,
    'Previous revision history:',
    historyTable,
    'Produce a new deliverable that addresses the issues noted. You may reference previous output files if helpful.'
  ].join('\n\n');
}

async function createRevisionFileDescriptor(
  source: any,
  fallbackId: string,
  seen: Set<string>
): Promise<AgentRequest['files'][number] | null> {
  const targetPath = typeof source?.absolutePath === 'string' ? source.absolutePath : '';
  if (!targetPath) {
    return null;
  }
  const absolutePath = path.resolve(targetPath);
  if (seen.has(absolutePath)) {
    return null;
  }
  if (!existsSync(absolutePath)) {
    return null;
  }

  let stat;
  try {
    stat = await fs.stat(absolutePath);
  } catch {
    return null;
  }
  if (!stat.isFile()) {
    return null;
  }

  const descriptor: NonNullable<AgentRequest['files']>[number] = {
    id: typeof source.id === 'string' && source.id ? source.id : fallbackId,
    originalName:
      typeof source.originalName === 'string' && source.originalName
        ? source.originalName
        : path.basename(absolutePath),
    absolutePath,
    size: typeof source.size === 'number' ? source.size : stat.size,
    mimeType: typeof source.mimeType === 'string' && source.mimeType ? source.mimeType : guessMimeType(absolutePath)
  };

  seen.add(absolutePath);
  return descriptor;
}

function buildRevisionHistoryTable(historyRecords: RevisionRecord[], latestComplaint: string) {
  if (!Array.isArray(historyRecords) || historyRecords.length === 0) {
    return 'No history yet.';
  }
  const header = '| Version | Outputs | Complaint | Commands |\n| --- | --- | --- | --- |';
  const revisionCount = historyRecords.reduce(
    (count, record) => (record && record.parentSessionId ? count + 1 : count),
    0
  );
  let remainingRevisions = revisionCount;

  const rows = historyRecords.map((record, index) => {
    const hasParent = Boolean(record?.parentSessionId);
    let versionLabel;
    if (hasParent) {
      const label = `Rev.${remainingRevisions}`;
      remainingRevisions -= 1;
      versionLabel = index === 0 ? `${label} (latest)` : label;
    } else {
      versionLabel = 'Original';
    }

    const outputs = summarizeOutputsForTable(record);
    const complaintText =
      index === 0 && typeof latestComplaint === 'string' && latestComplaint.trim()
        ? latestComplaint.trim()
        : extractComplaintMessage(record);
    const complaint = formatTableCell(complaintText || 'N/A');
    const commands = summarizeCommandsForTable(record);

    return `| ${formatTableCell(versionLabel)} | ${outputs} | ${complaint} | ${commands} |`;
  });

  return `${header}\n${rows.join('\n')}`;
}

function extractComplaintMessage(record: RevisionRecord) {
  if (!record) {
    return '';
  }
  const direct = typeof record?.complaintContext?.message === 'string' ? record.complaintContext.message.trim() : '';
  if (direct) {
    return direct;
  }
  const complaints = Array.isArray(record?.complaints) ? record.complaints : [];
  for (let index = complaints.length - 1; index >= 0; index -= 1) {
    const entry = complaints[index];
    if (entry && typeof entry.message === 'string' && entry.message.trim()) {
      return entry.message.trim();
    }
  }
  return '';
}

function summarizeOutputsForTable(record: RevisionRecord) {
  const outputs = record?.result?.resolvedOutputs;
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return 'N/A';
  }
  const lines = outputs.map((item, index) => {
    const fileName = item?.absolutePath
      ? path.basename(item.absolutePath)
      : item?.path
      ? path.basename(item.path)
      : `output-${index + 1}`;
    const description = typeof item?.description === 'string' && item.description ? ` - ${item.description}` : '';
    return `${index + 1}. ${fileName}${description}`;
  });
  return formatTableCell(lines.join('\n'));
}

function summarizeCommandsForTable(record: RevisionRecord) {
  const plan = record?.plan ?? record?.rawPlan ?? null;
  const result = record?.result ?? null;
  const summary = summarizeCommandHistory(result, plan);
  const lines = summary.split('\n').filter(Boolean);
  if (lines.length > 3) {
    const extra = lines.length - 3;
    return formatTableCell([...lines.slice(0, 3), `...and ${extra} more`].join('\n'));
  }
  return formatTableCell(lines.join('\n'));
}

function summarizeCommandHistory(result: RevisionRecord, plan: RevisionRecord) {
  if (result && Array.isArray(result.steps) && result.steps.length > 0) {
    return result.steps
      .map((step, index) => {
        const command = typeof step.command === 'string' && step.command ? step.command : '(unknown)';
        const args = Array.isArray(step.arguments) ? step.arguments.filter((arg) => typeof arg === 'string') : [];
        const commandLine = [command, ...args].join(' ').trim();
        const status = step.status || 'unknown';
        const infoParts = [];
        if (typeof step.exitCode === 'number') {
          infoParts.push(`exit=${step.exitCode}`);
        }
        if (step.timedOut) {
          infoParts.push('timed_out');
        }
        if (step.skipReason) {
          infoParts.push(`skip=${step.skipReason}`);
        }
        const info = infoParts.length ? ` (${infoParts.join(', ')})` : '';
        return `${index + 1}. [${status}] ${commandLine}${info}`;
      })
      .join('\n');
  }

  if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
    return plan.steps
      .map((step, index) => {
        const command = typeof step.command === 'string' && step.command ? step.command : '(unknown)';
        const args = Array.isArray(step.arguments) ? step.arguments.filter((arg) => typeof arg === 'string') : [];
        const commandLine = [command, ...args].join(' ').trim();
        const reasoning = typeof step.reasoning === 'string' && step.reasoning ? ` - ${step.reasoning}` : '';
        return `${index + 1}. ${commandLine}${reasoning}`;
      })
      .join('\n');
  }

  return 'No previous command history recorded.';
}

function formatTableCell(value: string) {
  if (!value) {
    return 'N/A';
  }
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function guessMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
      return 'audio/mp4';
    case '.flac':
      return 'audio/flac';
    default:
      return undefined;
  }
}
