const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('fs/promises')
const path = require('path')
const { randomUUID } = require('crypto')
const Database = require('better-sqlite3')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const DB_FILE_NAME = 'facturas.db'
const MODERN_STORAGE_KEY = 'facturas_alquiler_app_v1'
const LEGACY_SNAPSHOT_PATH = () => path.join(app.getPath('documents'), 'Facturas', 'legacy-snapshot.json')

const DATOS_VACIOS = {
  nombre: '',
  dni: '',
  direccion: '',
  codigoPostal: '',
  ciudad: '',
  provincia: ''
}

const DEFAULT_CONCEPTO = 'Alquiler mensual local comercial'
const DEFAULT_NOTAS = 'Operación sujeta a IVA 21% con retención de IRPF sobre la base imponible.'

const clampPct = (value) => Math.min(100, Math.max(0, value))
const nowIso = () => new Date().toISOString()
const todayIso = () => nowIso().split('T')[0]
const currentYear = () => new Date().getFullYear()
const sanitizeSerie = (serie) => String(serie ?? '').toUpperCase().replace(/[^A-Z0-9/_.-]/g, '').slice(0, 12)
const normalizeDni = (dni) => String(dni ?? '').toUpperCase().trim()
const parseDecimal = (value) => {
  const normalized = String(value ?? '').replace(',', '.').trim()
  if (!normalized) return 0
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}
const toCents = (value) => Math.round(value * 100)
const fromCents = (cents) => cents / 100
const pctToBp = (pct) => Math.round(clampPct(Number(pct || 0)) * 100)
const bpToPct = (bp) => bp / 100
const getYearFromDate = (value) => {
  const year = Number.parseInt(String(value || '').slice(0, 4), 10)
  return Number.isFinite(year) ? year : currentYear()
}
const composeInvoiceNumber = (serie, year, correlative) => `${serie}-${year}-${String(correlative).padStart(4, '0')}`
const sanitizeFileName = (value) => {
  const cleaned = String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .trim()
  return cleaned || 'factura'
}

const isPerson = (value) => {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.nombre === 'string' &&
    typeof value.dni === 'string' &&
    typeof value.direccion === 'string' &&
    typeof value.codigoPostal === 'string' &&
    typeof value.ciudad === 'string' &&
    typeof value.provincia === 'string'
  )
}

const completePerson = (value) => {
  return Boolean(
    value.nombre.trim() &&
      value.dni.trim() &&
      value.direccion.trim() &&
      value.codigoPostal.trim() &&
      value.ciudad.trim() &&
      value.provincia.trim()
  )
}

const defaultConfig = () => ({
  emisor: { ...DATOS_VACIOS },
  inquilino: { ...DATOS_VACIOS },
  serie: 'ALQ',
  nextCorrelative: 1,
  correlativeYear: currentYear(),
  defaultConcepto: DEFAULT_CONCEPTO,
  defaultNotasLegales: DEFAULT_NOTAS,
  ivaPct: 21,
  irpfPct: 19
})

const sanitizeConfig = (value) => {
  if (!value || typeof value !== 'object') return null
  if (!isPerson(value.emisor) || !isPerson(value.inquilino)) return null

  const serie = sanitizeSerie(value.serie) || 'ALQ'
  const nextCorrelative =
    typeof value.nextCorrelative === 'number' && Number.isFinite(value.nextCorrelative) && value.nextCorrelative > 0
      ? Math.floor(value.nextCorrelative)
      : 1
  const correlativeYear =
    typeof value.correlativeYear === 'number' && Number.isFinite(value.correlativeYear)
      ? Math.floor(value.correlativeYear)
      : currentYear()

  return {
    emisor: {
      ...DATOS_VACIOS,
      ...value.emisor,
      dni: normalizeDni(value.emisor.dni)
    },
    inquilino: {
      ...DATOS_VACIOS,
      ...value.inquilino,
      dni: normalizeDni(value.inquilino.dni)
    },
    serie,
    nextCorrelative,
    correlativeYear,
    defaultConcepto: typeof value.defaultConcepto === 'string' ? value.defaultConcepto : DEFAULT_CONCEPTO,
    defaultNotasLegales: typeof value.defaultNotasLegales === 'string' ? value.defaultNotasLegales : DEFAULT_NOTAS,
    ivaPct: clampPct(Number(value.ivaPct ?? 21)),
    irpfPct: clampPct(Number(value.irpfPct ?? 19))
  }
}

const mapInvoiceRow = (row) => ({
  id: row.id,
  numero: row.invoice_number,
  serie: row.serie,
  correlativo: row.correlative,
  anio: row.year,
  fechaExpedicion: row.issue_date,
  fechaOperacion: row.operation_date ?? '',
  concepto: row.concept,
  base: fromCents(row.base_cents),
  ivaPct: bpToPct(row.iva_pct_bp),
  ivaCuota: fromCents(row.iva_cents),
  irpfPct: bpToPct(row.irpf_pct_bp),
  irpfCuota: fromCents(row.irpf_cents),
  total: fromCents(row.total_cents),
  notasLegales: row.legal_notes ?? '',
  emisorSnapshot: JSON.parse(row.emitter_json),
  inquilinoSnapshot: JSON.parse(row.tenant_json)
})

const parseInvoiceNumber = (value) => {
  const match = String(value || '').match(/^([A-Z0-9/_.-]+)-(\d{4})-(\d{1,8})$/)
  if (!match) return null
  return {
    serie: match[1],
    year: Number.parseInt(match[2], 10),
    correlative: Number.parseInt(match[3], 10)
  }
}

const normalizeInvoiceInput = (item, fallbackConfig, index) => {
  const rawIssueDate = item.fechaExpedicion ?? item.fecha ?? todayIso()
  const issueDate = typeof rawIssueDate === 'string' && rawIssueDate ? rawIssueDate : todayIso()
  const parsedNumber = parseInvoiceNumber(item.numero)
  const serie = sanitizeSerie(item.serie ?? parsedNumber?.serie ?? fallbackConfig.serie) || fallbackConfig.serie
  const year = Number.isFinite(item.anio) ? Number(item.anio) : parsedNumber?.year ?? getYearFromDate(issueDate)
  const correlative =
    Number.isFinite(item.correlativo) && Number(item.correlativo) > 0
      ? Math.floor(Number(item.correlativo))
      : parsedNumber?.correlative ?? index + 1

  const base = Number.isFinite(item.base) ? Number(item.base) : Number(item.baseImponible ?? 0)
  const ivaPct = Number.isFinite(item.ivaPct) ? Number(item.ivaPct) : 21
  const irpfPct = Number.isFinite(item.irpfPct) ? Number(item.irpfPct) : 19
  const baseCents = toCents(base)
  const ivaBp = pctToBp(ivaPct)
  const irpfBp = pctToBp(irpfPct)
  const ivaCents = Number.isFinite(item.ivaCuota)
    ? toCents(Number(item.ivaCuota))
    : Number.isFinite(item.iva)
      ? toCents(Number(item.iva))
      : Math.round((baseCents * ivaBp) / 10000)
  const irpfCents = Number.isFinite(item.irpfCuota)
    ? toCents(Number(item.irpfCuota))
    : Number.isFinite(item.irpf)
      ? toCents(Number(item.irpf))
      : Math.round((baseCents * irpfBp) / 10000)
  const totalCents =
    Number.isFinite(item.total) && Number(item.total) > 0
      ? toCents(Number(item.total))
      : baseCents + ivaCents - irpfCents

  const emisorSnapshot = isPerson(item.emisorSnapshot)
    ? item.emisorSnapshot
    : isPerson(item.emisor)
      ? item.emisor
      : fallbackConfig.emisor

  const inquilinoSnapshot = isPerson(item.inquilinoSnapshot)
    ? item.inquilinoSnapshot
    : isPerson(item.inquilino)
      ? item.inquilino
      : fallbackConfig.inquilino

  return {
    id: typeof item.id === 'string' && item.id ? item.id : randomUUID(),
    invoiceNumber: item.numero || composeInvoiceNumber(serie, year, correlative),
    serie,
    year,
    correlative,
    issueDate,
    operationDate: typeof item.fechaOperacion === 'string' ? item.fechaOperacion : '',
    concept: String(item.concepto ?? item.concept ?? fallbackConfig.defaultConcepto),
    baseCents,
    ivaBp,
    ivaCents,
    irpfBp,
    irpfCents,
    totalCents,
    legalNotes: String(item.notasLegales ?? item.legal_notes ?? fallbackConfig.defaultNotasLegales),
    emisorSnapshot,
    inquilinoSnapshot,
    createdAt: typeof item.created_at === 'string' ? item.created_at : nowIso()
  }
}

const createDatabase = (dbPath) => {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      schema_version INTEGER NOT NULL,
      migrated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      serie TEXT NOT NULL,
      year INTEGER NOT NULL,
      correlative INTEGER NOT NULL,
      issue_date TEXT NOT NULL,
      operation_date TEXT,
      concept TEXT NOT NULL,
      base_cents INTEGER NOT NULL,
      iva_pct_bp INTEGER NOT NULL,
      iva_cents INTEGER NOT NULL,
      irpf_pct_bp INTEGER NOT NULL,
      irpf_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      legal_notes TEXT,
      emitter_json TEXT NOT NULL,
      tenant_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
    INSERT OR IGNORE INTO meta(schema_version, migrated_at) VALUES (1, NULL);
  `)

  return db
}

const readConfig = (db) => {
  const row = db.prepare('SELECT value_json FROM config WHERE key = ?').get('app_config')
  if (!row) {
    const config = defaultConfig()
    writeConfig(db, config)
    return config
  }

  try {
    const parsed = JSON.parse(row.value_json)
    const sanitized = sanitizeConfig(parsed)
    if (!sanitized) throw new Error('invalid_config')
    return sanitized
  } catch {
    const config = defaultConfig()
    writeConfig(db, config)
    return config
  }
}

const writeConfig = (db, config) => {
  const sanitized = sanitizeConfig(config) ?? defaultConfig()
  db.prepare(
    'INSERT INTO config(key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at'
  ).run('app_config', JSON.stringify(sanitized), nowIso())
  return sanitized
}

const listInvoices = (db) => {
  const rows = db
    .prepare(
      `SELECT
        id, invoice_number, serie, year, correlative,
        issue_date, operation_date, concept,
        base_cents, iva_pct_bp, iva_cents,
        irpf_pct_bp, irpf_cents,
        total_cents, legal_notes,
        emitter_json, tenant_json, created_at
       FROM invoices
       ORDER BY created_at DESC`
    )
    .all()

  return rows.map(mapInvoiceRow)
}

const invoiceExists = (db, invoiceNumber) =>
  Boolean(db.prepare('SELECT 1 FROM invoices WHERE invoice_number = ?').get(invoiceNumber))

const insertInvoiceRow = (db, invoiceRow) => {
  db.prepare(
    `INSERT INTO invoices (
      id, invoice_number, serie, year, correlative,
      issue_date, operation_date, concept,
      base_cents, iva_pct_bp, iva_cents,
      irpf_pct_bp, irpf_cents,
      total_cents, legal_notes,
      emitter_json, tenant_json, created_at
    ) VALUES (
      @id, @invoiceNumber, @serie, @year, @correlative,
      @issueDate, @operationDate, @concept,
      @baseCents, @ivaBp, @ivaCents,
      @irpfBp, @irpfCents,
      @totalCents, @legalNotes,
      @emisorSnapshotJson, @inquilinoSnapshotJson, @createdAt
    )`
  ).run({
    ...invoiceRow,
    emisorSnapshotJson: JSON.stringify(invoiceRow.emisorSnapshot),
    inquilinoSnapshotJson: JSON.stringify(invoiceRow.inquilinoSnapshot)
  })
}

const importDataset = (db, payload, migratedAt = nowIso()) => {
  const sanitizedConfig = sanitizeConfig(payload.config)
  if (!sanitizedConfig) {
    throw new Error('invalid_config')
  }

  const rawInvoices = Array.isArray(payload.facturas) ? payload.facturas : []
  const normalized = rawInvoices.map((item, index) => normalizeInvoiceInput(item, sanitizedConfig, index))

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM invoices').run()
    writeConfig(db, sanitizedConfig)

    normalized.forEach((invoice) => {
      insertInvoiceRow(db, invoice)
    })

    db.prepare('UPDATE meta SET migrated_at = ?').run(migratedAt)
  })

  tx()

  const finalConfig = readConfig(db)
  return {
    config: finalConfig,
    facturas: listInvoices(db)
  }
}

const buildBackupPayload = (db) => ({
  version: 1,
  exportedAt: nowIso(),
  config: readConfig(db),
  facturas: listInvoices(db)
})

const isDatabaseEmpty = (db) => {
  const row = db.prepare('SELECT COUNT(1) as count FROM invoices').get()
  return Number(row.count) === 0
}

const buildDatasetFromLegacyStorage = (local) => {
  const emisor = local.emisor ? JSON.parse(local.emisor) : DATOS_VACIOS
  const inquilino = local.inquilino ? JSON.parse(local.inquilino) : DATOS_VACIOS
  const facturas = local.facturas ? JSON.parse(local.facturas) : []
  const next = local.proximoNumero ? Number.parseInt(local.proximoNumero, 10) : 1

  const config = {
    ...defaultConfig(),
    emisor: isPerson(emisor) ? { ...DATOS_VACIOS, ...emisor, dni: normalizeDni(emisor.dni) } : { ...DATOS_VACIOS },
    inquilino: isPerson(inquilino)
      ? { ...DATOS_VACIOS, ...inquilino, dni: normalizeDni(inquilino.dni) }
      : { ...DATOS_VACIOS },
    nextCorrelative: Number.isFinite(next) && next > 0 ? next : 1
  }

  return {
    config,
    facturas: Array.isArray(facturas) ? facturas : []
  }
}

const readJsonFileIfExists = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

const runMigration = async (db, localPayload) => {
  if (!isDatabaseEmpty(db)) {
    return { status: 'skipped_existing' }
  }

  const sharedSnapshot = await readJsonFileIfExists(LEGACY_SNAPSHOT_PATH())
  if (sharedSnapshot && sharedSnapshot.version === 1 && sharedSnapshot.config) {
    const result = importDataset(db, sharedSnapshot, nowIso())
    return {
      status: 'migrated_shared_snapshot',
      importedCount: result.facturas.length
    }
  }

  if (localPayload?.modern) {
    try {
      const modern = JSON.parse(localPayload.modern)
      if (modern?.version === 1 && modern?.config) {
        const result = importDataset(db, modern, nowIso())
        return {
          status: 'migrated_modern_localstorage',
          importedCount: result.facturas.length
        }
      }
    } catch {
      // no-op
    }
  }

  if (localPayload?.emisor || localPayload?.inquilino || localPayload?.facturas || localPayload?.proximoNumero) {
    try {
      const legacy = buildDatasetFromLegacyStorage(localPayload)
      const result = importDataset(db, legacy, nowIso())
      return {
        status: 'migrated_legacy_localstorage',
        importedCount: result.facturas.length
      }
    } catch {
      // no-op
    }
  }

  return { status: 'no_source' }
}

const createInvoice = (db, draftInput) => {
  const config = readConfig(db)

  if (!completePerson(config.emisor) || !completePerson(config.inquilino)) {
    throw new Error('missing_people')
  }

  const baseValue = parseDecimal(draftInput?.baseInput)
  if (baseValue <= 0) {
    throw new Error('invalid_base')
  }

  const issueDate = typeof draftInput?.fechaExpedicion === 'string' && draftInput.fechaExpedicion ? draftInput.fechaExpedicion : todayIso()
  const operationDate = typeof draftInput?.fechaOperacion === 'string' ? draftInput.fechaOperacion : ''
  const concept = String(draftInput?.concepto ?? '').trim() || config.defaultConcepto
  const notes = String(draftInput?.notasLegales ?? '').trim() || config.defaultNotasLegales

  const serie = sanitizeSerie(config.serie) || 'ALQ'
  const year = getYearFromDate(issueDate)

  let correlative = config.correlativeYear === year ? config.nextCorrelative : 1
  while (invoiceExists(db, composeInvoiceNumber(serie, year, correlative))) {
    correlative += 1
  }

  const baseCents = toCents(baseValue)
  const ivaBp = pctToBp(config.ivaPct)
  const irpfBp = pctToBp(config.irpfPct)
  const ivaCents = Math.round((baseCents * ivaBp) / 10000)
  const irpfCents = Math.round((baseCents * irpfBp) / 10000)
  const totalCents = baseCents + ivaCents - irpfCents

  const invoiceRow = {
    id: randomUUID(),
    invoiceNumber: composeInvoiceNumber(serie, year, correlative),
    serie,
    year,
    correlative,
    issueDate,
    operationDate,
    concept,
    baseCents,
    ivaBp,
    ivaCents,
    irpfBp,
    irpfCents,
    totalCents,
    legalNotes: notes,
    emisorSnapshot: config.emisor,
    inquilinoSnapshot: config.inquilino,
    createdAt: nowIso()
  }

  insertInvoiceRow(db, invoiceRow)

  const nextConfig = writeConfig(db, {
    ...config,
    serie,
    correlativeYear: year,
    nextCorrelative: correlative + 1
  })

  const mapped = mapInvoiceRow({
    id: invoiceRow.id,
    invoice_number: invoiceRow.invoiceNumber,
    serie: invoiceRow.serie,
    year: invoiceRow.year,
    correlative: invoiceRow.correlative,
    issue_date: invoiceRow.issueDate,
    operation_date: invoiceRow.operationDate,
    concept: invoiceRow.concept,
    base_cents: invoiceRow.baseCents,
    iva_pct_bp: invoiceRow.ivaBp,
    iva_cents: invoiceRow.ivaCents,
    irpf_pct_bp: invoiceRow.irpfBp,
    irpf_cents: invoiceRow.irpfCents,
    total_cents: invoiceRow.totalCents,
    legal_notes: invoiceRow.legalNotes,
    emitter_json: JSON.stringify(invoiceRow.emisorSnapshot),
    tenant_json: JSON.stringify(invoiceRow.inquilinoSnapshot),
    created_at: invoiceRow.createdAt
  })

  return {
    invoice: mapped,
    config: nextConfig
  }
}

let db = null

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

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), DB_FILE_NAME)
  db = createDatabase(dbPath)
  readConfig(db)

  ipcMain.handle('app:paths', async () => ({
    userData: app.getPath('userData'),
    dbPath,
    sharedSnapshot: LEGACY_SNAPSHOT_PATH()
  }))

  ipcMain.handle('migration:run', async (_event, payload) => {
    return runMigration(db, payload)
  })

  ipcMain.handle('config:get', async () => {
    return readConfig(db)
  })

  ipcMain.handle('config:set', async (_event, config) => {
    const saved = writeConfig(db, config)
    return { ok: true, config: saved }
  })

  ipcMain.handle('invoice:list', async () => {
    return listInvoices(db)
  })

  ipcMain.handle('invoice:create', async (_event, draft) => {
    return createInvoice(db, draft)
  })

  ipcMain.handle('invoice:delete', async (_event, id) => {
    if (!id || typeof id !== 'string') return { ok: false }
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('backup:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Guardar copia de seguridad',
      defaultPath: path.join(app.getPath('documents'), `backup-facturas-${todayIso()}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }

    const payload = buildBackupPayload(db)
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, path: result.filePath }
  })

  ipcMain.handle('backup:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importar copia de seguridad',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true }
    }

    const parsed = await readJsonFileIfExists(result.filePaths[0])
    if (!parsed || parsed.version !== 1 || !parsed.config) {
      return { ok: false, error: 'invalid_file' }
    }

    const imported = importDataset(db, parsed, nowIso())
    return {
      ok: true,
      importedCount: imported.facturas.length
    }
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
    } catch {
      return { ok: false, error: 'save_failed' }
    }
  })

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

app.on('before-quit', () => {
  if (db) {
    db.close()
    db = null
  }
})
