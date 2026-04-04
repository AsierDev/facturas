import { InputCampo, TextAreaCampo } from '@/components/FormFields'
import { formatearEuros } from '@/domain/core'
import type { AppConfig, InvoiceDraft } from '@/domain/types'

interface FacturaCreateViewProps {
  config: AppConfig
  draft: InvoiceDraft
  proximoNumeroVista: string
  base: number
  ivaCalculado: number
  irpfCalculado: number
  totalCalculado: number
  onDraftChange: <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => void
  onCrearFactura: () => void
}

export function FacturaCreateView({
  config,
  draft,
  proximoNumeroVista,
  base,
  ivaCalculado,
  irpfCalculado,
  totalCalculado,
  onDraftChange,
  onCrearFactura
}: FacturaCreateViewProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-6 text-2xl font-bold text-gray-800">Crear nueva factura</h2>

        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-lg text-blue-900">
          <p>
            Próximo número automático: <strong>{proximoNumeroVista}</strong>
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <InputCampo
            label="Fecha de expedición"
            type="date"
            value={draft.fechaExpedicion}
            onChange={(value) => onDraftChange('fechaExpedicion', value)}
          />
          <InputCampo
            label="Fecha de operación (opcional)"
            type="date"
            value={draft.fechaOperacion}
            onChange={(value) => onDraftChange('fechaOperacion', value)}
          />
        </div>

        <InputCampo
          label="Concepto"
          value={draft.concepto}
          onChange={(value) => onDraftChange('concepto', value)}
          placeholder="Alquiler mensual local comercial"
        />

        <TextAreaCampo
          label="Notas legales o aclaraciones"
          value={draft.notasLegales}
          onChange={(value) => onDraftChange('notasLegales', value)}
          placeholder="Texto adicional para la factura"
        />

        <div className="mt-6 rounded-xl border-2 border-yellow-300 bg-yellow-50 p-6">
          <h3 className="mb-4 text-xl font-bold text-gray-800">Importe</h3>

          <div className="grid gap-6 md:grid-cols-2">
            <InputCampo
              label="Base imponible (€)"
              type="text"
              value={draft.baseInput}
              onChange={(value) => onDraftChange('baseInput', value)}
              placeholder="1000,00"
              helpText="Puede usar coma o punto decimal."
            />

            <div className="space-y-3 text-lg">
              <div className="flex justify-between border-b py-2">
                <span className="text-gray-600">Base imponible:</span>
                <span className="font-semibold">{formatearEuros(base)} €</span>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-gray-600">IVA ({config.ivaPct.toFixed(2)}%):</span>
                <span className="font-semibold text-green-700">+{formatearEuros(ivaCalculado)} €</span>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-gray-600">IRPF ({config.irpfPct.toFixed(2)}%):</span>
                <span className="font-semibold text-red-700">-{formatearEuros(irpfCalculado)} €</span>
              </div>
              <div className="mt-2 flex justify-between rounded-lg bg-blue-100 px-3 py-3">
                <span className="text-lg font-bold">TOTAL A PAGAR:</span>
                <span className="text-lg font-bold text-blue-800">{formatearEuros(totalCalculado)} €</span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onCrearFactura}
          className="mt-6 w-full rounded-xl bg-green-600 py-4 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700"
        >
          Crear factura
        </button>
      </section>

      {(config.emisor.nombre || config.inquilino.nombre) && (
        <div className="grid gap-6 md:grid-cols-2">
          {config.emisor.nombre && (
            <section className="rounded-xl bg-white p-6 shadow-lg">
              <h3 className="mb-3 text-lg font-bold text-gray-800">Emisor guardado</h3>
              <p className="text-gray-700">
                <strong>{config.emisor.nombre}</strong>
              </p>
              <p className="text-gray-600">DNI: {config.emisor.dni}</p>
              <p className="text-sm text-gray-600">
                {config.emisor.direccion}, {config.emisor.codigoPostal} {config.emisor.ciudad}
              </p>
            </section>
          )}

          {config.inquilino.nombre && (
            <section className="rounded-xl bg-white p-6 shadow-lg">
              <h3 className="mb-3 text-lg font-bold text-gray-800">Inquilino guardado</h3>
              <p className="text-gray-700">
                <strong>{config.inquilino.nombre}</strong>
              </p>
              <p className="text-gray-600">DNI: {config.inquilino.dni}</p>
              <p className="text-sm text-gray-600">
                {config.inquilino.direccion}, {config.inquilino.codigoPostal} {config.inquilino.ciudad}
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
