/**
 * OpenAIレスポンスからテキスト部分を抽出するヘルパークラスです。
 */
export class ResponseParser {
  /**
   * 各種レスポンス構造から最初に見つかったテキストを取り出します。
   * @param {any} response
   * @returns {string}
   */
  static extractText(response) {
    // レスポンスの基本検証
    if (!response || typeof response !== 'object') {
      throw new Error('OpenAIレスポンスが不正です。');
    }

    // パターン1: output_textフィールドから直接取得
    if (typeof response.output_text === 'string') {
      return response.output_text;
    }

    // パターン2: output配列構造からテキストを探索
    if (Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item && Array.isArray(item.content)) {
          for (const chunk of item.content) {
            if (chunk && typeof chunk.text === 'string') {
              return chunk.text;
            }
          }
        }
      }
    }

    // パターン3: choices配列構造からテキストを探索（Chat Completions API形式）
    if (Array.isArray(response.choices)) {
      for (const choice of response.choices) {
        const content = choice?.message?.content;
        // contentが文字列の場合
        if (typeof content === 'string') {
          return content;
        }
        // contentが配列の場合（マルチモーダル対応）
        if (Array.isArray(content)) {
          const textChunk = content.find((part) => part.type === 'text' && typeof part.text === 'string');
          if (textChunk && typeof textChunk.text === 'string') {
            return textChunk.text;
          }
        }
      }
    }

    // すべてのパターンで取得できなかった場合はエラー
    throw new Error('OpenAIレスポンスからテキストを取得できませんでした。');
  }
}
