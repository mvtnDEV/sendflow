'use client'

interface Order {
  orderNumber: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  addressStreet: string
  addressComuna: string
  addressRegion: string
  platform: string
  bultos: number
  status: string
  createdAt: string
  deliveredAt: string | null
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:'Pendiente', RECEIVED:'Recepcionado',
  IN_TRANSIT:'En camino', DELIVERED:'Entregado',
  INCIDENT:'Incidencia', CANCELLED:'Cancelado',
}
const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:'Shopify', MERCADOLIBRE:'ML Flex',
  WOOCOMMERCE:'WooCommerce', JUMPSELLER:'Jumpseller', MANUAL:'Manual',
}

export default function RecepcionesClient({
  orders, storeName, todayOnly
}: {
  orders: Order[]
  storeName: string
  todayOnly: boolean
}) {
  async function exportExcel() {
    const XLSX = await import('xlsx')

    const rows = orders.map(o => ({
      'N° Pedido':    o.orderNumber,
      'Cliente':      o.customerName,
      'Teléfono':     o.customerPhone || '',
      'Email':        o.customerEmail || '',
      'Dirección':    o.addressStreet,
      'Comuna':       o.addressComuna,
      'Región':       o.addressRegion,
      'Plataforma':   PLATFORM_LABEL[o.platform] ?? o.platform,
      'Bultos':       o.bultos,
      'Estado':       STATUS_LABEL[o.status] ?? o.status,
      'Creado':       new Date(o.createdAt).toLocaleString('es-CL'),
      'Entregado':    o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('es-CL') : '',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      {wch:12},{wch:22},{wch:14},{wch:24},{wch:28},
      {wch:16},{wch:16},{wch:14},{wch:8},{wch:14},{wch:18},{wch:18},
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')

    const fecha    = new Date().toLocaleDateString('es-CL').replace(/\//g,'-')
    const periodo  = todayOnly ? 'hoy' : 'filtrado'
    const filename = `sendflow_${storeName}_${periodo}_${fecha}.xlsx`

    XLSX.writeFile(wb, filename)
  }

  return (
    <button onClick={exportExcel}
      style={{ padding:'7px 14px', background:'#16A34A', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
      ⬇ Excel
    </button>
  )
}
