const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('fs/promises')
const path = require('path')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const LEGACY_SNAPSHOT_PATH = () => path.join(app.getPath('documents'), 'Facturas', 'legacy-snapshot.json')
const todayIso = () => new Date().toISOString().split('T')[0]
const sanitizeFileName = (value) => {
  const cleaned = String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .trim()
  return cleaned || 'factura'
}

const createPdfBufferFromHtml = async (html) => {
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  try {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    await pdfWindow.loadURL(dataUrl)
    const buffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
      marginsType: 1
    })
    return buffer
  } finally {
    if (!pdfWindow.isDestroyed()) {
      pdfWindow.close()
    }
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('legacy:write-snapshot', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'invalid_payload' }
  }

  try {
    const snapshotPath = LEGACY_SNAPSHOT_PATH()
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
    await fs.writeFile(snapshotPath, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, path: snapshotPath }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'write_failed'
    }
  }
})

ipcMain.handle('legacy:get-snapshot-path', async () => {
  return LEGACY_SNAPSHOT_PATH()
})

ipcMain.handle('pdf:save', async (_event, payload) => {
  const html = typeof payload?.html === 'string' ? payload.html : ''
  if (!html.trim()) {
    return { ok: false, error: 'invalid_html' }
  }

  const requestedFileName = typeof payload?.fileName === 'string' ? payload.fileName : `factura-${todayIso()}`
  const safeFileName = `${sanitizeFileName(requestedFileName).replace(/\.pdf$/i, '')}.pdf`

  const saveDialog = await dialog.showSaveDialog({
    title: 'Guardar factura en PDF',
    defaultPath: path.join(app.getPath('documents'), safeFileName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })

  if (saveDialog.canceled || !saveDialog.filePath) {
    return { ok: false, canceled: true }
  }

  try {
    const pdfBuffer = await createPdfBufferFromHtml(html)
    await fs.writeFile(saveDialog.filePath, pdfBuffer)
    return { ok: true, path: saveDialog.filePath }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'save_failed'
    }
  }
})

app.whenReady().then(() => {
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
