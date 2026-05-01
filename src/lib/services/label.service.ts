import QRCode from 'qrcode'
import { prisma } from '@/lib/db/prisma'

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Generador de QR en base64 ────────────────────────────────────────────────

export async function generateQRImage(qrCode: string): Promise<string> {
  // URL pública de tracking que el cliente puede escanear
 const trackingUrl = `${process.env.APP_URL}/tracking?q=${qrCode}`

  return QRCode.toDataURL(trackingUrl, {
    errorCorrectionLevel: 'M',
    margin:  2,
    width:   200,
    color: { dark: '#0B1628', light: '#FFFFFF' },
  })
}

// ─── Generador de HTML de etiqueta ───────────────────────────────────────────

export function buildLabelHTML(data: LabelData, qrDataUrl: string): string {
  const fecha = new Date(data.createdAt).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  const platformLabel: Record<string, string> = {
    SHOPIFY:       'Shopify',
    MERCADOLIBRE:  'ML Flex',
    WOOCOMMERCE:   'WooCommerce',
    JUMPSELLER:    'Jumpseller',
    MANUAL:        'Manual',
  }
  const trackingUrl = `${process.env.APP_URL}/public-tracking?q=${data.qrCode}`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    width: 10cm; min-height: 15cm;
    padding: 0.8cm;
    border: 2px solid #0B1628;
    background: white;
    color: #0B1628;
  }
  .header {
    display: flex; justify-content: space-between;
    align-items: flex-start; margin-bottom: 0.6cm;
    padding-bottom: 0.4cm; border-bottom: 1.5px solid #0B1628;
  }
  .logo-text { font-size: 20px; font-weight: bold; color: #0B1628; }
  .logo-text span { color: #2563EB; }
  .platform-badge {
    background: #EFF6FF; color: #1D4ED8;
    padding: 3px 10px; border-radius: 12px;
    font-size: 11px; font-weight: bold;
  }
  .order-number {
    font-size: 24px; font-weight: bold;
    letter-spacing: 1px; margin-bottom: 0.4cm;
    color: #0B1628;
  }
  .section-label {
    font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.08em; color: #6B7280;
    margin-bottom: 2px;
  }
  .section-value {
    font-size: 14px; font-weight: bold;
    color: #0B1628; margin-bottom: 0.3cm;
    line-height: 1.3;
  }
  .section-value.address { font-size: 13px; }
  .divider { border-top: 1px dashed #CBD5E1; margin: 0.3cm 0; }
  .qr-section {
    display: flex; align-items: center;
    gap: 0.4cm; margin-top: 0.4cm;
  }
  .qr-section img { width: 3cm; height: 3cm; border: 1px solid #E5E7EB; }
  .qr-info { flex: 1; }
  .qr-code-text {
    font-family: monospace; font-size: 11px;
    color: #6B7280; margin-top: 4px;
    word-break: break-all;
  }
  .footer {
    margin-top: 0.5cm; padding-top: 0.3cm;
    border-top: 1px solid #E5E7EB;
    display: flex; justify-content: space-between;
    font-size: 10px; color: #9CA3AF;
  }
  .bultos-badge {
    background: #0B1628; color: white;
    padding: 4px 12px; border-radius: 6px;
    font-size: 13px; font-weight: bold;
    display: inline-block; margin-bottom: 0.3cm;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo-text">Send<span>Flow</span></div>
    <div class="platform-badge">${platformLabel[data.platform] ?? data.platform}</div>
  </div>

  <div class="order-number">${data.orderNumber}</div>
  <div class="bultos-badge">${data.bultos} ${data.bultos === 1 ? 'bulto' : 'bultos'}</div>

  <div class="section-label">Destinatario</div>
  <div class="section-value">${data.customerName}</div>

  <div class="section-label">Dirección de entrega</div>
  <div class="section-value address">
    ${data.addressStreet}<br>
    ${data.addressComuna}, ${data.addressRegion}
  </div>

  <div class="section-label">Tienda</div>
  <div class="section-value" style="font-size:13px">${data.storeName}</div>

  <div class="divider"></div>

  <div class="qr-section">
    <img src="${qrDataUrl}" alt="QR de tracking">
    <div class="qr-info">
      <div class="section-label">Escanea para rastrear</div>
      <div class="section-value" style="font-size:12px">Tracking en tiempo real</div>
      <div class="qr-code-text">${data.qrCode}</div>
    </div>
  </div>

  <div class="footer">
    <span>Creado: ${fecha}</span>
    <span>${process.env.APP_URL ?? 'sendflow.cl'}</span>
  </div>
</body>
</html>`
}

// ─── Obtener datos del pedido y generar HTML ──────────────────────────────────

export async function generateLabelForOrder(orderId: string): Promise<{
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
  const html      = buildLabelHTML(labelData, qrDataUrl)

  return { html, order: labelData }
}
