import { formatMediaMetadataLines } from '../shared/MediaMetadata.js';
import { describePlaceholderLines, maskPathWithPlaceholders } from '../shared/PathPlaceholders.js';
import type { ToolRegistry } from '../registry/ToolRegistry.js';
import type { AgentRequest, PathPlaceholder } from '../shared/types.js';

/**
 * Builds the developer prompt that guides the planner model.
 */
export class PromptBuilder {
  private readonly toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async build(request: AgentRequest): Promise<string> {
    const toolSummary = this.toolRegistry
      .describeExecutableCommands()
      .map((tool) => `- ${tool.id}: ${tool.description}`)
      .join('\n');

    const fileSummary = await this.buildFileSummary(request);

    const placeholderDocs = this.buildPlaceholderDocs(request.pathPlaceholders);
    const sections = [
      'You are a multimedia conversion CLI assistant.',
      placeholderDocs,
      'Available commands:',
      toolSummary,
      'Input files:',
      fileSummary,
      `Place any new files inside: ${formatPathForPrompt(request.outputDir, request.pathPlaceholders)}`,
      'Rules:',
      '- Output must be JSON only.',
      '- Define an ordered array of command steps in the steps property.',
      `- Each step command must be one of ${this.toolRegistry.listCommandIds().join(' / ')}; use none if nothing should run.`,
      '- arguments must list CLI arguments in execution order.',
      '- reasoning should briefly explain why the step is needed.',
      '- outputs must list planned files (even if they may not exist yet).',
      '- Add followUp or overview strings when helpful.',
      request.pathPlaceholders?.length
        ? '- Use the provided placeholder tokens (for example ${OUTPUT_DIR}) instead of raw absolute paths.'
        : '- Use absolute paths and keep every path inside outputDir.'
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  async buildFileSummary(request: AgentRequest): Promise<string> {
    if (!request.files.length) {
      return 'No input files were provided.';
    }

    const summaries: string[] = [];
    for (let index = 0; index < request.files.length; index += 1) {
      const file = request.files[index];
      const lines = [
        `${index + 1}. ${file.originalName}`,
        `   path: ${formatPathForPrompt(file.absolutePath, request.pathPlaceholders)}`,
        `   size: ${file.size} bytes`
      ];
      if (file.mimeType) {
        lines.push(`   mime: ${file.mimeType}`);
      }
      try {
        const metadataLines = await formatMediaMetadataLines(file);
        if (metadataLines && metadataLines.length) {
          metadataLines.forEach((metaLine) => {
            lines.push(`   ${metaLine}`);
          });
        }
      } catch {
        // ignore metadata failures
      }
      summaries.push(lines.join('\n'));
    }
    return summaries.join('\n');
  }

  buildPlaceholderDocs(placeholders?: PathPlaceholder[]): string | null {
    const lines = describePlaceholderLines(placeholders);
    if (!lines.length) {
      return null;
    }
    return ['Path placeholders (use these instead of absolute directories):', ...lines].join('\n');
  }
}

function formatPathForPrompt(targetPath: string, placeholders?: PathPlaceholder[]): string {
  if (!targetPath) {
    return '';
  }
  return maskPathWithPlaceholders(targetPath, placeholders);
}
