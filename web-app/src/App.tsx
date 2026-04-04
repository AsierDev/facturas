import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { FacturaCreateView } from '@/components/views/FacturaCreateView'
import { FacturasListView } from '@/components/views/FacturasListView'
import { ConfiguracionView } from '@/components/views/ConfiguracionView'
import {
  crearDraft,
  getNextNumber,
  hoyIso,
  limpiarSerie,
  parseNumberInput,
  personaCompleta,
  redondear2
} from '@/domain/core'
import { buildPrintableFactura, printFromIframe, printFromPopup } from '@/domain/printing'
import { buildBackupPayload, loadStore, parseBackupContent, persistStore } from '@/domain/storage'
import type { AppConfig, AppStore, DatosPersonales, Factura, InvoiceDraft, Mensaje, PersonaKey, Vista } from '@/domain/types'

function App() {
  const [store, setStore] = useState<AppStore>(() => loadStore())
  const [vistaActual, setVistaActual] = useState<Vista>('factura')
  const [facturaSeleccionadaId, setFacturaSeleccionadaId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const facturaSeleccionada = useMemo(
    () => store.facturas.find((factura) => factura.id === facturaSeleccionadaId) ?? null,
    [store.facturas, facturaSeleccionadaId]
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      persistStore(store)
    }, 300)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [store.config, store.facturas])

  useEffect(() => {
    if (!window.facturasDesktop?.exportLegacySnapshot) return

    const timeout = window.setTimeout(() => {
      void window.facturasDesktop?.exportLegacySnapshot(buildBackupPayload(store))
    }, 1000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [store])

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

  const crearFactura = () => {
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

    const { anio, correlativo, numero } = getNextNumber(
      { ...store.config, serie },
      store.facturas,
      store.draft.fechaExpedicion || hoyIso()
    )

    const factura: Factura = {
      id: crypto.randomUUID(),
      numero,
      serie,
      correlativo,
      anio,
      fechaExpedicion: store.draft.fechaExpedicion || hoyIso(),
      fechaOperacion: store.draft.fechaOperacion,
      concepto: store.draft.concepto.trim() || store.config.defaultConcepto,
      base: redondear2(base),
      ivaPct: redondear2(store.config.ivaPct),
      ivaCuota: ivaCalculado,
      irpfPct: redondear2(store.config.irpfPct),
      irpfCuota: irpfCalculado,
      total: totalCalculado,
      notasLegales: store.draft.notasLegales.trim(),
      emisorSnapshot: { ...store.config.emisor },
      inquilinoSnapshot: { ...store.config.inquilino }
    }

    setStore((prev) => ({
      config: {
        ...prev.config,
        serie,
        nextCorrelative: correlativo + 1,
        correlativeYear: anio
      },
      draft: crearDraft(prev.config),
      facturas: [factura, ...prev.facturas]
    }))

    setMensaje({ tipo: 'ok', texto: `Factura ${numero} creada correctamente.` })
    setVistaActual('lista')
    setFacturaSeleccionadaId(factura.id)
  }

  const eliminarFactura = (id: string) => {
    if (!window.confirm('¿Seguro que desea eliminar esta factura?')) return

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
    const desktopBridge = window.facturasDesktop
    if (!desktopBridge?.savePdf) {
      setMensaje({
        tipo: 'info',
        texto: 'En versión web, use Imprimir y seleccione Guardar como PDF en el diálogo del navegador.'
      })
      return
    }

    try {
      const html = buildPrintableFactura(factura)
      const result = await desktopBridge.savePdf({
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

  const exportarBackup = () => {
    try {
      const payload = buildBackupPayload(store)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `backup-facturas-${hoyIso()}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setMensaje({ tipo: 'ok', texto: 'Copia de seguridad exportada.' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo exportar la copia de seguridad.' })
    }
  }

  const onClickImport = () => {
    fileInputRef.current?.click()
  }

  const importarBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const parsed = parseBackupContent(content)
      if (!parsed) throw new Error('Formato no compatible')

      if (!window.confirm('Se reemplazarán los datos actuales por la copia importada. ¿Continuar?')) {
        return
      }

      setStore({
        config: parsed.config,
        draft: crearDraft(parsed.config),
        facturas: parsed.facturas
      })
      setVistaActual('lista')
      setFacturaSeleccionadaId(null)
      setMensaje({ tipo: 'ok', texto: 'Copia importada correctamente.' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'Archivo inválido. No se pudo importar la copia.' })
    } finally {
      event.target.value = ''
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-blue-700 text-white shadow-lg">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="text-3xl font-bold">Facturas de Alquiler</h1>
          <p className="mt-1 text-lg text-blue-100">Local comercial - uso simple y sin complicaciones</p>
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
            onImportClick={onClickImport}
            onImportChange={importarBackup}
            fileInputRef={fileInputRef}
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
          <p className="mt-1 text-sm">Generación local de facturas, impresión y exportación a PDF.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
