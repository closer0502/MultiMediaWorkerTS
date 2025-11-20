import OpenAI from 'openai';

type OpenAIClientOptions = {
  apiKey?: string;
  baseURL?: string;
  OpenAIClass?: typeof OpenAI;
};

export function createOpenAIClient(options: OpenAIClientOptions = {}): OpenAI {
  const { apiKey, baseURL, OpenAIClass = OpenAI } = options;
  const resolvedBaseUrl = baseURL || process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL;
  const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || (resolvedBaseUrl ? 'lm-studio' : undefined);

  return new OpenAIClass({
    apiKey: resolvedApiKey,
    baseURL: resolvedBaseUrl
  });
}
