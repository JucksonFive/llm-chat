import { app, BrowserWindow, Menu, session, shell, dialog, ipcMain } from 'electron'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

let mainWindow: BrowserWindow | null = null
let serverPort = 3001

const isDev = !app.isPackaged

// Short-lived folder selection tokens (60s expiry). The renderer receives a
// token after the user picks a workspace folder; the server validates it before
// persisting the path. This prevents the renderer from injecting arbitrary
// workspace paths.
const folderTokens = new Map<string, { path: string; expires: number }>()
const FOLDER_TOKEN_TTL_MS = 60_000

// IPC secret shared with the Express server so it can verify folder tokens.
// Generated once per app launch.
const ipcSecret = crypto.randomBytes(32).toString('hex')

// Fix PATH on macOS — apps launched from Finder have a limited PATH
if (process.platform === 'darwin') {
  process.env.PATH = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    process.env.PATH,
  ].join(':')
}

function findDocker(): string | null {
  const candidates = process.platform === 'win32'
    ? ['docker', 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe']
    : ['docker', '/usr/local/bin/docker', '/usr/bin/docker', '/opt/homebrew/bin/docker']
  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" --version`, { stdio: 'ignore' })
      return cmd
    } catch { /* not found */ }
  }
  return null
}

async function startSearXNG() {
  const docker = findDocker()
  if (!docker) {
    console.warn('[searxng] Docker not found — web search will not be available')
    return
  }

  // Find docker-compose.yml: in dev it's in project root, in production it's bundled
  const composeFile = isDev
    ? path.join(__dirname, '..', 'docker-compose.yml')
    : path.join(process.resourcesPath, 'docker-compose.yml')

  if (!fs.existsSync(composeFile)) {
    console.warn('[searxng] docker-compose.yml not found — web search will not be available')
    return
  }

  try {
    // Check if container is already running
    const running = execSync(`"${docker}" ps --filter name=llm-chat-searxng --format "{{.Names}}"`, { encoding: 'utf8' }).trim()
    if (running) {
      console.log('[searxng] Already running')
      return
    }

    // Start with docker compose
    const composeDir = path.dirname(composeFile)
    execSync(`"${docker}" compose -f "${composeFile}" up -d`, {
      cwd: composeDir,
      stdio: 'inherit',
      timeout: 30000,
    })
    console.log('[searxng] Started via docker compose')
  } catch (err) {
    console.error('[searxng] Failed to start:', err)
  }
}

async function startExpressServer() {
  if (isDev) {
    // In dev, Express runs separately via `dev:server` on port 3001
    return
  }

  process.env.ELECTRON_PROD = 'true'
  process.env.ELECTRON = 'true'
  process.env.ELECTRON_DIST_PATH = path.join(__dirname, '..', 'dist')
  process.env.ELECTRON_IPC_SECRET = ipcSecret

  // Load the separately bundled server
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startServer } = require(path.join(__dirname, 'server.cjs'))
  try {
    serverPort = await startServer(3001)
  } catch {
    // Port 3001 busy, let OS pick a free port
    serverPort = await startServer(0)
  }
  console.log(`Express server started on port ${serverPort}`)
}

// Content-Security-Policy applied to the renderer as defense-in-depth.
// Mirrors server/csp.ts. In dev we relax script-src/connect-src so Vite's
// HMR client (inline scripts, eval, ws://localhost) keeps working; in
// production we use the strict policy. Overridable via CSP_HEADER env var.
function resolveCspHeader(): string {
  if (process.env.CSP_HEADER && process.env.CSP_HEADER.trim()) {
    return process.env.CSP_HEADER.trim()
  }
  if (isDev) {
    return (
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' http://localhost:* ws://localhost:*"
    )
  }
  return (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; connect-src 'self' http://localhost:*"
  )
}

function applyCsp() {
  const policy = resolveCspHeader()
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'LLM Chat',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadURL(`http://localhost:${serverPort}`)
  }

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC: secure workspace folder selection ──────────────────────────────

ipcMain.handle('select-workspace-folder', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Workspace',
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const folderPath = result.filePaths[0]
  const token = crypto.randomUUID()
  folderTokens.set(token, { path: folderPath, expires: Date.now() + FOLDER_TOKEN_TTL_MS })

  // Clean up expired tokens
  for (const [key, val] of folderTokens) {
    if (val.expires < Date.now()) folderTokens.delete(key)
  }

  return { token, path: folderPath }
})

app.whenReady().then(async () => {
  await startSearXNG()
  await startExpressServer()
  applyCsp()
  createMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  if (isDev) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mcpManager = require(path.join(__dirname, 'server.cjs'))
    await mcpManager.disconnectAll?.()
  } catch {
    // ignore cleanup errors
  }
})
