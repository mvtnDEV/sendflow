import { prisma } from '@/lib/db/prisma'
import type { OrderStatus } from '@prisma/client'

/**
 * Tracking público — la ÚNICA fuente de verdad de qué ve el cliente final.
 *
 * Regla #1 del proyecto: el cliente nunca ve la marca del operador
 * ("Fret", "Now", "EnviosNow"), ni el nombre de la tienda, ni sus datos de
 * contacto. Lo consumen tanto /track/[codigo] (Server Component) como
 * /api/tracking, para que no puedan divergir.
 */

const TZ = 'America/Santiago'

export function fmt(d: Date | null): string | null {
  if (!d) return null
  return new Date(d).toLocaleString('es-CL', {
    timeZone: TZ, day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Ofusca el nombre — muestra "María G." en lugar de "María González". */
export function maskName(name: string): string {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 3) + '***'
  return `${parts[0]} ${parts[1].charAt(0)}.`
}

/**
 * Mapeo POSITIVO de eventos: cada estado se traduce a un texto Moovex fijo y
 * la nota original se descarta. Una lista negra siempre se queda corta —
 * así es imposible que se filtre un "FR-1234" o el nombre de una tienda.
 */
const EVENT_TEXT: Record<OrderStatus, string> = {
  PENDING:    'Pedido registrado',
  RECEIVED:   'Recibido en bodega Moovex',
  DISPATCHED: 'Preparado para despacho',
  PICKED_UP:  'Preparado para despacho',
  IN_TRANSIT: 'En camino a destino',
  DELIVERED:  'Entregado',
  INCIDENT:   'Incidencia en la entrega',
  CANCELLED:  'Pedido cancelado',
}

/**
 * Red de seguridad final para el único campo de texto libre que sale al
 * cliente (receptorName). Elimina códigos de operador y menciones de marca.
 */
export function scrubInternal(texto: string | null): string | null {
  if (!texto) return null
  const limpio = texto
    .replace(/\bFR-?\s?\w+/gi, '')
    .replace(/\b(enviosnow|envios now|enviame|fret|now)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return limpio || null
}

/** Sanitiza el código que llega por URL: solo alfanuméricos, # y guiones. */
export function sanitizeCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9#\-_]/g, '').slice(0, 100)
}

export interface PublicTracking {
  orderNumber:    string
  status:         OrderStatus
  bultos:         number
  customerName:   string
  comuna:         string
  receptorName:   string | null
  createdAt:      string | null
  receivedAt:     string | null
  inTransitAt:    string | null
  deliveredAt:    string | null
  evidencePhoto1: string | null
  evidencePhoto2: string | null
  timeline:       { status: OrderStatus; text: string; formatted: string | null }[]
}

/**
 * Devuelve el pedido en su forma pública, o null si no existe.
 * Nunca distingue "no existe" de "no autorizado".
 */
export async function getPublicTracking(rawCode: string): Promise<PublicTracking | null> {
  const code = sanitizeCode(rawCode ?? '')
  if (!code) return null

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: code },
        { orderNumber: `#${code}` },
        { qrCode:      code },
      ],
    },
    select: {
      orderNumber:    true,
      status:         true,
      bultos:         true,
      customerName:   true,   // se ofusca antes de salir
      addressComuna:  true,   // la calle NO se consulta siquiera
      receptorName:   true,   // se ofusca antes de salir
      createdAt:      true,
      receivedAt:     true,
      inTransitAt:    true,
      deliveredAt:    true,
      evidencePhoto1: true,
      evidencePhoto2: true,
      // evidenceNote NO: es texto libre del conductor/webhook. Limpiarlo deja
      // frases rotas y siempre queda el riesgo de que se cuele algo interno.
      events: {
        orderBy: { createdAt: 'asc' },
        select:  { status: true, createdAt: true },  // la nota NUNCA se lee
      },
      // ❌ Fuera a propósito: store, addressStreet, customerPhone,
      //    customerEmail, receptorRut, externalId, integrationId,
      //    sourceId, storeId, rawPayload.
    },
  })

  if (!order) return null

  return {
    orderNumber:    order.orderNumber,
    status:         order.status,
    bultos:         order.bultos,
    customerName:   maskName(order.customerName),
    comuna:         order.addressComuna,
    receptorName:   order.receptorName ? maskName(scrubInternal(order.receptorName) ?? '') : null,
    createdAt:      fmt(order.createdAt),
    receivedAt:     fmt(order.receivedAt),
    inTransitAt:    fmt(order.inTransitAt),
    deliveredAt:    fmt(order.deliveredAt),
    evidencePhoto1: order.evidencePhoto1 || null,
    evidencePhoto2: order.evidencePhoto2 || null,
    timeline: order.events.map(e => ({
      status:    e.status,
      text:      EVENT_TEXT[e.status] ?? 'Actualización del pedido',
      formatted: fmt(e.createdAt),
    })),
  }
}

/** Etiqueta pública de cada estado. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING:    'Pedido registrado',
  RECEIVED:   'En bodega',
  DISPATCHED: 'Preparado para despacho',
  PICKED_UP:  'Preparado para despacho',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'Incidencia',
  CANCELLED:  'Cancelado',
}
