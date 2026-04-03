import { useEffect, useMemo, useState } from 'react'

interface DatosPersonales {
  nombre: string
  dni: string
  direccion: string
  codigoPostal: string
  ciudad: string
  provincia: string
}

interface AppConfig {
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

interface Factura {
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

interface InvoiceDraft {
  fechaExpedicion: string
  fechaOperacion: string
  concepto: string
  notasLegales: string
  baseInput: string
}

interface AppStore {
  config: AppConfig
  draft: InvoiceDraft
  facturas: Factura[]
}

type Vista = 'factura' | 'lista' | 'configuracion'

type Mensaje = {
  tipo: 'ok' | 'error' | 'info'
  texto: string
}

type PersonaKey = 'emisor' | 'inquilino'

interface MigrationPayload {
  modern: string | null
  emisor: string | null
  inquilino: string | null
  facturas: string | null
  proximoNumero: string | null
}

interface FacturasDesktopApi {
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

declare global {
  interface Window {
    facturasDesktopApi?: FacturasDesktopApi
  }
}

const STORAGE_KEY = 'facturas_alquiler_app_v1'
const LEGACY_STORAGE_KEYS = {
  emisor: 'facturas_emisor',
  inquilino: 'facturas_inquilino',
  facturas: 'facturas_lista',
  proximoNumero: 'facturas_proximo_numero'
}

const DATOS_VACIOS: DatosPersonales = {
  nombre: '',
  dni: '',
  direccion: '',
  codigoPostal: '',
  ciudad: '',
  provincia: ''
}

const DEFAULT_CONCEPTO = 'Alquiler mensual local comercial'
const DEFAULT_NOTAS = 'Operación sujeta a IVA 21% con retención de IRPF sobre la base imponible.'

const hoyIso = () => new Date().toISOString().split('T')[0]
const anioActual = () => new Date().getFullYear()
const redondear2 = (valor: number) => Math.round(valor * 100) / 100

const formatearEuros = (valor: number) =>
  valor.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

const limpiarSerie = (serie: string) => serie.toUpperCase().replace(/[^A-Z0-9/_.-]/g, '').slice(0, 12)
const normalizarDni = (dni: string) => dni.toUpperCase().trim()

const parseNumberInput = (value: string) => {
  const normalizado = value.replace(',', '.').trim()
  if (!normalizado) return 0
  const parsed = Number.parseFloat(normalizado)
  return Number.isFinite(parsed) ? parsed : 0
}

const clampPct = (value: number) => Math.min(100, Math.max(0, value))

const fechaLegible = (fecha: string) => {
  const date = new Date(fecha)
  if (Number.isNaN(date.getTime())) return fecha
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

const fechaCorta = (fecha: string) => {
  const date = new Date(fecha)
  if (Number.isNaN(date.getTime())) return fecha
  return date.toLocaleDateString('es-ES')
}

const getYearFromDate = (fechaIso: string) => {
  const year = Number.parseInt(fechaIso.slice(0, 4), 10)
  return Number.isFinite(year) ? year : anioActual()
}

const crearNumeroFactura = (serie: string, anio: number, correlativo: number) =>
  `${serie}-${anio}-${String(correlativo).padStart(4, '0')}`

const defaultConfig = (): AppConfig => ({
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

const crearDraft = (config: AppConfig): InvoiceDraft => ({
  fechaExpedicion: hoyIso(),
  fechaOperacion: '',
  concepto: config.defaultConcepto,
  notasLegales: config.defaultNotasLegales,
  baseInput: ''
})

const createDefaultStore = (): AppStore => {
  const config = defaultConfig()
  return {
    config,
    draft: crearDraft(config),
    facturas: []
  }
}

const personaCompleta = (persona: DatosPersonales) => {
  return Boolean(
    persona.nombre.trim() &&
      persona.dni.trim() &&
      persona.direccion.trim() &&
      persona.codigoPostal.trim() &&
      persona.ciudad.trim() &&
      persona.provincia.trim()
  )
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const buildPrintableFactura = (factura: Factura) => {
  const notas = factura.notasLegales.trim() ? `<p><strong>Notas:</strong> ${escapeHtml(factura.notasLegales)}</p>` : ''
  const fechaOperacion =
    factura.fechaOperacion && factura.fechaOperacion !== factura.fechaExpedicion
      ? `<p><strong>Fecha de operación:</strong> ${escapeHtml(fechaLegible(factura.fechaOperacion))}</p>`
      : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Factura ${escapeHtml(factura.numero)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 36px; max-width: 860px; margin: 0 auto; color: #111827; }
    h1 { margin: 0 0 18px 0; font-size: 30px; border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; }
    .subtitle { margin: 0 0 20px 0; color: #4b5563; }
    .datos { display: flex; gap: 16px; margin: 18px 0; }
    .datos section { width: 50%; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
    .datos h3 { margin: 0 0 8px 0; font-size: 14px; color: #1d4ed8; text-transform: uppercase; letter-spacing: .03em; }
    .datos p { margin: 4px 0; font-size: 14px; }
    .bloque { border: 1px solid #d1d5db; border-radius: 8px; padding: 14px; margin: 18px 0; background: #f8fafc; }
    .bloque p { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
    th { background: #eff6ff; }
    .totales { width: 360px; margin-left: auto; margin-top: 20px; }
    .totales p { display: flex; justify-content: space-between; margin: 8px 0; }
    .total { font-size: 20px; font-weight: bold; border-top: 2px solid #111827; padding-top: 10px; }
    .negativo { color: #b91c1c; }
    @media print {
      body { padding: 14px; }
    }
  </style>
</head>
<body>
  <h1>Factura ${escapeHtml(factura.numero)}</h1>
  <p class="subtitle">Arrendamiento de local comercial</p>

  <div class="datos">
    <section>
      <h3>Emisor</h3>
      <p><strong>${escapeHtml(factura.emisorSnapshot.nombre)}</strong></p>
      <p>NIF: ${escapeHtml(factura.emisorSnapshot.dni)}</p>
      <p>${escapeHtml(factura.emisorSnapshot.direccion)}</p>
      <p>${escapeHtml(factura.emisorSnapshot.codigoPostal)} ${escapeHtml(factura.emisorSnapshot.ciudad)}</p>
      <p>${escapeHtml(factura.emisorSnapshot.provincia)}</p>
    </section>

    <section>
      <h3>Destinatario (Inquilino)</h3>
      <p><strong>${escapeHtml(factura.inquilinoSnapshot.nombre)}</strong></p>
      <p>NIF: ${escapeHtml(factura.inquilinoSnapshot.dni)}</p>
      <p>${escapeHtml(factura.inquilinoSnapshot.direccion)}</p>
      <p>${escapeHtml(factura.inquilinoSnapshot.codigoPostal)} ${escapeHtml(factura.inquilinoSnapshot.ciudad)}</p>
      <p>${escapeHtml(factura.inquilinoSnapshot.provincia)}</p>
    </section>
  </div>

  <div class="bloque">
    <p><strong>Fecha de expedición:</strong> ${escapeHtml(fechaLegible(factura.fechaExpedicion))}</p>
    ${fechaOperacion}
    <p><strong>Concepto:</strong> ${escapeHtml(factura.concepto)}</p>
    ${notas}
  </div>

  <table>
    <thead>
      <tr>
        <th>Descripción</th>
        <th>Importe</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeHtml(factura.concepto)}</td>
        <td>${formatearEuros(factura.base)} €</td>
      </tr>
    </tbody>
  </table>

  <div class="totales">
    <p><span>Base imponible:</span><span>${formatearEuros(factura.base)} €</span></p>
    <p><span>IVA (${factura.ivaPct.toFixed(2)}%):</span><span>+${formatearEuros(factura.ivaCuota)} €</span></p>
    <p class="negativo"><span>IRPF (${factura.irpfPct.toFixed(2)}%):</span><span>-${formatearEuros(factura.irpfCuota)} €</span></p>
    <p class="total"><span>Total a pagar:</span><span>${formatearEuros(factura.total)} €</span></p>
  </div>
</body>
</html>`
}

const printFromPopup = (html: string) => {
  const ventana = window.open('', '_blank')
  if (!ventana) return false

  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  ventana.print()
  return true
}

const printFromIframe = (html: string) => {
  try {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.visibility = 'hidden'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove()
      }, 1500)
    }

    const trigger = () => {
      const frameWindow = iframe.contentWindow
      if (!frameWindow) {
        cleanup()
        return
      }
      frameWindow.focus()
      frameWindow.print()
      cleanup()
    }

    const frameDoc = iframe.contentDocument
    if (frameDoc) {
      frameDoc.open()
      frameDoc.write(html)
      frameDoc.close()
      window.setTimeout(trigger, 150)
    } else {
      iframe.onload = trigger
      iframe.srcdoc = html
    }

    return true
  } catch {
    return false
  }
}

const getNextNumber = (config: AppConfig, facturas: Factura[], fechaExpedicion: string) => {
  const anio = getYearFromDate(fechaExpedicion)
  let correlativo = config.correlativeYear === anio ? config.nextCorrelative : 1

  while (facturas.some((factura) => factura.numero === crearNumeroFactura(config.serie, anio, correlativo))) {
    correlativo += 1
  }

  return {
    anio,
    correlativo,
    numero: crearNumeroFactura(config.serie, anio, correlativo)
  }
}

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

function InputCampo({ label, value, onChange, placeholder = '', type = 'text', min, step, helpText }: InputCampoProps) {
  return (
    <div className="mb-4">
      <label className="block text-lg font-semibold text-gray-700 mb-2">{label}</label>
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

function TextAreaCampo({ label, value, onChange, placeholder = '' }: TextAreaCampoProps) {
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
}

function FormularioPersona({ titulo, datos, onChange }: FormularioPersonaProps) {
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
          onChange={(value) => onChange('dni', normalizarDni(value))}
          placeholder="12345678A"
        />
      </div>
      <InputCampo
        label="Dirección completa"
        value={datos.direccion}
        onChange={(value) => onChange('direccion', value)}
        placeholder="Calle, número, piso"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <InputCampo
          label="Código Postal"
          value={datos.codigoPostal}
          onChange={(value) => onChange('codigoPostal', value)}
          placeholder="28001"
        />
        <InputCampo
          label="Ciudad"
          value={datos.ciudad}
          onChange={(value) => onChange('ciudad', value)}
          placeholder="Madrid"
        />
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

function App() {
  const desktopApi = window.facturasDesktopApi

  const [store, setStore] = useState<AppStore>(() => createDefaultStore())
  const [vistaActual, setVistaActual] = useState<Vista>('factura')
  const [facturaSeleccionadaId, setFacturaSeleccionadaId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const facturaSeleccionada = useMemo(
    () => store.facturas.find((factura) => factura.id === facturaSeleccionadaId) ?? null,
    [store.facturas, facturaSeleccionadaId]
  )

  useEffect(() => {
    if (!desktopApi) {
      setMensaje({
        tipo: 'error',
        texto: 'No se detectó la API de escritorio. Abra esta app desde el ejecutable de desktop-app.'
      })
      setIsLoading(false)
      return
    }

    let cancelled = false

    const bootstrap = async () => {
      try {
        const migration = await desktopApi.migrationRun({
          modern: localStorage.getItem(STORAGE_KEY),
          emisor: localStorage.getItem(LEGACY_STORAGE_KEYS.emisor),
          inquilino: localStorage.getItem(LEGACY_STORAGE_KEYS.inquilino),
          facturas: localStorage.getItem(LEGACY_STORAGE_KEYS.facturas),
          proximoNumero: localStorage.getItem(LEGACY_STORAGE_KEYS.proximoNumero)
        })

        const [config, facturas] = await Promise.all([desktopApi.configGet(), desktopApi.invoiceList()])

        if (cancelled) return

        setStore({
          config,
          draft: crearDraft(config),
          facturas
        })

        if (migration.importedCount && migration.importedCount > 0) {
          setMensaje({
            tipo: 'ok',
            texto: `Migración completada. Facturas importadas: ${migration.importedCount}.`
          })
        }
      } catch {
        if (!cancelled) {
          setMensaje({
            tipo: 'error',
            texto: 'No se pudieron cargar los datos de escritorio. Revise permisos de la carpeta de usuario.'
          })
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [desktopApi])

  useEffect(() => {
    if (!desktopApi || isLoading) return

    const timeout = window.setTimeout(() => {
      void desktopApi.configSet(store.config)
    }, 300)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [desktopApi, isLoading, store.config])

  const updatePersona = (persona: PersonaKey, field: keyof DatosPersonales, value: string) => {
    setStore((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        [persona]: {
          ...prev.config[persona],
          [field]: value
        }
      }
    }))
  }

  const updateConfig = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setStore((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value
      }
    }))
  }

  const updateDraft = <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => {
    setStore((prev) => ({
      ...prev,
      draft: {
        ...prev.draft,
        [key]: value
      }
    }))
  }

  const base = parseNumberInput(store.draft.baseInput)
  const ivaCalculado = redondear2(base * (store.config.ivaPct / 100))
  const irpfCalculado = redondear2(base * (store.config.irpfPct / 100))
  const totalCalculado = redondear2(base + ivaCalculado - irpfCalculado)

  const crearFactura = async () => {
    if (!desktopApi) {
      setMensaje({ tipo: 'error', texto: 'La API de escritorio no está disponible.' })
      return
    }

    const serie = limpiarSerie(store.config.serie)
    if (!serie) {
      alert('Debe indicar una serie de facturación válida en Configuración.')
      setVistaActual('configuracion')
      return
    }

    if (!personaCompleta(store.config.emisor)) {
      alert('Complete todos los datos del emisor en Configuración antes de crear la factura.')
      setVistaActual('configuracion')
      return
    }

    if (!personaCompleta(store.config.inquilino)) {
      alert('Complete todos los datos del inquilino en Configuración antes de crear la factura.')
      setVistaActual('configuracion')
      return
    }

    if (base <= 0) {
      alert('Introduzca una base imponible válida (mayor que 0).')
      return
    }

    try {
      const result = await desktopApi.invoiceCreate(store.draft)
      setStore((prev) => ({
        config: result.config,
        draft: crearDraft(result.config),
        facturas: [result.invoice, ...prev.facturas]
      }))
      setMensaje({ tipo: 'ok', texto: `Factura ${result.invoice.numero} creada correctamente.` })
      setVistaActual('lista')
      setFacturaSeleccionadaId(result.invoice.id)
    } catch {
      setMensaje({
        tipo: 'error',
        texto: 'No se pudo crear la factura. Revise datos del emisor/inquilino y base imponible.'
      })
    }
  }

  const eliminarFactura = async (id: string) => {
    if (!desktopApi) return
    if (!window.confirm('¿Seguro que desea eliminar esta factura?')) return

    const result = await desktopApi.invoiceDelete(id)
    if (!result.ok) {
      setMensaje({ tipo: 'error', texto: 'No se pudo eliminar la factura.' })
      return
    }

    setStore((prev) => ({
      ...prev,
      facturas: prev.facturas.filter((factura) => factura.id !== id)
    }))

    if (facturaSeleccionadaId === id) {
      setFacturaSeleccionadaId(null)
    }

    setMensaje({ tipo: 'info', texto: 'Factura eliminada.' })
  }

  const imprimirFactura = (factura: Factura) => {
    const html = buildPrintableFactura(factura)
    if (printFromIframe(html)) return
    if (printFromPopup(html)) return

    setMensaje({
      tipo: 'error',
      texto: 'No se pudo abrir la impresión. Intente de nuevo o use la opción Guardar PDF.'
    })
  }

  const guardarFacturaPdf = async (factura: Factura) => {
    if (!desktopApi) {
      setMensaje({ tipo: 'error', texto: 'Guardar PDF solo está disponible en la app de escritorio.' })
      return
    }

    try {
      const html = buildPrintableFactura(factura)
      const result = await desktopApi.pdfSave({
        html,
        fileName: `Factura-${factura.numero}.pdf`
      })

      if (result.canceled) return
      if (!result.ok) {
        setMensaje({ tipo: 'error', texto: 'No se pudo guardar el PDF.' })
        return
      }

      setMensaje({
        tipo: 'ok',
        texto: result.path ? `PDF guardado en: ${result.path}` : 'PDF guardado correctamente.'
      })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo guardar el PDF.' })
    }
  }

  const exportarBackup = async () => {
    if (!desktopApi) return

    try {
      const result = await desktopApi.backupExport()
      if (result.canceled) return
      if (!result.ok) {
        setMensaje({ tipo: 'error', texto: 'No se pudo exportar la copia de seguridad.' })
        return
      }
      setMensaje({
        tipo: 'ok',
        texto: result.path
          ? `Copia exportada correctamente en: ${result.path}`
          : 'Copia exportada correctamente.'
      })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo exportar la copia de seguridad.' })
    }
  }

  const importarBackup = async () => {
    if (!desktopApi) return

    if (!window.confirm('Se reemplazarán los datos actuales por la copia importada. ¿Continuar?')) {
      return
    }

    try {
      const result = await desktopApi.backupImport()
      if (result.canceled) return
      if (!result.ok) {
        setMensaje({
          tipo: 'error',
          texto: result.error === 'invalid_file' ? 'Archivo inválido. No se pudo importar.' : 'No se pudo importar la copia.'
        })
        return
      }

      const [config, facturas] = await Promise.all([desktopApi.configGet(), desktopApi.invoiceList()])
      setStore({
        config,
        draft: crearDraft(config),
        facturas
      })
      setVistaActual('lista')
      setFacturaSeleccionadaId(null)
      setMensaje({ tipo: 'ok', texto: `Copia importada. Facturas cargadas: ${result.importedCount ?? facturas.length}.` })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo importar la copia de seguridad.' })
    }
  }

  const proximoNumeroVista = useMemo(() => {
    const { numero } = getNextNumber(
      { ...store.config, serie: limpiarSerie(store.config.serie) || 'ALQ' },
      store.facturas,
      store.draft.fechaExpedicion || hoyIso()
    )
    return numero
  }, [store.config, store.facturas, store.draft.fechaExpedicion])

  const colorMensaje =
    mensaje?.tipo === 'ok'
      ? 'border-green-300 bg-green-50 text-green-800'
      : mensaje?.tipo === 'error'
        ? 'border-red-300 bg-red-50 text-red-800'
        : 'border-blue-300 bg-blue-50 text-blue-800'

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl bg-white px-8 py-6 text-center shadow-lg">
          <p className="text-2xl font-bold text-slate-800">Iniciando Facturas Desktop...</p>
          <p className="mt-2 text-slate-600">Cargando base de datos y migración automática.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-blue-700 text-white shadow-lg">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="text-3xl font-bold">Facturas de Alquiler (Desktop)</h1>
          <p className="mt-1 text-lg text-blue-100">Persistencia local en SQLite para uso diario sin complicación</p>
        </div>
      </header>

      <nav className="bg-white shadow-md">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-wrap gap-2 py-3">
            <button
              onClick={() => {
                setVistaActual('factura')
                setFacturaSeleccionadaId(null)
              }}
              className={`rounded-lg px-6 py-3 text-lg font-semibold transition-all ${
                vistaActual === 'factura' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Nueva factura
            </button>
            <button
              onClick={() => {
                setVistaActual('lista')
                setFacturaSeleccionadaId(null)
              }}
              className={`rounded-lg px-6 py-3 text-lg font-semibold transition-all ${
                vistaActual === 'lista' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Ver facturas ({store.facturas.length})
            </button>
            <button
              onClick={() => {
                setVistaActual('configuracion')
                setFacturaSeleccionadaId(null)
              }}
              className={`rounded-lg px-6 py-3 text-lg font-semibold transition-all ${
                vistaActual === 'configuracion'
                  ? 'bg-blue-700 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Configuración
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {mensaje && (
          <div className={`mb-6 rounded-xl border-2 p-4 text-lg ${colorMensaje}`}>
            <div className="flex items-center justify-between gap-3">
              <p>{mensaje.texto}</p>
              <button className="font-bold" onClick={() => setMensaje(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {vistaActual === 'factura' && (
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
                  value={store.draft.fechaExpedicion}
                  onChange={(value) => updateDraft('fechaExpedicion', value)}
                />
                <InputCampo
                  label="Fecha de operación (opcional)"
                  type="date"
                  value={store.draft.fechaOperacion}
                  onChange={(value) => updateDraft('fechaOperacion', value)}
                />
              </div>

              <InputCampo
                label="Concepto"
                value={store.draft.concepto}
                onChange={(value) => updateDraft('concepto', value)}
                placeholder="Alquiler mensual local comercial"
              />

              <TextAreaCampo
                label="Notas legales o aclaraciones"
                value={store.draft.notasLegales}
                onChange={(value) => updateDraft('notasLegales', value)}
                placeholder="Texto adicional para la factura"
              />

              <div className="mt-6 rounded-xl border-2 border-yellow-300 bg-yellow-50 p-6">
                <h3 className="mb-4 text-xl font-bold text-gray-800">Importe</h3>

                <div className="grid gap-6 md:grid-cols-2">
                  <InputCampo
                    label="Base imponible (€)"
                    type="text"
                    value={store.draft.baseInput}
                    onChange={(value) => updateDraft('baseInput', value)}
                    placeholder="1000,00"
                    helpText="Puede usar coma o punto decimal."
                  />

                  <div className="space-y-3 text-lg">
                    <div className="flex justify-between border-b py-2">
                      <span className="text-gray-600">Base imponible:</span>
                      <span className="font-semibold">{formatearEuros(base)} €</span>
                    </div>
                    <div className="flex justify-between border-b py-2">
                      <span className="text-gray-600">IVA ({store.config.ivaPct.toFixed(2)}%):</span>
                      <span className="font-semibold text-green-700">+{formatearEuros(ivaCalculado)} €</span>
                    </div>
                    <div className="flex justify-between border-b py-2">
                      <span className="text-gray-600">IRPF ({store.config.irpfPct.toFixed(2)}%):</span>
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
                onClick={() => {
                  void crearFactura()
                }}
                className="mt-6 w-full rounded-xl bg-green-600 py-4 text-xl font-bold text-white shadow-lg transition-all hover:bg-green-700"
              >
                Crear factura
              </button>
            </section>

            {(store.config.emisor.nombre || store.config.inquilino.nombre) && (
              <div className="grid gap-6 md:grid-cols-2">
                {store.config.emisor.nombre && (
                  <section className="rounded-xl bg-white p-6 shadow-lg">
                    <h3 className="mb-3 text-lg font-bold text-gray-800">Emisor guardado</h3>
                    <p className="text-gray-700">
                      <strong>{store.config.emisor.nombre}</strong>
                    </p>
                    <p className="text-gray-600">DNI: {store.config.emisor.dni}</p>
                    <p className="text-sm text-gray-600">
                      {store.config.emisor.direccion}, {store.config.emisor.codigoPostal} {store.config.emisor.ciudad}
                    </p>
                  </section>
                )}

                {store.config.inquilino.nombre && (
                  <section className="rounded-xl bg-white p-6 shadow-lg">
                    <h3 className="mb-3 text-lg font-bold text-gray-800">Inquilino guardado</h3>
                    <p className="text-gray-700">
                      <strong>{store.config.inquilino.nombre}</strong>
                    </p>
                    <p className="text-gray-600">DNI: {store.config.inquilino.dni}</p>
                    <p className="text-sm text-gray-600">
                      {store.config.inquilino.direccion}, {store.config.inquilino.codigoPostal}{' '}
                      {store.config.inquilino.ciudad}
                    </p>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {vistaActual === 'lista' && (
          <div className="space-y-6">
            <section className="rounded-xl bg-white p-6 shadow-lg">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-gray-800">Facturas guardadas</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      void exportarBackup()
                    }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-lg font-semibold text-white hover:bg-blue-700"
                  >
                    Exportar copia
                  </button>
                  <button
                    onClick={() => {
                      void importarBackup()
                    }}
                    className="rounded-lg bg-gray-700 px-4 py-2 text-lg font-semibold text-white hover:bg-gray-800"
                  >
                    Importar copia
                  </button>
                </div>
              </div>

              {store.facturas.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  <p className="mb-4 text-6xl">Sin facturas</p>
                  <p className="text-xl">Todavía no se ha creado ninguna factura.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {store.facturas.map((factura) => (
                    <article
                      key={factura.id}
                      className="cursor-pointer rounded-xl border-2 border-gray-200 p-4 transition-all hover:border-blue-300"
                      onClick={() => setFacturaSeleccionadaId(factura.id)}
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
                  <button onClick={() => setFacturaSeleccionadaId(null)} className="text-lg font-bold text-gray-500">
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
                    onClick={() => imprimirFactura(facturaSeleccionada)}
                    className="flex-1 rounded-xl bg-blue-700 py-3 text-lg font-bold text-white hover:bg-blue-800"
                  >
                    Imprimir
                  </button>
                  <button
                    onClick={() => {
                      void guardarFacturaPdf(facturaSeleccionada)
                    }}
                    className="flex-1 rounded-xl bg-indigo-700 py-3 text-lg font-bold text-white hover:bg-indigo-800"
                  >
                    Guardar PDF
                  </button>
                  <button
                    onClick={() => {
                      void eliminarFactura(facturaSeleccionada.id)
                    }}
                    className="flex-1 rounded-xl bg-red-600 py-3 text-lg font-bold text-white hover:bg-red-700"
                  >
                    Eliminar factura
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {vistaActual === 'configuracion' && (
          <div>
            <h2 className="mb-6 text-2xl font-bold text-gray-800">Configuración de datos</h2>

            <section className="mb-6 rounded-xl bg-white p-6 shadow-lg">
              <h3 className="mb-4 border-b-2 border-blue-500 pb-2 text-xl font-bold text-gray-800">
                Ajustes de facturación
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                <InputCampo
                  label="Serie"
                  value={store.config.serie}
                  onChange={(value) => updateConfig('serie', limpiarSerie(value) || 'ALQ')}
                  placeholder="ALQ"
                  helpText="Se usará en el número de factura: SERIE-AÑO-0001"
                />
                <InputCampo
                  label="IVA (%)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(store.config.ivaPct)}
                  onChange={(value) => updateConfig('ivaPct', clampPct(parseNumberInput(value)))}
                />
                <InputCampo
                  label="IRPF (%)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(store.config.irpfPct)}
                  onChange={(value) => updateConfig('irpfPct', clampPct(parseNumberInput(value)))}
                />
              </div>

              <InputCampo
                label="Concepto por defecto"
                value={store.config.defaultConcepto}
                onChange={(value) => updateConfig('defaultConcepto', value)}
                placeholder={DEFAULT_CONCEPTO}
              />
              <TextAreaCampo
                label="Notas legales por defecto"
                value={store.config.defaultNotasLegales}
                onChange={(value) => updateConfig('defaultNotasLegales', value)}
                placeholder={DEFAULT_NOTAS}
              />

              <button
                onClick={() => {
                  setStore((prev) => ({
                    ...prev,
                    draft: {
                      ...prev.draft,
                      concepto: prev.config.defaultConcepto,
                      notasLegales: prev.config.defaultNotasLegales
                    }
                  }))
                  setMensaje({ tipo: 'ok', texto: 'Borrador actualizado con valores por defecto.' })
                }}
                className="rounded-lg bg-gray-700 px-5 py-3 text-lg font-semibold text-white hover:bg-gray-800"
              >
                Aplicar valores por defecto al borrador
              </button>
            </section>

            <FormularioPersona
              titulo="Datos del emisor (propietario)"
              datos={store.config.emisor}
              onChange={(field, value) => updatePersona('emisor', field, value)}
            />

            <FormularioPersona
              titulo="Datos del inquilino"
              datos={store.config.inquilino}
              onChange={(field, value) => updatePersona('inquilino', field, value)}
            />

            <div className="rounded-xl border-2 border-green-400 bg-green-100 p-4 text-center">
              <p className="text-lg font-semibold text-green-800">
                Los datos se guardan automáticamente en SQLite. Recomendado: exportar una copia de seguridad periódicamente.
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-12 border-t bg-gray-100 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-gray-600">
          <p>Sistema de Facturación - Alquiler de Local Comercial</p>
          <p className="mt-1 text-sm">Aplicación desktop con base de datos SQLite local.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
