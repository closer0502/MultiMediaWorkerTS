# MultiMediaWorker

MultiMediaWorker は、自然言語の指示を ffmpeg / ImageMagick / ExifTool / yt-dlp などの CLI コマンド列に変換し、進捗と生成物を Web + Electron UI で可視化するツールです。バックエンドのエージェントが request -> plan -> execute -> summarize の全フェーズを担当し、フロントエンドが進捗・履歴・出力を表示します。

## 目次
1. [概要](#概要)
2. [ディレクトリ構成](#ディレクトリ構成)
3. [必須要件](#必須要件)
4. [セットアップ](#セットアップ)
5. [開発ワークフロー](#開発ワークフロー)
6. [テストとビルド](#テストとビルド)
7. [デバッグ / プレビュー用ユーティリティ](#デバッグ--プレビュー用ユーティリティ)
8. [HTTP API](#http-api)
9. [CLI ツールの追加](#cli-ツールの追加)

## 概要
- バックエンド (Express + TypeScript) は LLM から受け取ったプランを順番に実行し、フェーズ情報 (`request -> plan -> execute -> summarize`) を JSON で返します。
- フロントエンド (React + Vite) はタスクフォーム、ファイル添付、進捗モーダル、最新結果、履歴などを提供します。
- Electron 版は同じフロントエンドをデスクトップ向けにラップし、アップロードや成果物を `app.getPath('userData')/worker-data/` に保存します。

## ディレクトリ構成
```
backend/
  src/
    agent/               # プランナー / 実行器 / フェーズトラッカー
    server/              # Express ベースの API サーバー
  tests/agent.test.ts
frontend/
  src/                   # React + Vite フロントエンド
  vite.config.ts
public/                  # 静的アセット
storage/                 # 一時ファイル (Git 管理外)
```

## 必須要件
- Node.js 18 以上
- PATH に登録済みの CLI: `ffmpeg`, `magick`, `exiftool`, `yt-dlp` など
- OpenAI API キー (`.env.local` に `OPENAI_API_KEY` を設定)

## セットアップ
1. 環境変数ファイルを複製:
   ```bash
   cp .env.example .env.local
   ```
2. 依存パッケージをインストール:
   ```bash
   npm install
   ```

## 開発ワークフロー
### Web フロントエンド + バックエンド
- バックエンド API: `npm run dev:server` -> http://localhost:3001
- Local LLM backend (LM Studio API): `npm run dev:server:lm` -> http://localhost:3001 (set `LLM_BASE_URL` in `.env.local.lm` for LM Studio)
- フロントエンド (Vite): `npm run dev:client` -> http://localhost:5173 (バックエンドへプロキシ)
- 片方だけ起動する場合、追加の環境変数 (`VITE_DEV_SERVER_URL` など) は不要です。

### Electron (デスクトップ)
- `npm run dev:desktop`: Vite 開発サーバーと Electron を同時起動 (ELECTRON_DEV=1)。
- `npm run start:desktop`: `npm run build` 済みの成果物を使って Electron を疑似本番モードで起動 (ELECTRON_DEV=0)。
- `npm run package:desktop`: `npm run build` 実行後に Electron Builder で各 OS 向けインストーラーを作成 (出力は `dist/`)。

## テストとビルド
- すべてのテスト: `npm test`
  - バックエンドのみ: `npm run test:backend`
  - フロントエンドのみ: `npm run test:frontend`
- クライアント本番ビルド: `npm run build:client`
- ビルド済みフロントエンドのプレビュー: `npm run preview:client`
- バックエンド + フロントエンドの一括ビルド: `npm run build`

## デバッグ / プレビュー用ユーティリティ
### 進捗モーダルを単体で起動できるプレビュー
1. `npm run dev:client` を起動。
2. `http://localhost:5173/?progressPreview=1` にアクセス。
3. 以下のクエリで表示を調整できます。
   - `stage`: `0` ~ `PROGRESS_STEPS.length - 1`
   - `logs`: `step1|step2|...` のようなパイプ区切り文字列

### "エラーから再編集"した場合の送信プロンプトの組み立てを確認できるプレビュー
開発モード (`import.meta.env.DEV` が true) のみ有効です。
1. `npm run dev:client` を実行し、`http://localhost:5173/?error-retry-test` を開きます。
2. もしくは `npm run dev:desktop` で Electron を起動し、DevTools で `window.location.href = window.location.origin + '/?error-retry-test'` を実行して画面を切り替えます。
3. クエリを外す、または本番ビルドを起動すると通常 UI に戻ります。

## HTTP API
- `POST /api/tasks` (`multipart/form-data`)
  - フィールド
    - `task`: 必須。自然言語で行いたい処理内容。
    - `files`: 任意。複数指定可。
  - クエリパラメータ
    - `dryRun=true`: CLI 実行をスキップし、プランのみ生成。
    - `debug=true` / `debug=verbose`: プランニングの補足情報を含めて返す。

成功レスポンス例:
```json
{
  "status": "success",
  "sessionId": "session-...",
  "task": "135329973_p1.png を 512x512 にリサイズしてください",
  "plan": { "...": "..." },
  "result": { "...": "..." },
  "phases": [
    { "id": "request", "status": "success", "meta": { "fileCount": 1 } },
    { "id": "plan", "status": "success", "meta": { "command": "magick" } },
    { "id": "execute", "status": "success", "meta": { "exitCode": 0 } },
    { "id": "summarize", "status": "success", "meta": { "outputs": 1 } }
  ],
  "debug": {
    "model": "gpt-4o-mini",
    "developerPrompt": "...",
    "responseText": "..."
  },
  "uploadedFiles": [
    { "originalName": "135329973_p1.png", "size": 123456 }
  ]
}
```
失敗時は `status: "failed"` になりつつ、`phases` と可能であれば `plan` も含まれます。

## CLI ツールの追加
1. `backend/src/agent/constants.ts` の `DEFAULT_TOOL_DEFINITIONS` にツール定義を追加。
2. 追加する CLI をローカルにインストールし、PATH から実行できるようにする。
3. 特別な UI や検証が必要な場合のみフロントエンドを修正 (多くはバックエンド側の定義追加だけで対応可能)。