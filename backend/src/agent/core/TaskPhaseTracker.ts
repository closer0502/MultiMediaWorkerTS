type PhaseDefinition = { id: string; title: string };

type PhaseLogEntry = { at: string; message: string };

type TrackedPhase = PhaseDefinition & {
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  error: { message: string; stack: string | null; name: string } | null;
  meta: Record<string, any>;
  logs: PhaseLogEntry[];
};

const DEFAULT_PHASES: PhaseDefinition[] = [
  { id: 'plan', title: 'Plan command' },
  { id: 'execute', title: 'Execute command' },
  { id: 'summarize', title: 'Summarize results' }
];

/**
 * タスクフェーズを簡易追跡するユーティリティ。
 */
export class TaskPhaseTracker {
  private readonly _phases: TrackedPhase[];

  constructor(phases: PhaseDefinition[] = DEFAULT_PHASES) {
    this._phases = phases.map((phase) => ({
      ...phase,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
      error: null,
      meta: {},
      logs: []
    }));
  }

  start(phaseId: string, meta: Record<string, any> = {}): void {
    const phase = this._findPhase(phaseId);
    if (!phase) {
      return;
    }
    const now = new Date().toISOString();
    phase.status = 'in_progress';
    phase.startedAt = phase.startedAt || now;
    phase.meta = { ...phase.meta, ...meta };
  }

  complete(phaseId: string, meta: Record<string, any> = {}): void {
    const phase = this._findPhase(phaseId);
    if (!phase) {
      return;
    }
    const now = new Date().toISOString();
    phase.status = 'success';
    phase.finishedAt = now;
    phase.meta = { ...phase.meta, ...meta };
  }

  fail(phaseId: string, error: Error | string, meta: Record<string, any> = {}): void {
    const phase = this._findPhase(phaseId);
    if (!phase) {
      return;
    }
    const now = new Date().toISOString();
    phase.status = 'failed';
    phase.finishedAt = now;
    phase.meta = { ...phase.meta, ...meta };
    phase.error =
      typeof error === 'string'
        ? { message: error, stack: null, name: 'Error' }
        : {
            message: error?.message ?? 'Unknown error',
            stack: error?.stack ?? null,
            name: error?.name ?? 'Error'
          };
  }

  log(phaseId: string, message: string): void {
    const phase = this._findPhase(phaseId);
    if (!phase) {
      return;
    }
    phase.logs.push({ at: new Date().toISOString(), message });
  }

  getPhases(): TrackedPhase[] {
    return this._phases.map((phase) => ({
      ...phase,
      meta: { ...phase.meta },
      logs: [...phase.logs]
    }));
  }

  private _findPhase(phaseId: string): TrackedPhase | undefined {
    return this._phases.find((phase) => phase.id === phaseId);
  }
}

export { DEFAULT_PHASES as DEFAULT_TASK_PHASES };
