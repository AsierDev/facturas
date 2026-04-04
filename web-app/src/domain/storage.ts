import {
  DATOS_VACIOS,
  DEFAULT_CONCEPTO,
  DEFAULT_NOTAS,
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
  anioActual,
  clampPct,
  crearDraft,
  crearNumeroFactura,
  defaultConfig,
  getYearFromDate,
  hoyIso,
  limpiarSerie,
  normalizarDni
} from './core'
import type { AppConfig, AppStore, BackupPayloadV1, DatosPersonales, Factura, PersistedV1 } from './types'

const isDatosPersonales = (value: unknown): value is DatosPersonales => {
  if (!value || typeof value !== 'object') return false
  const data = value as DatosPersonales
  return (
    typeof data.nombre === 'string' &&
    typeof data.dni === 'string' &&
    typeof data.direccion === 'string' &&
    typeof data.codigoPostal === 'string' &&
    typeof data.ciudad === 'string' &&
    typeof data.provincia === 'string'
  )
}

const isFactura = (value: unknown): value is Factura => {
  if (!value || typeof value !== 'object') return false
  const data = value as Factura
  return (
    typeof data.id === 'string' &&
    typeof data.numero === 'string' &&
    typeof data.serie === 'string' &&
    typeof data.correlativo === 'number' &&
    typeof data.anio === 'number' &&
    typeof data.fechaExpedicion === 'string' &&
    typeof data.fechaOperacion === 'string' &&
    typeof data.concepto === 'string' &&
    typeof data.base === 'number' &&
    typeof data.ivaPct === 'number' &&
    typeof data.ivaCuota === 'number' &&
    typeof data.irpfPct === 'number' &&
    typeof data.irpfCuota === 'number' &&
    typeof data.total === 'number' &&
    typeof data.notasLegales === 'string' &&
    isDatosPersonales(data.emisorSnapshot) &&
    isDatosPersonales(data.inquilinoSnapshot)
  )
}

const sanitizarConfig = (value: unknown): AppConfig | null => {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<AppConfig>
  if (!isDatosPersonales(input.emisor) || !isDatosPersonales(input.inquilino)) return null

  const serie = limpiarSerie(typeof input.serie === 'string' ? input.serie : 'ALQ') || 'ALQ'
  const nextCorrelative =
    typeof input.nextCorrelative === 'number' && Number.isFinite(input.nextCorrelative) && input.nextCorrelative > 0
      ? Math.floor(input.nextCorrelative)
      : 1
  const correlativeYear =
    typeof input.correlativeYear === 'number' && Number.isFinite(input.correlativeYear)
      ? Math.floor(input.correlativeYear)
      : anioActual()

  return {
    emisor: {
      ...DATOS_VACIOS,
      ...input.emisor,
      dni: normalizarDni(input.emisor.dni)
    },
    inquilino: {
      ...DATOS_VACIOS,
      ...input.inquilino,
      dni: normalizarDni(input.inquilino.dni)
    },
    serie,
    nextCorrelative,
    correlativeYear,
    defaultConcepto: typeof input.defaultConcepto === 'string' ? input.defaultConcepto : DEFAULT_CONCEPTO,
    defaultNotasLegales: typeof input.defaultNotasLegales === 'string' ? input.defaultNotasLegales : DEFAULT_NOTAS,
    ivaPct: clampPct(typeof input.ivaPct === 'number' && Number.isFinite(input.ivaPct) ? input.ivaPct : 21),
    irpfPct: clampPct(typeof input.irpfPct === 'number' && Number.isFinite(input.irpfPct) ? input.irpfPct : 19)
  }
}

const sanitizarFacturas = (value: unknown): Factura[] => {
  if (!Array.isArray(value)) return []
  return value.filter(isFactura)
}

const loadLegacyStore = (): AppStore | null => {
  try {
    const legacyEmisorRaw = localStorage.getItem(LEGACY_STORAGE_KEYS.emisor)
    const legacyInquilinoRaw = localStorage.getItem(LEGACY_STORAGE_KEYS.inquilino)
    const legacyFacturasRaw = localStorage.getItem(LEGACY_STORAGE_KEYS.facturas)
    const legacyNextRaw = localStorage.getItem(LEGACY_STORAGE_KEYS.proximoNumero)

    if (!legacyEmisorRaw && !legacyInquilinoRaw && !legacyFacturasRaw && !legacyNextRaw) {
      return null
    }

    const baseConfig = defaultConfig()
    const emisor = legacyEmisorRaw ? JSON.parse(legacyEmisorRaw) : DATOS_VACIOS
    const inquilino = legacyInquilinoRaw ? JSON.parse(legacyInquilinoRaw) : DATOS_VACIOS
    const nextLegacy = legacyNextRaw ? Number.parseInt(legacyNextRaw, 10) : 1

    const mappedFacturas: Factura[] = []
    if (legacyFacturasRaw) {
      const parsed = JSON.parse(legacyFacturasRaw)
      if (Array.isArray(parsed)) {
        parsed.forEach((item, index) => {
          if (!item || typeof item !== 'object') return
          const fecha = typeof item.fecha === 'string' ? item.fecha : hoyIso()
          const anio = getYearFromDate(fecha)
          const correlativoRaw = Number.parseInt(String((item as { numero?: string }).numero ?? ''), 10)
          const correlativo = Number.isFinite(correlativoRaw) && correlativoRaw > 0 ? correlativoRaw : index + 1
          const numero = crearNumeroFactura('ALQ', anio, correlativo)

          const base = Number((item as { baseImponible?: number }).baseImponible) || 0
          const ivaCuota = Number((item as { iva?: number }).iva) || 0
          const irpfCuota = Number((item as { irpf?: number }).irpf) || 0
          const total = Number((item as { total?: number }).total) || base + ivaCuota - irpfCuota

          mappedFacturas.push({
            id:
              typeof (item as { id?: string }).id === 'string'
                ? (item as { id: string }).id
                : `legacy-${index}-${Date.now()}`,
            numero,
            serie: 'ALQ',
            correlativo,
            anio,
            fechaExpedicion: fecha,
            fechaOperacion: '',
            concepto:
              typeof (item as { concepto?: string }).concepto === 'string'
                ? (item as { concepto: string }).concepto
                : DEFAULT_CONCEPTO,
            base,
            ivaPct: 21,
            ivaCuota,
            irpfPct: 19,
            irpfCuota,
            total,
            notasLegales: DEFAULT_NOTAS,
            emisorSnapshot: isDatosPersonales((item as { emisor?: unknown }).emisor)
              ? (item as { emisor: DatosPersonales }).emisor
              : DATOS_VACIOS,
            inquilinoSnapshot: isDatosPersonales((item as { inquilino?: unknown }).inquilino)
              ? (item as { inquilino: DatosPersonales }).inquilino
              : DATOS_VACIOS
          })
        })
      }
    }

    const config: AppConfig = {
      ...baseConfig,
      emisor: isDatosPersonales(emisor)
        ? { ...DATOS_VACIOS, ...emisor, dni: normalizarDni(emisor.dni) }
        : DATOS_VACIOS,
      inquilino: isDatosPersonales(inquilino)
        ? { ...DATOS_VACIOS, ...inquilino, dni: normalizarDni(inquilino.dni) }
        : DATOS_VACIOS,
      nextCorrelative: Number.isFinite(nextLegacy) && nextLegacy > 0 ? nextLegacy : 1
    }

    return {
      config,
      draft: crearDraft(config),
      facturas: mappedFacturas
    }
  } catch {
    return null
  }
}

export const loadStore = (): AppStore => {
  const fallbackConfig = defaultConfig()
  const fallback: AppStore = {
    config: fallbackConfig,
    draft: crearDraft(fallbackConfig),
    facturas: []
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return loadLegacyStore() ?? fallback
    }

    const parsed = JSON.parse(raw) as Partial<PersistedV1>
    if (parsed.version !== 1) {
      return loadLegacyStore() ?? fallback
    }

    const config = sanitizarConfig(parsed.config)
    const facturas = sanitizarFacturas(parsed.facturas)
    if (!config) return fallback

    return {
      config,
      draft: crearDraft(config),
      facturas
    }
  } catch {
    return loadLegacyStore() ?? fallback
  }
}

export const persistStore = (store: AppStore) => {
  const payload: PersistedV1 = {
    version: 1,
    config: store.config,
    facturas: store.facturas
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export const buildBackupPayload = (store: AppStore): BackupPayloadV1 => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  config: store.config,
  facturas: store.facturas
})

export const parseBackupContent = (content: string): { config: AppConfig; facturas: Factura[] } | null => {
  try {
    const parsed = JSON.parse(content) as Partial<BackupPayloadV1>
    const config = sanitizarConfig(parsed.config)
    const facturas = sanitizarFacturas(parsed.facturas)

    if (parsed.version !== 1 || !config) {
      return null
    }

    return { config, facturas }
  } catch {
    return null
  }
}
