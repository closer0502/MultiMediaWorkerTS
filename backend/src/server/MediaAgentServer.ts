import express, { type Request as ExpressRequest, type Response as ExpressResponse, type NextFunction as ExpressNextFunction } from 'express';
import cors from 'cors';
import multer, { type Multer } from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';

import { MediaAgentTaskError } from '../agent/index.js';
import type { MediaAgent, ToolRegistry } from '../agent/index.js';

type AgentRunner = Pick<MediaAgent, 'runTask'>;

export type MediaAgentServerOptions = {
  agent: AgentRunner;
  toolRegistry: ToolRegistry;
  publicRoot: string;
  generatedRoot: string;
  storageRoot: string;
  sessionInputRoot: string;
  clientDistRoot?: string;
};

type LogStreamEntry = {
  res: ExpressResponse;
  heartbeat: NodeJS.Timeout;
  closed: boolean;
};

type AgentSession = {
  id: string;
  inputDir: string;
  outputDir: string;
};

export type SessionAwareRequest = ExpressRequest & { agentSession?: AgentSession };

/**
 * メディアエージェントをHTTPエンドポイントと連携させるExpressベースのAPIサーバー
 */
export class MediaAgentServer {
  private readonly agent: AgentRunner;
  private readonly toolRegistry: ToolRegistry;
  private readonly publicRoot: string;
  private readonly generatedRoot: string;
  private readonly storageRoot: string;
  private readonly sessionInputRoot: string;
  private readonly clientDistRoot?: string;
  private readonly app: express.Express;
  private readonly upload: Multer;
  private readonly logStreams: Map<string, LogStreamEntry>;
  private serverInstance?: Server;
  /**
   * サーバーインスタンスを初期化
   * @param {{agent: MediaAgent, toolRegistry: ToolRegistry, publicRoot: string, generatedRoot: string, storageRoot: string, sessionInputRoot: string}} options サーバー設定オプション
   */
  constructor(options: MediaAgentServerOptions) {
    this.agent = options.agent;
    this.toolRegistry = options.toolRegistry;
    this.publicRoot = path.resolve(options.publicRoot);
    this.generatedRoot = path.resolve(options.generatedRoot);
    this.storageRoot = path.resolve(options.storageRoot);
    this.sessionInputRoot = path.resolve(options.sessionInputRoot);
    this.clientDistRoot = options.clientDistRoot ? path.resolve(options.clientDistRoot) : undefined;

    this.app = express();
    this.upload = this.createUploader();
    this.logStreams = new Map<string, LogStreamEntry>();

    this.prepareSession = this.prepareSession.bind(this);
    this.handleTaskRequest = this.handleTaskRequest.bind(this);
    this.handleRevisionRequest = this.handleRevisionRequest.bind(this);
    this.handleGetTools = this.handleGetTools.bind(this);
    this.handleTaskLogStream = this.handleTaskLogStream.bind(this);
  }

  /**
   * サーバーを起動し、指定ポートでリクエストを受け付ける
   * @param {number} port ポート番号
   * @returns {Promise<void>}
   */
  async start(port: number): Promise<void> {
    await this.ensureBaseDirectories();
    this.configureMiddleware();
    this.configureRoutes();
    await new Promise<void>((resolve) => {
      this.serverInstance = this.app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Agent server listening on http://localhost:${port}`);
        resolve();
      });
    });
  }

  /**
   * サーバーを停止する
   * @returns {Promise<void>}
   */
  async stop(): Promise<void> {
    if (!this.serverInstance) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.serverInstance.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * CORSや静的ファイル配信などのミドルウェアを設定
   */
  configureMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(
      '/files',
      express.static(this.publicRoot, {
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'wav', 'mp3']
      })
    );
    if (this.clientDistRoot && existsSync(this.clientDistRoot)) {
      this.app.use(express.static(this.clientDistRoot));
    }
  }

  /**
   * APIルートとエラーハンドラを設定
  */
  configureRoutes() {
    this.app.get('/api/task-logs', this.handleTaskLogStream);
    this.app.get('/api/tools', this.handleGetTools);
    this.app.post('/api/tasks', this.prepareSession, this.upload.array('files'), this.handleTaskRequest);
    this.app.post('/api/revisions', this.prepareSession, this.handleRevisionRequest);
    if (this.clientDistRoot) {
      const indexPath = path.join(this.clientDistRoot, 'index.html');
      if (existsSync(indexPath)) {
        this.app.get('*', (req, res, next) => {
          if (req.path.startsWith('/api') || req.path.startsWith('/files')) {
            next();
            return;
          }
          res.sendFile(indexPath);
        });
      }
    }
    this.app.use((err, req, res, next) => {
      // eslint-disable-next-line no-console
      console.error(err);
      if (res.headersSent) {
        next(err);
        return;
      }
      res.status(500).json({
        error: 'サーバーエラーが発生しました。',
        detail: err.message
      });
    });
  }

  /**
   * 利用可能なツール一覧を返すエンドポイント
   * @param {ExpressRequest} req リクエスト
   * @param {ExpressResponse} res レスポンス
   */
  handleGetTools(req, res) {
    res.json({
      tools: this.toolRegistry.describeExecutableCommands()
    });
  }

  /**
   * セッションIDと入出力ディレクトリを準備するミドルウェア
   * @param {ExpressRequest} req リクエスト
   * @param {ExpressResponse} res レスポンス
   * @param {ExpressNextFunction} next 次のミドルウェア
   */
  async prepareSession(req: SessionAwareRequest, res: ExpressResponse, next: ExpressNextFunction): Promise<void> {
    try {
      const sessionId = createSessionId();
      const inputDir = path.join(this.sessionInputRoot, sessionId);
      const outputDir = path.join(this.generatedRoot, sessionId);

      await fs.mkdir(inputDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });

      req.agentSession = {
        id: sessionId,
        inputDir,
        outputDir
      };

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * タスクリクエストを処理し、エージェントを実行してレスポンスを返す
   * @param {ExpressRequest} req リクエスト
   * @param {ExpressResponse} res レスポンス
   */
  async handleTaskRequest(req: SessionAwareRequest, res: ExpressResponse): Promise<void> {
    const logChannel = this.extractLogChannel(req);
    if (logChannel) {
      this.waitForLogChannel(logChannel).catch(() => {});
    }

    const task = (req.body?.task || '').trim();
    if (!task) {
      if (logChannel) {
        this.sendLogMessage(logChannel, 'タスク内容が空のため実行を中断しました。');
        this.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(400).json({ error: 'task フィールドは必須です。' });
      return;
    }

    const session = req.agentSession;
    if (!session) {
      if (logChannel) {
        this.sendLogError(logChannel, 'セッションの初期化に失敗しました。');
        this.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(500).json({ error: 'セッションが初期化されていません。' });
      return;
    }

    const debugMode = parseDebugMode(req.query?.debug);
    const dryRun = parseBoolean(req.query?.dryRun);
    const submittedAt = new Date().toISOString();
    const requestOptions = {
      debug: debugMode.enabled,
      verbose: debugMode.enabled,
      dryRun
    };

    const files = Array.isArray(req.files)
      ? req.files.map((file, index) => ({
          id: `${session.id}-file-${index}`,
          originalName: file.originalname,
          absolutePath: path.resolve(file.path),
          size: file.size,
          mimeType: file.mimetype
        }))
      : [];

    const agentRequest = {
      task,
      files,
      outputDir: session.outputDir
    };

    const requestPhase = createRequestPhase(task, files, { dryRun, debug: debugMode.enabled });
    requestPhase.meta.parentSessionId = null;
    requestPhase.meta.revision = false;

    try {
      if (logChannel) {
        await this.waitForLogChannel(logChannel);
        this.sendLogMessage(logChannel, 'タスクを受け付けました。コマンドプランを生成しています…');
      }

      const commandLogHandlers = logChannel ? this.createCommandLogHandlers(logChannel) : {};
      const agentResponse = await this.agent.runTask(agentRequest, {
        cwd: session.inputDir,
        publicRoot: this.publicRoot,
        dryRun,
        debug: debugMode.enabled,
        includeRawResponse: debugMode.includeRaw,
        ...commandLogHandlers
      });

      const phases = [requestPhase, ...agentResponse.phases];
      const record = this.buildSessionRecord({
        sessionId: session.id,
        submittedAt,
        task,
        status: 'success',
        plan: agentResponse.plan,
        rawPlan: agentResponse.rawPlan ?? agentResponse.plan,
        result: agentResponse.result,
        phases,
        uploadedFiles: files,
        requestOptions,
        debug: debugMode.enabled ? agentResponse.debug ?? null : null,
        parentSessionId: null,
        complaintContext: null
      });
      await this.writeSessionRecord(record);

      if (logChannel) {
        this.sendLogMessage(logChannel, 'タスクが完了しました。');
        this.closeLogStream(logChannel, { status: 'success' });
      }

      res.json({
        status: 'success',
        sessionId: session.id,
        task,
        plan: agentResponse.plan,
        rawPlan: agentResponse.rawPlan ?? agentResponse.plan,
        result: agentResponse.result,
        phases,
        debug: debugMode.enabled ? agentResponse.debug ?? null : undefined,
        uploadedFiles: files,
        parentSessionId: null,
        complaint: null,
        submittedAt
      });
    } catch (error) {
      const isAgentError = error instanceof MediaAgentTaskError;
      const phases = [requestPhase, ...(isAgentError ? error.phases : [])];
      const errorContext = isAgentError ? error.context || {} : {};
      const planPayload = isAgentError ? errorContext.plan ?? null : null;
      const rawPlan = isAgentError ? errorContext.rawPlan ?? planPayload : null;
      const resultPayload = isAgentError ? errorContext.result ?? null : null;
      const detailMessage = error?.message || 'Task execution failed.';
      const errorMessage = 'Task execution failed.';
      const statusCode = isAgentError ? 422 : 500;
      const record = this.buildSessionRecord({
        sessionId: session.id,
        submittedAt,
        task,
        status: 'failed',
        plan: planPayload,
        rawPlan,
        result: resultPayload,
        phases,
        uploadedFiles: files,
        requestOptions,
        debug: debugMode.enabled ? errorContext.debug ?? null : null,
        error: errorMessage,
        detail: detailMessage,
        responseText: isAgentError ? errorContext.responseText ?? null : null,
        parentSessionId: null,
        complaintContext: null
      });
      await this.writeSessionRecord(record);

      if (logChannel) {
        this.sendLogError(logChannel, detailMessage);
        this.closeLogStream(logChannel, { status: 'error' });
      }

      res.status(statusCode).json({
        status: 'failed',
        sessionId: session.id,
        error: errorMessage,
        detail: detailMessage,
        phases,
        plan: planPayload,
        rawPlan,
        result: resultPayload,
        responseText: isAgentError ? errorContext.responseText ?? null : null,
        debug: debugMode.enabled ? errorContext.debug ?? null : undefined,
        uploadedFiles: files,
        parentSessionId: null,
        complaint: null,
        submittedAt
      });
    }
  }

  /**
   * 再編集リクエストを処理する。
   * @param {ExpressRequest} req リクエスト
   * @param {ExpressResponse} res レスポンス
   */
  async handleRevisionRequest(req: SessionAwareRequest, res: ExpressResponse): Promise<void> {
    const logChannel = this.extractLogChannel(req);
    if (logChannel) {
      this.waitForLogChannel(logChannel).catch(() => {});
    }

    const baseSessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const complaint = typeof req.body?.complaint === 'string' ? req.body.complaint.trim() : '';

    if (!baseSessionId) {
      if (logChannel) {
        this.sendLogError(logChannel, 'セッションIDが指定されていません。');
        this.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(400).json({ error: 'sessionId フィールドは必須です。' });
      return;
    }
    if (!complaint) {
      if (logChannel) {
        this.sendLogMessage(logChannel, 'クレーム内容が空のため再編集を中断しました。');
        this.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(400).json({ error: 'complaint フィールドは必須です。' });
      return;
    }

    const session = req.agentSession;
    if (!session) {
      if (logChannel) {
        this.sendLogError(logChannel, 'セッションの初期化に失敗しました。');
        this.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(500).json({ error: 'セッションが初期化されていません。' });
      return;
    }

    const baseRecord = await this.readSessionRecord(baseSessionId);
    if (!baseRecord) {
      if (logChannel) {
        this.sendLogError(logChannel, '指定されたセッションが見つかりません。');
        this.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(404).json({ error: '指定されたセッションが見つかりません。' });
      return;
    }

    const debugMode = parseDebugMode(req.query?.debug);
    const dryRun = parseBoolean(req.query?.dryRun);
    const submittedAt = new Date().toISOString();
    const requestOptions = {
      debug: debugMode.enabled,
      verbose: debugMode.enabled,
      dryRun
    };

    const historyRecords = await this.collectRevisionHistory(baseRecord);
    const originalTask =
      historyRecords.length > 0
        ? historyRecords[historyRecords.length - 1].task || ''
        : baseRecord.task || '';

    const revisionFiles = await this.prepareRevisionFiles(baseRecord);
    const revisionTask = this.composeRevisionTask(originalTask, complaint, historyRecords);

    const agentRequest = {
      task: revisionTask,
      files: revisionFiles,
      outputDir: session.outputDir
    };

    const requestPhase = createRequestPhase(revisionTask, revisionFiles, { dryRun, debug: debugMode.enabled });
    requestPhase.meta.parentSessionId = baseSessionId;
    requestPhase.meta.revision = true;
    requestPhase.meta.complaint = complaint.slice(0, 200);
    requestPhase.meta.revisionFileCount = revisionFiles.length;

    try {
      if (logChannel) {
        await this.waitForLogChannel(logChannel);
        this.sendLogMessage(logChannel, '再編集リクエストを受け付けました。コマンドプランを生成しています…');
      }

      const commandLogHandlers = logChannel ? this.createCommandLogHandlers(logChannel) : {};
      const agentResponse = await this.agent.runTask(agentRequest, {
        cwd: session.inputDir,
        publicRoot: this.publicRoot,
        dryRun,
        debug: debugMode.enabled,
        includeRawResponse: debugMode.includeRaw,
        ...commandLogHandlers
      });

      const phases = [requestPhase, ...agentResponse.phases];
      const record = this.buildSessionRecord({
        sessionId: session.id,
        submittedAt,
        task: revisionTask,
        status: 'success',
        plan: agentResponse.plan,
        rawPlan: agentResponse.rawPlan ?? agentResponse.plan,
        result: agentResponse.result,
        phases,
        uploadedFiles: revisionFiles,
        requestOptions,
        debug: debugMode.enabled ? agentResponse.debug ?? null : null,
        parentSessionId: baseSessionId,
        complaintContext: { sessionId: baseSessionId, message: complaint }
      });
      await this.writeSessionRecord(record);
      await this.appendComplaintEntry(baseSessionId, {
        submittedAt,
        message: complaint,
        followUpSessionId: session.id,
        status: 'success'
      });

      if (logChannel) {
        this.sendLogMessage(logChannel, '再編集タスクが完了しました。');
        this.closeLogStream(logChannel, { status: 'success' });
      }

      res.json({
        status: 'success',
        sessionId: session.id,
        task: revisionTask,
        plan: agentResponse.plan,
        rawPlan: agentResponse.rawPlan ?? agentResponse.plan,
        result: agentResponse.result,
        phases,
        debug: debugMode.enabled ? agentResponse.debug ?? null : undefined,
        uploadedFiles: revisionFiles,
        parentSessionId: baseSessionId,
        complaint,
        submittedAt
      });
    } catch (error) {
      const isAgentError = error instanceof MediaAgentTaskError;
      const phases = [requestPhase, ...(isAgentError ? error.phases : [])];
      const errorContext = isAgentError ? error.context || {} : {};
      const planPayload = isAgentError ? errorContext.plan ?? null : null;
      const rawPlan = isAgentError ? errorContext.rawPlan ?? planPayload : null;
      const resultPayload = isAgentError ? errorContext.result ?? null : null;
      const detailMessage = error?.message || 'Task execution failed.';
      const errorMessage = 'Task execution failed.';
      const statusCode = isAgentError ? 422 : 500;
      const record = this.buildSessionRecord({
        sessionId: session.id,
        submittedAt,
        task: revisionTask,
        status: 'failed',
        plan: planPayload,
        rawPlan,
        result: resultPayload,
        phases,
        uploadedFiles: revisionFiles,
        requestOptions,
        debug: debugMode.enabled ? errorContext.debug ?? null : null,
        error: errorMessage,
        detail: detailMessage,
        responseText: isAgentError ? errorContext.responseText ?? null : null,
        parentSessionId: baseSessionId,
        complaintContext: { sessionId: baseSessionId, message: complaint }
      });
      await this.writeSessionRecord(record);
      await this.appendComplaintEntry(baseSessionId, {
        submittedAt,
        message: complaint,
        followUpSessionId: session.id,
        status: 'failed',
        error: detailMessage
      });

      if (logChannel) {
        this.sendLogError(logChannel, detailMessage);
        this.closeLogStream(logChannel, { status: 'error' });
      }

      res.status(statusCode).json({
        status: 'failed',
        sessionId: session.id,
        error: errorMessage,
        detail: detailMessage,
        phases,
        plan: planPayload,
        rawPlan,
        result: resultPayload,
        responseText: isAgentError ? errorContext.responseText ?? null : null,
        debug: debugMode.enabled ? errorContext.debug ?? null : undefined,
        uploadedFiles: revisionFiles,
        parentSessionId: baseSessionId,
        complaint,
        submittedAt
      });
    }
  }

  /**
   * SSEログチャンネル用のIDを取得する。
   * @param {ExpressRequest} req
   * @returns {string}
   */
  extractLogChannel(req) {
    const fromQuery = this.normalizeChannelId(req.query?.logChannel);
    const fromHeader = this.normalizeChannelId(req.headers?.['x-log-channel']);
    return fromQuery || fromHeader || '';
  }

  /**
   * SSE接続用のチャンネルIDを正規化する。
   * @param {unknown} value
   * @returns {string}
   */
  normalizeChannelId(value) {
    if (Array.isArray(value)) {
      const candidate = value.find((item) => typeof item === 'string' && item.trim().length > 0);
      return this.normalizeChannelId(candidate ?? '');
    }
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(trimmed)) {
      return '';
    }
    return trimmed;
  }

  /**
   * ログチャンネルが接続されるまで待機する。
   * @param {string} channelId
   * @param {number} [timeoutMs]
   * @returns {Promise<void>}
   */
  async waitForLogChannel(channelId: string, timeoutMs = 1000): Promise<void> {
    if (!channelId) {
      return;
    }
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (Date.now() - start < timeoutMs) {
      const entry = this.logStreams.get(channelId);
      if (entry && !entry.closed) {
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
    }
  }

  /**
   * SSEでログを購読するクライアントを登録する。
   * @param {ExpressRequest} req
   * @param {ExpressResponse} res
   */
  handleTaskLogStream(req, res) {
    const channelId =
      this.normalizeChannelId(req.query?.channel) || this.normalizeChannelId(req.query?.logChannel);
    if (!channelId) {
      res.status(400).json({ error: 'channel クエリパラメータが必要です。' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const existing = this.logStreams.get(channelId);
    if (existing) {
      existing.closed = true;
      clearInterval(existing.heartbeat);
      this.logStreams.delete(channelId);
      existing.res.end();
    }

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keep-alive\n\n');
      }
    }, 15000);

    const entry = { res, heartbeat, closed: false };
    this.logStreams.set(channelId, entry);

    res.write('event: ready\n');
    res.write('data: {}\n\n');

    req.on('close', () => {
      if (!entry.closed) {
        entry.closed = true;
        clearInterval(entry.heartbeat);
        this.logStreams.delete(channelId);
      }
    });
  }

  /**
   * ログ用の情報メッセージを送信する。
   * @param {string} channelId
   * @param {string} message
   */
  sendLogMessage(channelId, message) {
    if (!channelId || !message) {
      return;
    }
    this.sendLogEvent(channelId, 'info', { message });
  }

  /**
   * ログ用のエラーメッセージを送信する。
   * @param {string} channelId
   * @param {string} message
   */
  sendLogError(channelId, message) {
    if (!channelId || !message) {
      return;
    }
    this.sendLogEvent(channelId, 'error', { message });
  }

  /**
   * SSEイベントを送信する。
   * @param {string} channelId
   * @param {string} eventName
   * @param {Record<string, any>} payload
   */
  sendLogEvent(channelId, eventName, payload = {}) {
    if (!channelId) {
      return;
    }
    const entry = this.logStreams.get(channelId);
    if (!entry || entry.closed) {
      return;
    }
    try {
      const serialized = JSON.stringify(payload ?? {});
      entry.res.write(`event: ${eventName}\n`);
      entry.res.write(`data: ${serialized}\n\n`);
    } catch (error) {
      entry.closed = true;
      clearInterval(entry.heartbeat);
      this.logStreams.delete(channelId);
      entry.res.end();
      // eslint-disable-next-line no-console
      console.error('Failed to send log event', error);
    }
  }

  /**
   * ログチャンネルを終了させる。
   * @param {string} channelId
   * @param {Record<string, any>} [payload]
   */
  closeLogStream(channelId, payload = {}) {
    if (!channelId) {
      return;
    }
    const entry = this.logStreams.get(channelId);
    if (!entry || entry.closed) {
      return;
    }
    this.sendLogEvent(channelId, 'end', payload ?? {});
    entry.closed = true;
    clearInterval(entry.heartbeat);
    this.logStreams.delete(channelId);
    entry.res.end();
  }

  /**
   * コマンド実行時のログハンドラを生成する。
   * @param {string} channelId
   */
  createCommandLogHandlers(channelId) {
    return {
      onCommandStart: ({ index, step }) => {
        const commandLine = this.formatCommandLine(step);
        this.sendLogEvent(channelId, 'command_start', {
          index,
          command: step?.command ?? '',
          arguments: Array.isArray(step?.arguments) ? step.arguments : [],
          commandLine
        });
      },
      onCommandOutput: ({ index, stream, text }) => {
        if (!text) {
          return;
        }
        this.sendLogEvent(channelId, 'log', {
          index,
          stream,
          text
        });
      },
      onCommandEnd: ({ index, exitCode, timedOut }) => {
        this.sendLogEvent(channelId, 'command_end', {
          index,
          exitCode,
          timedOut
        });
      },
      onCommandSkip: ({ index, step, reason }) => {
        const commandLine = this.formatCommandLine(step);
        this.sendLogEvent(channelId, 'command_skip', {
          index,
          reason,
          command: step?.command ?? '',
          commandLine
        });
      }
    };
  }

  /**
   * コマンドラインの文字列表現を作成する。
   * @param {{command?: string, arguments?: string[]}} step
   * @returns {string}
   */
  formatCommandLine(step) {
    if (!step) {
      return '';
    }
    const args = Array.isArray(step.arguments) ? step.arguments : [];
    const parts = [step.command, ...args]
      .map((part) => (part === undefined || part === null ? '' : String(part)))
      .filter((part) => part.length > 0);
    return parts.join(' ').trim();
  }

  /**
   * セッション結果をフラットな形にまとめる。
   * @param {Object} payload セッション情報
   * @returns {Record<string, any>}
   */
  buildSessionRecord(payload) {
    return {
      id: payload.sessionId,
      submittedAt: payload.submittedAt,
      task: payload.task,
      status: payload.status,
      plan: payload.plan ?? null,
      rawPlan: payload.rawPlan ?? null,
      result: payload.result ?? null,
      phases: payload.phases ?? [],
      uploadedFiles: payload.uploadedFiles ?? [],
      requestOptions: payload.requestOptions ?? {},
      debug: payload.debug ?? null,
      error: payload.error ?? null,
      detail: payload.detail ?? null,
      responseText: payload.responseText ?? null,
      parentSessionId: payload.parentSessionId ?? null,
      complaintContext: payload.complaintContext ?? null,
      complaints: Array.isArray(payload.complaints) ? payload.complaints : []
    };
  }

  /**
   * セッション結果を保存する。
   * @param {Record<string, any>} record 保存対象
   * @returns {Promise<void>}
   */
  async writeSessionRecord(record) {
    const filePath = this.getSessionRecordPath(record.id);
    const payload = JSON.stringify(record, null, 2);
    await fs.writeFile(filePath, payload, 'utf8');
  }

  /**
   * セッション結果を読み込む。
   * @param {string} sessionId 対象セッションID
   * @returns {Promise<Record<string, any>|null>}
   */
  async readSessionRecord(sessionId) {
    const filePath = this.getSessionRecordPath(sessionId);
    try {
      const buffer = await fs.readFile(filePath, 'utf8');
      return JSON.parse(buffer);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * セッション記録へクレーム履歴を追加する。
   * @param {string} sessionId 対象セッションID
   * @param {Record<string, any>} entry 追加する履歴
   * @returns {Promise<void>}
   */
  async appendComplaintEntry(sessionId, entry) {
    const record = await this.readSessionRecord(sessionId);
    if (!record) {
      return;
    }
    const complaints = Array.isArray(record.complaints) ? record.complaints.slice() : [];
    complaints.push(entry);
    record.complaints = complaints;
    await this.writeSessionRecord(record);
  }

  /**
   * 対象セッションから親セッションへ遡り、再編集履歴を収集する。
   * @param {Record<string, any>} startRecord 起点となるセッション記録
   * @returns {Promise<Record<string, any>[]>}
   */
  async collectRevisionHistory(startRecord) {
    if (!startRecord) {
      return [];
    }
    /** @type {Record<string, any>[]} */
    const history = [];
    const visited = new Set();
    let current = startRecord;
    let safetyCounter = 0;

    while (current && !visited.has(current.id) && safetyCounter < 25) {
      history.push(current);
      visited.add(current.id);
      safetyCounter += 1;
      if (!current.parentSessionId) {
        break;
      }
      const parent = await this.readSessionRecord(current.parentSessionId);
      if (!parent) {
        break;
      }
      current = parent;
    }

    return history;
  }

  /**
   * 再編集用のファイル一覧を準備する。
   * @param {Record<string, any>} baseRecord ベースセッション記録
   * @returns {Promise<import('../agent/index.js').AgentRequest['files']>}
   */
  async prepareRevisionFiles(baseRecord) {
    const collected = [];
    const seen = new Set();

    const inputs = Array.isArray(baseRecord.uploadedFiles) ? baseRecord.uploadedFiles : [];
    for (let index = 0; index < inputs.length; index += 1) {
      const descriptor = await this.createRevisionFileDescriptor(inputs[index], `input-${index}`, seen);
      if (descriptor) {
        collected.push(descriptor);
      }
    }

    const outputs = Array.isArray(baseRecord.result?.resolvedOutputs) ? baseRecord.result.resolvedOutputs : [];
    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index];
      if (!output || !output.exists) {
        continue;
      }
      const descriptor = await this.createRevisionFileDescriptor(
        {
          id: `output-${index}`,
          originalName: output.absolutePath ? path.basename(output.absolutePath) : path.basename(output.path || `output-${index}`),
          absolutePath: output.absolutePath || output.path,
          size: typeof output.size === 'number' ? output.size : undefined,
          mimeType: undefined
        },
        `output-${index}`,
        seen
      );
      if (descriptor) {
        collected.push(descriptor);
      }
    }

    return collected;
  }

  /**
   * ファイル記述子を構築する。
   * @param {Record<string, any>} source 元データ
   * @param {string} fallbackId IDが無い場合の接頭辞
   * @param {Set<string>} seen 既知パス集合
   * @returns {Promise<import('../agent/index.js').AgentRequest['files'][number]|null>}
   */
  async createRevisionFileDescriptor(source, fallbackId, seen) {
    const targetPath = typeof source?.absolutePath === 'string' ? source.absolutePath : '';
    if (!targetPath) {
      return null;
    }
    const absolutePath = path.resolve(targetPath);
    if (seen.has(absolutePath)) {
      return null;
    }
    if (!existsSync(absolutePath)) {
      return null;
    }

    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      return null;
    }
    if (!stat.isFile()) {
      return null;
    }

    const descriptor = {
      id: typeof source.id === 'string' && source.id ? source.id : fallbackId,
      originalName:
        typeof source.originalName === 'string' && source.originalName
          ? source.originalName
          : path.basename(absolutePath),
      absolutePath,
      size: typeof source.size === 'number' ? source.size : stat.size,
      mimeType: typeof source.mimeType === 'string' && source.mimeType ? source.mimeType : guessMimeType(absolutePath)
    };

    seen.add(absolutePath);
    return descriptor;
  }

  /**
   * セッション記録の保存パスを取得する。
   * @param {string} sessionId セッションID
   * @returns {string}
   */
  getSessionRecordPath(sessionId) {
    return path.join(this.storageRoot, `${sessionId}.json`);
  }

  /**
   * 再編集に渡すタスク文を整形する。
   * @param {string} originalTask 元のタスク
   * @param {string} complaint ユーザーからの指摘
   * @param {Record<string, any>[]} historyRecords 再編集の履歴（最新順）
   * @returns {string}
   */
  composeRevisionTask(originalTask, complaint, historyRecords) {
    const baseTask = originalTask || '（元の依頼内容は記録されていません）';
    const historyTable = buildRevisionHistoryTable(historyRecords || [], complaint);

    return [
      '再編集リクエストです。',
      `元の依頼内容:\n${baseTask}`,
      'これまでの編集履歴:',
      historyTable,
      '前回までのミスを踏まえ、指摘を解消した新しい成果物を作成してください。必要に応じて前回の成果物ファイルを参照して構いません。'
    ].join('\n\n');
  }

  /**
   * ファイルアップロード用のmulterインスタンスを作成
   * @returns {multer.Multer} multerインスタンス
   */
  createUploader(): Multer {
    return multer({
      storage: multer.diskStorage({
        destination: (req, file, callback) => {
          const session = (req as SessionAwareRequest).agentSession;
          if (!session) {
            callback(new Error('セッションが初期化されていません。'), '');
            return;
          }
          callback(null, session.inputDir);
        },
        filename: (req, file, callback) => {
          callback(null, createSafeFileName(file.originalname));
        }
      })
    });
  }

  /**
   * 一時出力ディレクトリを一括削除して初期状態に戻す
   * @returns {Promise<void>}
   */
  async resetTemporaryDirectories() {
    const temporaryDirs = [this.generatedRoot, this.sessionInputRoot];
    await Promise.all(
      temporaryDirs.map(async (dir) => {
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch (error) {
          throw new Error(`一時ディレクトリのクリーンアップに失敗しました: ${dir}`, { cause: error });
        }
      })
    );
  }

  /**
   * ストレージディレクトリに残ったセッション記録を削除
   * @returns {Promise<void>}
   */
  async clearStorageRecords() {
    let entries;
    try {
      entries = await fs.readdir(this.storageRoot, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return;
      }
      throw new Error('ストレージディレクトリの走査に失敗しました。', { cause: error });
    }

    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
          return;
        }
        const targetPath = path.join(this.storageRoot, entry.name);
        try {
          await fs.rm(targetPath, { force: true });
        } catch (error) {
          throw new Error(`ストレージファイルの削除に失敗しました: ${targetPath}`, { cause: error });
        }
      })
    );
  }

  /**
   * 必要なベースディレクトリを作成し、一時領域とストレージを初期化
   * @returns {Promise<void>}
   */
  async ensureBaseDirectories() {
    await Promise.all(
      [this.publicRoot, this.storageRoot].map((dir) => fs.mkdir(dir, { recursive: true }))
    );

    await this.clearStorageRecords();
    await this.resetTemporaryDirectories();

    await Promise.all(
      [this.generatedRoot, this.sessionInputRoot].map((dir) => fs.mkdir(dir, { recursive: true }))
    );
  }
}

/**
 * セッションIDを生成（タイムスタンプ+ランダム文字列）
 * @returns {string} セッションID
 */
function createSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `session-${Date.now()}-${randomPart}`;
}

/**
 * ファイル名を安全な形式にサニタイズ
 * @param {string} name 元のファイル名
 * @returns {string} サニタイズ済みファイル名
 */
function createSafeFileName(name) {
  const baseName = path.basename(name);
  const sanitized = baseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  if (!sanitized || sanitized.startsWith('.')) {
    const timestamp = Date.now();
    return `file_${timestamp}`;
  }
  return sanitized.slice(0, 200);
}

/**
 * リクエスト受信時のフェーズ情報を作成
 * @param {string} task タスク内容
 * @param {Array} files アップロードファイル一覧
 * @param {Object} options オプション（dryRun、debugなど）
 * @returns {Object} フェーズオブジェクト
 */
function createRequestPhase(
  task: string,
  files: Array<{ id?: string }>,
  options: { dryRun?: boolean; debug?: boolean } = {}
) {
  const now = new Date().toISOString();
  const meta: Record<string, any> = {
    taskPreview: task.slice(0, 120),
    fileCount: files.length,
    dryRun: Boolean(options.dryRun),
    debug: Boolean(options.debug)
  };
  return {
    id: 'request',
    title: 'Receive request',
    status: 'success',
    startedAt: now,
    finishedAt: now,
    error: null,
    logs: [],
    meta
  };
}

/**
 * クエリパラメータをboolean値にパース
 * @param {*} value クエリパラメータ値
 * @returns {boolean} パース結果
 */
function parseBoolean(value) {
  const normalized = getFirstQueryValue(value);
  if (normalized === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(normalized.toLowerCase());
}

/**
 * デバッグモードのクエリパラメータをパース
 * @param {*} value クエリパラメータ値
 * @returns {{enabled: boolean, includeRaw: boolean}} デバッグモード設定
 */
function parseDebugMode(value) {
  const normalized = getFirstQueryValue(value);
  if (!normalized) {
    return { enabled: false, includeRaw: false };
  }
  const lower = normalized.toLowerCase();
  return {
    enabled: ['1', 'true', 'yes', 'on', 'verbose', 'full'].includes(lower),
    includeRaw: lower === 'verbose' || lower === 'full'
  };
}

/**
 * クエリパラメータが配列の場合は最初の値を取得
 * @param {*} value クエリパラメータ値
 * @returns {string | undefined} 最初の値またはundefined
 */
function getFirstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value);
}

/**
 * 前回のコマンド履歴をサマリ文字列に変換する。
 * @param {Record<string, any>|null} result 以前の実行結果
 * @param {Record<string, any>|null} plan 以前の計画
 * @returns {string}
 */
function summarizeCommandHistory(result, plan) {
  if (result && Array.isArray(result.steps) && result.steps.length > 0) {
    return result.steps
      .map((step, index) => {
        const command = typeof step.command === 'string' && step.command ? step.command : '(unknown)';
        const args = Array.isArray(step.arguments) ? step.arguments.filter((arg) => typeof arg === 'string') : [];
        const commandLine = [command, ...args].join(' ').trim();
        const status = step.status || 'unknown';
        const infoParts = [];
        if (typeof step.exitCode === 'number') {
          infoParts.push(`exit=${step.exitCode}`);
        }
        if (step.timedOut) {
          infoParts.push('timed_out');
        }
        if (step.skipReason) {
          infoParts.push(`skip=${step.skipReason}`);
        }
        const info = infoParts.length ? ` (${infoParts.join(', ')})` : '';
        return `${index + 1}. [${status}] ${commandLine}${info}`;
      })
      .join('\n');
  }

  if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
    return plan.steps
      .map((step, index) => {
        const command = typeof step.command === 'string' && step.command ? step.command : '(unknown)';
        const args = Array.isArray(step.arguments) ? step.arguments.filter((arg) => typeof arg === 'string') : [];
        const commandLine = [command, ...args].join(' ').trim();
        const reasoning = typeof step.reasoning === 'string' && step.reasoning ? ` - ${step.reasoning}` : '';
        return `${index + 1}. ${commandLine}${reasoning}`;
      })
      .join('\n');
  }

  return '前回のコマンド履歴は記録されていません。';
}

/**
 * Markdown テーブルで利用する値を整形する。
 * @param {string} value
 * @returns {string}
 */
function formatTableCell(value) {
  if (!value) {
    return '（なし）';
  }
  return String(value).replace(/\|/g, '／').replace(/\r?\n/g, '<br>');
}

/**
 * テーブル用に成果物を整形する。
 * @param {Record<string, any>} record
 * @returns {string}
 */
function summarizeOutputsForTable(record) {
  const outputs = record?.result?.resolvedOutputs;
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return '（なし）';
  }
  const lines = outputs.map((item, index) => {
    const fileName = item?.absolutePath
      ? path.basename(item.absolutePath)
      : item?.path
      ? path.basename(item.path)
      : `output-${index + 1}`;
    const description = typeof item?.description === 'string' && item.description ? ` - ${item.description}` : '';
    return `${index + 1}. ${fileName}${description}`;
  });
  return formatTableCell(lines.join('\n'));
}

/**
 * テーブル用にコマンド履歴を整形する。
 * @param {Record<string, any>} record
 * @returns {string}
 */
function summarizeCommandsForTable(record) {
  const plan = record?.plan ?? record?.rawPlan ?? null;
  const result = record?.result ?? null;
  const summary = summarizeCommandHistory(result, plan);
  const lines = summary.split('\n').filter(Boolean);
  if (lines.length > 3) {
    const extra = lines.length - 3;
    return formatTableCell([...lines.slice(0, 3), `...他${extra}件`].join('\n'));
  }
  return formatTableCell(lines.join('\n'));
}

/**
 * 再編集履歴を Markdown テーブルとして整形する。
 * @param {Record<string, any>[]} historyRecords
 * @param {string} latestComplaint 今回のクレーム内容
 * @returns {string}
 */
function buildRevisionHistoryTable(historyRecords, latestComplaint) {
  if (!Array.isArray(historyRecords) || historyRecords.length === 0) {
    return '履歴情報はまだありません。';
  }
  const header = '| バージョン | 生成物 | クレーム | 主なコマンド |\n| --- | --- | --- | --- |';
  const revisionCount = historyRecords.reduce(
    (count, record) => (record && record.parentSessionId ? count + 1 : count),
    0
  );
  let remainingRevisions = revisionCount;

  const rows = historyRecords.map((record, index) => {
    const hasParent = Boolean(record?.parentSessionId);
    let versionLabel;
    if (hasParent) {
      const label = `Rev.${remainingRevisions}`;
      remainingRevisions -= 1;
      versionLabel = index === 0 ? `${label} (最新)` : label;
    } else {
      versionLabel = 'Original';
    }

    const outputs = summarizeOutputsForTable(record);
    let complaintText;
    if (index === 0 && typeof latestComplaint === 'string' && latestComplaint.trim()) {
      complaintText = latestComplaint.trim();
    } else {
      complaintText = extractComplaintMessage(record);
    }
    const complaint = formatTableCell(complaintText || '（なし）');
    const commands = summarizeCommandsForTable(record);

    return `| ${formatTableCell(versionLabel)} | ${outputs} | ${complaint} | ${commands} |`;
  });

  return `${header}\n${rows.join('\n')}`;
}

/**
 * レコードからクレーム文を抽出する。
 * @param {Record<string, any>} record
 * @returns {string}
 */
function extractComplaintMessage(record) {
  if (!record) {
    return '';
  }
  const direct = typeof record?.complaintContext?.message === 'string' ? record.complaintContext.message.trim() : '';
  if (direct) {
    return direct;
  }
  const complaints = Array.isArray(record?.complaints) ? record.complaints : [];
  for (let index = complaints.length - 1; index >= 0; index -= 1) {
    const entry = complaints[index];
    if (entry && typeof entry.message === 'string' && entry.message.trim()) {
      return entry.message.trim();
    }
  }
  return '';
}

/**
 * 拡張子から簡易的にMIMEタイプを推定する。
 * @param {string} filePath 対象パス
 * @returns {string|undefined}
 */
function guessMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
      return 'audio/mp4';
    case '.flac':
      return 'audio/flac';
    default:
      return undefined;
  }
}

export {
  createSessionId,
  createSafeFileName,
  createRequestPhase,
  parseBoolean,
  parseDebugMode,
  getFirstQueryValue
};
