import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROGRESS_ROTATION_MS, PROGRESS_STEPS } from '../constants/app';
import { MESSAGES } from '../i18n/messages';

const INITIAL_HISTORY = [];
const LOG_LINE_LIMIT = 500;

/**
 * Create a stable identity string for a File-like object.
 * @param {File|{name?: string, size?: number, lastModified?: number}} file
 * @returns {string}
 */
function createFileIdentityKey(file) {
  if (!file || typeof file !== 'object') {
    return 'unknown';
  }
  const name = typeof file.name === 'string' ? file.name : '';
  const size = typeof file.size === 'number' ? file.size : 0;
  const lastModified = typeof file.lastModified === 'number' ? file.lastModified : 0;
  return `${name}::${size}::${lastModified}`;
}

/**
 * Build an instruction string for retrying after a failed task.
 * @param {string} originalTask
 * @param {{message?: string, payload?: Record<string, any>}} failureContext
 * @returns {string}
 */
function normalizeOriginalTask(taskText) {
  const trimmed = typeof taskText === 'string' ? taskText.trim() : '';
  if (!trimmed) {
    return '（元の依頼内容を取得できませんでした）';
  }
  const header = '元の依頼内容:';
  if (trimmed.startsWith('エラー再編集リクエストです。') && trimmed.includes(header)) {
    const afterHeader = trimmed.slice(trimmed.indexOf(header) + header.length).trim();
    if (!afterHeader) {
      return trimmed;
    }
    const separatorIndex = afterHeader.indexOf('\n\n');
    const candidate = (separatorIndex !== -1 ? afterHeader.slice(0, separatorIndex) : afterHeader).trim();
    return candidate || trimmed;
  }
  return trimmed;
}

export function summarizeFailureContext(failureContext) {
  const failureLines = [];
  const failureMessage = typeof failureContext?.message === 'string' ? failureContext.message.trim() : '';
  if (failureMessage) {
    failureLines.push(`最新の失敗メッセージ:\n${failureMessage}`);
  }
  const payload = failureContext?.payload;
  const detail = typeof payload?.detail === 'string' ? payload.detail.trim() : '';
  if (detail && detail !== failureMessage) {
    failureLines.push(`追加情報:\n${detail}`);
  }

  const responseText = typeof payload?.responseText === 'string' ? payload.responseText.trim() : '';
  if (responseText) {
    failureLines.push(`LLM 応答:\n${truncateForPrompt(responseText, 1200)}`);
  }

  const result = payload?.result;
  const workflowSummary = formatWorkflowPhases(Array.isArray(payload?.phases) ? payload.phases : null);
  if (workflowSummary) {
    failureLines.push(`ワークフロー:\n${workflowSummary}`);
  }

  const commandPlanSummary = formatCommandPlan(payload?.plan ?? payload?.rawPlan ?? null);
  if (commandPlanSummary) {
    failureLines.push(`コマンドプラン:\n${commandPlanSummary}`);
  }

  const failingStep = findFirstFailingStep(Array.isArray(result?.steps) ? result.steps : null);
  if (failingStep) {
    const exitInfo = [];
    if (typeof failingStep.exitCode === 'number') {
      exitInfo.push(`exitCode=${failingStep.exitCode}`);
    }
    if (failingStep.timedOut) {
      exitInfo.push('timed_out=true');
    }
    const infoSuffix = exitInfo.length ? ` (${exitInfo.join(', ')})` : '';
    const commandLine = formatCommandLineFromStep(failingStep);
    failureLines.push(`失敗したコマンド: ${commandLine}${infoSuffix}`);
    const stderr = typeof failingStep.stderr === 'string' ? failingStep.stderr.trim() : '';
    if (stderr) {
      failureLines.push(`stderr (抜粋):\n${truncateForPrompt(stderr, 1200)}`);
    }
    const stdout = typeof failingStep.stdout === 'string' ? failingStep.stdout.trim() : '';
    if (stdout) {
      failureLines.push(`stdout (抜粋):\n${truncateForPrompt(stdout, 600)}`);
    }
  }

  const aggregatedStderr = typeof result?.stderr === 'string' ? result.stderr.trim() : '';
  if (aggregatedStderr) {
    failureLines.push(`集約 stderr:\n${truncateForPrompt(aggregatedStderr, 1200)}`);
  }

  if (failureLines.length === 0) {
    failureLines.push('エラーの詳細は取得できませんでした。');
  }

  return failureLines.join('\n\n');
}

export function buildErrorRetryTask(originalTask, failureContext) {
  const baseTask = normalizeOriginalTask(originalTask);
  const previousHistory = Array.isArray(failureContext?.history) ? failureContext.history : [];
  const attemptLabel =
    typeof failureContext?.attemptLabel === 'string'
      ? failureContext.attemptLabel
      : typeof failureContext?.attemptNumber === 'number'
      ? `${failureContext.attemptNumber}回目`
      : '最新';

  const currentSummary = summarizeFailureContext(failureContext);
  const historyList = [];
  const seenLabels = new Set();

  const pushEntry = (label, summary) => {
    if (!label || !summary || seenLabels.has(label)) {
      return;
    }
    seenLabels.add(label);
    historyList.push([label, summary]);
  };

  pushEntry(attemptLabel, currentSummary);

  for (const entry of previousHistory) {
    if (!entry) {
      continue;
    }
    const label =
      typeof entry.label === 'string'
        ? entry.label
        : typeof entry.attemptNumber === 'number'
        ? `${entry.attemptNumber}回目`
        : null;
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
    pushEntry(label, summary);
  }

  const historyBlock = formatErrorHistory(historyList);

  return [
    'エラー再編集リクエストです。',
    '',
    '元の依頼内容:',
    baseTask,
    '',
    'エラー履歴:',
    historyBlock,
    '',
    '上記の問題を解消し、正しい成果物を生成してください。必要に応じて前回の成果物ファイルやログを参照しても構いません。'
  ].join('\n');
}

/**
 * Render failure history as a readable block without escaping quotes inside summaries.
 * @param {Array<[string, string]>} historyList
 * @returns {string}
 */
function formatErrorHistory(historyList) {
  if (!Array.isArray(historyList) || historyList.length === 0) {
    return '{}';
  }
  const lines = ['{'];
  historyList.forEach(([label, summary], index) => {
    const normalizedLabel = typeof label === 'string' && label ? label : `#${index + 1}`;
    const normalizedSummary =
      typeof summary === 'string' && summary.trim() ? summary.trim() : '(詳細なし)';
    lines.push(`  "${normalizedLabel}": |`);
    normalizedSummary.split(/\r?\n/).forEach((line) => {
      lines.push(`    ${line}`);
    });
    if (index < historyList.length - 1) {
      lines.push('');
    }
  });
  lines.push('}');
  return lines.join('\n');
}

/**
 * @param {Array<Record<string, any>>|null} steps
 * @returns {Record<string, any>|null}
 */
function findFirstFailingStep(steps) {
  if (!Array.isArray(steps)) {
    return null;
  }
  return (
    steps.find(
      (step) =>
        step &&
        step.status === 'executed' &&
        (step.timedOut || (typeof step.exitCode === 'number' && step.exitCode !== 0))
    ) || null
  );
}

/**
 * @param {Record<string, any>} step
 * @returns {string}
 */
function formatCommandLineFromStep(step) {
  if (!step) {
    return '(不明なコマンド)';
  }
  const command = typeof step.command === 'string' && step.command ? step.command : '(不明なコマンド)';
  const args = Array.isArray(step.arguments)
    ? step.arguments.filter((arg) => typeof arg === 'string' && arg.trim())
    : [];
  return [command, ...args].join(' ').trim();
}

/**
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
function truncateForPrompt(value, maxLength = 1200) {
  if (typeof value !== 'string') {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…(省略)`;
}

/**
 * @param {Array<Record<string, any>>|null} phases
 * @returns {string}
 */
function formatWorkflowPhases(phases) {
  if (!Array.isArray(phases) || phases.length === 0) {
    return '';
  }
  const lines = phases.map((phase) => {
    const title = typeof phase?.title === 'string' && phase.title ? phase.title : phase?.id || '(不明なフェーズ)';
    const status = phase?.status || 'unknown';
    const segments = [`[${status}] ${title}`];

    const metaSummary = summarizePhaseMeta(phase?.meta);
    if (metaSummary) {
      segments.push(metaSummary);
    }

    const errorMessage =
      typeof phase?.error?.message === 'string' && phase.error.message ? truncateForPrompt(phase.error.message.trim(), 200) : '';
    if (errorMessage) {
      segments.push(`error: ${errorMessage}`);
    }

    const logCount = Array.isArray(phase?.logs) ? phase.logs.length : 0;
    if (logCount > 0) {
      segments.push(`logs: ${logCount}`);
    }

    return `- ${segments.join(' / ')}`;
  });
  return lines.join('\n');
}

/**
 * @param {Record<string, any>} meta
 * @returns {string}
 */
function summarizePhaseMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return '';
  }
  const parts = Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => {
      const display = truncateForPrompt(stringifyMetaValue(value), 120);
      return `${key}=${display}`;
    });
  return parts.length ? parts.join(', ') : '';
}

/**
 * @param {any} value
 * @returns {string}
 */
function stringifyMetaValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyMetaValue(item)).join('/');
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return '';
}

/**
 * @param {Record<string, any>|null} plan
 * @returns {string}
 */
function formatCommandPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return '';
  }
  const lines = [];
  const overview = typeof plan.overview === 'string' ? plan.overview.trim() : '';
  if (overview) {
    lines.push(`概要: ${truncateForPrompt(overview, 240)}`);
  }
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  if (steps.length === 0) {
    return lines.length ? lines.join('\n') : '';
  }
  const stepLines = steps.map((step, index) => {
    const commandLine = formatCommandLineFromStep(step);
    const reasoning = typeof step?.reasoning === 'string' && step.reasoning.trim()
      ? ` — 理由: ${truncateForPrompt(step.reasoning.trim(), 200)}`
      : '';
    const outputs = describePlannedOutputs(Array.isArray(step?.outputs) ? step.outputs : []);
    const segments = [`${index + 1}. ${commandLine}${reasoning}`];
    if (outputs) {
      segments.push(`出力: ${outputs}`);
    }
    return segments.join(' / ');
  });
  lines.push(...stepLines);
  const followUp = typeof plan.followUp === 'string' ? plan.followUp.trim() : '';
  if (followUp) {
    lines.push(`追加メモ: ${truncateForPrompt(followUp, 200)}`);
  }
  return lines.join('\n');
}

/**
 * @param {Array<Record<string, any>>} outputs
 * @returns {string}
 */
function describePlannedOutputs(outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return '';
  }
  const entries = outputs
    .slice(0, 3)
    .map((entry) => {
      const path = typeof entry?.path === 'string' ? entry.path : '';
      const description = typeof entry?.description === 'string' ? entry.description : '';
      const combined = [path, description].filter(Boolean).join(' - ');
      return truncateForPrompt(combined || '(不明な出力)', 160);
    });
  const suffix = outputs.length > 3 ? ` …他${outputs.length - 3}件` : '';
  return `${entries.join(', ')}${suffix}`;
}

export function useTaskWorkflow() {
  const [task, setTask] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(INITIAL_HISTORY);
  const [planStatus, setPlanStatus] = useState('idle');
  const [planError, setPlanError] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [showDebugOptions, setShowDebugOptions] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [complaintText, setComplaintText] = useState('');
  const [complaintError, setComplaintError] = useState('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const [liveLogs, setLiveLogs] = useState([]);
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);
  const logChannelRef = useRef('');
  const logChunkBufferRef = useRef({ stdout: '', stderr: '' });
  const workflowMessages = MESSAGES.workflow;
  const logMessages = workflowMessages.logs;
  const validationMessages = workflowMessages.validation;
  const errorMessages = workflowMessages.errors;
  const helperMessages = workflowMessages.helper;

  useEffect(() => {
    if (!isSubmitting) {
      setProgressStage(0);
      return undefined;
    }

    setProgressStage(0);
    const timer = setInterval(() => {
      setProgressStage((prev) => {
        if (prev >= PROGRESS_STEPS.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, PROGRESS_ROTATION_MS);
    return () => clearInterval(timer);
  }, [isSubmitting]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const { body } = document;
    if (!body) {
      return undefined;
    }
    body.classList.toggle('modal-open', isSubmitting);
    return () => {
      body.classList.remove('modal-open');
    };
  }, [isSubmitting]);

  const appendLogLines = useCallback((lines) => {
    if (!Array.isArray(lines) || lines.length === 0) {
      return;
    }
    setLiveLogs((prev) => {
      const merged = [...prev, ...lines];
      if (merged.length > LOG_LINE_LIMIT) {
        return merged.slice(merged.length - LOG_LINE_LIMIT);
      }
      return merged;
    });
  }, []);

  const appendLogChunk = useCallback(
    (stream, text) => {
      if (!text) {
        return;
      }
      const key = stream === 'stderr' ? 'stderr' : 'stdout';
      const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const pending = logChunkBufferRef.current[key] || '';
      const combined = pending + normalized;
      const segments = combined.split('\n');
      logChunkBufferRef.current[key] = segments.pop() ?? '';
      if (segments.length === 0) {
        return;
      }
      const lines = segments.map((line) => {
        if (key === 'stderr') {
          return line.length > 0 ? `[stderr] ${line}` : '[stderr]';
        }
        return line;
      });
      appendLogLines(lines);
    },
    [appendLogLines]
  );

  const flushPendingChunks = useCallback(() => {
    const pending = logChunkBufferRef.current;
    const lines = [];
    if (pending.stdout) {
      lines.push(pending.stdout);
    }
    if (pending.stderr) {
      lines.push(`[stderr] ${pending.stderr}`);
    }
    logChunkBufferRef.current = { stdout: '', stderr: '' };
    if (lines.length > 0) {
      appendLogLines(lines);
    }
  }, [appendLogLines]);

  const stopLogStream = useCallback(() => {
    flushPendingChunks();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    logChannelRef.current = '';
    logChunkBufferRef.current = { stdout: '', stderr: '' };
  }, [flushPendingChunks]);

  const startLogStream = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      logChannelRef.current = '';
      logChunkBufferRef.current = { stdout: '', stderr: '' };
      setLiveLogs([]);
      return '';
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const channelId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const source = new EventSource(`/api/task-logs?channel=${encodeURIComponent(channelId)}`);
    logChannelRef.current = channelId;
    logChunkBufferRef.current = { stdout: '', stderr: '' };
    setLiveLogs([]);

    const parseEventData = (event) => {
      if (!event?.data) {
        return {};
      }
      try {
        return JSON.parse(event.data);
      } catch (error) {
        return {};
      }
    };

    const handleInfo = (event) => {
      const payload = parseEventData(event);
      if (payload?.message) {
        appendLogLines([payload.message]);
      }
    };

    const handleError = (event) => {
      const payload = parseEventData(event);
      if (payload?.message) {
        appendLogLines([`[error] ${payload.message}`]);
      }
    };

    const handleCommandStart = (event) => {
      const payload = parseEventData(event);
      const index = typeof payload?.index === 'number' ? payload.index + 1 : null;
      const commandLine =
        typeof payload?.commandLine === 'string' && payload.commandLine.trim().length > 0
          ? payload.commandLine
          : typeof payload?.command === 'string'
            ? payload.command
            : '';
      const label = index ? `[${index}] ` : '';
      const prefix = commandLine ? `$ ${commandLine}` : logMessages.commandStart;
      appendLogLines([`${label}${prefix}`]);
    };

    const handleCommandEnd = (event) => {
      const payload = parseEventData(event);
      const index = typeof payload?.index === 'number' ? payload.index + 1 : null;
      const timedOut = Boolean(payload?.timedOut);
      const exitCode = typeof payload?.exitCode === 'number' ? payload.exitCode : payload?.exitCode;
      let suffix;
      if (timedOut) {
        suffix = logMessages.timeout;
      } else if (exitCode === null || exitCode === undefined) {
        suffix = logMessages.exitCodeUnknown;
      } else {
        suffix = `${logMessages.exitCodePrefix}${exitCode}`;
      }
      const label = index ? `[${index}] ` : '';
      appendLogLines([`${label}${suffix}`]);
    };

    const handleCommandSkip = (event) => {
      const payload = parseEventData(event);
      const index = typeof payload?.index === 'number' ? payload.index + 1 : null;
      const reason = payload?.reason || 'skipped';
      const commandLine =
        typeof payload?.commandLine === 'string' && payload.commandLine.trim().length > 0
          ? payload.commandLine
          : typeof payload?.command === 'string'
            ? payload.command
            : '';
      let reasonText;
      switch (reason) {
        case 'dry_run':
          reasonText = logMessages.skipDryRun;
          break;
        case 'previous_step_failed':
          reasonText = logMessages.skipPreviousFailed;
          break;
        case 'no_op_command':
          reasonText = logMessages.skipNoCommand;
          break;
        default:
          reasonText = reason
            ? `${logMessages.skipFallbackPrefix}${reason}${logMessages.skipFallbackSuffix}`
            : logMessages.noAdditionalInfo;
          break;
      }
      const label = index ? `[${index}] ` : '';
      const suffix = commandLine ? `: ${commandLine}` : '';
      appendLogLines([`${label}${reasonText}${suffix}`]);
    };

    const handleLog = (event) => {
      const payload = parseEventData(event);
      if (!payload) {
        return;
      }
      const stream = payload.stream === 'stderr' ? 'stderr' : 'stdout';
      const text = typeof payload.text === 'string' ? payload.text : '';
      appendLogChunk(stream, text);
    };

    source.addEventListener('info', handleInfo);
    source.addEventListener('error', handleError);
    source.addEventListener('command_start', handleCommandStart);
    source.addEventListener('command_end', handleCommandEnd);
    source.addEventListener('command_skip', handleCommandSkip);
    source.addEventListener('log', handleLog);
    source.addEventListener('end', () => {
      flushPendingChunks();
    });
    source.onerror = () => {
      flushPendingChunks();
    };

    eventSourceRef.current = source;
    return channelId;
  }, [appendLogChunk, appendLogLines, flushPendingChunks]);

  useEffect(
    () => () => {
      stopLogStream();
    },
    [stopLogStream]
  );

  const resetForm = useCallback(() => {
    setTask('');
    setSelectedFiles([]);
    setPlanStatus('idle');
    setPlanError(null);
    setLastRequest(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleFilesSelected = useCallback((files) => {
    setSelectedFiles((previous) => {
      if (!Array.isArray(files) || files.length === 0) {
        return previous;
      }
      const existingKeys = new Set(previous.map((file) => createFileIdentityKey(file)));
      const nextFiles = [...previous];
      let appended = false;
      for (const file of files) {
        const key = createFileIdentityKey(file);
        if (existingKeys.has(key)) {
          continue;
        }
        existingKeys.add(key);
        nextFiles.push(file);
        appended = true;
      }
      return appended ? nextFiles : previous;
    });
  }, []);

  const handleClearFiles = useCallback(() => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const submitTaskRequest = useCallback(
    async ({ taskInput, files, options }) => {
      const trimmedTask = typeof taskInput === 'string' ? taskInput.trim() : '';
      const fileList = Array.isArray(files) ? [...files] : [];
      const normalizedOptions = {
        debugEnabled: Boolean(options?.debugEnabled),
        dryRun: Boolean(options?.dryRun)
      };

      if (!trimmedTask) {
        const validationMessage = validationMessages.emptyTask;
        setError(validationMessage);
        setPlanStatus('failed');
        setPlanError({
          message: validationMessage,
          recordedAt: new Date().toISOString(),
          payload: null,
          request: {
            task: trimmedTask,
            files: fileList,
            options: normalizedOptions
          }
        });
        return false;
      }

      setIsSubmitting(true);
      setError('');
      setPlanStatus('running');
      setPlanError(null);

      const requestSnapshot = {
        task: trimmedTask,
        files: fileList,
        options: normalizedOptions
      };
      setLastRequest(requestSnapshot);

      const params = new URLSearchParams();
      const logChannel = startLogStream();
      if (logChannel) {
        params.append('logChannel', logChannel);
      }
      if (normalizedOptions.debugEnabled) {
        params.append('debug', 'verbose');
      }
      if (normalizedOptions.dryRun) {
        params.append('dryRun', 'true');
      }

      const url = `/api/tasks${params.toString() ? `?${params.toString()}` : ''}`;
      const formData = new FormData();
      formData.append('task', trimmedTask);
      fileList.forEach((file) => {
        formData.append('files', file);
      });

      const submittedAt = new Date().toISOString();
      const pendingUploads = fileList.map((file, index) => ({
        id: `local-${index}`,
        originalName: file.name,
        size: file.size,
        mimeType: file.type
      }));

      try {
        const response = await fetch(url, {
          method: 'POST',
          body: formData
        });

        const payload = await response.json().catch(() => null);
        const recordedAt = payload?.submittedAt || submittedAt;

        if (!response.ok) {
          const message = payload?.error || errorMessages.submitGeneric;
          const detail = payload?.detail || message;
          setError(message);
          setPlanStatus('failed');
          const failureContext = {
            message: detail,
            payload,
            recordedAt,
            request: requestSnapshot
          };
          setPlanError(failureContext);
          if (payload) {
            setHistory((prev) => [
              {
                id: payload.sessionId || `error-${Date.now()}`,
                submittedAt: recordedAt,
                task: payload.task || trimmedTask,
                plan: payload.plan || null,
                rawPlan: payload.rawPlan ?? payload.plan ?? null,
                result: payload.result || null,
                phases: payload.phases || [],
                uploadedFiles: payload.uploadedFiles || pendingUploads,
                status: payload.status || 'failed',
                error: payload.detail || detail,
                debug: payload.debug || null,
                responseText: payload.responseText ?? null,
                parentSessionId: payload.parentSessionId ?? null,
                complaint: payload.complaint ?? null,
                requestOptions: {
                  debug: normalizedOptions.debugEnabled,
                  verbose: normalizedOptions.debugEnabled,
                  dryRun: normalizedOptions.dryRun
                }
              },
              ...prev
            ]);
          }
          return false;
        }

        if (!payload) {
          throw new Error(errorMessages.parseResponse);
        }

        const finalStatus = payload.status || 'success';
        const detailMessage = payload.detail || payload.error || '';

        setHistory((prev) => [
          {
            id: payload.sessionId,
            submittedAt: recordedAt,
            task: payload.task || trimmedTask,
            plan: payload.plan,
            rawPlan: payload.rawPlan ?? payload.plan ?? null,
            result: payload.result,
            phases: payload.phases || [],
            uploadedFiles: payload.uploadedFiles || pendingUploads,
            status: finalStatus,
            error: payload.detail || null,
            debug: payload.debug || null,
            responseText: payload.responseText ?? null,
            parentSessionId: payload.parentSessionId ?? null,
            complaint: payload.complaint ?? null,
            requestOptions: {
              debug: normalizedOptions.debugEnabled,
              verbose: normalizedOptions.debugEnabled,
              dryRun: normalizedOptions.dryRun
            }
          },
          ...prev
        ]);

        if (finalStatus === 'success') {
          setComplaintText('');
          setComplaintError('');
          setPlanStatus('succeeded');
          setPlanError(null);
          return true;
        }

        const failureMessage = detailMessage || errorMessages.executionFailed;
        setError(failureMessage);
        setPlanStatus('failed');
        setPlanError({
          message: failureMessage,
          payload,
          recordedAt,
          request: requestSnapshot
        });
        return false;
      } catch (submitError) {
        const message = submitError?.message || errorMessages.executionError;
        setError(message);
        const recordedAt = new Date().toISOString();
        setPlanStatus('failed');
        setPlanError({
          message,
          payload: null,
          recordedAt,
          request: requestSnapshot
        });
        return false;
      } finally {
        stopLogStream();
        setIsSubmitting(false);
      }
    },
    [startLogStream, stopLogStream, setHistory, setComplaintText, setComplaintError]
  );

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      await submitTaskRequest({
        taskInput: task,
        files: selectedFiles,
        options: {
          debugEnabled,
          dryRun
        }
      });
    },
    [task, selectedFiles, debugEnabled, dryRun, submitTaskRequest]
  );

  const handleRetryFromError = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    const snapshot = planError?.request || lastRequest;
    if (!snapshot || !snapshot.task) {
      return;
    }

    const previousFiles = Array.isArray(snapshot.files) ? [...snapshot.files] : [];
    const normalizedOptions = {
      debugEnabled: Boolean(snapshot.options?.debugEnabled),
      dryRun: Boolean(snapshot.options?.dryRun)
    };

    const retryTask = buildErrorRetryTask(snapshot.task, planError);
    setTask(retryTask);
    setSelectedFiles(previousFiles);
    setDebugEnabled(normalizedOptions.debugEnabled);
    setDryRun(normalizedOptions.dryRun);

    await submitTaskRequest({
      taskInput: retryTask,
      files: previousFiles,
      options: normalizedOptions
    });
  }, [
    isSubmitting,
    planError,
    lastRequest,
    submitTaskRequest,
    setSelectedFiles,
    setDebugEnabled,
    setDryRun,
    setTask
  ]);
  const latestEntry = useMemo(() => {
    if (isSubmitting) {
      return null;
    }
    return history[0] || null;
  }, [history, isSubmitting]);

  const latestOutputs = useMemo(() => {
    if (!latestEntry) {
      return [];
    }
    return latestEntry?.result?.resolvedOutputs || [];
  }, [latestEntry]);

  const handleComplaintSubmit = useCallback(async () => {
    const complaintValue = complaintText.trim();
    const baseSessionId = latestEntry?.id || '';
    const baseTask = latestEntry?.task || '';
    const hasOutputs = Array.isArray(latestOutputs) && latestOutputs.length > 0;

    if (!complaintValue) {
      setComplaintError(validationMessages.emptyComplaint);
      return;
    }
    if (!baseSessionId || !hasOutputs) {
      setComplaintError(validationMessages.noOutputs);
      return;
    }
    if (isSubmittingComplaint || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setIsSubmittingComplaint(true);
    setComplaintError('');

    const params = new URLSearchParams();
    const logChannel = startLogStream();
    if (logChannel) {
      params.append('logChannel', logChannel);
    }
    if (debugEnabled) {
      params.append('debug', 'verbose');
    }
    if (dryRun) {
      params.append('dryRun', 'true');
    }

    const url = `/api/revisions${params.toString() ? `?${params.toString()}` : ''}`;
    const submittedAt = new Date().toISOString();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: baseSessionId,
          complaint: complaintValue
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.error || errorMessages.revisionFailed;
        setComplaintError(message);
        if (payload) {
          const recordedAt = payload.submittedAt || submittedAt;
          setHistory((prev) => [
            {
              id: payload.sessionId || `revision-error-${Date.now()}`,
              submittedAt: recordedAt,
              task: payload.task || baseTask,
              plan: payload.plan || null,
              rawPlan: payload.rawPlan ?? payload.plan ?? null,
              result: payload.result || null,
              phases: payload.phases || [],
              uploadedFiles: payload.uploadedFiles || [],
              status: payload.status || 'failed',
              error: payload.detail || message,
              debug: payload.debug || null,
              responseText: payload.responseText ?? null,
              parentSessionId: payload.parentSessionId ?? baseSessionId,
              complaint: payload.complaint ?? complaintValue,
              requestOptions: {
                debug: debugEnabled,
                verbose: debugEnabled,
                dryRun
              }
            },
            ...prev
          ]);
        }
        return;
      }

      if (!payload) {
        throw new Error(errorMessages.parseEmpty);
      }

      const recordedAt = payload.submittedAt || submittedAt;
      setHistory((prev) => [
        {
          id: payload.sessionId,
          submittedAt: recordedAt,
          task: payload.task || baseTask,
          plan: payload.plan,
          rawPlan: payload.rawPlan ?? payload.plan ?? null,
          result: payload.result,
          phases: payload.phases || [],
          uploadedFiles: payload.uploadedFiles || [],
          status: payload.status || 'success',
          error: payload.detail || null,
          debug: payload.debug || null,
          responseText: payload.responseText ?? null,
          parentSessionId: payload.parentSessionId ?? baseSessionId,
          complaint: payload.complaint ?? complaintValue,
          requestOptions: {
            debug: debugEnabled,
            verbose: debugEnabled,
            dryRun
          }
        },
        ...prev
      ]);
      setComplaintText('');
    } catch (submitError) {
      setComplaintError(submitError.message);
    } finally {
      stopLogStream();
      setIsSubmitting(false);
      setIsSubmittingComplaint(false);
    }
  }, [
    complaintText,
    latestEntry,
    latestOutputs,
    debugEnabled,
    dryRun,
    isSubmitting,
    isSubmittingComplaint,
    startLogStream,
    stopLogStream
  ]);

  const complaintTextTrimmed = complaintText.trim();
  const canSubmitRevision = Boolean(!isSubmitting && latestEntry && latestOutputs.length > 0);
  const complaintButtonDisabled =
    isSubmitting || isSubmittingComplaint || !canSubmitRevision || complaintTextTrimmed.length === 0;
  const complaintHelperMessage = canSubmitRevision
    ? helperMessages.withOutputs
    : helperMessages.withoutOutputs;

  const handleComplaintChange = useCallback(
    (value) => {
      setComplaintText(value);
      if (complaintError) {
        setComplaintError('');
      }
    },
    [complaintError]
  );

  return {
    task,
    setTask,
    selectedFiles,
    handleFilesSelected,
    handleClearFiles,
    fileInputRef,
    isSubmitting,
    planStatus,
    planError,
    handleRetryFromError,
    error,
    history,
    debugEnabled,
    setDebugEnabled,
    showDebugOptions,
    setShowDebugOptions,
    dryRun,
    setDryRun,
    progressStage,
    handleSubmit,
    resetForm,
    latestEntry,
    latestOutputs,
    complaintText,
    complaintError,
    complaintButtonDisabled,
    complaintHelperMessage,
    canSubmitRevision,
    isSubmittingComplaint,
    handleComplaintSubmit,
    handleComplaintChange,
    setError,
    liveLogs
  };
}
