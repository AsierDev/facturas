import { describe, expect, it } from 'vitest'
import {
  clampPct,
  createDefaultStore,
  getNextNumber,
  parseNumberInput,
  redondear2
} from './core'
import type { Factura } from './types'

const factura = (numero: string, serie: string, anio: number, correlativo: number): Factura => ({
  id: `${serie}-${anio}-${correlativo}`,
  numero,
  serie,
  correlativo,
  anio,
  fechaExpedicion: `${anio}-01-01`,
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

describe('core domain (web)', () => {
  it('calcula 0001 si no hay facturas, aunque nextCorrelative sea mayor', () => {
    const store = createDefaultStore()
    store.config.serie = 'ALQ'
    store.config.correlativeYear = 2026
    store.config.nextCorrelative = 9

    const next = getNextNumber(store.config, [], '2026-04-03')

    expect(next.correlativo).toBe(1)
    expect(next.numero).toBe('ALQ-2026-0001')
  })

  it('calcula el siguiente correlativo real por serie y año', () => {
    const store = createDefaultStore()
    store.config.serie = 'ALQ'

    const facturas = [
      factura('ALQ-2026-0001', 'ALQ', 2026, 1),
      factura('ALQ-2026-0002', 'ALQ', 2026, 2),
      factura('ALQ-2025-0009', 'ALQ', 2025, 9),
      factura('OTRA-2026-0017', 'OTRA', 2026, 17)
    ]

    const next = getNextNumber(store.config, facturas, '2026-04-03')
    expect(next.correlativo).toBe(3)
    expect(next.numero).toBe('ALQ-2026-0003')
  })

  it('parsea importes con coma o punto', () => {
    expect(parseNumberInput('1000,55')).toBe(1000.55)
    expect(parseNumberInput('1000.55')).toBe(1000.55)
    expect(parseNumberInput('')).toBe(0)
  })

  it('acota porcentajes a 0..100', () => {
    expect(clampPct(-10)).toBe(0)
    expect(clampPct(21)).toBe(21)
    expect(clampPct(150)).toBe(100)
  })

  it('redondea a dos decimales', () => {
    expect(redondear2(123.456)).toBe(123.46)
    expect(redondear2(123.454)).toBe(123.45)
  })
})
