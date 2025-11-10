import { DEFAULT_TOOL_DEFINITIONS } from '../config/constants.js';
import type { ToolDefinitionMap } from '../config/constants.js';

/**
 * 利用可能なCLIコマンド定義を保持するレジストリ。
 */
export class ToolRegistry {
  private readonly definitions: ToolDefinitionMap;

  constructor(definitions: ToolDefinitionMap = {}) {
    this.definitions = { ...DEFAULT_TOOL_DEFINITIONS, ...definitions };
  }

  static createDefault(): ToolRegistry {
    return new ToolRegistry();
  }

  hasCommand(command: string): boolean {
    return Boolean(this.definitions[command]);
  }

  listCommandIds(): string[] {
    return Object.keys(this.definitions);
  }

  listExecutableCommandIds(): string[] {
    return this.listCommandIds().filter((id) => id !== 'none');
  }

  describeExecutableCommands(): Array<{ id: string; title: string; description: string }> {
    return this.listExecutableCommandIds().map((id) => ({
      id,
      title: this.definitions[id].title,
      description: this.definitions[id].description
    }));
  }
}
