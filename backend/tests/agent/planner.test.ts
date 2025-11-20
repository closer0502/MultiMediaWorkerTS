import assert from 'node:assert/strict';

import type OpenAI from 'openai';

import { OpenAIPlanner, createOpenAIClient } from '../../src/agent/index.js';
import { sharedToolRegistry } from '../helpers/testEnvironment.js';

type PlannerPlan = {
  steps: Array<{ command: string }>;
  followUp?: string;
  overview?: string;
};

export default async function runPlannerTests() {
  await testOpenAIPlannerNormalization();
  await testOpenAIPlannerResponseFormat();
  await testCreateOpenAIClient();
}

async function testOpenAIPlannerNormalization() {
  const dummyClient = { responses: { create: async () => ({}) } } as unknown as OpenAI;
  const planner = new OpenAIPlanner(dummyClient, sharedToolRegistry);

  const legacy = planner.normalizePlanStructure({
    command: 'none',
    arguments: ['-v'],
    reasoning: 'Legacy format',
    followUp: 'Review later',
    outputs: []
  }) as unknown as PlannerPlan;
  assert.equal(legacy.steps.length, 1);
  assert.equal(legacy.steps[0].command, 'none');
  assert.equal(legacy.followUp, 'Review later');

  const structured = planner.normalizePlanStructure({
    overview: 'Use ffmpeg then magick',
    steps: [
      { command: 'ffmpeg', arguments: [], reasoning: '', outputs: [] },
      { command: 'magick', arguments: [], reasoning: '', outputs: [] }
    ]
  }) as unknown as PlannerPlan;
  assert.equal(structured.steps.length, 2);
  assert.equal(structured.overview, 'Use ffmpeg then magick');
}

async function testOpenAIPlannerResponseFormat() {
  const dummyClient = { responses: { create: async () => ({}) } } as unknown as OpenAI;
  const planner = new OpenAIPlanner(dummyClient, sharedToolRegistry);
  const schema = planner.buildResponseFormat() as any;
  assert.equal(schema.type, 'json_schema');
  assert.ok(schema.schema.properties.steps);
  assert.ok(schema.schema.properties.steps.items.required.includes('command'));
}

async function testCreateOpenAIClient() {
  class StubOpenAI {
    options: any;
    constructor(options) {
      this.options = options;
    }
  }

  const explicit = createOpenAIClient('test-key', StubOpenAI as unknown as typeof OpenAI) as any;
  assert.equal(explicit.options.apiKey, 'test-key');
  assert.equal(explicit.options.baseURL, 'http://localhost:1234/v1');

  const original = process.env.OPENAI_API_KEY;
  const originalBase = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = 'env-key';
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
  const implicit = createOpenAIClient(undefined, StubOpenAI as unknown as typeof OpenAI) as any;
  assert.equal(implicit.options.apiKey, 'env-key');
  assert.equal(implicit.options.baseURL, 'https://api.openai.com/v1');
  process.env.OPENAI_API_KEY = original;
  process.env.OPENAI_BASE_URL = originalBase;
}
