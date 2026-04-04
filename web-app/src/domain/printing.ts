import { fechaLegible, formatearEuros } from './core'
import type { Factura } from './types'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;')

export const buildPrintableFactura = (factura: Factura) => {
  const notas = factura.notasLegales.trim() ? `<p><strong>Notas:</strong> ${escapeHtml(factura.notasLegales)}</p>` : ''
  const fechaOperacion =
    factura.fechaOperacion && factura.fechaOperacion !== factura.fechaExpedicion
      ? `<p><strong>Fecha de operacion:</strong> ${escapeHtml(fechaLegible(factura.fechaOperacion))}</p>`
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
    <p><strong>Fecha de expedicion:</strong> ${escapeHtml(fechaLegible(factura.fechaExpedicion))}</p>
    ${fechaOperacion}
    <p><strong>Concepto:</strong> ${escapeHtml(factura.concepto)}</p>
    ${notas}
  </div>

  <table>
    <thead>
      <tr>
        <th>Descripcion</th>
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

export const printFromPopup = (html: string) => {
  const ventana = window.open('', '_blank')
  if (!ventana) return false

  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  ventana.print()
  return true
}

export const printFromIframe = (html: string) => {
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
