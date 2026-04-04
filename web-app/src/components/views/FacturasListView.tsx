import { type ChangeEvent, type RefObject } from 'react'
import { fechaCorta, fechaLegible, formatearEuros } from '@/domain/core'
import type { Factura } from '@/domain/types'

interface FacturasListViewProps {
  facturas: Factura[]
  facturaSeleccionada: Factura | null
  onSelectFactura: (id: string) => void
  onCloseDetalle: () => void
  onImprimir: (factura: Factura) => void
  onGuardarPdf: (factura: Factura) => Promise<void>
  onEliminar: (id: string) => void
  onExportarBackup: () => void
  onImportClick: () => void
  onImportChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  fileInputRef: RefObject<HTMLInputElement | null>
}

export function FacturasListView({
  facturas,
  facturaSeleccionada,
  onSelectFactura,
  onCloseDetalle,
  onImprimir,
  onGuardarPdf,
  onEliminar,
  onExportarBackup,
  onImportClick,
  onImportChange,
  fileInputRef
}: FacturasListViewProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-gray-800">Facturas guardadas</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onExportarBackup}
              className="rounded-lg bg-blue-600 px-4 py-2 text-lg font-semibold text-white hover:bg-blue-700"
            >
              Exportar copia
            </button>
            <button
              onClick={onImportClick}
              className="rounded-lg bg-gray-700 px-4 py-2 text-lg font-semibold text-white hover:bg-gray-800"
            >
              Importar copia
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                void onImportChange(event)
              }}
            />
          </div>
        </div>

        {facturas.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <p className="mb-4 text-6xl">Sin facturas</p>
            <p className="text-xl">Todavía no se ha creado ninguna factura.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {facturas.map((factura) => (
              <article
                key={factura.id}
                className="cursor-pointer rounded-xl border-2 border-gray-200 p-4 transition-all hover:border-blue-300"
                onClick={() => onSelectFactura(factura.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">Factura {factura.numero}</p>
                    <p className="text-gray-600">{fechaCorta(factura.fechaExpedicion)}</p>
                    <p className="text-sm text-gray-500">{factura.concepto}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-blue-700">{formatearEuros(factura.total)} €</p>
                    <p className="text-sm text-gray-500">Inquilino: {factura.inquilinoSnapshot.nombre}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {facturaSeleccionada && (
        <section className="rounded-xl bg-white p-6 shadow-lg">
          <div className="mb-6 flex items-center justify-between gap-2">
            <h3 className="text-2xl font-bold text-gray-800">Factura {facturaSeleccionada.numero}</h3>
            <button onClick={onCloseDetalle} className="text-lg font-bold text-gray-500">
              Cerrar
            </button>
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-2 font-bold text-gray-700">Emisor</h4>
              <p>
                <strong>{facturaSeleccionada.emisorSnapshot.nombre}</strong>
              </p>
              <p>DNI: {facturaSeleccionada.emisorSnapshot.dni}</p>
              <p className="text-sm">{facturaSeleccionada.emisorSnapshot.direccion}</p>
              <p className="text-sm">
                {facturaSeleccionada.emisorSnapshot.codigoPostal} {facturaSeleccionada.emisorSnapshot.ciudad}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-2 font-bold text-gray-700">Inquilino</h4>
              <p>
                <strong>{facturaSeleccionada.inquilinoSnapshot.nombre}</strong>
              </p>
              <p>DNI: {facturaSeleccionada.inquilinoSnapshot.dni}</p>
              <p className="text-sm">{facturaSeleccionada.inquilinoSnapshot.direccion}</p>
              <p className="text-sm">
                {facturaSeleccionada.inquilinoSnapshot.codigoPostal} {facturaSeleccionada.inquilinoSnapshot.ciudad}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-lg bg-blue-50 p-4">
            <p>
              <strong>Fecha de expedición:</strong> {fechaLegible(facturaSeleccionada.fechaExpedicion)}
            </p>
            {facturaSeleccionada.fechaOperacion && facturaSeleccionada.fechaOperacion !== facturaSeleccionada.fechaExpedicion && (
              <p>
                <strong>Fecha de operación:</strong> {fechaLegible(facturaSeleccionada.fechaOperacion)}
              </p>
            )}
            <p>
              <strong>Concepto:</strong> {facturaSeleccionada.concepto}
            </p>
            {facturaSeleccionada.notasLegales && (
              <p>
                <strong>Notas:</strong> {facturaSeleccionada.notasLegales}
              </p>
            )}
          </div>

          <div className="space-y-2 border-t-2 pt-4 text-lg">
            <div className="flex justify-between">
              <span>Base imponible:</span>
              <span>{formatearEuros(facturaSeleccionada.base)} €</span>
            </div>
            <div className="flex justify-between text-green-700">
              <span>IVA ({facturaSeleccionada.ivaPct.toFixed(2)}%):</span>
              <span>+{formatearEuros(facturaSeleccionada.ivaCuota)} €</span>
            </div>
            <div className="flex justify-between text-red-700">
              <span>IRPF ({facturaSeleccionada.irpfPct.toFixed(2)}%):</span>
              <span>-{formatearEuros(facturaSeleccionada.irpfCuota)} €</span>
            </div>
            <div className="flex justify-between border-t-2 pt-2 text-xl font-bold">
              <span>TOTAL:</span>
              <span className="text-blue-700">{formatearEuros(facturaSeleccionada.total)} €</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-4">
            <button
              onClick={() => onImprimir(facturaSeleccionada)}
              className="flex-1 rounded-xl bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800"
            >
              Imprimir
            </button>
            <button
              onClick={() => {
                void onGuardarPdf(facturaSeleccionada)
              }}
              className="flex-1 rounded-xl bg-indigo-700 py-3 text-lg font-bold text-white hover:bg-indigo-800"
            >
              Guardar PDF
            </button>
            <button
              onClick={() => onEliminar(facturaSeleccionada.id)}
              className="flex-1 rounded-xl bg-red-600 py-3 text-lg font-bold text-white hover:bg-red-700"
            >
              Eliminar factura
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
