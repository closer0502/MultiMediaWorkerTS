/**
 * エージェント実行時のフェーズ情報を保持するカスタムエラー。
 */
export class MediaAgentTaskError extends Error {
  phases: Array<any>;
  context: Record<string, any>;

  constructor(
    message: string,
    phases: Array<any>,
    options: { cause?: unknown; context?: Record<string, any> } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'MediaAgentTaskError';
    this.phases = phases;
    this.context = options.context || {};
  }
}
