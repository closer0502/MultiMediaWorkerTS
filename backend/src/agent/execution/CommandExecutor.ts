import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type {
  CommandPlan,
  CommandStepPlan,
  CommandExecutionOptions,
  CommandExecutionResult,
  CommandOutputPlan,
  DescribedOutput,
  CommandStepResult,
  CommandStepSkipReason
} from '../shared/types.js';

type SpawnProcessHooks = {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

/**
 * Executes command plans step by step and reports consolidated results.
 */
export class CommandExecutor {
  private readonly timeoutMs: number;

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  }

  /**
   * Runs every command step in the provided plan.
   * @param {CommandPlan} plan
   * @param {CommandExecutionOptions} [options]
   * @returns {Promise<CommandExecutionResult>}
   */
  async execute(
    plan: CommandPlan,
    options: CommandExecutionOptions = {}
  ): Promise<CommandExecutionResult> {
    const cwd = options.cwd || process.cwd();
    const publicRoot = options.publicRoot ? path.resolve(options.publicRoot) : null;
    const dryRun = Boolean(options.dryRun);
    const onCommandStart = typeof options.onCommandStart === 'function' ? options.onCommandStart : null;
    const onCommandOutput = typeof options.onCommandOutput === 'function' ? options.onCommandOutput : null;
    const onCommandEnd = typeof options.onCommandEnd === 'function' ? options.onCommandEnd : null;
    const onCommandSkip = typeof options.onCommandSkip === 'function' ? options.onCommandSkip : null;

    const allOutputs = this.collectOutputs(plan.steps);
    await this.ensureOutputDirectories(allOutputs);

    const stepResults: CommandStepResult[] = [];
    let aggregatedStdout = '';
    let aggregatedStderr = '';
    let lastExitCode = null;
    let anyTimedOut = false;
    let encounteredFailure = false;

    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index];
      const skipReason = this.resolveSkipReason({
        dryRun,
        encounteredFailure,
        command: step.command
      });

      if (skipReason) {
        if (onCommandSkip) {
          onCommandSkip({ index, step, reason: skipReason });
        }
        stepResults.push(this.createSkippedResult(step, skipReason));
        continue;
      }

      if (onCommandStart) {
        onCommandStart({ index, step });
      }

      const { exitCode, stdout, stderr, timedOut } = await this.spawnProcess(step.command, step.arguments, cwd, {
        onStdout: onCommandOutput
          ? (chunk) => {
              onCommandOutput({ index, step, stream: 'stdout', text: chunk });
            }
          : null,
        onStderr: onCommandOutput
          ? (chunk) => {
              onCommandOutput({ index, step, stream: 'stderr', text: chunk });
            }
          : null
      });

      const executedResult = this.createExecutedResult(step, exitCode, stdout, stderr, timedOut);
      stepResults.push(executedResult);

      lastExitCode = exitCode;
      anyTimedOut = anyTimedOut || timedOut;

      aggregatedStdout = this.appendSectionOutput(aggregatedStdout, index, step, stdout);
      aggregatedStderr = this.appendSectionOutput(aggregatedStderr, index, step, stderr);

      if (onCommandEnd) {
        onCommandEnd({ index, step, exitCode, timedOut });
      }

      if (timedOut || (exitCode !== null && exitCode !== 0)) {
        encounteredFailure = true;
      }
    }

    // Mark remaining steps as skipped if a failure occurred mid-way.
    if (encounteredFailure) {
      for (let index = 0; index < stepResults.length; index += 1) {
        const result = stepResults[index];
        if (result.status === 'skipped' && !result.skipReason) {
          result.skipReason = 'previous_step_failed';
        }
      }
    }

    const resolvedOutputs = await this.describeOutputs(allOutputs, publicRoot);
    const noExecutedSteps = stepResults.every((step) => step.status !== 'executed');

    return {
      exitCode: lastExitCode,
      timedOut: anyTimedOut,
      stdout: aggregatedStdout,
      stderr: aggregatedStderr,
      resolvedOutputs,
      dryRun: dryRun || noExecutedSteps,
      steps: stepResults
    };
  }

  /**
   * Collects every output description from the plan.
   * @param {CommandStepPlan[]} steps
   * @returns {CommandOutputPlan[]}
   */
  collectOutputs(steps: CommandStepPlan[]): CommandOutputPlan[] {
    return steps.flatMap((step) => Array.isArray(step.outputs) ? step.outputs : []);
  }

  /**
   * Ensures that every planned output directory exists.
   * @param {CommandOutputPlan[]} outputs
   * @returns {Promise<void>}
   */
  async ensureOutputDirectories(outputs: CommandOutputPlan[]): Promise<void> {
    const uniqueDirs = new Set(outputs.map((item) => path.dirname(path.resolve(item.path))));
    await Promise.all(Array.from(uniqueDirs).map((dir) => fs.mkdir(dir, { recursive: true })));
  }

  /**
   * Describes the current state of the planned output files.
   * @param {CommandOutputPlan[]} outputs
   * @param {string|null} publicRoot
   * @returns {Promise<DescribedOutput[]>}
   */
  async describeOutputs(outputs: CommandOutputPlan[], publicRoot: string | null): Promise<DescribedOutput[]> {
    const described = [];
    for (const item of outputs) {
      const absolutePath = path.resolve(item.path);
      const exists = existsSync(absolutePath);
      let size = null;
      if (exists) {
        const stat = await fs.stat(absolutePath);
        size = stat.size;
      }
      let publicPath = null;
      if (exists && publicRoot) {
        const relative = path.relative(publicRoot, absolutePath);
        if (!relative.startsWith('..')) {
          publicPath = relative.split(path.sep).join('/');
        }
      }
      described.push({
        path: item.path,
        description: item.description,
        absolutePath,
        exists,
        size,
        publicPath
      });
    }
    return described;
  }

  /**
   * Determines if the current step should be skipped and why.
   * @param {{dryRun: boolean, encounteredFailure: boolean, command: string}} options
   * @returns {string|undefined}
   */
  resolveSkipReason({
    dryRun,
    encounteredFailure,
    command
  }: {
    dryRun: boolean;
    encounteredFailure: boolean;
    command: string;
  }): CommandStepSkipReason | undefined {
    if (dryRun) {
      return 'dry_run';
    }
    if (encounteredFailure) {
      return 'previous_step_failed';
    }
    if (command === 'none') {
      return 'no_op_command';
    }
    return undefined;
  }

  /**
   * Creates a result object for a skipped step.
   * @param {CommandStepPlan} step
   * @param {string} skipReason
   * @returns {CommandStepResult}
   */
  createSkippedResult(step: CommandStepPlan, skipReason: CommandStepSkipReason): CommandStepResult {
    return {
      status: 'skipped',
      command: step.command,
      arguments: step.arguments,
      reasoning: step.reasoning,
      exitCode: null,
      timedOut: false,
      stdout: '',
      stderr: '',
      skipReason
    };
  }

  /**
   * Creates a result object for an executed step.
   * @param {CommandStepPlan} step
   * @param {number|null} exitCode
   * @param {string} stdout
   * @param {string} stderr
   * @param {boolean} timedOut
   * @returns {CommandStepResult}
   */
  createExecutedResult(
    step: CommandStepPlan,
    exitCode: number | null,
    stdout: string,
    stderr: string,
    timedOut: boolean
  ): CommandStepResult {
    return {
      status: 'executed',
      command: step.command,
      arguments: step.arguments,
      reasoning: step.reasoning,
      exitCode,
      timedOut,
      stdout,
      stderr
    };
  }

  /**
   * Appends a command section to aggregated output.
   * @param {string} existing
   * @param {number} index
   * @param {CommandStepPlan} step
   * @param {string} content
   * @returns {string}
   */
  appendSectionOutput(existing: string, index: number, step: CommandStepPlan, content: string): string {
    const hasContent = Boolean(content);
    if (!hasContent) {
      return existing;
    }

    const commandLine = [step.command, ...step.arguments].join(' ').trim();
    const header = `[step ${index + 1}] ${commandLine}`.trim();
    const block = `${header}\n${content}`.trimEnd();
    if (!existing) {
      return block;
    }
    return `${existing}\n${block}`;
  }

  /**
   * Spawns a child process for the given command.
   * @param {string} command
   * @param {string[]} args
   * @param {string} cwd
   * @returns {Promise<{exitCode: number|null, stdout: string, stderr: string, timedOut: boolean}>}
   */
  spawnProcess(command: string, args: string[], cwd: string, hooks: SpawnProcessHooks = {}) {
    return new Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>(
      (resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: process.env,
        shell: false,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let finished = false;
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, this.timeoutMs);

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (typeof hooks.onStdout === 'function') {
          hooks.onStdout(text);
        }
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (typeof hooks.onStderr === 'function') {
          hooks.onStderr(text);
        }
      });

      child.on('error', (error) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      child.on('close', (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          resolve({
            exitCode: timedOut ? null : code,
            stdout,
            stderr,
            timedOut
          });
        }
      });
      }
    );
  }
}

