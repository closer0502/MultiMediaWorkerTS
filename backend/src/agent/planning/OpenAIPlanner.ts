import OpenAI from 'openai';
import { DEFAULT_MODEL } from '../config/constants.js';
import { PromptBuilder } from './PromptBuilder.js';
import { PlanValidator } from './PlanValidator.js';
import { ResponseParser } from './ResponseParser.js';
import type { ToolRegistry } from '../registry/ToolRegistry.js';
import type { AgentRequest, CommandPlan } from '../shared/types.js';

type PlannerOptions = {
  model?: string;
  promptBuilder?: PromptBuilder;
  planValidator?: PlanValidator;
};

type PlanRequestOptions = {
  debug?: boolean;
  includeRawResponse?: boolean;
};

type PlanResult = {
  plan: CommandPlan;
  rawPlan: CommandPlan;
  debug?: Record<string, any>;
};

/**
 * Generates executable command plans with the OpenAI Responses API.
 */
export class OpenAIPlanner {
  private readonly client: OpenAI;
  private readonly toolRegistry: ToolRegistry;
  private readonly model: string;
  private readonly promptBuilder: PromptBuilder;
  private readonly planValidator: PlanValidator;

  constructor(client: OpenAI, toolRegistry: ToolRegistry, options: PlannerOptions = {}) {
    this.client = client;
    this.toolRegistry = toolRegistry;
    this.model = options.model || DEFAULT_MODEL;
    this.promptBuilder = options.promptBuilder || new PromptBuilder(toolRegistry);
    this.planValidator = options.planValidator || new PlanValidator(toolRegistry);
  }

  async plan(request: AgentRequest, options: PlanRequestOptions = {}): Promise<PlanResult> {
    const developerPrompt = await this.promptBuilder.build(request);
    const responsePayload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: this.model,
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: developerPrompt
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: request.task
            }
          ]
        }
      ],
      text: {
        format: this.buildResponseFormat()
      },
      reasoning: {
        effort: 'low'
      },
      tools: [],
      store: true
    };

    // eslint-disable-next-line no-console
    console.log('[planner request]', JSON.stringify(responsePayload, null, 2));

    const response = await this.client.responses.create(responsePayload);

    const responseText = ResponseParser.extractText(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch (error: any) {
      throw new Error(`Failed to parse OpenAI response as JSON: ${error.message}`);
    }

    const normalized = this.normalizePlanStructure(parsed);

    const debug = options.debug
      ? {
          model: this.model,
          developerPrompt,
          requestPayload: safeSerialize(responsePayload),
          responseText,
          parsed: normalized,
          rawResponse: options.includeRawResponse ? safeSerialize(response) : undefined
        }
      : undefined;

    try {
      const plan = this.planValidator.validate(normalized, request.outputDir);
      return { plan, rawPlan: normalized, debug };
    } catch (error: any) {
      if (error && typeof error === 'object') {
        const errorObj = error as Record<string, any>;
        errorObj.rawPlan = normalized;
        if (debug) {
          errorObj.debug = debug;
        }
        errorObj.responseText = responseText;
      }
      throw error;
    }
  }

  buildResponseFormat(): OpenAI.Responses.ResponseFormatTextJSONSchemaConfig {
    return {
      type: 'json_schema',
      name: 'command_plan',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['steps'],
        properties: {
          steps: {
            type: 'array',
            description: 'Ordered command plan.',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['command', 'arguments', 'reasoning', 'outputs'],
              properties: {
                command: {
                  type: 'string',
                  description: 'Command name to execute.',
                  enum: this.toolRegistry.listCommandIds()
                },
                arguments: {
                  type: 'array',
                  description: 'Ordered command arguments.',
                  items: {
                    type: 'string'
                  }
                },
                reasoning: {
                  type: 'string',
                  description: 'Why this step is needed.'
                },
                outputs: {
                  type: 'array',
                  description: 'Planned output files.',
                  items: {
                    type: 'object',
                    required: ['path', 'description'],
                    additionalProperties: false,
                    properties: {
                      path: {
                        type: 'string'
                      },
                      description: {
                        type: 'string'
                      }
                    }
                  }
                }
              }
            },
            optionalProperties: {
              id: {
                type: 'string',
                description: 'Optional identifier for the step.'
              },
              title: {
                type: 'string',
                description: 'Short label for the step.'
              },
              note: {
                type: 'string',
                description: 'Additional explanation or caution.'
              }
            }
          }
        },
        optionalProperties: {
          overview: {
            type: 'string',
            description: 'High level summary of the approach.'
          },
          followUp: {
            type: 'string',
            description: 'Optional follow-up guidance for the operator.'
          }
        }
      }
    };
  }

  normalizePlanStructure(value: unknown): CommandPlan {
    if (!value || typeof value !== 'object') {
      return { overview: '', followUp: '', steps: [] };
    }

    if (Array.isArray((value as any).steps)) {
      const typed = value as any;
      return {
        overview: typeof typed.overview === 'string' ? typed.overview : '',
        followUp: typeof typed.followUp === 'string' ? typed.followUp : '',
        steps: typed.steps.map((step: any) => ({
          command: step?.command,
          arguments: Array.isArray(step?.arguments) ? [...step.arguments] : [],
          reasoning: typeof step?.reasoning === 'string' ? step.reasoning : '',
          outputs: Array.isArray(step?.outputs) ? [...step.outputs] : [],
          id: typeof step?.id === 'string' ? step.id : undefined,
          title: typeof step?.title === 'string' ? step.title : undefined,
          note: typeof step?.note === 'string' ? step.note : undefined
        }))
      };
    }

    const typed = value as any;
    const legacyCommand = typeof typed.command === 'string' ? typed.command : 'none';
    const legacyArguments = Array.isArray(typed.arguments) ? [...typed.arguments] : [];
    const legacyOutputs = Array.isArray(typed.outputs) ? [...typed.outputs] : [];
    const legacyReasoning = typeof typed.reasoning === 'string' ? typed.reasoning : '';
    const legacyFollowUp = typeof typed.followUp === 'string' ? typed.followUp : '';

    return {
      overview: legacyReasoning,
      followUp: legacyFollowUp,
      steps: [
        {
          command: legacyCommand,
          arguments: legacyArguments,
          reasoning: legacyReasoning,
          outputs: legacyOutputs
        }
      ]
    };
  }
}

function safeSerialize(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}
