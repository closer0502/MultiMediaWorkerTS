# エージェント実行プロセス解説

このドキュメントは、`backend/src` 配下で動くメディアエージェントの実行フローと主要コンポーネントの役割を整理したものです。HTTP リクエストが届いてから CLI コマンドが実行されるまでを、ステップごとに追いながら把握できます。

## 1. 全体フロー（ステップバイステップ）

1. **HTTP リクエスト受信**  
   - エントリポイント: `MediaAgentServer.handleTaskRequest` (`backend/src/server/MediaAgentServer.ts`)  
   - 行うこと:  
     - `prepareSession` で入力・出力ディレクトリを初期化  
     - `multer` でファイルを受け取り `AgentRequest.files` に格納  
     - クエリから `dryRun` / `debug` などのオプションを解析  
     - `createRequestPhase` で最初のフェーズを記録

2. **エージェントリクエストの構築**  
   - ファイルメタ情報とタスク内容をまとめて `AgentRequest` オブジェクトを生成  
   - 利用するツール一覧は `ToolRegistry` (`backend/src/agent/registry/ToolRegistry.ts`) から取得

3. **タスク実行の委譲**  
   - `MediaAgentServer` から `MediaAgent.runTask` を呼び出し (`backend/src/agent/core/MediaAgent.ts`)、フェーズ管理に `TaskPhaseTracker` が初期化される

4. **プラン作成フェーズ**  
   - `OpenAIPlanner.plan` (`backend/src/agent/planning/OpenAIPlanner.ts`) が呼び出される  
     1. `PromptBuilder.build` で開発用プロンプトを構築  
     2. OpenAI Responses API (`openai.responses.create`) を実行  
     3. `ResponseParser.extractText` でレスポンスからテキストを抽出  
     4. JSON を解析して `PlanValidator.validate` でコマンドプランを検証  
   - 成功時は `plan` と `rawPlan` が `MediaAgent` に返る。失敗すると `MediaAgentTaskError` にフェーズ情報付きでラップされる

5. **コマンド実行フェーズ**  
   - `CommandExecutor.execute` (`backend/src/agent/execution/CommandExecutor.ts`) が担当  
     1. `ensureOutputDirectories` で出力ディレクトリを作成  
     2. `dryRun` でない場合は `spawnProcess` により子プロセスを起動  
     3. 結果を `describeOutputs` が整形し、ファイルサイズや公開パスを付与

6. **要約フェーズとレスポンス組み立て**  
   - `MediaAgent` がフェーズごとに `summarize` を呼び、集計データを返却  
   - `MediaAgentServer` が `requestPhase` を含むフェーズ配列・プラン・実行結果をまとめて JSON 応答としてクライアントへ返す

7. **エラーハンドリング**  
   - 例外が発生すると `MediaAgentTaskError` (`backend/src/agent/core/MediaAgentTaskError.ts`) によってフェーズ履歴と追加コンテキストが提供され、サーバーは `status: failed` の応答を返す

## 2. 主要コンポーネントの役割

| コンポーネント | 位置 | 主な役割 |
| --- | --- | --- |
| `MediaAgentServer` | `backend/src/server/MediaAgentServer.ts` | HTTP 経由のリクエスト受付、セッション準備、エージェント呼び出し、レスポンス整形 |
| `MediaAgent` | `backend/src/agent/core/MediaAgent.ts` | プランナーとエグゼキューターを束ね、フェーズ管理を行う統括クラス |
| `TaskPhaseTracker` | `backend/src/agent/core/TaskPhaseTracker.ts` | `plan`・`execute`・`summarize` など各フェーズの状態とログを管理 |
| `MediaAgentTaskError` | `backend/src/agent/core/MediaAgentTaskError.ts` | 失敗時にフェーズ情報とデバッグ情報を保持する例外 |
| `OpenAIPlanner` | `backend/src/agent/planning/OpenAIPlanner.ts` | OpenAI Responses API でコマンドプランを生成 |
| `PromptBuilder` | `backend/src/agent/planning/PromptBuilder.ts` | タスク内容とツール一覧を元に開発用プロンプトを組み立て |
| `PlanValidator` | `backend/src/agent/planning/PlanValidator.ts` | 生成されたプランの妥当性検証と正規化を担当 |
| `ResponseParser` | `backend/src/agent/planning/ResponseParser.ts` | OpenAI レスポンスから最適なテキスト部分を抽出 |
| `CommandExecutor` | `backend/src/agent/execution/CommandExecutor.ts` | 実際に CLI コマンドを実行し結果を整形 |
| `ToolRegistry` | `backend/src/agent/registry/ToolRegistry.ts` | 利用可能コマンドとメタ情報の管理 |
| `constants` | `backend/src/agent/config/constants.ts` | 既定のツール定義や各種設定値 |
| `types` | `backend/src/agent/shared/types.ts` | JSDoc 用の型定義（`AgentRequest` / `CommandPlan` など） |
| `createMediaAgent` | `backend/src/agent/core/MediaAgent.ts` | プランナーとエグゼキューターを組み合わせたエージェントを構築 |
| `createOpenAIClient` | `backend/src/agent/integrations/OpenAIClientFactory.ts` | API キー付きの OpenAI クライアントを生成 |

## 3. 実行時の呼び出し関係（簡易シーケンス）

```
MediaAgentServer.handleTaskRequest
 ├─ MediaAgent.runTask
 │  ├─ OpenAIPlanner.plan
 │  │  ├─ PromptBuilder.build
 │  │  ├─ client.responses.create (OpenAI API)
 │  │  ├─ ResponseParser.extractText
 │  │  └─ PlanValidator.validate
 │  ├─ CommandExecutor.execute
 │  │  ├─ ensureOutputDirectories
 │  │  ├─ spawnProcess
 │  │  └─ describeOutputs
 │  └─ TaskPhaseTracker.start / complete / fail / log
 └─ レスポンス JSON の組み立て
```

## 4. 参考: インスタンス生成

- `backend/src/server.ts` で `createOpenAIClient` と `createMediaAgent` を使ってエージェントが構築され、`MediaAgentServer` に渡されます。
- ツール定義を拡張したい場合は `ToolRegistry` をカスタム初期化し、`createMediaAgent` の引数に渡してください。

---

このファイルを起点に、コードベースの各ファイルを辿ることでエージェントの実行構造を素早く把握できます。
