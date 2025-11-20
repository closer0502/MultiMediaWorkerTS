import OpenAI from 'openai';

/**
 * OpenAI互換エンドポイント向けクライアントを生成する。
 * デフォルトでは LM Studio のローカル API (http://localhost:1234/v1) を叩く。
 * 本家 OpenAI を使いたい場合は OPENAI_BASE_URL を空にして、OPENAI_API_KEY を設定。
 */
export function createOpenAIClient(apiKey?: string, OpenAIClass: typeof OpenAI = OpenAI): OpenAI {
  const resolvedApiKey =
    apiKey ||
    process.env.OPENAI_API_KEY ||
    process.env.LM_STUDIO_API_KEY ||
    // openai ライブラリは apiKey が必須なので、ローカル無認証用にプレースホルダを渡す
    'lm-studio';

  const baseURL =
    process.env.OPENAI_BASE_URL ||
    process.env.LM_STUDIO_BASE_URL ||
    process.env.LLM_BASE_URL ||
    'http://localhost:1234/v1';

  return new OpenAIClass({
    apiKey: resolvedApiKey,
    // baseURL は空文字を避けるため条件付き設定
    baseURL
  });
}
