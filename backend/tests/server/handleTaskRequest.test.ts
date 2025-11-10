import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { MediaAgentTaskError } from '../../src/agent/index.js';
import { type SessionAwareRequest } from '../../src/server/MediaAgentServer.js';
import {
  TMP_ROOT,
  createMockResponse,
  createServerInstance
} from '../helpers/testEnvironment.js';

export default async function runServerHandleTaskRequestTests() {
  await testMediaAgentServerHandleTaskRequestSuccess();
  await testMediaAgentServerHandleTaskRequestAgentError();
}

async function testMediaAgentServerHandleTaskRequestSuccess() {
  const baseDir = path.join(TMP_ROOT, 'server-success');
  const calls: any[] = [];
  const server = createServerInstance(baseDir, {
    agent: {
      async runTask(request, options) {
        calls.push({ request, options });
        return {
          plan: { steps: [] },
          rawPlan: null,
          result: {
            exitCode: 0,
            timedOut: false,
            stdout: '',
            stderr: '',
            resolvedOutputs: [],
            dryRun: false,
            steps: []
          },
          phases: [{ id: 'plan', status: 'success' }],
          debug: { info: 'details' }
        };
      }
    } as any
  });
  await server.ensureBaseDirectories();

  const sessionDir = path.join(baseDir, 'generated', 'session-success');
  const inputDir = path.join(baseDir, 'inputs', 'session-success');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(inputDir, { recursive: true });

  const uploadedFiles = [
    {
      originalname: 'image.png',
      path: path.join(baseDir, 'uploads', 'image.png'),
      size: 42,
      mimetype: 'image/png'
    },
    {
      originalname: 'clip.mp4',
      path: path.join(baseDir, 'uploads', 'clip.mp4'),
      size: 84,
      mimetype: 'video/mp4'
    }
  ];
  const req = {
    body: { task: 'Process media' },
    query: { dryRun: 'true', debug: 'verbose' },
    files: uploadedFiles,
    agentSession: {
      id: 'session-success',
      inputDir,
      outputDir: sessionDir
    }
  } as unknown as SessionAwareRequest;
  await fs.mkdir(path.dirname(uploadedFiles[0].path), { recursive: true });
  for (const file of uploadedFiles) {
    await fs.writeFile(file.path, 'binary');
  }

  const res = createMockResponse() as any;
  await server.handleTaskRequest(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body);
  assert.equal(res.body.status, 'success');
  assert.equal(res.body.sessionId, 'session-success');
  assert.equal(res.body.plan.steps.length, 0);
  assert.equal(res.body.phases.length, 2);
  assert.equal(res.body.uploadedFiles.length, 2);
  assert.ok(res.body.debug);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.task, 'Process media');
  assert.equal(calls[0].options.dryRun, true);
  assert.equal(calls[0].request.files.length, 2);
  assert.equal(calls[0].options.includeRawResponse, true);
}

async function testMediaAgentServerHandleTaskRequestAgentError() {
  const baseDir = path.join(TMP_ROOT, 'server-agent-error');
  const errorPhases = [{ id: 'execute', status: 'failed' }];
  const errorContext = {
    plan: { steps: [] },
    rawPlan: { steps: [] },
    responseText: 'error-text',
    debug: { trace: true }
  };
  const agentError = new MediaAgentTaskError('Planner failed', errorPhases, {
    context: errorContext
  });

  const server = createServerInstance(baseDir, {
    agent: {
      async runTask() {
        throw agentError;
      }
    } as any
  });
  await server.ensureBaseDirectories();

  const sessionDir = path.join(baseDir, 'generated', 'session-error');
  const inputDir = path.join(baseDir, 'inputs', 'session-error');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(inputDir, { recursive: true });

  const req = {
    body: { task: 'Process media' },
    query: { debug: 'true' },
    files: [],
    agentSession: {
      id: 'session-error',
      inputDir,
      outputDir: sessionDir
    }
  } as unknown as SessionAwareRequest;

  const res = createMockResponse() as any;
  await server.handleTaskRequest(req, res);

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.status, 'failed');
  assert.equal(res.body.error, 'Task execution failed.');
  assert.equal(res.body.plan, errorContext.plan);
  assert.equal(res.body.rawPlan, errorContext.rawPlan);
  assert.equal(res.body.responseText, errorContext.responseText);
  assert.equal(res.body.debug, errorContext.debug);
  assert.equal(res.body.phases.length, 2);
}
