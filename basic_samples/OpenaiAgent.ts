import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });

export type CommandResponse = {
  command: 'ffmpeg' | 'magick' | 'exiftool' | 'yt-dlp' | 'none';
  arguments: string[];
};

export function createOpenAIClient(apiKey?: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY || process.env.LM_STUDIO_API_KEY || 'lm-studio',
    baseURL:
      process.env.OPENAI_BASE_URL ||
      process.env.LM_STUDIO_BASE_URL ||
      process.env.LLM_BASE_URL ||
      'http://localhost:1234/v1'
  });
}

export async function getCommandSuggestion(client: OpenAI, userQuery: string) {
  const response = await client.responses.create({
    model: 'gpt-5',
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: '#あなたはユーザーの求める問題を解決する最適なターミナルコマンドを返答します。\n#あなたが使えるコマンドは以下のコマンドリストです。\nffmpeg\n- magick(ImageMagick)\n- exiftool\n- yt-dlp\n- none (ユーザーの求める問題を解決する上でどのコマンドでも無力な場合)\n\n#返答はJSON schemaに従って返してください'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: userQuery
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'command_with_arguments',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command name (must be one of: ffmpeg, magick, exiftool, yt-dlp, or none).',
              enum: ['ffmpeg', 'magick', 'exiftool', 'yt-dlp', 'none']
            },
            arguments: {
              type: 'array',
              description: 'Arguments for the command (each specified as a non-empty string; can be empty array).',
              items: {
                type: 'string',
                minLength: 1
              }
            }
          },
          required: ['command', 'arguments'],
          additionalProperties: false
        }
      }
    },
    reasoning: {
      effort: 'low'
    },
    tools: [],
    store: true
  });
  return response;
}
