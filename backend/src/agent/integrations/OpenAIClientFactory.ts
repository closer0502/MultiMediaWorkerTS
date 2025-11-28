import OpenAI from 'openai';

export function createOpenAIClient(apiKey: string, OpenAIClass: typeof OpenAI = OpenAI): OpenAI {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required in .env.local');
  }
  return new OpenAIClass({
    apiKey
  });
}
