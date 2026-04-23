import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:'Shopify', MERCADOLIBRE:'ML Flex',
  WOOCOMMERCE:'WooCommerce', JUMPSELLER:'Jumpseller', MANUAL:'Manual',
}
const PLATFORM_COLOR: Record<string, { bg: string; color: string }> = {
  SHOPIFY:      { bg: '#EFF6FF', color: '#1D4ED8' },
  MERCADOLIBRE: { bg: '#FFF7ED', color: '#C2410C' },
  WOOCOMMERCE:  { bg: '#F5F3FF', color: '#5B21B6' },
  JUMPSELLER:   { bg: '#FFF7ED', color: '#92400E' },
}

export default async function TiendasPage() {
  const user = await getSessionUser()
  const where = user?.role === 'SUPER_ADMIN' ? {} : { id: user?.storeId ?? '' }

  const stores = await prisma.store.findMany({
    where,
    include: {
      integrations: {
        select: { id: true, platform: true, isActive: true, lastSyncAt: true },
      },
      _count: { select: { orders: true } },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Tiendas conectadas</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>{stores.length} tienda{stores.length !== 1 ? 's' : ''} registrada{stores.length !== 1 ? 's' : ''}</p>
        </div>
        {user?.role === 'SUPER_ADMIN' && (
          <button style={{ padding: '8px 16px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + Nueva tienda
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
        {stores.map(store => (
          <div key={store.id} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{store.name}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{store._count.orders} pedidos totales</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#F0FDF4', color: '#166534', fontWeight: 500 }}>
                {store.isActive ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Integraciones</div>
              {store.integrations.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9CA3AF' }}>Sin integraciones configuradas</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {store.integrations.map(int => {
                    const pc = PLATFORM_COLOR[int.platform] ?? { bg: '#F1F5F9', color: '#475569' }
                    const lastSync = int.lastSyncAt
                      ? new Date(int.lastSyncAt).toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
                      : 'Nunca'
                    return (
                      <div key={int.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: pc.bg, color: pc.color }}>
                            {PLATFORM_LABEL[int.platform]}
                          </span>
                          <span style={{ fontSize: 11, color: int.isActive ? '#16A34A' : '#9CA3AF' }}>
                            {int.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          Sync: {lastSync}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
