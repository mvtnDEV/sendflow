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
  storeName:      string
  platform:       string
  sourceId?:      string
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
  if (!sourceId || platform === 'MANUAL') return null
  const prefix = PLATFORM_PREFIX[platform]
  if (!prefix) return null
  return `${prefix}-${sourceId}`
}

export async function generateQRImage(qrCode: string): Promise<string> {
  const trackingUrl = `${process.env.APP_URL}/public-tracking?q=${qrCode}`
  return QRCode.toDataURL(trackingUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width:  240,
    color: { dark: '#0B1628', light: '#FFFFFF' },
  })
}

export function buildSingleLabel(data: LabelData, qrDataUrl: string): string {
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

function buildHTMLWrapper(labelsHTML: string): string {
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
    storeName:     order.store.name,
    platform:      order.platform,
    sourceId:      (order as any).sourceId ?? undefined,
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
      storeName:     order.store.name,
      platform:      order.platform,
      sourceId:      (order as any).sourceId ?? undefined,
      createdAt:     order.createdAt,
    }
    const qrDataUrl = await generateQRImage(order.qrCode)
    labelsHTML += buildSingleLabel(labelData, qrDataUrl)
  }

  return buildHTMLWrapper(labelsHTML)
}
