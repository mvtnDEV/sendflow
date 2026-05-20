import type { Order, Store, User, StoreIntegration } from '@prisma/client'

export type { Order, Store, User, StoreIntegration }
export type { OrderStatus, Platform, UserRole } from '@prisma/client'

export interface SessionUser {
  id:      string
  email:   string
  name:    string
  role:    'SUPER_ADMIN' | 'STORE_ADMIN' | 'DRIVER'
  storeId: string | null
}

export interface NormalizedOrder {
  externalId:     string
  platform:       'SHOPIFY' | 'MERCADOLIBRE' | 'WOOCOMMERCE' | 'JUMPSELLER'
  customerName:   string
  customerPhone?: string
  customerEmail?: string
  addressStreet:  string
  addressComuna:  string
  addressRegion:  string
  bultos:         number
  rawPayload:     Record<string, unknown>
}

export interface ApiOk<T = unknown> {
  ok:   true
  data: T
}
export interface ApiError {
  ok:    false
  error: string
  code?: string
}
export type ApiResponse<T = unknown> = ApiOk<T> | ApiError

export type OrderWithRelations = Order & {
  store:       Pick<Store, 'id' | 'name' | 'slug'>
  integration: Pick<StoreIntegration, 'platform'> | null
  events:      { status: string; createdAt: Date; note: string | null }[]
}

export interface OrderFilters {
  storeId?:        string
  status?:         string
  platform?:       string
  search?:         string
  comuna?:         string
  region?:         string
  dateFrom?:       string
  dateTo?:         string
  todayOnly?:      boolean
  superAdminView?: boolean
  page?:           number
  pageSize?:       number
}

export interface DashboardStats {
  total:      number
  pending:    number
  received:   number
  inTransit:  number
  delivered:  number
  incident:   number
  byPlatform: { platform: string; count: number }[]
  byStore:    { storeId: string; storeName: string; count: number }[]
}
