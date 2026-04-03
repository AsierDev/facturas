import { useEffect, useMemo, useState } from 'react'
import { FacturaCreateView } from '@/components/views/FacturaCreateView'
import { FacturasListView } from '@/components/views/FacturasListView'
import { ConfiguracionView } from '@/components/views/ConfiguracionView'
import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
  crearDraft,
  createDefaultStore,
  getNextNumber,
  hoyIso,
  limpiarSerie,
  parseNumberInput,
  personaCompleta,
  redondear2
} from '@/domain/core'
import { buildPrintableFactura, printFromIframe, printFromPopup } from '@/domain/printing'
import type {
  AppConfig,
  AppStore,
  DatosPersonales,
  Factura,
  InvoiceDraft,
  Mensaje,
  PersonaKey,
  Vista
} from '@/domain/types'

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
        texto: result.path ? `Copia exportada correctamente en: ${result.path}` : 'Copia exportada correctamente.'
      })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo exportar la copia de seguridad.' })
    }
  }

  const importarBackup = async () => {
    if (!desktopApi) return

    if (!window.confirm('Se reemplazarán los datos actuales por la copia importada. ¿Continuar?')) return

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

  const aplicarDefaultsAlBorrador = () => {
    setStore((prev) => ({
      ...prev,
      draft: {
        ...prev.draft,
        concepto: prev.config.defaultConcepto,
        notasLegales: prev.config.defaultNotasLegales
      }
    }))
    setMensaje({ tipo: 'ok', texto: 'Borrador actualizado con valores por defecto.' })
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
          <FacturaCreateView
            config={store.config}
            draft={store.draft}
            proximoNumeroVista={proximoNumeroVista}
            base={base}
            ivaCalculado={ivaCalculado}
            irpfCalculado={irpfCalculado}
            totalCalculado={totalCalculado}
            onDraftChange={updateDraft}
            onCrearFactura={crearFactura}
          />
        )}

        {vistaActual === 'lista' && (
          <FacturasListView
            facturas={store.facturas}
            facturaSeleccionada={facturaSeleccionada}
            onSelectFactura={setFacturaSeleccionadaId}
            onCloseDetalle={() => setFacturaSeleccionadaId(null)}
            onImprimir={imprimirFactura}
            onGuardarPdf={guardarFacturaPdf}
            onEliminar={eliminarFactura}
            onExportarBackup={exportarBackup}
            onImportarBackup={importarBackup}
          />
        )}

        {vistaActual === 'configuracion' && (
          <ConfiguracionView
            config={store.config}
            onConfigChange={updateConfig}
            onPersonaChange={updatePersona}
            onAplicarDefaultsAlBorrador={aplicarDefaultsAlBorrador}
          />
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
