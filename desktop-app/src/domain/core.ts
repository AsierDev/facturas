import type { AppConfig, AppStore, DatosPersonales, Factura, InvoiceDraft, LegacyStorageKeyMap } from './types'

export const STORAGE_KEY = 'facturas_alquiler_app_v1'
export const LEGACY_STORAGE_KEYS: LegacyStorageKeyMap = {
  emisor: 'facturas_emisor',
  inquilino: 'facturas_inquilino',
  facturas: 'facturas_lista',
  proximoNumero: 'facturas_proximo_numero'
}

export const DATOS_VACIOS: DatosPersonales = {
  nombre: '',
  dni: '',
  direccion: '',
  codigoPostal: '',
  ciudad: '',
  provincia: ''
}

export const DEFAULT_CONCEPTO = 'Alquiler mensual local comercial'
export const DEFAULT_NOTAS = 'Operación sujeta a IVA 21% con retención de IRPF sobre la base imponible.'

export const hoyIso = () => new Date().toISOString().split('T')[0]
export const anioActual = () => new Date().getFullYear()
export const redondear2 = (valor: number) => Math.round(valor * 100) / 100

export const formatearEuros = (valor: number) =>
  valor.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

export const limpiarSerie = (serie: string) => serie.toUpperCase().replace(/[^A-Z0-9/_.-]/g, '').slice(0, 12)
export const normalizarDni = (dni: string) => dni.toUpperCase().trim()

export const parseNumberInput = (value: string) => {
  const normalizado = value.replace(',', '.').trim()
  if (!normalizado) return 0
  const parsed = Number.parseFloat(normalizado)
  return Number.isFinite(parsed) ? parsed : 0
}

export const clampPct = (value: number) => Math.min(100, Math.max(0, value))

export const fechaLegible = (fecha: string) => {
  const date = new Date(fecha)
  if (Number.isNaN(date.getTime())) return fecha
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

export const fechaCorta = (fecha: string) => {
  const date = new Date(fecha)
  if (Number.isNaN(date.getTime())) return fecha
  return date.toLocaleDateString('es-ES')
}

export const getYearFromDate = (fechaIso: string) => {
  const year = Number.parseInt(fechaIso.slice(0, 4), 10)
  return Number.isFinite(year) ? year : anioActual()
}

export const crearNumeroFactura = (serie: string, anio: number, correlativo: number) =>
  `${serie}-${anio}-${String(correlativo).padStart(4, '0')}`

export const defaultConfig = (): AppConfig => ({
  emisor: DATOS_VACIOS,
  inquilino: DATOS_VACIOS,
  serie: 'ALQ',
  nextCorrelative: 1,
  correlativeYear: anioActual(),
  defaultConcepto: DEFAULT_CONCEPTO,
  defaultNotasLegales: DEFAULT_NOTAS,
  ivaPct: 21,
  irpfPct: 19
})

export const crearDraft = (config: AppConfig): InvoiceDraft => ({
  fechaExpedicion: hoyIso(),
  fechaOperacion: '',
  concepto: config.defaultConcepto,
  notasLegales: config.defaultNotasLegales,
  baseInput: ''
})

export const createDefaultStore = (): AppStore => {
  const config = defaultConfig()
  return {
    config,
    draft: crearDraft(config),
    facturas: []
  }
}

export const personaCompleta = (persona: DatosPersonales) => {
  return Boolean(
    persona.nombre.trim() &&
      persona.dni.trim() &&
      persona.direccion.trim() &&
      persona.codigoPostal.trim() &&
      persona.ciudad.trim() &&
      persona.provincia.trim()
  )
}

export const getNextNumber = (config: AppConfig, facturas: Factura[], fechaExpedicion: string) => {
  const anio = getYearFromDate(fechaExpedicion)
  const targetSerie = config.serie
  let maxCorrelativo = 0

  for (const factura of facturas) {
    if (factura.serie === targetSerie && factura.anio === anio && factura.correlativo > maxCorrelativo) {
      maxCorrelativo = factura.correlativo
    }
  }

  let correlativo = maxCorrelativo + 1

  while (facturas.some((factura) => factura.numero === crearNumeroFactura(config.serie, anio, correlativo))) {
    correlativo += 1
  }

  return {
    anio,
    correlativo,
    numero: crearNumeroFactura(config.serie, anio, correlativo)
  }
}
