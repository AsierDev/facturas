import { FormularioPersona, InputCampo, TextAreaCampo } from '@/components/FormFields'
import { DEFAULT_CONCEPTO, DEFAULT_NOTAS, clampPct, limpiarSerie, normalizarDni, parseNumberInput } from '@/domain/core'
import type { AppConfig, DatosPersonales } from '@/domain/types'

interface ConfiguracionViewProps {
  config: AppConfig
  onConfigChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void
  onPersonaChange: (persona: 'emisor' | 'inquilino', field: keyof DatosPersonales, value: string) => void
  onAplicarDefaultsAlBorrador: () => void
}

export function ConfiguracionView({
  config,
  onConfigChange,
  onPersonaChange,
  onAplicarDefaultsAlBorrador
}: ConfiguracionViewProps) {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-800">Configuración de datos</h2>

      <section className="mb-6 rounded-xl bg-white p-6 shadow-lg">
        <h3 className="mb-4 border-b-2 border-blue-500 pb-2 text-xl font-bold text-gray-800">Ajustes de facturación</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <InputCampo
            label="Serie"
            value={config.serie}
            onChange={(value) => onConfigChange('serie', limpiarSerie(value) || 'ALQ')}
            placeholder="ALQ"
            helpText="Se usará en el número de factura: SERIE-AÑO-0001"
          />
          <InputCampo
            label="IVA (%)"
            type="number"
            min="0"
            step="0.01"
            value={String(config.ivaPct)}
            onChange={(value) => onConfigChange('ivaPct', clampPct(parseNumberInput(value)))}
          />
          <InputCampo
            label="IRPF (%)"
            type="number"
            min="0"
            step="0.01"
            value={String(config.irpfPct)}
            onChange={(value) => onConfigChange('irpfPct', clampPct(parseNumberInput(value)))}
          />
        </div>

        <InputCampo
          label="Concepto por defecto"
          value={config.defaultConcepto}
          onChange={(value) => onConfigChange('defaultConcepto', value)}
          placeholder={DEFAULT_CONCEPTO}
        />
        <TextAreaCampo
          label="Notas legales por defecto"
          value={config.defaultNotasLegales}
          onChange={(value) => onConfigChange('defaultNotasLegales', value)}
          placeholder={DEFAULT_NOTAS}
        />

        <button
          onClick={onAplicarDefaultsAlBorrador}
          className="rounded-lg bg-gray-700 px-5 py-3 text-lg font-semibold text-white hover:bg-gray-800"
        >
          Aplicar valores por defecto al borrador
        </button>
      </section>

      <FormularioPersona
        titulo="Datos del emisor (propietario)"
        datos={config.emisor}
        onChange={(field, value) => onPersonaChange('emisor', field, value)}
        normalizarDocumento={normalizarDni}
      />

      <FormularioPersona
        titulo="Datos del inquilino"
        datos={config.inquilino}
        onChange={(field, value) => onPersonaChange('inquilino', field, value)}
        normalizarDocumento={normalizarDni}
      />

      <div className="rounded-xl border-2 border-green-400 bg-green-100 p-4 text-center">
        <p className="text-lg font-semibold text-green-800">
          Los datos se guardan automáticamente en SQLite. Recomendado: exportar una copia de seguridad periódicamente.
        </p>
      </div>
    </div>
  )
}
