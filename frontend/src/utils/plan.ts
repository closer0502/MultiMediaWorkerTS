import { quoteArgument } from './formatters';
import { MESSAGES } from '../i18n/messages';
const PLAN_MESSAGES = MESSAGES.plan;

/**
 * @typedef {Object} ClientCommandOutput
 * @property {string} path
 * @property {string} description
 */

/**
 * @typedef {Object} ClientCommandStep
 * @property {string} command
 * @property {string[]} arguments
 * @property {string} reasoning
 * @property {ClientCommandOutput[]} outputs
 * @property {string|undefined} id
 * @property {string|undefined} title
 * @property {string|undefined} note
 */

/**
 * @typedef {Object} ClientCommandPlan
 * @property {ClientCommandStep[]} steps
 * @property {string|undefined} overview
 * @property {string|undefined} followUp
 */

/**
 * @typedef {Object} ClientCommandStepResult
 * @property {'executed'|'skipped'} status
 * @property {string} command
 * @property {string[]} arguments
 * @property {string} reasoning
 * @property {number|null} exitCode
 * @property {boolean} timedOut
 * @property {string} stdout
 * @property {string} stderr
 * @property {string|undefined} skipReason
 */

/**
 * @param {ClientCommandPlan|any} plan
 * @returns {string}
 */
export function buildPlanSummary(plan) {
  const normalized = normalizePlan(plan);
  if (!normalized || !normalized.steps.length) {
    return '';
  }

  return normalized.steps
    .map((step, index) => `${PLAN_MESSAGES.summaryStepPrefix(index)}${formatStepCommand(step)}`)
    .join(PLAN_MESSAGES.summarySeparator);
}

/**
 * @param {ClientCommandPlan|any} plan
 * @returns {ClientCommandPlan|null}
 */
export function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  if (Array.isArray(plan.steps)) {
    return {
      steps: plan.steps.map((step) => normalizePlanStep(step)),
      overview: typeof plan.overview === 'string' ? plan.overview : '',
      followUp: typeof plan.followUp === 'string' ? plan.followUp : ''
    };
  }

  if (typeof plan.command === 'string') {
    const legacyStep = normalizePlanStep(plan);
    return {
      steps: [legacyStep],
      overview: typeof plan.reasoning === 'string' ? plan.reasoning : '',
      followUp: typeof plan.followUp === 'string' ? plan.followUp : ''
    };
  }

  return null;
}

/**
 * @param {{command?: string, arguments?: string[]}} step
 * @returns {string}
 */
export function formatStepCommand(step) {
  if (!step?.command) {
    return '';
  }
  const args = Array.isArray(step.arguments) ? step.arguments.map(quoteArgument).join(' ') : '';
  return `${step.command} ${args}`.trim();
}

/**
 * @param {ClientCommandStepResult} step
 * @returns {string}
 */
export function formatStepStatus(step) {
  if (!step || !step.status) {
    return PLAN_MESSAGES.unknown;
  }

  if (step.status === 'executed') {
    const parts = [];
    if (step.exitCode !== null && step.exitCode !== undefined) {
      parts.push(`${PLAN_MESSAGES.exitCodeLabel} ${step.exitCode}`);
    }
    if (step.timedOut) {
      parts.push(PLAN_MESSAGES.timedOutLabel);
    }
    return parts.length ? PLAN_MESSAGES.executedWithMeta(parts.join(' / ')) : PLAN_MESSAGES.executed;
  }

  if (step.status === 'skipped') {
    return PLAN_MESSAGES.skip;
  }

  return step.status;
}

export function describeSkipReason(reason) {
  switch (reason) {
    case 'dry_run':
      return PLAN_MESSAGES.dryRunDescription;
    case 'previous_step_failed':
      return PLAN_MESSAGES.previousFailedDescription;
    case 'no_op_command':
      return PLAN_MESSAGES.noOpDescription;
    default:
      return reason ? reason.replace(/_/g, ' ') : PLAN_MESSAGES.noAdditionalInfo;
  }
}

function normalizePlanStep(step) {
  const command = typeof step?.command === 'string' ? step.command : '';
  const args = Array.isArray(step?.arguments) ? step.arguments.filter((arg) => typeof arg === 'string') : [];
  const outputs = Array.isArray(step?.outputs)
    ? step.outputs
        .map((output) => ({
          path: typeof output?.path === 'string' ? output.path : '',
          description: typeof output?.description === 'string' ? output.description : ''
        }))
        .filter((output) => output.path)
    : [];

  const id = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : undefined;
  const title = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : undefined;
  const note = typeof step?.note === 'string' && step.note.trim() ? step.note.trim() : undefined;

  return {
    command,
    arguments: args,
    reasoning: typeof step?.reasoning === 'string' ? step.reasoning : '',
    outputs,
    id,
    title,
    note
  };
}

