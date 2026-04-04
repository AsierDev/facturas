import { describe, expect, it } from 'vitest'
import { defaultConfig } from './core'
import { parseBackupContent } from './storage'
import type { Factura } from './types'

const facturaBase = (): Factura => ({
  id: 'fac-1',
  numero: 'ALQ-2026-0001',
  serie: 'ALQ',
  correlativo: 1,
  anio: 2026,
  fechaExpedicion: '2026-04-03',
  fechaOperacion: '',
  concepto: 'Alquiler',
  base: 1000,
  ivaPct: 21,
  ivaCuota: 210,
  irpfPct: 19,
  irpfCuota: 190,
  total: 1020,
  notasLegales: 'Notas',
  emisorSnapshot: {
    nombre: 'Emisor',
    dni: '12345678A',
    direccion: 'Calle A',
    codigoPostal: '26001',
    ciudad: 'Logrono',
    provincia: 'La Rioja'
  },
  inquilinoSnapshot: {
    nombre: 'Inquilino',
    dni: '87654321B',
    direccion: 'Calle B',
    codigoPostal: '26002',
    ciudad: 'Logrono',
    provincia: 'La Rioja'
  }
})

describe('storage (web)', () => {
  it('acepta un backup v1 válido', () => {
    const payload = {
      version: 1,
      exportedAt: '2026-04-03T10:00:00.000Z',
      config: defaultConfig(),
      facturas: [facturaBase()]
    }

    const parsed = parseBackupContent(JSON.stringify(payload))
    expect(parsed).not.toBeNull()
    expect(parsed?.facturas).toHaveLength(1)
    expect(parsed?.facturas[0].numero).toBe('ALQ-2026-0001')
  })

  it('rechaza backups con versión no soportada', () => {
    const payload = {
      version: 2,
      exportedAt: '2026-04-03T10:00:00.000Z',
      config: defaultConfig(),
      facturas: []
    }

    expect(parseBackupContent(JSON.stringify(payload))).toBeNull()
  })

  it('rechaza backups inválidos', () => {
    expect(parseBackupContent('{not-json')).toBeNull()
    expect(parseBackupContent(JSON.stringify({ version: 1, facturas: [] }))).toBeNull()
  })
})
