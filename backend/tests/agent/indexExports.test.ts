import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import type OpenAI from 'openai';

import {
  DEFAULT_MODEL,
  DEFAULT_TOOL_DEFINITIONS,
  createMediaAgent
} from '../../src/agent/index.js';
import { TMP_ROOT, sharedToolRegistry } from '../helpers/testEnvironment.js';

export default async function runIndexExportTests() {
  await testIndexExports();
  await testMediaAgentWithMockClient();
}

async function testIndexExports() {
  assert.equal(typeof DEFAULT_MODEL, 'string');
  assert.ok(Object.keys(DEFAULT_TOOL_DEFINITIONS).length > 0);
}

async function testMediaAgentWithMockClient() {
  const mockClient = {
    responses: {
      create: async () => ({
        output_text: JSON.stringify({
          overview: 'No action required.',
          followUp: '',
          steps: [
            {
              command: 'none',
              arguments: [],
              reasoning: 'Nothing to execute.',
              outputs: []
            }
          ]
        })
      })
    }
  } as unknown as OpenAI;

  const tmpDir = path.join(TMP_ROOT, 'agent-run');
  await fs.mkdir(tmpDir, { recursive: true });

  const agent = createMediaAgent(mockClient, { toolRegistry: sharedToolRegistry });
  const { plan, rawPlan, result, phases, debug } = await agent.runTask(
    {
      task: 'No additional processing required',
      files: [],
      outputDir: tmpDir
    },
    { publicRoot: tmpDir, dryRun: true, debug: true }
  );

  assert.ok(Array.isArray(plan.steps));
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].command, 'none');
  assert.equal(result.exitCode, null);
  assert.ok(Array.isArray(result.resolvedOutputs));
  assert.ok(Array.isArray(result.steps));
  assert.ok(Array.isArray(phases));
  assert.equal(phases[0].id, 'plan');
  assert.equal(phases[1].id, 'execute');
  assert.ok(debug);
  assert.ok(rawPlan);
}
