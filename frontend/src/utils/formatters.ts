import { STATUS_LABELS } from '../constants/app';
import { MESSAGES } from '../i18n/messages';

const FORMATTER_MESSAGES = MESSAGES.formatters;

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function quoteArgument(argument) {
  if (!argument) {
    return '""';
  }
  if (/[\s"]/u.test(argument)) {
    return `"${argument.replace(/"/g, '\\"')}"`;
  }
  return argument;
}

export function statusLabel(status) {
  if (!status) {
    return FORMATTER_MESSAGES.unknownStatus;
  }
  if (STATUS_LABELS[status]) {
    return STATUS_LABELS[status];
  }
  if (status === 'in_progress') {
    return FORMATTER_MESSAGES.inProgress;
  }
  if (status === 'pending') {
    return FORMATTER_MESSAGES.pending;
  }
  return status;
}

export function formatPhaseMetaKey(key) {
  const mapping = FORMATTER_MESSAGES.phaseMetaKeys || {};
  return mapping[key] || key;
}

export function formatPhaseMetaValue(value) {
  if (typeof value === 'boolean') {
    return value ? FORMATTER_MESSAGES.booleanTrue : FORMATTER_MESSAGES.booleanFalse;
  }
  return String(value);
}

export function formatDateTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function deriveDownloadName(item) {
  if (!item) {
    return undefined;
  }
  const source = item.publicPath || item.absolutePath || item.path;
  if (!source) {
    return undefined;
  }
  const parts = String(source)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

export function resolvePublicHref(publicPath) {
  if (!publicPath) {
    return '';
  }
  const normalized = String(publicPath).trim();
  if (!normalized) {
    return '';
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    return normalized;
  }
  const cleaned = normalized.replace(/\\/g, '/').replace(/^\.\//, '');
  if (cleaned.startsWith('/files/')) {
    return cleaned;
  }
  if (cleaned.startsWith('/')) {
    return cleaned;
  }
  if (cleaned.startsWith('files/')) {
    return `/${cleaned}`;
  }
  return `/files/${cleaned}`;
}

const IMAGE_PREVIEW_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff']);
const AUDIO_PREVIEW_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
const VIDEO_PREVIEW_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v', 'mkv']);

export function determinePreviewType(filename) {
  const extension = extractFileExtension(filename);
  if (!extension) {
    return null;
  }
  if (IMAGE_PREVIEW_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (AUDIO_PREVIEW_EXTENSIONS.has(extension)) {
    return 'audio';
  }
  if (VIDEO_PREVIEW_EXTENSIONS.has(extension)) {
    return 'video';
  }
  return null;
}

export function extractFileExtension(filename) {
  if (!filename) {
    return '';
  }
  const withoutQuery = String(filename).split('?')[0].split('#')[0];
  const lastDot = withoutQuery.lastIndexOf('.');
  if (lastDot === -1) {
    return '';
  }
  return withoutQuery.slice(lastDot + 1).toLowerCase();
}
