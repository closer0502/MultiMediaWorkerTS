import path from 'node:path';

import { formatMediaMetadataLines } from '../shared/MediaMetadata.js';
import type { ToolRegistry } from '../registry/ToolRegistry.js';
import type { AgentRequest } from '../shared/types.js';

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

    return [
      'You are a multimedia conversion CLI assistant.',
      'Available commands:',
      toolSummary,
      'Input files:',
      fileSummary,
      `Place any new files inside: ${normalizePath(request.outputDir)}`,
      'Rules:',
      '- Output must be JSON only.',
      '- Define an ordered array of command steps in the steps property.',
      `- Each step command must be one of ${this.toolRegistry.listCommandIds().join(' / ')}; use none if nothing should run.`,
      '- arguments must list CLI arguments in execution order.',
      '- reasoning should briefly explain why the step is needed.',
      '- outputs must list planned files (even if they may not exist yet).',
      '- Add followUp or overview strings when helpful.',
      '- Use absolute paths and keep every path inside outputDir.'
    ].join('\n\n');
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
        `   path: ${normalizePath(file.absolutePath)}`,
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
}

function normalizePath(targetPath: string): string {
  return path.resolve(targetPath);
}
