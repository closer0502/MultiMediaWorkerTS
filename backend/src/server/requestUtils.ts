import path from 'node:path';

export function createSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `session-${Date.now()}-${randomPart}`;
}

export function createSafeFileName(name: string) {
  const baseName = path.basename(name);
  const sanitized = baseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  if (!sanitized || sanitized.startsWith('.')) {
    const timestamp = Date.now();
    return `file_${timestamp}`;
  }
  return sanitized.slice(0, 200);
}

export function createRequestPhase(
  task: string,
  files: Array<{ id?: string }>,
  options: { dryRun?: boolean; debug?: boolean } = {}
) {
  const now = new Date().toISOString();
  const meta: Record<string, any> = {
    taskPreview: task.slice(0, 120),
    fileCount: files.length,
    dryRun: Boolean(options.dryRun),
    debug: Boolean(options.debug)
  };
  return {
    id: 'request',
    title: 'Receive request',
    status: 'success',
    startedAt: now,
    finishedAt: now,
    error: null,
    logs: [],
    meta
  };
}

export function parseBoolean(value: unknown) {
  const normalized = getFirstQueryValue(value);
  if (normalized === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(normalized.toLowerCase());
}

export function parseDebugMode(value: unknown) {
  const normalized = getFirstQueryValue(value);
  if (!normalized) {
    return { enabled: false, includeRaw: false };
  }
  const lower = normalized.toLowerCase();
  return {
    enabled: ['1', 'true', 'yes', 'on', 'verbose', 'full'].includes(lower),
    includeRaw: lower === 'verbose' || lower === 'full'
  };
}

export function getFirstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value);
}
