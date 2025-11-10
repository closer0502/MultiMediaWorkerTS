import path from 'node:path';

import type { ToolRegistry } from '../registry/ToolRegistry.js';
import type { CommandPlan, CommandStepPlan, CommandOutputPlan } from '../shared/types.js';

/**
 * Validates command plans produced by the planner before execution.
 */
export class PlanValidator {
  private readonly toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  validate(plan: CommandPlan, outputDir: string): CommandPlan {
    if (!plan || typeof plan !== 'object') {
      throw new Error('Command plan is invalid.');
    }

    if (typeof outputDir !== 'string' || !outputDir.trim()) {
      throw new Error('Output directory is not specified.');
    }

    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error('Command steps are missing.');
    }

    if (typeof plan.followUp !== 'string') {
      plan.followUp = '';
    }

    if (typeof plan.overview !== 'string') {
      plan.overview = '';
    }

    const normalizedOutputDir = path.resolve(outputDir);
    plan.steps = plan.steps.map((rawStep, index) => this.validateStep(rawStep, index, normalizedOutputDir));

    return plan;
  }

  private validateStep(rawStep: any, index: number, normalizedOutputDir: string): CommandStepPlan {
    if (!rawStep || typeof rawStep !== 'object') {
      throw new Error(`Command step (${index + 1}) is invalid.`);
    }

    const command = rawStep.command;
    if (typeof command !== 'string' || !this.toolRegistry.hasCommand(command)) {
      throw new Error(`Unknown command: ${command}`);
    }

    const args = rawStep.arguments;
    if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) {
      throw new Error(`Step (${index + 1}) arguments must be an array of strings.`);
    }

    const reasoning = typeof rawStep.reasoning === 'string' ? rawStep.reasoning : '';
    const outputs = Array.isArray(rawStep.outputs) ? rawStep.outputs : [];

    const normalizedOutputs = outputs.map((item, outputIndex) =>
      this.validateOutput(item, index, outputIndex, normalizedOutputDir)
    );

    const id = typeof rawStep.id === 'string' && rawStep.id.trim() ? rawStep.id.trim() : undefined;
    const title = typeof rawStep.title === 'string' && rawStep.title.trim() ? rawStep.title.trim() : undefined;
    const note = typeof rawStep.note === 'string' && rawStep.note.trim() ? rawStep.note.trim() : undefined;

    return {
      command,
      arguments: args,
      reasoning,
      outputs: normalizedOutputs,
      id,
      title,
      note
    };
  }

  private validateOutput(
    rawOutput: any,
    stepIndex: number,
    outputIndex: number,
    normalizedOutputDir: string
  ): CommandOutputPlan {
    if (!rawOutput || typeof rawOutput !== 'object') {
      throw new Error(`Step (${stepIndex + 1}) outputs[${outputIndex}] is invalid.`);
    }

    const rawPath = typeof rawOutput.path === 'string' ? rawOutput.path.trim() : '';
    if (!rawPath) {
      throw new Error(`Step (${stepIndex + 1}) output path is missing.`);
    }

    const absolutePath = path.resolve(rawPath);
    const relative = path.relative(normalizedOutputDir, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Output path lies outside of the output directory: ${rawOutput.path}`);
    }

    const description = typeof rawOutput.description === 'string' ? rawOutput.description : '';

    return {
      path: absolutePath,
      description
    };
  }
}
