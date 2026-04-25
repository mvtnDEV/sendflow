export const dynamic = 'force-dynamic'

import { getSessionUser } from '@/lib/utils/auth'
import { listOrders } from '@/lib/services/order.service'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  PENDING:'Pendiente', RECEIVED:'Recepcionado',
  IN_TRANSIT:'En camino', DELIVERED:'Entregado', INCIDENT:'Incidencia',
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  PENDING:    { bg: '#FFFBEB', color: '#92400E' },
  RECEIVED:   { bg: '#EFF6FF', color: '#1D4ED8' },
  IN_TRANSIT: { bg: '#F0FDF4', color: '#166534' },
  DELIVERED:  { bg: '#F5F3FF', color: '#5B21B6' },
  INCIDENT:   { bg: '#FFF1F2', color: '#9F1239' },
}

interface Props {
  searchParams: {
    search?: string; comuna?: string
    status?: string; dateFrom?: string; dateTo?: string
  }
}

export default async function BusquedaPage({ searchParams }: Props) {
  const user    = await getSessionUser()
  const storeId = user?.role === 'STORE_ADMIN' ? (user?.storeId ?? undefined) : undefined

  const hasFilters = Object.values(searchParams).some(Boolean)

  const result = hasFilters
    ? await listOrders({ storeId, ...searchParams, pageSize: 20 })
    : null

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Búsqueda avanzada</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>Busca por nombre, dirección, comuna o estado</p>
      </div>

      {/* Formulario de búsqueda */}
      <form method="GET">
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 5 }}>
                Nombre del cliente o N° de pedido
              </label>
              <input
                name="search"
                defaultValue={searchParams.search}
                placeholder="Buscar por nombre, dirección, N° pedido..."
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 5 }}>Comuna</label>
              <input
                name="comuna"
                defaultValue={searchParams.comuna}
                placeholder="Ej: Providencia"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 5 }}>Estado</label>
              <select
                name="status"
                defaultValue={searchParams.status ?? ''}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: 'white' }}
              >
                <option value="">Todos los estados</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 5 }}>Desde</label>
              <input
                type="date"
                name="dateFrom"
                defaultValue={searchParams.dateFrom}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 5 }}>Hasta</label>
              <input
                type="date"
                name="dateTo"
                defaultValue={searchParams.dateTo}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Link href="/busqueda" style={{ padding: '9px 16px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: '#374151' }}>
                Limpiar
              </Link>
              <button type="submit" style={{ padding: '9px 18px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                Buscar
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Resultados */}
      {result && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', fontSize: 13, color: '#6B7280' }}>
            {result.total} resultado{result.total !== 1 ? 's' : ''}
          </div>
          {result.items.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              No se encontraron pedidos con esos criterios
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Pedido', 'Cliente', 'Dirección', 'Estado', 'Fecha'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.items.map(order => {
                  const sc = STATUS_COLOR[order.status] ?? STATUS_COLOR.PENDING
                  return (
                    <tr key={order.id}>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 13, fontWeight: 500, color: '#1D4ED8' }}>
                        <Link href={`/recepciones/${order.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{order.orderNumber}</Link>
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>{order.customerName}</td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 12, color: '#6B7280' }}>
                        {order.addressStreet}, {order.addressComuna}
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #F1F5F9' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: sc.bg, color: sc.color }}>
                          {STATUS_LABEL[order.status]}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 12, color: '#9CA3AF' }}>
                        {new Date(order.createdAt).toLocaleDateString('es-CL')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!hasFilters && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 }}>
          Ingresa al menos un criterio de búsqueda para ver resultados
        </div>
      )}
    </div>
  )
}
