import QRCode from 'qrcode'
import { prisma } from '@/lib/db/prisma'

interface LabelData {
  orderNumber:    string
  qrCode:         string
  customerName:   string
  customerPhone?: string
  addressStreet:  string
  addressComuna:  string
  addressRegion:  string
  addressNotes?:  string
  storeName:      string
  platform:       string
  sourceId?:      string
  subStoreName?:  string
  createdAt:      Date
}

const PLATFORM_PREFIX: Record<string, string> = {
  SHOPIFY:      'SHF',
  MERCADOLIBRE: 'ML',
  WOOCOMMERCE:  'WOO',
  JUMPSELLER:   'JMP',
  MANUAL:       'MAN',
}

function formatSourceId(sourceId: string | undefined, platform: string): string | null {
  if (!sourceId) return null
  const prefix = PLATFORM_PREFIX[platform]
  if (!prefix) return null
  return `${prefix}-${sourceId}`
}

export async function generateQRImage(qrCode: string): Promise<string> {
  const trackingUrl = `${process.env.APP_URL}/track/${encodeURIComponent(qrCode)}`
  return QRCode.toDataURL(trackingUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width:  240,
    color: { dark: '#0B1628', light: '#FFFFFF' },
  })
}

export type TipoServicio = 'ENTREGA' | 'RETIRO' | 'CAMBIO'

export interface ServicioEtiqueta {
  tipo:       TipoServicio
  /** Dirección donde se retira el producto (retiro y cambio) */
  retirarEn?: { calle: string; comuna?: string }
  /** Referencias sin los textos técnicos [RETIRO] / [CAMBIO] */
  notas?:     string
}

function separarCalleComuna(texto: string): { calle: string; comuna?: string } {
  const i = texto.lastIndexOf(', ')
  return i > 0 ? { calle: texto.slice(0, i).trim(), comuna: texto.slice(i + 2).trim() } : { calle: texto.trim() }
}

/**
 * Los pedidos de retiro y cambio (creados en "Nuevo pedido") guardan sus direcciones dentro de
 * addressNotes con este formato:
 *   [RETIRO] Retirar en: <calle>, <comuna> — <notas>
 *   [CAMBIO] Entregar en: <calle>, <comuna> — Retirar en: <calle>, <comuna> — <notas>
 * y marcan subStoreName como RETIRO / CAMBIO. Aquí se separa eso para imprimirlo claro.
 * Cualquier otro pedido es una ENTREGA normal y no cambia.
 */
export function parseServicio(data: Pick<LabelData, 'addressNotes' | 'subStoreName'>): ServicioEtiqueta {
  const notas = (data.addressNotes ?? '').trim()
  const sub   = (data.subStoreName ?? '').trim().toUpperCase()
  const marca = /^\[(RETIRO|CAMBIO)\]\s*/i.exec(notas)
  const tipo  = (marca ? marca[1].toUpperCase() : sub) as string

  if (tipo !== 'RETIRO' && tipo !== 'CAMBIO') return { tipo: 'ENTREGA', notas: notas || undefined }
  if (!marca) return { tipo, notas: notas || undefined } // marcado solo por sub-tienda: se muestran las notas tal cual

  const partes = notas.slice(marca[0].length).split(' — ').map((t) => t.trim()).filter(Boolean)
  const textoRetiro = (t: string) => t.replace(/^Retirar en:\s*/i, '')
  if (tipo === 'RETIRO') {
    // La dirección del pedido ya ES la de retiro; lo que sigue al primer " — " son referencias
    return { tipo, notas: partes.slice(1).join(' — ') || undefined }
  }
  // CAMBIO: partes[0] = "Entregar en: …" (igual a la dirección del pedido), otra parte = "Retirar en: …"
  const iRetiro = partes.findIndex((t) => /^Retirar en:/i.test(t))
  if (iRetiro === -1) return { tipo, notas: partes.slice(1).join(' — ') || undefined }
  return {
    tipo,
    retirarEn: separarCalleComuna(textoRetiro(partes[iRetiro])),
    notas: partes.filter((_, i) => i !== 0 && i !== iRetiro).join(' — ') || undefined,
  }
}

function esc(t: string | undefined): string {
  return (t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Etiqueta de RETIRO o CAMBIO: tipo de servicio arriba y cada dirección con su título, sin recuadros. */
function buildEtiquetaRetiroCambio(data: LabelData, qrDataUrl: string, servicio: ServicioEtiqueta): string {
  const fecha = new Date(data.createdAt).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const sourceLabel = formatSourceId(data.sourceId, data.platform)
  const esCambio    = servicio.tipo === 'CAMBIO'

  const bloque = (titulo: string, calle: string, comuna: string | undefined, numero?: number) => `
        <div class="dir-bloque">
          <div class="dir-titulo">${numero ? `<span class="dir-num">${numero}</span>` : ''}${titulo}</div>
          <div class="dir-calle">${esc(calle)}</div>
          ${comuna ? `<div class="dir-comuna">${esc(comuna)}</div>` : ''}
        </div>`

  const direcciones = esCambio
    ? bloque('ENTREGAR EN', data.addressStreet, `${data.addressComuna} · ${data.addressRegion}`, 1) +
      (servicio.retirarEn
        ? bloque('RETIRAR EN', servicio.retirarEn.calle, servicio.retirarEn.comuna, 2)
        : `<div class="dir-bloque"><div class="dir-titulo"><span class="dir-num">2</span>RETIRAR EN</div><div class="dir-comuna">Ver referencias</div></div>`)
    : bloque('RETIRAR EN', data.addressStreet, `${data.addressComuna} · ${data.addressRegion}`)

  return `
  <div class="label">
    <div class="accent"></div>
    <div class="header">
      <div class="logo">Send<span>Flow</span></div>
      <div class="order-num">${esc(data.orderNumber)}</div>
    </div>
    <div class="tipo">
      <span class="tipo-grande">${servicio.tipo}</span>
      <span class="tipo-chico">${esCambio ? 'Entregar y<br>retirar' : 'Retirar<br>producto'}</span>
    </div>
    <div class="body">
      <div class="info">
        ${direcciones}

        <div class="lbl">Cliente</div>
        <div class="val">${esc(data.customerName)}</div>

        ${data.customerPhone ? `
        <div class="lbl">Teléfono</div>
        <div class="val">${esc(data.customerPhone)}</div>
        ` : ''}

        ${servicio.notas ? `
        <div class="lbl">Referencias</div>
        <div class="val notes">${esc(servicio.notas)}</div>
        ` : ''}

        <div class="lbl">Tienda</div>
        <div class="tienda-row">
          <span class="tienda-nombre">${esc(data.storeName)}</span>
          ${sourceLabel ? `<span class="tienda-source">${esc(sourceLabel)}</span>` : ''}
        </div>
      </div>
      <div class="qr-col">
        <img src="${qrDataUrl}" alt="QR tracking">
        <div class="qr-hint">Escanea para<br>rastrear</div>
      </div>
    </div>
    <div class="footer">
      <span>${fecha}</span>
      <span>${process.env.APP_URL ?? 'sendflow.cl'}</span>
    </div>
  </div>`
}

export function buildSingleLabel(data: LabelData, qrDataUrl: string): string {
  const servicio = parseServicio(data)
  if (servicio.tipo !== 'ENTREGA') return buildEtiquetaRetiroCambio(data, qrDataUrl, servicio)
  return buildEtiquetaEntrega(data, qrDataUrl)
}

/** La etiqueta de siempre. No se modifica. */
function buildEtiquetaEntrega(data: LabelData, qrDataUrl: string): string {
  const fecha = new Date(data.createdAt).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const sourceLabel = formatSourceId(data.sourceId, data.platform)

  return `
  <div class="label">
    <div class="accent"></div>
    <div class="header">
      <div class="logo">Send<span>Flow</span></div>
      <div class="order-num">${data.orderNumber}</div>
    </div>
    <div class="body">
      <div class="info">

        <div class="lbl">Destinatario</div>
        <div class="val">${data.customerName}</div>

        ${data.customerPhone ? `
        <div class="lbl">Teléfono</div>
        <div class="val">${data.customerPhone}</div>
        ` : ''}

        <div class="lbl">Dirección de entrega</div>
        <div class="val">${data.addressStreet}<br>${data.addressComuna}, ${data.addressRegion}</div>

        ${data.addressNotes ? `
        <div class="lbl">Referencias</div>
        <div class="val notes">${data.addressNotes}</div>
        ` : ''}

        <div class="lbl">Tienda</div>
        <div class="tienda-row">
          <span class="tienda-nombre">${data.storeName}</span>
          ${sourceLabel ? `<span class="tienda-source">${sourceLabel}</span>` : ''}
        </div>

      </div>
      <div class="qr-col">
        <img src="${qrDataUrl}" alt="QR tracking">
        <div class="qr-hint">Escanea para<br>rastrear tu pedido</div>
      </div>
    </div>
    <div class="footer">
      <span>${fecha}</span>
      <span>${process.env.APP_URL ?? 'sendflow.cl'}</span>
    </div>
  </div>`
}

export function buildHTMLWrapper(labelsHTML: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  @page {
    margin: 0;
    size: 10cm 15cm;
  }

  html, body {
    width: 10cm;
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    background: white;
    color: #0B1628;
  }

  .label {
    width: 10cm;
    max-width: 10cm;
    background: white;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
  }
  .label:last-child {
    page-break-after: avoid;
    break-after: avoid;
  }

  .accent { height: 6px; background: #2563EB; }

  .header {
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #F1F5F9;
    border-left: 1px solid #E2E8F0;
    border-right: 1px solid #E2E8F0;
  }
  .logo { font-size: 18px; font-weight: bold; color: #0B1628; }
  .logo span { color: #2563EB; }
  .order-num { font-size: 22px; font-weight: bold; color: #0B1628; letter-spacing: 0.5px; font-family: monospace; }

  .body {
    padding: 16px;
    display: flex;
    gap: 14px;
    border-left: 1px solid #E2E8F0;
    border-right: 1px solid #E2E8F0;
  }
  .info { flex: 1; }

  .lbl {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #9CA3AF;
    margin-bottom: 3px;
  }
  .val {
    font-size: 15px;
    font-weight: bold;
    color: #0B1628;
    margin-bottom: 12px;
    line-height: 1.4;
  }
  .val.notes {
    font-size: 12px;
    font-weight: normal;
    color: #374151;
    background: #FFFBEB;
    border-left: 3px solid #F59E0B;
    padding: 4px 8px;
    border-radius: 0 4px 4px 0;
  }

  .tienda-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .tienda-nombre {
    font-size: 13px;
    color: #0B1628;
  }
  .tienda-source {
    font-size: 15px;
    font-weight: bold;
    color: #166534;
    background: #F0FDF4;
    padding: 2px 10px;
    border-radius: 6px;
    border: 1px solid #BBF7D0;
    font-family: monospace;
  }

  .qr-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 100px;
  }
  .qr-col img {
    width: 95px;
    height: 95px;
    border: 1px solid #E2E8F0;
    border-radius: 4px;
  }
  .qr-hint {
    font-size: 9px;
    color: #9CA3AF;
    text-align: center;
    line-height: 1.4;
  }

  .footer {
    padding: 8px 16px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-top: 1px solid #F1F5F9;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #9CA3AF;
  }

  /* ── Retiro y cambio ── */
  .tipo {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 16px;
    background: #0B1628;
    color: #FFFFFF;
  }
  .tipo-grande { font-size: 30px; font-weight: 900; letter-spacing: 0.04em; line-height: 1; }
  .tipo-chico  { font-size: 12px; font-weight: bold; text-align: right; line-height: 1.25; }

  .dir-bloque { margin-bottom: 10px; }
  .dir-bloque + .dir-bloque { border-top: 1px solid #CBD5E1; padding-top: 10px; }
  .dir-titulo {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
  }
  .dir-num {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #0B1628;
    color: #FFFFFF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
  .dir-calle  { font-size: 17px; font-weight: bold; line-height: 1.2; color: #0B1628; }
  .dir-comuna { font-size: 13px; font-weight: bold; color: #475569; margin-top: 2px; }
</style>
</head>
<body>
  ${labelsHTML}
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`
}

export async function generateLabelForOrder(orderId: string): Promise<{
  html:  string
  order: LabelData
}> {
  const order = await prisma.order.findUnique({
    where:   { id: orderId },
    include: { store: { select: { name: true } } },
  })
  if (!order) throw new Error('Pedido no encontrado')

  const labelData: LabelData = {
    orderNumber:   order.orderNumber,
    qrCode:        order.qrCode,
    customerName:  order.customerName,
    customerPhone: order.customerPhone ?? undefined,
    addressStreet: order.addressStreet,
    addressComuna: order.addressComuna,
    addressRegion: order.addressRegion,
    addressNotes:  order.addressNotes ?? undefined,
    storeName:     order.store.name,
    platform:      order.platform,
    sourceId:      (order as any).sourceId ?? undefined,
    subStoreName:  (order as any).subStoreName ?? undefined,
    createdAt:     order.createdAt,
  }

  const qrDataUrl  = await generateQRImage(order.qrCode)
  const labelsHTML = buildSingleLabel(labelData, qrDataUrl)

  return { html: buildHTMLWrapper(labelsHTML), order: labelData }
}

export async function generateBulkLabels(orderIds: string[]): Promise<string> {
  const orders = await prisma.order.findMany({
    where:   { id: { in: orderIds } },
    include: { store: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  let labelsHTML = ''
  for (const order of orders) {
    const labelData: LabelData = {
      orderNumber:   order.orderNumber,
      qrCode:        order.qrCode,
      customerName:  order.customerName,
      customerPhone: order.customerPhone ?? undefined,
      addressStreet: order.addressStreet,
      addressComuna: order.addressComuna,
      addressRegion: order.addressRegion,
      addressNotes:  order.addressNotes ?? undefined,
      storeName:     order.store.name,
      platform:      order.platform,
      sourceId:      (order as any).sourceId ?? undefined,
      subStoreName:  (order as any).subStoreName ?? undefined,
      createdAt:     order.createdAt,
    }
    const qrDataUrl = await generateQRImage(order.qrCode)
    labelsHTML += buildSingleLabel(labelData, qrDataUrl)
  }

  return buildHTMLWrapper(labelsHTML)
}
export async function markLabelsAsPrinted(orderIds: string[]): Promise<void> {
  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data:  { labelUrl: 'printed' }, // marca que se imprimió
  })
}
