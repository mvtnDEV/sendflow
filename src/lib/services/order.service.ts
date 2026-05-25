export async function listOrders(filters: OrderFilters) {
  const page     = filters.page     ?? 1
  const pageSize = filters.pageSize ?? 10
  const skip     = (page - 1) * pageSize
  const today    = todayRange()

  const where: any = {}

  if (filters.storeId)  where.storeId  = filters.storeId
  if (filters.status)   where.status   = filters.status
  if (filters.platform) where.platform = filters.platform
  if (filters.comuna)   where.addressComuna = { contains: filters.comuna, mode: 'insensitive' }

  if (filters.search) {
    where.OR = [
      { customerName:  { contains: filters.search, mode: 'insensitive' } },
      { addressStreet: { contains: filters.search, mode: 'insensitive' } },
      { orderNumber:   { contains: filters.search, mode: 'insensitive' } },
      { customerPhone: { contains: filters.search } },
      { sourceId:      { contains: filters.search } },
      { subStoreName:  { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  if (filters.todayOnly && !filters.dateFrom && !filters.dateTo) {
    if (filters.superAdminView) {
      // SUPER_ADMIN vista hoy: solo activos + MANUAL pendientes
      // Sin WooCommerce sin enviado_intralog
      where.AND = [
        {
          OR: [
            { status: 'IN_TRANSIT' },
            { status: 'INCIDENT' },
            { deliveredAt: today },
            { status: 'PENDING', platform: 'MANUAL' },
          ],
        },
        // Excluir WooCommerce sin enviado_intralog
        {
          NOT: {
            AND: [
              { platform: 'WOOCOMMERCE' },
              { NOT: { rawPayload: { path: ['status'], equals: 'enviado_intralog' } } },
            ],
          },
        },
      ]
    } else {
      // STORE_ADMIN: ve todo del día incluyendo sus pendientes
      where.OR = [
        { createdAt:   today },
        { status:      'PENDING' },
        { receivedAt:  today },
        { inTransitAt: today },
        { deliveredAt: today },
      ]
    }
  } else if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
      ...(filters.dateTo   && { lte: new Date(filters.dateTo + 'T23:59:59') }),
    }
    // SUPER_ADMIN historial: ocultar PENDING no MANUAL, RECEIVED y WOO sin intralog
    if (filters.superAdminView && !filters.status) {
      where.AND = [
        { NOT: { AND: [{ status: 'PENDING' }, { NOT: { platform: 'MANUAL' } }] } },
        { NOT: { status: 'RECEIVED' } },
        { NOT: { AND: [{ platform: 'WOOCOMMERCE' }, { NOT: { rawPayload: { path: ['status'], equals: 'enviado_intralog' } } }] } },
      ]
    }
  } else if (filters.superAdminView && !filters.status) {
    // Historial completo sin fechas
    where.AND = [
      { NOT: { AND: [{ status: 'PENDING' }, { NOT: { platform: 'MANUAL' } }] } },
      { NOT: { status: 'RECEIVED' } },
      { NOT: { AND: [{ platform: 'WOOCOMMERCE' }, { NOT: { rawPayload: { path: ['status'], equals: 'enviado_intralog' } } }] } },
    ]
  } else if (filters.superAdminView) {
    // Con filtro de status aplicado — solo WOO filter
    where.AND = [
      { NOT: { AND: [{ platform: 'WOOCOMMERCE' }, { NOT: { rawPayload: { path: ['status'], equals: 'enviado_intralog' } } }] } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take:    pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id:            true,
        orderNumber:   true,
        platform:      true,
        status:        true,
        customerName:  true,
        customerPhone: true,
        addressStreet: true,
        addressComuna: true,
        bultos:        true,
        sourceId:      true,
        subStoreName:  true,
        createdAt:     true,
        evidencePhoto1:true,
        rawPayload:    true,
        store: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}
