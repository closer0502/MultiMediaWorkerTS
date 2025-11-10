import path from 'node:path';
import dotenv from 'dotenv';

import { createOpenAIClient, createMediaAgent, ToolRegistry } from './agent/index.js';
import { MediaAgentServer } from './server/MediaAgentServer.js';

const ROOT_DIR = process.cwd();
dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

const PORT = Number(process.env.PORT || 3001);

const PUBLIC_ROOT = path.join(ROOT_DIR, 'public');
const GENERATED_ROOT = path.join(PUBLIC_ROOT, 'generated');
const STORAGE_ROOT = path.join(ROOT_DIR, 'storage');
const SESSION_INPUT_ROOT = path.join(STORAGE_ROOT, 'inputs');

const toolRegistry = ToolRegistry.createDefault();
const openAIClient = createOpenAIClient();
const agent = createMediaAgent(openAIClient, {
  toolRegistry,
  model: process.env.OPENAI_MODEL
});

const server = new MediaAgentServer({
  agent,
  toolRegistry,
  publicRoot: PUBLIC_ROOT,
  generatedRoot: GENERATED_ROOT,
  storageRoot: STORAGE_ROOT,
  sessionInputRoot: SESSION_INPUT_ROOT
});

server.start(PORT).catch((error) => {
  // eslint-disable-next-line no-console
  console.error('サーバーの起動に失敗しました:', error);
  process.exit(1);
});
