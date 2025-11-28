import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export type LocalEnv = Record<string, string>;

export function loadLocalEnv(rootDir: string = process.cwd()): LocalEnv {
  const envPath = path.join(rootDir, '.env.local');
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const content = fs.readFileSync(envPath);
  return dotenv.parse(content);
}

export function requireEnv(env: LocalEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`.env.local is missing required key: ${key}`);
  }
  return value;
}
