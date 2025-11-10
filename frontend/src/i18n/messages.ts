export const MESSAGES = {
  app: {
    header: {
      title: 'MultiMedia Worker',
      description:
        '指定した指示に従い、ffmpeg / ImageMagick / ExifTool / yt-dlp などのコマンドを自動生成して実行します。'
    },
    sections: {
      taskForm: 'タスクを送信',
      latestResult: '最新の結果',
      history: '履歴'
    },
    errors: {
      planFailed: 'プランの実行中にエラーが発生しました。'
    }
  },
  taskForm: {
    heading: 'タスクを送信',
    taskLabel: '内容 / 指示',
    placeholder: '例: 135329973_p1.png を 512x512 の PNG にリサイズ',
    attachLabel: 'ファイルを添付',
    attachAria: 'ファイルを添付',
    submit: '送信する',
    submitting: '送信中...',
    reset: 'リセット',
    debugOptionsTitle: 'デバッグオプション',
    dryRunLabel: 'ドライラン（コマンドを実行せず検証）',
    debugVerboseLabel: '詳細なデバッグログを有効にする（レスポンスを含む）'
  },
  filePreview: {
    selectedLabel: (count) => `選択中のファイル（${count}件）`,
    clear: 'クリア',
    none: 'ファイルはまだ選択されていません。',
    add: 'ファイルを追加',
    previewAlt: (name) => `${name} のプレビュー`
  },
  latestOutputs: {
    heading: '生成物',
    processing: '最新の生成物は処理が完了すると表示されます。',
    empty: 'まだ表示できる生成物はありません。',
    errorTitle: 'プランの実行中にエラーが発生しました。',
    errorAction: 'エラーから再編集',
    complaintSectionTitle: '修正リクエスト',
    complaintHint: '最新の生成物に対する修正依頼を送信できます。',
    complaintPlaceholder: '例: 出力された画像が暗いので明るくしてください。',
    complaintButton: '修正依頼を送信',
    complaintSubmitting: '送信中...',
    complaintDisabledHint: '修正依頼は生成物を確認できる状態で利用できます。'
  },
  complaint: {
    helperWithOutputs: '最新の生成物に対する要望を記入して送信してください。',
    helperWithoutOutputs: '生成物が表示されると修正依頼を送信できます。'
  },
  progress: {
    dialogTitle: '進行状況を確認しています',
    lead: 'そのままお待ちください。',
    logTitle: '実行ログ',
    logAriaLabel: '実行ログ',
    logEmpty: 'まだ出力はありません。',
    statusLabels: {
      success: '成功',
      failed: '失敗'
    },
    stages: [
      {
        title: '依頼内容を確認しています',
        description: '入力された内容と補足情報を解析しています。'
      },
      {
        title: '計画を作成しています',
        description: '必要な手順を洗い出し、実行順序を準備しています。'
      },
      {
        title: 'コマンドを実行しています',
        description: '必要なコマンドを順番に実行し、結果を収集しています。'
      },
      {
        title: '結果を取りまとめています',
        description: '生成物を整理し、確認しやすい形に整えています。'
      }
    ]
  },
  workflow: {
    validation: {
      emptyTask: 'タスク内容を入力してください。',
      emptyComplaint: '修正依頼の内容を入力してください。',
      noOutputs: '修正対象の生成物が見つかりません。'
    },
    helper: {
      withOutputs: '最新の生成物に対する修正点を記入してください。',
      withoutOutputs: '生成物が表示されると修正依頼を送信できます。'
    },
    errors: {
      submitGeneric: '送信中に問題が発生しました。',
      parseResponse: 'サーバーレスポンスを解析できませんでした。',
      parseEmpty: 'サーバーから空のレスポンスが返されました。',
      executionFailed: 'プランの実行中に失敗しました。',
      executionError: '実行中にエラーが発生しました。',
      revisionFailed: '修正リクエストの送信に失敗しました。'
    },
    logs: {
      commandStart: 'コマンドを開始しました',
      timeout: '終了コード: タイムアウトしました',
      exitCodeUnknown: '終了コード: 不明',
      exitCodePrefix: '終了コード: ',
      skipDryRun: 'ドライランのためスキップしました',
      skipPreviousFailed: '前のステップ失敗のためスキップしました',
      skipNoCommand: 'コマンドが設定されていないためスキップしました',
      skipFallbackPrefix: '理由: ',
      skipFallbackSuffix: ' のためスキップしました',
      noAdditionalInfo: '追加情報はありません。'
    }
  },
  progressPreview: {
    defaultLogs: [
      'タスクを受け付けました。コマンドプランを生成しています...',
      'FFmpeg の実行と補助コマンドを準備しています...',
      'ログを収集中です。最終チェックが完了するまでお待ちください。'
    ]
  },
  phase: {
    none: 'フェーズはまだありません。',
    startedAt: '開始',
    finishedAt: '終了',
    errorLabel: 'エラー',
    logsLabel: (count) => `ログ (${count})`
  },
  plan: {
    summarySeparator: ' / ',
    summaryStepPrefix: (index) => `${index + 1}）`,
    executed: '実行済み',
    executedWithMeta: (meta) => `実行済み（${meta}）`,
    skip: 'スキップ',
    exitCodeLabel: '終了コード',
    timedOutLabel: 'タイムアウト',
    unknown: '不明',
    dryRunDescription: 'ドライランモードのため説明のみです。',
    previousFailedDescription: '直前のステップが失敗しました。',
    noOpDescription: 'コマンドが "none" に設定されています。',
    noAdditionalInfo: '追加情報はありません。',
    outputFallback: '出力',
    stepLabel: (index) => `ステップ ${index + 1}`,
    copyCommand: 'コマンドをコピー',
    copyCommandCopied: 'コピーしました',
    copyCommandAria: (title) => `${title} のコマンドをコピー`,
    skipReasonPrefix: 'スキップ理由: '
  },
  process: {
    notExecuted: 'コマンドはまだ実行されていません。',
    exitCode: '終了コード',
    timedOut: 'タイムアウト',
    dryRun: 'ドライラン',
    yes: 'はい',
    no: 'いいえ',
    unknown: '不明',
    stepsHeading: 'ステップ詳細',
    stepLabel: (index) => `ステップ ${index + 1}`,
    skipReasonPrefix: 'スキップ理由: ',
    stdout: '標準出力',
    stderr: '標準エラー',
    emptyLog: '（なし）'
  },
  output: {
    none: '出力ファイルはまだありません。',
    descriptionFallback: '出力',
    exists: '存在します',
    missing: '見つかりません',
    download: 'ダウンロード',
    previewAlt: '出力プレビュー'
  },
  uploaded: {
    none: 'アップロードされたファイルはありません。'
  },
  debug: {
    empty: 'デバッグ情報はありません。'
  },
  stepStatusBadge: {
    executed: '実行済み',
    skipped: 'スキップ',
    exitCode: '終了コード:',
    timedOut: 'タイムアウト'
  },
  result: {
    revisionChip: '修正依頼',
    dryRunChip: 'ドライラン',
    debugChip: 'デバッグ',
    complaintHeading: 'ユーザーからの要望',
    phasesHeading: 'ワークフロー',
    planHeading: 'コマンドプラン',
    planUnavailable: 'コマンドプランは利用できません。',
    followUpHeading: '追加の指示',
    rawPlanHeading: 'プラン（生データ）',
    rawPlanSummary: 'JSON を表示',
    responseHeading: 'レスポンス',
    responseSummary: 'レスポンス全文を表示',
    uploadsHeading: 'アップロード済みファイル',
    outputsHeading: '出力ファイル',
    summaryHeading: '実行サマリー',
    debugHeading: 'デバッグログ'
  },
  history: {
    none: '履歴はまだありません。',
    complaintLabel: '修正依頼の内容',
    planFallback: '（プランなし）',
    revisionChip: '修正依頼'
  },
  formatters: {
    unknownStatus: '不明',
    inProgress: '進行中',
    pending: '待機中',
    booleanTrue: 'はい',
    booleanFalse: 'いいえ',
    phaseMetaKeys: {
      executor: '実行主体',
      duration: '処理時間',
      durationMs: '処理時間 (ms)',
      attempt: '試行回数',
      attempts: '試行回数',
      retries: 'リトライ回数'
    }
  }
};
