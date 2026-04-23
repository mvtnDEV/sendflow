import type { Order, Store, User, StoreIntegration } from '@prisma/client'

// ─── Re-exports útiles ────────────────────────────────────────────────────────
export type { Order, Store, User, StoreIntegration }
export type { OrderStatus, Platform, UserRole } from '@prisma/client'

// ─── Sesión ───────────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'SUPER_ADMIN' | 'STORE_ADMIN' | 'DRIVER'
  storeId: string | null
}

// ─── Pedido normalizado (común a todas las plataformas) ───────────────────────

export interface NormalizedOrder {
  externalId: string
  platform: 'SHOPIFY' | 'MERCADOLIBRE' | 'WOOCOMMERCE' | 'JUMPSELLER'
  customerName: string
  customerPhone?: string
  customerEmail?: string
  addressStreet: string
  addressComuna: string
  addressRegion: string
  bultos: number
  rawPayload: Record<string, unknown>
}

// ─── Respuestas de API ────────────────────────────────────────────────────────

export interface ApiOk<T = unknown> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: string
  code?: string
}

export type ApiResponse<T = unknown> = ApiOk<T> | ApiError

// ─── Pedido con relaciones (para el dashboard) ────────────────────────────────

export type OrderWithRelations = Order & {
  store: Pick<Store, 'id' | 'name' | 'slug'>
  integration: Pick<StoreIntegration, 'platform'> | null
  events: { status: string; createdAt: Date; note: string | null }[]
}

// ─── Filtros de búsqueda ──────────────────────────────────────────────────────

export interface OrderFilters {
  storeId?: string
  status?: string
  platform?: string
  search?: string      // busca en customerName, addressStreet, orderNumber
  comuna?: string
  region?: string
  dateFrom?: string
  dateTo?: string
  todayOnly?: boolean  // true = solo pedidos del día (vista por defecto)
  page?: number
  pageSize?: number
}

// ─── Stats del dashboard ──────────────────────────────────────────────────────

export interface DashboardStats {
  total: number
  pending: number
  received: number
  inTransit: number
  delivered: number
  incident: number
  byPlatform: { platform: string; count: number }[]
  byStore: { storeId: string; storeName: string; count: number }[]
}
