import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PlanValidator, TaskPhaseTracker } from '../../src/agent/index.js';
import { TMP_ROOT, sharedToolRegistry } from '../helpers/testEnvironment.js';

export default async function runAgentValidationTests() {
  await testPlanValidator();
  await testTaskPhaseTracker();
}

async function testPlanValidator() {
  const validator = new PlanValidator(sharedToolRegistry);
  const tmpDir = path.join(TMP_ROOT, 'validator');
  await fs.mkdir(tmpDir, { recursive: true });

  const validated = validator.validate(
    {
      overview: 'Process media',
      followUp: 'Review artifacts.',
      steps: [
        {
          command: 'none',
          arguments: [],
          reasoning: 123 as any,
          outputs: [],
          id: ' step-1 ',
          title: '  Initial ',
          note: ' optional note '
        }
      ]
    },
    tmpDir
  );

  assert.equal(validated.steps.length, 1);
  const step = validated.steps[0];
  assert.equal(step.command, 'none');
  assert.equal(step.reasoning, '');
  assert.equal(step.id, 'step-1');
  assert.equal(step.title, 'Initial');
  assert.equal(step.note, 'optional note');

  let threw = false;
  try {
    validator.validate(
      {
        overview: '',
        followUp: '',
        steps: [
          {
            command: 'none',
            arguments: [123 as any],
            reasoning: '',
            outputs: []
          }
        ]
      },
      tmpDir
    );
  } catch (error) {
    threw = true;
    assert.ok(error.message.includes('array of strings'));
  }
  assert.equal(threw, true);
}

async function testTaskPhaseTracker() {
  const tracker = new TaskPhaseTracker([
    { id: 'plan', title: 'Plan command' },
    { id: 'execute', title: 'Execute command' }
  ]);
  tracker.start('plan');
  tracker.log('plan', 'starting planner');
  tracker.complete('plan', { steps: 1 });
  tracker.start('execute');
  tracker.fail('execute', new Error('mock failure'));

  const phases = tracker.getPhases();
  assert.equal(phases.length, 2);
  assert.equal(phases[0].status, 'success');
  assert.equal(phases[0].logs.length, 1);
  assert.equal(phases[1].status, 'failed');
  assert.ok(phases[1].error);
}
