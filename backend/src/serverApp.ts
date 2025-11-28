import path from 'node:path';

import { createOpenAIClient, createMediaAgent, ToolRegistry } from './agent/index.js';
import { MediaAgentServer } from './server/MediaAgentServer.js';
import { loadLocalEnv, requireEnv, type LocalEnv } from './config/env.js';

export type CreateMediaAgentServerOptions = {
  rootDir?: string;
  publicRoot?: string;
  generatedRoot?: string;
  storageRoot?: string;
  sessionInputRoot?: string;
  clientDistRoot?: string;
  env?: LocalEnv;
};

export function createDefaultMediaAgentServer(options: CreateMediaAgentServerOptions = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
  const publicRoot = options.publicRoot ?? path.join(rootDir, 'public');
  const generatedRoot = options.generatedRoot ?? path.join(publicRoot, 'generated');
  const storageRoot = options.storageRoot ?? path.join(rootDir, 'storage');
  const sessionInputRoot = options.sessionInputRoot ?? path.join(storageRoot, 'inputs');
  const clientDistRoot = options.clientDistRoot ?? path.join(rootDir, 'frontend', 'dist');
  const env = options.env ?? loadLocalEnv(rootDir);
  const openAIKey = requireEnv(env, 'OPENAI_API_KEY');

  const toolRegistry = ToolRegistry.createDefault();
  const openAIClient = createOpenAIClient(openAIKey);
  const agent = createMediaAgent(openAIClient, {
    toolRegistry,
    model: env.OPENAI_MODEL
  });

  return new MediaAgentServer({
    agent,
    toolRegistry,
    publicRoot,
    generatedRoot,
    storageRoot,
    sessionInputRoot,
    clientDistRoot
  });
}

