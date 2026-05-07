export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { updateOrderStatus } from '@/lib/services/order.service'
import { prisma } from '@/lib/db/prisma'

// POST /api/orders/batch-receive — recepcionar múltiples pedidos desde el sistema web
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  if (user.role === 'VIEWER' || user.role === 'DRIVER') {
    return NextResponse.json({ ok: false, error: 'Sin permisos' }, { status: 403 })
  }

  const { orderIds } = await req.json().catch(() => ({}))
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'orderIds requerido' }, { status: 400 })
  }

  let updated = 0
  const errors: string[] = []

  for (const orderId of orderIds) {
    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } })
      if (!order) { errors.push(`Pedido ${orderId} no encontrado`); continue }
      if (order.status !== 'PENDING') { continue } // ya recepcionado, skip silencioso

      // STORE_ADMIN solo puede recepcionar pedidos de su tienda
      if (user.role === 'STORE_ADMIN' && user.storeId !== order.storeId) {
        errors.push(`Sin acceso al pedido ${order.orderNumber}`)
        continue
      }

      await updateOrderStatus(orderId, 'RECEIVED', 'Recepcionado en bodega (batch web)', user.id)
      updated++
    } catch (err: any) {
      errors.push(err.message)
    }
  }

  return NextResponse.json({ ok: true, updated, errors })
}
