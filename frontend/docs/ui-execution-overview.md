# フロントエンド実行プロセス解説

このドキュメントは、`frontend/src` を中心にした UI 側の流れと主要コンポーネントを把握するためのものです。ユーザー操作からサーバー応答の表示まで、どの関数がどんな役割を担うかをステップ形式でまとめています。

## 1. 全体フロー（ステップバイステップ）

1. **エントリポイントと初期化**  
   - `main.tsx` (`frontend/src/main.tsx`)  
   - `ReactDOM.createRoot(...).render(<App />)` によりルートコンポーネント `App` をマウント。開発時は `React.StrictMode` で警告検知も行います。

2. **初期状態のセットアップ**  
   - `App.tsx` (`frontend/src/App.tsx`) 内の `useState` でフォーム入力、履歴、ツール一覧、デバッグ設定などの状態を用意します。

3. **ユーザー入力の収集**  
   - タスク入力フィールドとファイル選択 (`<input type="file" multiple />`) を `App` が保持。  
   - `FilePreviewList` コンポーネントで選択済みファイルを表示し、合計サイズなどを算出します。  
   - チェックボックスでドライランやデバッグモードを設定できます。

4. **フォーム送信処理**  
   - `handleSubmit` が `<form onSubmit={handleSubmit}>` から呼ばれます。  
   - タスク内容と選択ファイルを `FormData` に詰め、クエリパラメータで `debug` / `dryRun` などを付与して `/api/tasks` に POST。  
   - 送信時刻とファイル情報を保持し、レスポンス待機中は `isSubmitting` フラグで UI をロックします。

5. **サーバー応答の処理**  
   - 応答 JSON を解析し、成功時は `history` ステートに新しいエントリを追加。プラン情報（`plan` / `rawPlan`）、フェーズ履歴、生成物のメタ情報をまとめて保持します。  
   - 失敗時は `error` メッセージを表示しつつ履歴にも失敗エントリを追加。`debug` フラグがオンならデバッグ用ドロワーで詳細を確認できます。

6. **結果表示**  
   - メインビューでは直近の結果を `ResultPanel` で表示。  
   - `PhaseTimeline` がサーバーから返されたフェーズ進行状況をタイムライン形式で描画。  
   - `OutputList` が生成ファイルをテーブルで表示し、公開パスがあればリンク化します。  
   - 下部の `HistoryList` で過去実行の簡易履歴を参照できます。

7. **デバッグ情報の展開**  
   - `debugEnabled` がオンのときはサーバーから返された `rawPlan` や `responseText` / `debug` 情報をサイドドロワーに表示。  
   - `PlanView` と `RawJsonViewer` (`App.tsx` 内のユーティリティ) が JSON を整形して表示します。

8. **フォームのリセットおよび再実行**  
   - 成功時は `resetForm` がタスクとファイル選択をクリア。失敗時は入力を保持して再送できるようにします。  
   - `history` に保存されたエントリをクリックすると詳細を再表示でき、`handleSelectHistoryEntry` が現在の選択を更新します。

## 2. 主なコンポーネントと関数の役割

| 名称 | 位置 | 役割 |
| --- | --- | --- |
| `App` | `frontend/src/App.tsx` | UI 全体を統括。入力フォーム、結果パネル、履歴、デバッグ表示をまとめて管理 |
| `FilePreviewList` | `App.tsx` 内 | 選択されたファイルの一覧と総サイズ表示、クリア操作を提供 |
| `PhaseTimeline` | `App.tsx` 内 | サーバーから返ってくるフェーズ状態をタイムライン表示 |
| `OutputList` | `App.tsx` 内 | 生成ファイルの有無や公開パスを一覧表示 |
| `HistoryList` | `App.tsx` 内 | 過去の実行履歴を簡易表示して再参照を可能にする |
| `PlanView` / `RawJsonViewer` | `App.tsx` 内 | 生成されたプランやデバッグ用 JSON を整形表示 |
| `main.tsx` | `frontend/src/main.tsx` | ルート要素への `App` マウントとグローバルスタイルの読込 |
| `styles.css` | `frontend/src/styles.css` | UI レイアウトや状態に応じたスタイル定義 |

## 3. 送信から表示までの呼び出し関係（簡易シーケンス）

```
main.tsx
 └─ <App />
     ├─ handleSubmit (form submission)
     │  ├─ fetch('/api/tasks', FormData)
     │  ├─ setHistory([...])
     │  └─ setError / setIsSubmitting
     ├─ ResultPanel（ローカルコンポーネント）
     │  ├─ PhaseTimeline
     │  ├─ OutputList
     │  └─ DebugDrawer (開発時)
     └─ HistoryList（過去結果の再表示）
```

## 4. 補足

- `fetch` のエラーハンドリングではレスポンス本体が JSON でなくても安全に処理できるよう `response.json().catch(() => null)` としています。
- 履歴ステートにはユーザー入力時点のファイル情報も保持しているため、`dryRun` で実行しても後からデータを振り返ることができます。
- フロントエンドで使用する文言は英語が中心ですが、必要に応じて i18n 化しやすいようユーティリティ関数を切り出す余地があります。

---

この資料を起点に `App.tsx` 内の補助関数を辿ると、ユーザー操作からサーバー連携までの流れをすばやく把握できます。
