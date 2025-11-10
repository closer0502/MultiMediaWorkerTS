import assert from 'node:assert/strict';
import path from 'node:path';

import {
  createRequestPhase,
  createSafeFileName,
  createSessionId,
  getFirstQueryValue,
  parseBoolean,
  parseDebugMode,
  type SessionAwareRequest
} from '../../src/server/MediaAgentServer.js';
import {
  TMP_ROOT,
  createServerInstance,
  directoryExists
} from '../helpers/testEnvironment.js';

export default async function runServerHelperTests() {
  await testMediaAgentServerHelpers();
  await testMediaAgentServerPrepareSession();
}

async function testMediaAgentServerHelpers() {
  const idA = createSessionId();
  const idB = createSessionId();
  assert.notEqual(idA, idB);
  assert.ok(idA.startsWith('session-'));

  assert.equal(createSafeFileName('foo bar.txt'), 'foo_bar.txt');
  const hidden = createSafeFileName('.env');
  assert.ok(hidden.startsWith('file_'));

  const phase = createRequestPhase('Transcode media', [{ id: '1' }], { dryRun: true, debug: false });
  assert.equal(phase.meta.taskPreview, 'Transcode media');
  assert.equal(phase.meta.fileCount, 1);
  assert.equal(phase.meta.dryRun, true);

  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('no'), false);
  assert.equal(parseBoolean(undefined), false);

  const debugVerbose = parseDebugMode('verbose');
  assert.equal(debugVerbose.enabled, true);
  assert.equal(debugVerbose.includeRaw, true);
  const debugOff = parseDebugMode(undefined);
  assert.equal(debugOff.enabled, false);

  assert.equal(getFirstQueryValue(['yes', 'no']), 'yes');
  assert.equal(getFirstQueryValue(null), undefined);
}

async function testMediaAgentServerPrepareSession() {
  const baseDir = path.join(TMP_ROOT, 'server-prepare');
  const server = createServerInstance(baseDir, {
    agent: { runTask: async () => ({}) } as any
  });
  await server.ensureBaseDirectories();

  const req = { query: {} } as unknown as SessionAwareRequest;
  const res = {} as any;
  await server.prepareSession(req, res, (error) => {
    if (error) {
      throw error;
    }
  });

  assert.ok(req.agentSession);
  const session = req.agentSession;
  const inputExists = await directoryExists(session.inputDir);
  const outputExists = await directoryExists(session.outputDir);
  assert.equal(inputExists, true);
  assert.equal(outputExists, true);
}
