import OpenAI from 'openai';

export function createOpenAIClient(apiKey?: string, OpenAIClass: typeof OpenAI = OpenAI): OpenAI {
  return new OpenAIClass({
    apiKey: apiKey || process.env.OPENAI_API_KEY
  });
}
