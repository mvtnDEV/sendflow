import QRCode from 'qrcode'
import { prisma } from '@/lib/db/prisma'

interface LabelData {
  orderNumber:   string
  qrCode:        string
  customerName:  string
  addressStreet: string
  addressComuna: string
  addressRegion: string
  storeName:     string
  platform:      string
  bultos:        number
  createdAt:     Date
}

export async function generateQRImage(qrCode: string): Promise<string> {
  const trackingUrl = `${process.env.APP_URL}/public-tracking?q=${qrCode}`
  return QRCode.toDataURL(trackingUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width:  200,
    color: { dark: '#0B1628', light: '#FFFFFF' },
  })
}

// ─── Etiqueta individual (con numeración de bulto opcional) ───────────────────

export function buildSingleLabel(data: LabelData, qrDataUrl: string, bultoNum?: number, totalBultos?: number): string {
  const fecha = new Date(data.createdAt).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const platformLabel: Record<string, string> = {
    SHOPIFY:      'Shopify',
    MERCADOLIBRE: 'ML Flex',
    WOOCOMMERCE:  'WooCommerce',
    JUMPSELLER:   'Jumpseller',
    MANUAL:       'Manual',
  }
  const bultoBadge = bultoNum && totalBultos
    ? `Bulto ${bultoNum}/${totalBultos}`
    : `${data.bultos} ${data.bultos === 1 ? 'bulto' : 'bultos'}`

  return `
  <div class="label">
    <div class="accent"></div>
    <div class="header">
      <div class="logo">Send<span>Flow</span></div>
      <div class="order-num">${data.orderNumber}</div>
    </div>
    <div class="body">
      <div class="info">
        <div class="platform-badge">${platformLabel[data.platform] ?? data.platform}</div>
        <div class="lbl">Destinatario</div>
        <div class="val">${data.customerName}</div>
        <div class="lbl">Dirección de entrega</div>
        <div class="val">${data.addressStreet}<br>${data.addressComuna}, ${data.addressRegion}</div>
        <div class="lbl">Tienda</div>
        <div class="val sm">${data.storeName}</div>
      </div>
      <div class="qr-col">
        <img src="${qrDataUrl}" alt="QR tracking">
        <div class="bultos-badge">${bultoBadge}</div>
        <div class="qr-hint">Escanea para<br>rastrear tu pedido</div>
      </div>
    </div>
    <div class="footer">
      <span>${fecha}</span>
      <span>${process.env.APP_URL ?? 'sendflow.cl'}</span>
    </div>
  </div>`
}

// ─── HTML base con estilos compartidos ───────────────────────────────────────

function buildHTMLWrapper(labelsHTML: string, autoprint = true): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: white; color: #0B1628; }
  .label {
    width: 10cm;
    background: white;
    page-break-after: always;
    break-after: page;
  }
  .label:last-child { page-break-after: avoid; break-after: avoid; }
  .accent { height: 5px; background: #2563EB; }
  .header {
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #F1F5F9;
    border-left: 1px solid #E2E8F0;
    border-right: 1px solid #E2E8F0;
  }
  .logo { font-size: 14px; font-weight: bold; color: #0B1628; }
  .logo span { color: #2563EB; }
  .order-num { font-size: 18px; font-weight: bold; color: #0B1628; letter-spacing: 0.5px; font-family: monospace; }
  .body {
    padding: 10px 12px;
    display: flex;
    gap: 10px;
    border-left: 1px solid #E2E8F0;
    border-right: 1px solid #E2E8F0;
  }
  .info { flex: 1; }
  .lbl { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #9CA3AF; margin-bottom: 1px; }
  .val { font-size: 11px; font-weight: bold; color: #0B1628; margin-bottom: 7px; line-height: 1.3; }
  .val.sm { font-size: 10px; font-weight: normal; }
  .qr-col { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 70px; }
  .qr-col img { width: 64px; height: 64px; border: 1px solid #E2E8F0; border-radius: 4px; }
  .bultos-badge { background: #EFF6FF; color: #1D4ED8; font-size: 9px; font-weight: bold; padding: 2px 7px; border-radius: 4px; }
  .qr-hint { font-size: 7px; color: #9CA3AF; text-align: center; line-height: 1.4; }
  .platform-badge { font-size: 8px; font-weight: bold; color: #1D4ED8; background: #EFF6FF; padding: 1px 6px; border-radius: 10px; margin-bottom: 7px; display: inline-block; }
  .footer { padding: 5px 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-top: 1px solid #F1F5F9; display: flex; justify-content: space-between; font-size: 8px; color: #9CA3AF; }
  @media print {
    body { margin: 0; }
    @page { margin: 0.3cm; size: 10cm auto; }
  }
</style>
</head>
<body>
  ${labelsHTML}
  ${autoprint ? '<script>window.onload = () => { window.print(); }</script>' : ''}
</body>
</html>`
}

// ─── Generar etiquetas de un pedido (1 por bulto) ────────────────────────────

export async function generateLabelForOrder(orderId: string, allBultos = false): Promise<{
  html:   string
  order:  LabelData
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
    addressStreet: order.addressStreet,
    addressComuna: order.addressComuna,
    addressRegion: order.addressRegion,
    storeName:     order.store.name,
    platform:      order.platform,
    bultos:        order.bultos,
    createdAt:     order.createdAt,
  }

  const qrDataUrl = await generateQRImage(order.qrCode)

  let labelsHTML = ''
  if (allBultos && order.bultos > 1) {
    // Una etiqueta por cada bulto con numeración
    for (let i = 1; i <= order.bultos; i++) {
      labelsHTML += buildSingleLabel(labelData, qrDataUrl, i, order.bultos)
    }
  } else {
    labelsHTML = buildSingleLabel(labelData, qrDataUrl)
  }

  return { html: buildHTMLWrapper(labelsHTML), order: labelData }
}

// ─── Generar etiquetas masivas para múltiples pedidos ────────────────────────

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
      addressStreet: order.addressStreet,
      addressComuna: order.addressComuna,
      addressRegion: order.addressRegion,
      storeName:     order.store.name,
      platform:      order.platform,
      bultos:        order.bultos,
      createdAt:     order.createdAt,
    }
    const qrDataUrl = await generateQRImage(order.qrCode)
    // Una etiqueta por cada bulto
    if (order.bultos > 1) {
      for (let i = 1; i <= order.bultos; i++) {
        labelsHTML += buildSingleLabel(labelData, qrDataUrl, i, order.bultos)
      }
    } else {
      labelsHTML += buildSingleLabel(labelData, qrDataUrl)
    }
  }

  return buildHTMLWrapper(labelsHTML)
}
