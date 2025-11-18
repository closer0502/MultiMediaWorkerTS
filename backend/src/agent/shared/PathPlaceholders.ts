import path from 'node:path';

import type { PathPlaceholder } from './types.js';

type NormalizedPlaceholder = {
  name: string;
  token: string;
  absolutePath: string;
  compareKey: string;
  compareKeyWithSep: string;
  description?: string;
};

const WINDOWS = process.platform === 'win32';

export function formatPlaceholderToken(name: string): string {
  return `\${${name}}`;
}

export function maskPathWithPlaceholders(targetPath: string, placeholders?: PathPlaceholder[]): string {
  if (!targetPath) {
    return '';
  }
  const normalizedTarget = path.resolve(targetPath);
  const entries = normalizePlaceholders(placeholders);
  if (!entries.length) {
    return normalizedTarget;
  }
  const compareTarget = normalizeForComparison(normalizedTarget);
  for (const entry of entries) {
    if (compareTarget === entry.compareKey) {
      return entry.token;
    }
    if (compareTarget.startsWith(entry.compareKeyWithSep)) {
      const suffix = normalizedTarget.slice(entry.absolutePath.length);
      return `${entry.token}${suffix}`;
    }
  }
  return '[unmapped path]';
}

export function expandPlaceholdersInText(value: string, placeholders?: PathPlaceholder[]): string {
  if (!value || typeof value !== 'string') {
    return value;
  }
  const entries = normalizePlaceholders(placeholders);
  if (!entries.length) {
    return value;
  }
  let output = value;
  for (const entry of entries) {
    output = replaceAll(output, entry.token, entry.absolutePath);
    const barePattern = new RegExp(`\\$${escapeRegExp(entry.name)}(?![0-9A-Za-z_])`, 'g');
    output = output.replace(barePattern, entry.absolutePath);
  }
  return output;
}

export function describePlaceholderLines(placeholders?: PathPlaceholder[]): string[] {
  const entries = normalizePlaceholders(placeholders);
  return entries.map((entry) => {
    const description = entry.description ? ` — ${entry.description}` : '';
    return `${entry.token}${description}`;
  });
}

function normalizePlaceholders(placeholders?: PathPlaceholder[]): NormalizedPlaceholder[] {
  if (!Array.isArray(placeholders)) {
    return [];
  }
  return placeholders
    .filter((placeholder) => placeholder?.name && placeholder?.absolutePath)
    .map((placeholder) => {
      const name = placeholder.name.trim();
      const absolutePath = path.resolve(placeholder.absolutePath);
      const compareKey = normalizeForComparison(absolutePath);
      const compareKeyWithSep = ensureTrailingSeparator(compareKey);
      return {
        name,
        token: formatPlaceholderToken(name),
        absolutePath,
        compareKey,
        compareKeyWithSep,
        description: placeholder.description
      };
    })
    .sort((a, b) => b.absolutePath.length - a.absolutePath.length);
}

function ensureTrailingSeparator(value: string): string {
  return value.endsWith(path.sep) ? value : `${value}${path.sep}`;
}

function normalizeForComparison(value: string): string {
  if (WINDOWS) {
    return value.toLowerCase();
  }
  return value;
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  if (!needle) {
    return haystack;
  }
  return haystack.split(needle).join(replacement);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
