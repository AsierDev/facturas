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

export type Vista = 'factura' | 'lista' | 'configuracion'

export type Mensaje = {
  tipo: 'ok' | 'error' | 'info'
  texto: string
}

export type PersonaKey = 'emisor' | 'inquilino'

export interface MigrationPayload {
  modern: string | null
  emisor: string | null
  inquilino: string | null
  facturas: string | null
  proximoNumero: string | null
}

export interface FacturasDesktopApi {
  getPaths: () => Promise<{ userData: string; dbPath: string; sharedSnapshot: string }>
  migrationRun: (payload: MigrationPayload) => Promise<{ status: string; importedCount?: number }>
  configGet: () => Promise<AppConfig>
  configSet: (config: AppConfig) => Promise<{ ok: boolean; config: AppConfig }>
  invoiceList: () => Promise<Factura[]>
  invoiceCreate: (draft: InvoiceDraft) => Promise<{ invoice: Factura; config: AppConfig }>
  invoiceDelete: (id: string) => Promise<{ ok: boolean }>
  pdfSave: (payload: { html: string; fileName: string }) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>
  backupExport: () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>
  backupImport: () => Promise<{ ok: boolean; canceled?: boolean; importedCount?: number; error?: string }>
}

export type LegacyStorageKeyMap = {
  emisor: string
  inquilino: string
  facturas: string
  proximoNumero: string
}

declare global {
  interface Window {
    facturasDesktopApi?: FacturasDesktopApi
  }
}

export {}
