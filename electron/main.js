import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Only read app configuration from .env.local to avoid picking up OS-level env vars unexpectedly.
const envPath = path.join(projectRoot, '.env.local');
const localEnv = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};

function requireLocalEnv(key) {
  const value = localEnv[key];
  if (!value) {
    throw new Error(`.env.local is missing required key: ${key}`);
  }
  return value;
}

function createBackendEnv(overrides = {}) {
  const systemEssentials = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP
  };
  const merged = { ...systemEssentials, ...localEnv, ...overrides };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
}

// Ensure we fail fast when required keys are missing rather than silently reading OS env vars.
requireLocalEnv('OPENAI_API_KEY');

const rendererDevUrl = localEnv.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const configuredBackendPort = localEnv.MEDIA_AGENT_PORT ?? localEnv.PORT;
const backendPort = Number.isFinite(Number(configuredBackendPort))
  ? Number(configuredBackendPort)
  : 3001;
const devFlag = localEnv.ELECTRON_DEV;
const isDev = devFlag === '1' || (!app.isPackaged && devFlag !== '0');
const disableDevTools = process.argv.includes('--no-devtools');
const shouldOpenDevTools = isDev && !disableDevTools;

let mainWindow;
let backendProcess = null;
let embeddedServer = null;
let backendReused = false;
let isShuttingDown = false;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForEndpoint(url, label, attempts = 60, interval = 500) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return;
      }
    } catch {
      // ignore and retry
    }
    await delay(interval);
  }
  throw new Error(`${label} に接続できませんでした (${url})`);
}

async function isBackendAlive(url) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

function resolveTsxCli() {
  const baseDir = path.join(projectRoot, 'node_modules', 'tsx', 'dist');
  const candidates = ['cli.js', 'cli.mjs'];
  for (const fileName of candidates) {
    const cliPath = path.join(baseDir, fileName);
    if (fs.existsSync(cliPath)) {
      return cliPath;
    }
  }
  throw new Error(
    `tsx CLI が見つかりません (${path.join(baseDir, candidates[0])})。先に "npm install" を実行してください。`
  );
}

function resolveNodeBinary() {
  const candidates = [process.env.npm_node_execpath, process.env.NODE, process.env.NODE_EXE];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'node';
}

function wireBackendLogs(child, label) {
  const formatLine = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => `[${label}] ${line}`);

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      for (const line of formatLine(chunk)) {
        console.log(line);
      }
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      for (const line of formatLine(chunk)) {
        console.error(line);
      }
    });
  }
}

async function startBackendServer() {
  const serverUrl = `http://localhost:${backendPort}/api/tools`;
  if (await isBackendAlive(serverUrl)) {
    backendReused = true;
    return;
  }

  if (isDev) {
    const env = createBackendEnv({ PORT: String(backendPort) });
    const tsxCli = resolveTsxCli();
    const serverEntry = path.join(projectRoot, 'backend', 'src', 'server.ts');
    const nodeBinary = resolveNodeBinary();
    backendProcess = spawn(nodeBinary, [tsxCli, serverEntry], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    });
    wireBackendLogs(backendProcess, 'backend');
    backendProcess.on('exit', (code) => {
      if (isShuttingDown) {
        return;
      }
      const message = `バックエンドプロセスが終了しました (code=${code ?? 'unknown'})`;
      console.error(message);
      dialog.showErrorBox('MultiMediaWorker', message);
      app.quit();
    });
    await waitForEndpoint(serverUrl, 'バックエンド');
    return;
  }

  const serverEntry = path.join(projectRoot, 'dist', 'backend', 'server.js');
  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `バックエンドのビルド成果物が見つかりません: ${serverEntry}\n先に "npm run build" を実行してください。`
    );
  }
  const moduleUrl = pathToFileURL(serverEntry).href;
  const serverModule = await import(moduleUrl);
  const factory = serverModule?.createDefaultMediaAgentServer;
  if (typeof factory !== 'function') {
    throw new Error('createDefaultMediaAgentServer がエクスポートされていません。');
  }

  const runtimeRoot = path.join(app.getPath('userData'), 'worker-data');
  const publicRoot = path.join(runtimeRoot, 'public');
  const storageRoot = path.join(runtimeRoot, 'storage');

  embeddedServer = factory({
    rootDir: projectRoot,
    env: localEnv,
    publicRoot,
    generatedRoot: path.join(publicRoot, 'generated'),
    storageRoot,
    sessionInputRoot: path.join(storageRoot, 'inputs'),
    clientDistRoot: path.join(projectRoot, 'frontend', 'dist')
  });
  await embeddedServer.start(backendPort);
}

async function stopBackendServer() {
  isShuttingDown = true;
  if (backendReused) {
    backendReused = false;
    return;
  }
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (embeddedServer) {
    try {
      await embeddedServer.stop();
    } catch (error) {
      console.error('バックエンド停止中にエラーが発生しました:', error);
    }
    embeddedServer = null;
  }
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    await waitForEndpoint(rendererDevUrl, 'フロントエンド');
    await mainWindow.loadURL(rendererDevUrl);
    if (shouldOpenDevTools) {
      // Allow launching dev build without automatically opening DevTools via --no-devtools flag.
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    const startUrl = `http://localhost:${backendPort}`;
    await mainWindow.loadURL(startUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startBackendServer();
      await createMainWindow();
    } catch (error) {
      console.error(error);
      dialog.showErrorBox('MultiMediaWorker', error?.message || 'アプリの起動に失敗しました。');
      app.exit(1);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow().catch((error) => {
        console.error('ウィンドウの再生成に失敗しました:', error);
      });
    }
  });
}

app.on('before-quit', () => {
  stopBackendServer().catch((error) => {
    console.error('バックエンド停止中に失敗しました:', error);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('SIGINT', () => {
  app.quit();
});

process.on('SIGTERM', () => {
  app.quit();
});
