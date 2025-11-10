import fs from 'node:fs/promises';
import path from 'node:path';

import { ToolRegistry } from '../../src/agent/index.js';
import { MediaAgentServer } from '../../src/server/MediaAgentServer.js';
import type { MediaAgentServerOptions } from '../../src/server/MediaAgentServer.js';

export const TMP_ROOT = path.join(process.cwd(), 'tmp-tests');
export const sharedToolRegistry = ToolRegistry.createDefault();

export async function ensureTestRoot() {
  await fs.mkdir(TMP_ROOT, { recursive: true });
}

export async function cleanupTestRoot() {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
}

export function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

export function createServerInstance(
  baseDir: string,
  overrides: Partial<MediaAgentServerOptions> & { agent: MediaAgentServerOptions['agent'] }
) {
  const paths = {
    publicRoot: path.join(baseDir, 'public'),
    generatedRoot: path.join(baseDir, 'generated'),
    storageRoot: path.join(baseDir, 'storage'),
    sessionInputRoot: path.join(baseDir, 'inputs')
  };

  return new MediaAgentServer({
    agent: overrides.agent,
    toolRegistry: overrides.toolRegistry || ToolRegistry.createDefault(),
    ...paths
  });
}

export async function directoryExists(targetPath: string) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
