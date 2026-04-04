export interface DatosPersonales {
  nombre: string
  dni: string
  direccion: string
  codigoPostal: string
  ciudad: string
  provincia: string
}

export interface AppConfig {
  emisor: DatosPersonales
  inquilino: DatosPersonales
  serie: string
  nextCorrelative: number
  correlativeYear: number
  defaultConcepto: string
  defaultNotasLegales: string
  ivaPct: number
  irpfPct: number
}

export interface Factura {
  id: string
  numero: string
  serie: string
  correlativo: number
  anio: number
  fechaExpedicion: string
  fechaOperacion: string
  concepto: string
  base: number
  ivaPct: number
  ivaCuota: number
  irpfPct: number
  irpfCuota: number
  total: number
  notasLegales: string
  emisorSnapshot: DatosPersonales
  inquilinoSnapshot: DatosPersonales
}

export interface InvoiceDraft {
  fechaExpedicion: string
  fechaOperacion: string
  concepto: string
  notasLegales: string
  baseInput: string
}

export interface AppStore {
  config: AppConfig
  draft: InvoiceDraft
  facturas: Factura[]
}

export interface PersistedV1 {
  version: 1
  config: AppConfig
  facturas: Factura[]
}

export interface BackupPayloadV1 extends PersistedV1 {
  exportedAt: string
}

export interface FacturasDesktopBridge {
  exportLegacySnapshot: (payload: BackupPayloadV1) => Promise<{ ok: boolean; path?: string; error?: string }>
  getLegacySnapshotPath: () => Promise<string>
  savePdf: (payload: { html: string; fileName: string }) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>
}

export type Vista = 'factura' | 'lista' | 'configuracion'

export type Mensaje = {
  tipo: 'ok' | 'error' | 'info'
  texto: string
}

export type PersonaKey = 'emisor' | 'inquilino'

export type LegacyStorageKeyMap = {
  emisor: string
  inquilino: string
  facturas: string
  proximoNumero: string
}

declare global {
  interface Window {
    facturasDesktop?: FacturasDesktopBridge
  }
}

export {}
