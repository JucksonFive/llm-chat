import { app, BrowserWindow, Menu, shell } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let serverPort = 3001

const isDev = !app.isPackaged

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

async function startExpressServer() {
  if (isDev) {
    // In dev, Express runs separately via `dev:server` on port 3001
    return
  }

  process.env.ELECTRON_PROD = 'true'
  process.env.ELECTRON = 'true'
  process.env.ELECTRON_DIST_PATH = path.join(__dirname, '..', 'dist')

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

app.whenReady().then(async () => {
  await startExpressServer()
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
