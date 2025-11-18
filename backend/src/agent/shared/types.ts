export type AgentFile = {
  id: string;
  originalName: string;
  absolutePath: string;
  size: number;
  mimeType?: string;
};

export type AgentFileStreamMetadata = {
  type?: string;
  codec?: string;
  width?: number;
  height?: number;
  frameRate?: string;
  channels?: number;
  sampleRate?: number;
  pixelFormat?: string;
  bitDepth?: number;
};

export type AgentFileMetadata = {
  formatName?: string;
  durationSeconds?: number;
  bitRate?: number;
  primaryStream: AgentFileStreamMetadata | null;
  otherStreams: AgentFileStreamMetadata[];
  raw: Record<string, unknown>;
};

export type PathPlaceholder = {
  name: string;
  absolutePath: string;
  description?: string;
};

export type AgentRequest = {
  task: string;
  files: AgentFile[];
  outputDir: string;
  pathPlaceholders?: PathPlaceholder[];
};

export type CommandOutputPlan = {
  path: string;
  description: string;
};

export type ToolCommandId = 'ffmpeg' | 'magick' | 'exiftool' | 'yt-dlp' | 'none' | (string & {});

export type CommandStepPlan = {
  command: ToolCommandId;
  arguments: string[];
  reasoning: string;
  outputs: CommandOutputPlan[];
  id?: string;
  title?: string;
  note?: string;
};

export type CommandPlan = {
  steps: CommandStepPlan[];
  overview?: string;
  followUp?: string;
};

export type CommandStepSkipReason = 'dry_run' | 'previous_step_failed' | 'no_op_command' | (string & {});

export type CommandExecutionHooks = {
  onCommandStart?: (payload: { index: number; step: CommandStepPlan }) => void;
  onCommandOutput?: (payload: { index: number; step: CommandStepPlan; stream: 'stdout' | 'stderr'; text: string }) => void;
  onCommandEnd?: (payload: { index: number; step: CommandStepPlan; exitCode: number | null; timedOut: boolean }) => void;
  onCommandSkip?: (payload: { index: number; step: CommandStepPlan; reason: CommandStepSkipReason }) => void;
};

export type CommandExecutionOptions = {
  cwd?: string;
  timeoutMs?: number;
  publicRoot?: string;
  dryRun?: boolean;
} & CommandExecutionHooks;

export type DescribedOutput = {
  description: string;
  path: string;
  absolutePath: string;
  exists: boolean;
  size: number | null;
  publicPath: string | null;
};

export type CommandStepStatus = 'executed' | 'skipped';

export type CommandStepResult = {
  status: CommandStepStatus;
  command: string;
  arguments: string[];
  reasoning: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  skipReason?: CommandStepSkipReason;
};

export type CommandExecutionResult = {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  resolvedOutputs: DescribedOutput[];
  dryRun?: boolean;
  steps: CommandStepResult[];
};
