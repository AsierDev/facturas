import type { DatosPersonales } from '@/domain/types'

interface InputCampoProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'number' | 'date'
  min?: string
  step?: string
  helpText?: string
}

export function InputCampo({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  min,
  step,
  helpText
}: InputCampoProps) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-lg font-semibold text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        step={step}
        className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-lg focus:border-blue-600 focus:outline-none"
      />
      {helpText && <p className="mt-1 text-sm text-gray-500">{helpText}</p>}
    </div>
  )
}

interface TextAreaCampoProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TextAreaCampo({ label, value, onChange, placeholder = '' }: TextAreaCampoProps) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-lg font-semibold text-gray-700">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-lg focus:border-blue-600 focus:outline-none"
      />
    </div>
  )
}

interface FormularioPersonaProps {
  titulo: string
  datos: DatosPersonales
  onChange: (field: keyof DatosPersonales, value: string) => void
  normalizarDocumento: (value: string) => string
}

export function FormularioPersona({ titulo, datos, onChange, normalizarDocumento }: FormularioPersonaProps) {
  return (
    <section className="mb-6 rounded-xl bg-white p-6 shadow-lg">
      <h3 className="mb-4 border-b-2 border-blue-500 pb-2 text-xl font-bold text-gray-800">{titulo}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <InputCampo
          label="Nombre completo"
          value={datos.nombre}
          onChange={(value) => onChange('nombre', value)}
          placeholder="Nombre y apellidos"
        />
        <InputCampo
          label="DNI/NIF"
          value={datos.dni}
          onChange={(value) => onChange('dni', normalizarDocumento(value))}
          placeholder="12345678A"
        />
      </div>
      <InputCampo
        label="Direccion completa"
        value={datos.direccion}
        onChange={(value) => onChange('direccion', value)}
        placeholder="Calle, numero, piso"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <InputCampo
          label="Codigo Postal"
          value={datos.codigoPostal}
          onChange={(value) => onChange('codigoPostal', value)}
          placeholder="28001"
        />
        <InputCampo label="Ciudad" value={datos.ciudad} onChange={(value) => onChange('ciudad', value)} placeholder="Madrid" />
        <InputCampo
          label="Provincia"
          value={datos.provincia}
          onChange={(value) => onChange('provincia', value)}
          placeholder="Madrid"
        />
      </div>
    </section>
  )
}
