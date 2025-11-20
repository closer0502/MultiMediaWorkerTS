import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

import { createDefaultMediaAgentServer } from './serverApp.js';

const ROOT_DIR = process.cwd();
dotenv.config({ path: path.join(ROOT_DIR, '.env.local.lm') });

// LM Studio は API キー不要のため、未設定の場合はプレースホルダーを自動設定
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'lm-studio';
}
// LM Studio のデフォルトのベース URL を自動設定 (未設定時のみ)
if (!process.env.LLM_BASE_URL) {
  process.env.LLM_BASE_URL = 'http://localhost:1234/v1';
}

const PORT = Number(process.env.PORT || 3001);

async function startServer() {
  const server = createDefaultMediaAgentServer({ rootDir: ROOT_DIR });
  await server.start(PORT);
  return server;
}

function isMainEntry() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainEntry()) {
  startServer().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('サーバーの起動に失敗しました:', error);
    process.exit(1);
  });
}

export { createDefaultMediaAgentServer };
export type { CreateMediaAgentServerOptions } from './serverApp.js';
