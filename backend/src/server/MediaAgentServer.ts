import express, { type Request as ExpressRequest, type Response as ExpressResponse, type NextFunction as ExpressNextFunction } from 'express';
import cors from 'cors';
import multer, { type Multer } from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';

import { MediaAgentTaskError } from '../agent/index.js';
import type { MediaAgent, PathPlaceholder, ToolRegistry } from '../agent/index.js';
import { LogStreamManager } from './LogStreamManager.js';
import { SessionRecordStore } from './SessionRecordStore.js';
import { composeRevisionTask, prepareRevisionFiles } from './revisionHelpers.js';
import {
  createRequestPhase,
  createSafeFileName,
  createSessionId,
  getFirstQueryValue,
  parseBoolean,
  parseDebugMode
} from './requestUtils.js';

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

type AgentSession = {
  id: string;
  inputDir: string;
  outputDir: string;
};

export type SessionAwareRequest = ExpressRequest & { agentSession?: AgentSession };

/**
 * 繝｡繝・ぅ繧｢繧ｨ繝ｼ繧ｸ繧ｧ繝ｳ繝医ｒHTTP繧ｨ繝ｳ繝峨・繧､繝ｳ繝医→騾｣謳ｺ縺輔○繧畿xpress繝吶・繧ｹ縺ｮAPI繧ｵ繝ｼ繝舌・
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
  private readonly logStreamManager: LogStreamManager;
  private readonly recordStore: SessionRecordStore;
  private serverInstance?: Server;
  /**
   * 繧ｵ繝ｼ繝舌・繧､繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ繧貞・譛溷喧
   * @param {{agent: MediaAgent, toolRegistry: ToolRegistry, publicRoot: string, generatedRoot: string, storageRoot: string, sessionInputRoot: string}} options 繧ｵ繝ｼ繝舌・險ｭ螳壹が繝励す繝ｧ繝ｳ
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
    this.logStreamManager = new LogStreamManager();
    this.recordStore = new SessionRecordStore(this.storageRoot);

    this.prepareSession = this.prepareSession.bind(this);
    this.handleTaskRequest = this.handleTaskRequest.bind(this);
    this.handleRevisionRequest = this.handleRevisionRequest.bind(this);
    this.handleGetTools = this.handleGetTools.bind(this);
  }

  /**
   * 繧ｵ繝ｼ繝舌・繧定ｵｷ蜍輔＠縲∵欠螳壹・繝ｼ繝医〒繝ｪ繧ｯ繧ｨ繧ｹ繝医ｒ蜿励￠莉倥￠繧・
   * @param {number} port 繝昴・繝育分蜿ｷ
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
   * 繧ｵ繝ｼ繝舌・繧貞●豁｢縺吶ｋ
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
   * CORS繧・撕逧・ヵ繧｡繧､繝ｫ驟堺ｿ｡縺ｪ縺ｩ縺ｮ繝溘ラ繝ｫ繧ｦ繧ｧ繧｢繧定ｨｭ螳・
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
   * API繝ｫ繝ｼ繝医→繧ｨ繝ｩ繝ｼ繝上Φ繝峨Λ繧定ｨｭ螳・
  */
  configureRoutes() {
    this.app.get('/api/task-logs', (req, res) => this.logStreamManager.handleTaskLogStream(req, res));
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
        error: 'Server error occurred.',
        detail: err.message
      });
    });
  }

  /**
   * 蛻ｩ逕ｨ蜿ｯ閭ｽ縺ｪ繝・・繝ｫ荳隕ｧ繧定ｿ斐☆繧ｨ繝ｳ繝峨・繧､繝ｳ繝・
   * @param {ExpressRequest} req 繝ｪ繧ｯ繧ｨ繧ｹ繝・
   * @param {ExpressResponse} res 繝ｬ繧ｹ繝昴Φ繧ｹ
   */
  handleGetTools(req, res) {
    res.json({
      tools: this.toolRegistry.describeExecutableCommands()
    });
  }

  /**
   * 繧ｻ繝・す繝ｧ繝ｳID縺ｨ蜈･蜃ｺ蜉帙ョ繧｣繝ｬ繧ｯ繝医Μ繧呈ｺ門ｙ縺吶ｋ繝溘ラ繝ｫ繧ｦ繧ｧ繧｢
   * @param {ExpressRequest} req 繝ｪ繧ｯ繧ｨ繧ｹ繝・
   * @param {ExpressResponse} res 繝ｬ繧ｹ繝昴Φ繧ｹ
   * @param {ExpressNextFunction} next 谺｡縺ｮ繝溘ラ繝ｫ繧ｦ繧ｧ繧｢
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

  buildPathPlaceholders(session: AgentSession): PathPlaceholder[] {
    return [
      {
        name: 'INPUT_DIR',
        absolutePath: session.inputDir,
        description: 'Read-only uploaded files for this session.'
      },
      {
        name: 'OUTPUT_DIR',
        absolutePath: session.outputDir,
        description: 'Write new files here for this session.'
      },
      {
        name: 'PUBLIC_DIR',
        absolutePath: this.publicRoot,
        description: 'Static public root (read-only).'
      },
      {
        name: 'STORAGE_DIR',
        absolutePath: this.storageRoot,
        description: 'Shared storage root for uploads and intermediates.'
      }
    ];
  }

  /**
   * 繧ｿ繧ｹ繧ｯ繝ｪ繧ｯ繧ｨ繧ｹ繝医ｒ蜃ｦ逅・＠縲√お繝ｼ繧ｸ繧ｧ繝ｳ繝医ｒ螳溯｡後＠縺ｦ繝ｬ繧ｹ繝昴Φ繧ｹ繧定ｿ斐☆
   * @param {ExpressRequest} req 繝ｪ繧ｯ繧ｨ繧ｹ繝・
   * @param {ExpressResponse} res 繝ｬ繧ｹ繝昴Φ繧ｹ
  */
  async handleTaskRequest(req: SessionAwareRequest, res: ExpressResponse): Promise<void> {
    const logChannel = this.logStreamManager.extractLogChannel(req);
    if (logChannel) {
      this.logStreamManager.waitForLogChannel(logChannel).catch(() => {});
    }

    const task = (req.body?.task || '').trim();
    if (!task) {
      if (logChannel) {
        this.logStreamManager.sendLogMessage(logChannel, 'Task text is empty; execution halted.');
        this.logStreamManager.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(400).json({ error: 'task field is required.' });
      return;
    }

    const session = req.agentSession;
    if (!session) {
      if (logChannel) {
        this.logStreamManager.sendLogError(logChannel, 'Failed to initialize session.');
        this.logStreamManager.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(500).json({ error: 'Session was not initialized.' });
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

    const pathPlaceholders = this.buildPathPlaceholders(session);

    const agentRequest = {
      task,
      files,
      outputDir: session.outputDir,
      pathPlaceholders
    };

    const requestPhase = createRequestPhase(task, files, { dryRun, debug: debugMode.enabled });
    requestPhase.meta.parentSessionId = null;
    requestPhase.meta.revision = false;

    try {
      if (logChannel) {
        await this.logStreamManager.waitForLogChannel(logChannel);
        this.logStreamManager.sendLogMessage(logChannel, 'Task received. Generating command plan...');
      }

      const commandLogHandlers = logChannel ? this.logStreamManager.createCommandLogHandlers(logChannel) : {};
      const agentResponse = await this.agent.runTask(agentRequest, {
        cwd: session.inputDir,
        publicRoot: this.publicRoot,
        dryRun,
        debug: debugMode.enabled,
        includeRawResponse: debugMode.includeRaw,
        ...commandLogHandlers
      });

      const phases = [requestPhase, ...agentResponse.phases];
      const record = this.recordStore.buildSessionRecord({
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
      await this.recordStore.writeSessionRecord(record);

      if (logChannel) {
        this.logStreamManager.sendLogMessage(logChannel, 'Task completed.');
        this.logStreamManager.closeLogStream(logChannel, { status: 'success' });
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
      const record = this.recordStore.buildSessionRecord({
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
      await this.recordStore.writeSessionRecord(record);

      if (logChannel) {
        this.logStreamManager.sendLogError(logChannel, detailMessage);
        this.logStreamManager.closeLogStream(logChannel, { status: 'error' });
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
   * 蜀咲ｷｨ髮・Μ繧ｯ繧ｨ繧ｹ繝医ｒ蜃ｦ逅・☆繧九・
   * @param {ExpressRequest} req 繝ｪ繧ｯ繧ｨ繧ｹ繝・
   * @param {ExpressResponse} res 繝ｬ繧ｹ繝昴Φ繧ｹ
   */
  async handleRevisionRequest(req: SessionAwareRequest, res: ExpressResponse): Promise<void> {
    const logChannel = this.logStreamManager.extractLogChannel(req);
    if (logChannel) {
      this.logStreamManager.waitForLogChannel(logChannel).catch(() => {});
    }

    const baseSessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const complaint = typeof req.body?.complaint === 'string' ? req.body.complaint.trim() : '';

    if (!baseSessionId) {
      if (logChannel) {
        this.logStreamManager.sendLogError(logChannel, 'sessionId is required.');
        this.logStreamManager.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(400).json({ error: 'sessionId is required.' });
      return;
    }
    if (!complaint) {
      if (logChannel) {
        this.logStreamManager.sendLogMessage(logChannel, 'Complaint text is empty; revision aborted.');
        this.logStreamManager.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(400).json({ error: 'complaint field is required.' });
      return;
    }

    const session = req.agentSession;
    if (!session) {
      if (logChannel) {
        this.logStreamManager.sendLogError(logChannel, 'Failed to initialize session.');
        this.logStreamManager.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(500).json({ error: 'Session was not initialized.' });
      return;
    }

    const baseRecord = await this.recordStore.readSessionRecord(baseSessionId);
    if (!baseRecord) {
      if (logChannel) {
        this.logStreamManager.sendLogError(logChannel, 'Referenced session was not found.');
        this.logStreamManager.closeLogStream(logChannel, { status: 'error' });
      }
      res.status(404).json({ error: 'Referenced session was not found.' });
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

    const historyRecords = await this.recordStore.collectRevisionHistory(baseRecord);
    const originalTask =
      historyRecords.length > 0
        ? historyRecords[historyRecords.length - 1].task || ''
        : baseRecord.task || '';

    const revisionFiles = await prepareRevisionFiles(baseRecord);
    const revisionTask = composeRevisionTask(originalTask, complaint, historyRecords);

    const pathPlaceholders = this.buildPathPlaceholders(session);

    const agentRequest = {
      task: revisionTask,
      files: revisionFiles,
      outputDir: session.outputDir,
      pathPlaceholders
    };

    const requestPhase = createRequestPhase(revisionTask, revisionFiles, { dryRun, debug: debugMode.enabled });
    requestPhase.meta.parentSessionId = baseSessionId;
    requestPhase.meta.revision = true;
    requestPhase.meta.complaint = complaint.slice(0, 200);
    requestPhase.meta.revisionFileCount = revisionFiles.length;

    try {
      if (logChannel) {
        await this.logStreamManager.waitForLogChannel(logChannel);
        this.logStreamManager.sendLogMessage(logChannel, 'Revision request received. Generating command plan...');
      }

      const commandLogHandlers = logChannel ? this.logStreamManager.createCommandLogHandlers(logChannel) : {};
      const agentResponse = await this.agent.runTask(agentRequest, {
        cwd: session.inputDir,
        publicRoot: this.publicRoot,
        dryRun,
        debug: debugMode.enabled,
        includeRawResponse: debugMode.includeRaw,
        ...commandLogHandlers
      });

      const phases = [requestPhase, ...agentResponse.phases];
      const record = this.recordStore.buildSessionRecord({
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
      await this.recordStore.writeSessionRecord(record);
      await this.recordStore.appendComplaintEntry(baseSessionId, {
        submittedAt,
        message: complaint,
        followUpSessionId: session.id,
        status: 'success'
      });

      if (logChannel) {
        this.logStreamManager.sendLogMessage(logChannel, 'Revision task completed.');
        this.logStreamManager.closeLogStream(logChannel, { status: 'success' });
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
      const record = this.recordStore.buildSessionRecord({
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
      await this.recordStore.writeSessionRecord(record);
      await this.recordStore.appendComplaintEntry(baseSessionId, {
        submittedAt,
        message: complaint,
        followUpSessionId: session.id,
        status: 'failed',
        error: detailMessage
      });

      if (logChannel) {
        this.logStreamManager.sendLogError(logChannel, detailMessage);
        this.logStreamManager.closeLogStream(logChannel, { status: 'error' });
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
   * ファイルアップロード用のmulterインスタンスを作成
   * @returns {multer.Multer} multerインスタンス
   */
  createUploader(): Multer {
    return multer({
      storage: multer.diskStorage({
        destination: (req, file, callback) => {
          const session = (req as SessionAwareRequest).agentSession;
          if (!session) {
            callback(new Error('Session has not been initialized.'), '');
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
          throw new Error(`Failed to clean temporary directory: ${dir}`, { cause: error });
        }
      })
    );
  }

  /**
   * 必須なベースディレクトリを作成し、一時領域とストレージを初期化
   * @returns {Promise<void>}
   */
  async ensureBaseDirectories() {
    await Promise.all(
      [this.publicRoot, this.storageRoot].map((dir) => fs.mkdir(dir, { recursive: true }))
    );

    await this.recordStore.clearStorageRecords();
    await this.resetTemporaryDirectories();

    await Promise.all(
      [this.generatedRoot, this.sessionInputRoot].map((dir) => fs.mkdir(dir, { recursive: true }))
    );
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
