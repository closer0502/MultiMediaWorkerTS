import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createDefaultMediaAgentServer } from './serverApp.js';
import { loadLocalEnv } from './config/env.js';

const ROOT_DIR = process.cwd();
const LOCAL_ENV = loadLocalEnv(ROOT_DIR);
const PORT = Number(LOCAL_ENV.PORT ?? 3001);

async function startServer() {
  const server = createDefaultMediaAgentServer({ rootDir: ROOT_DIR, env: LOCAL_ENV });
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
