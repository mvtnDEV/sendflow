import { prisma } from '@/lib/db/prisma'
import { audit } from './audit.service'

// ─── Derecho de supresión (Art. 14 Ley 21.719) ───────────────────────────────

export async function requestDataDeletion(params: {
  requesterName:  string
  requesterEmail: string
  orderId?:       string
  reason?:        string
}) {
  return prisma.dataDeletionRequest.create({ data: { ...params } })
}

// ─── Anonimización de pedido ─────────────────────────────────────────────────
// No borramos el pedido (necesario para trazabilidad logística)
// sino que reemplazamos los datos personales con valores genéricos

export async function anonymizeOrder(orderId: string, processedBy: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Pedido no encontrado')
  if (order.anonymizedAt) throw new Error('Ya fue anonimizado')

  await prisma.order.update({
    where: { id: orderId },
    data: {
      customerName:   'DATOS ELIMINADOS',
      customerPhone:  null,
      customerEmail:  null,
      addressStreet:  `${order.addressComuna} (eliminado)`,
      addressNotes:   null,
      evidenceNote:   null,
      evidencePhoto1: null,
      evidencePhoto2: null,
      rawPayload:     null as any,
      anonymizedAt:   new Date(),
    },
  })

  await audit({
    userId:   processedBy,
    action:   'DATA_ANONYMIZED',
    resource: `order:${orderId}`,
  })

  return true
}

// ─── Política de retención automática ────────────────────────────────────────
// Ley 21.719: datos personales solo mientras sea necesario
// Por defecto: 2 años desde la entrega

export async function setRetentionDate(orderId: string, yearsFromDelivery = 2) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) return

  const baseDate     = order.deliveredAt ?? order.createdAt
  const retentionDate = new Date(baseDate)
  retentionDate.setFullYear(retentionDate.getFullYear() + yearsFromDelivery)

  await prisma.order.update({
    where: { id: orderId },
    data:  { dataRetentionDate: retentionDate },
  })
}

// ─── Job de limpieza automática (llamar desde cron) ──────────────────────────
// Anonimiza pedidos cuya fecha de retención ya venció

export async function runRetentionCleanup() {
  const expired = await prisma.order.findMany({
    where: {
      dataRetentionDate: { lte: new Date() },
      anonymizedAt:      null,
    },
    select: { id: true },
  })

  let count = 0
  for (const o of expired) {
    try {
      await anonymizeOrder(o.id, 'system:retention-job')
      count++
    } catch {}
  }

  console.log(`[RetentionCleanup] Anonimizados ${count} de ${expired.length} pedidos`)
  return { total: expired.length, anonymized: count }
}

// ─── Política de privacidad (texto para mostrar en el sistema) ───────────────

export const PRIVACY_POLICY = {
  lastUpdated:  '2025-01-01',
  controller:   'SendFlow',
  legalBasis:   'Ley 21.719 de Protección de Datos Personales (Chile)',
  dataCollected: [
    'Nombre completo del destinatario',
    'Teléfono del destinatario',
    'Email del destinatario',
    'Dirección de entrega',
    'Fotografías de evidencia de entrega',
  ],
  purpose:      'Gestión y seguimiento de envíos',
  retention:    '2 años desde la fecha de entrega, luego anonimización automática',
  rights:       [
    'Acceso a sus datos (Art. 11)',
    'Rectificación de datos inexactos (Art. 12)',
    'Supresión de datos (Art. 14)',
    'Oposición al tratamiento (Art. 17)',
  ],
  contact:      'privacidad@sendflow.cl',
}
