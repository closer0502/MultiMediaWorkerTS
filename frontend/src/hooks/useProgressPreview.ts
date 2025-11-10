import { useEffect, useMemo } from 'react';
import { PROGRESS_STEPS } from '../constants/app';
import { MESSAGES } from '../i18n/messages';

const DEFAULT_STAGE = 1;
const DEFAULT_LOGS = MESSAGES.progressPreview.defaultLogs;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parseStage = (params, maxStage) => {
  const value = Number.parseInt(params.get('stage') ?? '', 10);
  if (Number.isFinite(value)) {
    return clamp(value, 0, maxStage);
  }
  return clamp(DEFAULT_STAGE, 0, maxStage);
};

const parseLogs = (params) => {
  const raw = params.get('logs');
  if (!raw) {
    return DEFAULT_LOGS;
  }
  return raw
    .split('|')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

export function useProgressPreview() {
  const result = useMemo(() => {
    if (!import.meta.env.DEV) {
      return { enabled: false };
    }
    if (typeof window === 'undefined') {
      return { enabled: false };
    }

    const params = new URLSearchParams(window.location.search);
    if (!params.has('progressPreview')) {
      return { enabled: false };
    }

    const maxStage = Math.max(PROGRESS_STEPS.length - 1, 0);
    const stage = parseStage(params, maxStage);
    const logs = parseLogs(params);

    return {
      enabled: true,
      stage,
      logs
    };
  }, []);

  useEffect(() => {
    if (!result.enabled) {
      return undefined;
    }
    if (typeof document === 'undefined') {
      return undefined;
    }
    const { body } = document;
    if (!body) {
      return undefined;
    }
    body.classList.add('modal-open');
    return () => {
      body.classList.remove('modal-open');
    };
  }, [result.enabled]);

  return result;
}
