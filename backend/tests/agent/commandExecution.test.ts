import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CommandExecutor,
  MediaAgentTaskError,
  MediaAgent,
  PlanValidator,
  ToolRegistry
} from '../../src/agent/index.js';
import { TMP_ROOT, sharedToolRegistry } from '../helpers/testEnvironment.js';

export default async function runCommandExecutionTests() {
  await testCommandExecutorWithNone();
  await testMediaAgentRejectsNoOpPlan();
  await testCommandExecutorExecutionPaths();
  await testToolRegistry();
  await testMediaAgentTaskError();
}

async function testCommandExecutorWithNone() {
  const validator = new PlanValidator(sharedToolRegistry);
  const executor = new CommandExecutor();
  const tmpDir = path.join(TMP_ROOT, 'executor-none');
  await fs.mkdir(tmpDir, { recursive: true });

  const plan = validator.validate(
    {
      overview: '',
      followUp: '',
      steps: [
        {
          command: 'none',
          arguments: [],
          reasoning: 'No operation required.',
          outputs: [
            {
              path: path.join(tmpDir, 'noresult.txt'),
              description: 'placeholder'
            }
          ]
        }
      ]
    },
    tmpDir
  );

  const result = await executor.execute(plan, { publicRoot: tmpDir });
  assert.equal(result.exitCode, null);
  assert.equal(result.timedOut, false);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(result.resolvedOutputs.length, 1);
  assert.equal(result.resolvedOutputs[0].exists, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].status, 'skipped');
  assert.equal(result.steps[0].skipReason, 'no_op_command');
}

async function testMediaAgentRejectsNoOpPlan() {
  const tmpDir = path.join(TMP_ROOT, 'executor-none-failure');
  await fs.mkdir(tmpDir, { recursive: true });

  const noopPlan = {
    overview: '',
    followUp: '',
    steps: [
      {
        command: 'none',
        arguments: [],
        reasoning: 'No work to run.',
        outputs: []
      }
    ]
  };

  const agent = new MediaAgent({
    planner: {
      async plan() {
        return { plan: noopPlan, rawPlan: noopPlan, debug: { mocked: true } };
      }
    } as any,
    executor: new CommandExecutor(),
    toolRegistry: sharedToolRegistry
  });

  await assert.rejects(
    agent.runTask(
      {
        task: 'Expect commands to run',
        files: [],
        outputDir: tmpDir
      },
      { publicRoot: tmpDir }
    ),
    (error: any) => {
      assert.ok(error instanceof MediaAgentTaskError);
      assert.equal(error.message, 'No executable commands were generated (plan only returned "none" steps).');
      return true;
    }
  );
}

async function testCommandExecutorExecutionPaths() {
  const executor = new CommandExecutor({ timeoutMs: 10_000 });
  const plan = {
    overview: 'Run sample commands',
    followUp: '',
    steps: [
      {
        command: process.execPath,
        arguments: ['-e', "process.stdout.write('hello world')"],
        reasoning: 'Print greeting.',
        outputs: []
      },
      {
        command: 'none',
        arguments: [],
        reasoning: 'Skip follow-up.',
        outputs: []
      }
    ]
  };

  const result = await executor.execute(plan, {});
  assert.equal(result.exitCode, 0);
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].status, 'executed');
  assert.equal(result.steps[0].exitCode, 0);
  assert.ok(result.stdout.includes('hello world'));
  assert.equal(result.steps[1].status, 'skipped');
  assert.equal(result.steps[1].skipReason, 'no_op_command');
  assert.ok(result.stdout.includes('[step 1]'), 'Aggregated stdout should label steps.');
}

async function testToolRegistry() {
  const registry = ToolRegistry.createDefault();
  assert.ok(registry.hasCommand('ffmpeg'));
  assert.ok(registry.hasCommand('yt-dlp'));
  assert.ok(registry.listCommandIds().includes('none'));
  assert.ok(registry.describeExecutableCommands().every((entry) => entry.id !== 'none'));
}

async function testMediaAgentTaskError() {
  const cause = new Error('boom');
  const phases = [{ id: 'execute', status: 'failed' }];
  const context = { plan: { steps: [] } };
  const error = new MediaAgentTaskError('Execution failed', phases, { cause, context });

  assert.equal(error.message, 'Execution failed');
  assert.equal(error.name, 'MediaAgentTaskError');
  assert.equal(error.phases, phases);
  assert.equal(error.context, context);
  assert.equal(error.cause, cause);
}
