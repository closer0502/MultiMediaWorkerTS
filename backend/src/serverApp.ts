import path from 'node:path';

import { createOpenAIClient, createMediaAgent, ToolRegistry } from './agent/index.js';
import { MediaAgentServer } from './server/MediaAgentServer.js';

export type CreateMediaAgentServerOptions = {
  rootDir?: string;
  publicRoot?: string;
  generatedRoot?: string;
  storageRoot?: string;
  sessionInputRoot?: string;
  clientDistRoot?: string;
};

export function createDefaultMediaAgentServer(options: CreateMediaAgentServerOptions = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
  const publicRoot = options.publicRoot ?? path.join(rootDir, 'public');
  const generatedRoot = options.generatedRoot ?? path.join(publicRoot, 'generated');
  const storageRoot = options.storageRoot ?? path.join(rootDir, 'storage');
  const sessionInputRoot = options.sessionInputRoot ?? path.join(storageRoot, 'inputs');
  const clientDistRoot = options.clientDistRoot ?? path.join(rootDir, 'frontend', 'dist');

  const toolRegistry = ToolRegistry.createDefault();
  const llmBaseUrl = process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL;
  const openAIClient = createOpenAIClient({ baseURL: llmBaseUrl });
  const agent = createMediaAgent(openAIClient, {
    toolRegistry,
    model: process.env.OPENAI_MODEL
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
