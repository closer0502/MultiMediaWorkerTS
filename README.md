# MultiMediaWorker

MultiMediaWorker は、自然言語のリクエストを ffmpeg / ImageMagick / ExifTool / yt-dlp などの CLI コマンドに変換して実行する AI エージェント + Web UI アプリです。エージェントはバックエンドでコマンドを計画・実行し、その結果と生成物をフロントエンドで可視化します。

## ディレクトリ構成

```
backend/
  src/
    agent/               # プランナー・実行器・フェーズトラッカーなど
    server/              # Express ベースの API サーバー
    server.js            # バックエンドのエントリーポイント
  tests/agent.test.js    # バックエンド向けユニットテスト

frontend/
  src/                   # React + Vite フロントエンド
  index.html
  vite.config.js

public/generated/        # 生成物 (静的配信用、Git 管理外)
storage/                 # アップロードファイルの一時保存 (Git 管理外)
```

## 事前準備

- Node.js 18 以降
- `ffmpeg`, `magick`, `exiftool`, `yt-dlp` などの CLI をローカル環境にインストールし、`PATH` に通す
- `.env.example` を複製して `.env.local` を作成し、`OPENAI_API_KEY` を設定

```bash
cp .env.example .env.local
```

## インストール

```bash
npm install
```

## 開発サーバーの起動

バックエンドとフロントエンドを別ターミナルで起動します。

```bash
# ターミナル 1: エージェント API
npm run dev:server

# ターミナル 2: フロントエンド (Vite)
npm run dev:client
```

- バックエンド: http://localhost:3001
- フロントエンド: http://localhost:5173 (バックエンドへプロキシ)

## 進捗モーダルのプレビュー用URL

- `npm run dev:client` を起動し、`http://localhost:5173/?progressPreview=1` にアクセスすると、進捗モーダルだけを表示した状態で確認できます。
- progressPreview=1 は「プレビューを有効にする」ことだけを示すフラグです。値の「1」自体に段階や割合といった意味はなく、「このクエリが付いている＝進捗モーダルをプレビュー表示する」というスイッチとして扱っています。
- `stage` (0 〜 `PROGRESS_STEPS.length - 1`) や `logs` (`|` 区切りの文字列) をクエリで指定すると、表示内容を個別に調整できます。


## テスト & ビルド

```bash
# バックエンドのユニットテスト
npm test

# フロントエンドの本番ビルド出力
npm run build:client

# ビルド済みフロントエンドのプレビュー
npm run preview:client
```

## デスクトップアプリ (Electron)

- `npm run dev:desktop`  
  Vite の開発サーバーと Electron を同時に立ち上げ、デスクトップ UI からバックエンド API を呼び出します。バックエンドは Electron プロセス側で自動起動します。
- `npm run start:desktop`  
  `npm run build` でバックエンド/フロントエンドをビルドした後、同じ成果物を使って Electron を実行します（`ELECTRON_DEV=0` で擬似本番モード）。
- `npm run package:desktop`  
  `npm run build` を実行してから Electron Builder で各 OS 向けバイナリを生成します（出力は `dist/` フォルダ）。

デスクトップ版では生成物やアップロードファイルを `app.getPath('userData')/worker-data/` 以下（例: Windows なら `%APPDATA%/MultiMediaWorker/worker-data`）に保存します。`.env.local` は Web 版と同じものをプロジェクトルートに配置してください。

## ワークフローの可視化とデバッグ

- バックエンドは「request → plan → execute → summarize」の各フェーズを `phases` 配列として JSON で返します。フロントエンドはチェックリストとして表示し、いつ・どこで失敗したかが一目で分かります。
- フォームのオプションで「Dry run (CLI を実行せずに計画のみ確認)」「Debug (LLM へのプロンプトやレスポンスを返す)」「Verbose (Debug + 生レスポンス)」が選択できます。
- 実行ログ (`stdout` / `stderr`) や debug 情報は UI 上で展開表示できます。

## HTTP API


- `POST /api/tasks` (`multipart/form-data`)  
  フィールド:
  - `task`: 必須、自然言語で行いたい処理。
  - `files`: 任意、処理対象ファイル（複数可）。
  - クエリオプション:
    - `dryRun=true` … CLI 実行をスキップ。
    - `debug=true` または `debug=verbose` … プランニングの補足情報を返す。

レスポンス例（成功時）:

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

エラー時も `phases` と (可能なら) `plan` を含む JSON が返ります。`status` は `failed` になり、どのフェーズで失敗したかを UI で確認できます。

## ツールの追加方法

1. `backend/src/agent/constants.js` の `DEFAULT_TOOL_DEFINITIONS` にツール情報を追加。
2. 追加した CLI をホスト環境へインストールし、`PATH` で利用可能にする。
3. 必要に応じて UI の文言やバリデーションを調整（多くの場合はバックエンドの定義だけで対応可能）。

