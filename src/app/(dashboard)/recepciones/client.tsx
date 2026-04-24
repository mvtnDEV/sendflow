'use client'
import { useState } from 'react'

export default function RecepcionesClient({
  storeName, todayOnly
}: {
  storeName: string
  todayOnly: boolean
  orders?: any[]
}) {
  const [loading, setLoading] = useState(false)

  async function exportExcel() {
    setLoading(true)
    try {
      const params = new URLSearchParams(window.location.search)
      if (todayOnly) params.set('todayOnly', '1')

      const res  = await fetch(`/api/orders/export?${params.toString()}`)
      const data = await res.json()

      if (!data.ok || !data.data?.length) {
        alert('No hay pedidos para exportar')
        return
      }

      const XLSX = await import('xlsx')

      const STATUS_LABEL: Record<string, string> = {
        PENDING:'Pendiente', RECEIVED:'Recepcionado',
        IN_TRANSIT:'En camino', DELIVERED:'Entregado',
        INCIDENT:'Incidencia', CANCELLED:'Cancelado',
      }
      const PLATFORM_LABEL: Record<string, string> = {
        SHOPIFY:'Shopify', MERCADOLIBRE:'ML Flex',
        WOOCOMMERCE:'WooCommerce', JUMPSELLER:'Jumpseller', MANUAL:'Manual',
      }

      const rows = data.data.map((o: any) => ({
        'N° Pedido':  o.orderNumber,
        'Tienda':     o.store?.name || '',
        'Cliente':    o.customerName,
        'Teléfono':   o.customerPhone || '',
        'Email':      o.customerEmail || '',
        'Dirección':  o.addressStreet,
        'Comuna':     o.addressComuna,
        'Región':     o.addressRegion,
        'Plataforma': PLATFORM_LABEL[o.platform] ?? o.platform,
        'Bultos':     o.bultos,
        'Estado':     STATUS_LABEL[o.status] ?? o.status,
        'Creado':     new Date(o.createdAt).toLocaleString('es-CL'),
        'Entregado':  o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('es-CL') : '',
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        {wch:12},{wch:20},{wch:22},{wch:14},{wch:24},{wch:28},
        {wch:16},{wch:16},{wch:14},{wch:8},{wch:14},{wch:18},{wch:18},
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')

      const fecha    = new Date().toLocaleDateString('es-CL').replace(/\//g,'-')
      const periodo  = todayOnly ? 'hoy' : 'historial'
      XLSX.writeFile(wb, `sendflow_${storeName}_${periodo}_${fecha}.xlsx`)

    } catch (err) {
      console.error('Export error:', err)
      alert('Error exportando. Revisa la consola.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={exportExcel} disabled={loading}
      style={{ padding:'7px 14px', background:loading?'#86EFAC':'#16A34A', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5 }}>
      {loading ? '⏳ Exportando...' : '⬇ Excel'}
    </button>
  )
}
