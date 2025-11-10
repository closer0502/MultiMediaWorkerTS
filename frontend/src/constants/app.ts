import { MESSAGES } from '../i18n/messages';

export const STATUS_LABELS = { ...MESSAGES.progress.statusLabels };

export const PROGRESS_STEPS = MESSAGES.progress.stages.map((stage) => ({ ...stage }));

export const PROGRESS_ROTATION_MS = 2400;
