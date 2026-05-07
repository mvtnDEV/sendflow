'use client'
import { useState } from 'react'

export default function RecepcionesClient({
  storeName,
  todayOnly,
  orders = [],
}: {
  storeName:  string
  todayOnly:  boolean
  orders?:    any[]
}) {
  const [loadingExport,      setLoadingExport]      = useState(false)
  const [loadingRecepcionar, setLoadingRecepcionar] = useState(false)
  const [resultado,          setResultado]          = useState<{ ok: boolean; msg: string } | null>(null)

  // Pedidos PENDING visibles en la lista actual
  const pendientes = orders.filter(o => o.status === 'PENDING')

  async function exportExcel() {
    setLoadingExport(true)
    try {
      const params = new URLSearchParams(window.location.search)
      if (todayOnly) params.set('todayOnly', '1')
      const res  = await fetch(`/api/orders/export?${params.toString()}`)
      const data = await res.json()
      if (!data.ok || !data.data?.length) { alert('No hay pedidos para exportar'); return }
      const XLSX = await import('xlsx')
      const STATUS_LABEL: Record<string, string> = {
        PENDING:'Pendiente', RECEIVED:'Recepcionado',
        IN_TRANSIT:'En camino', DELIVERED:'Entregado',
        INCIDENT:'No entregado', CANCELLED:'Cancelado',
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
      ws['!cols'] = [{wch:12},{wch:20},{wch:22},{wch:14},{wch:24},{wch:28},{wch:16},{wch:16},{wch:14},{wch:8},{wch:14},{wch:18},{wch:18}]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
      const fecha   = new Date().toLocaleDateString('es-CL').replace(/\//g, '-')
      const periodo = todayOnly ? 'hoy' : 'historial'
      XLSX.writeFile(wb, `sendflow_${storeName}_${periodo}_${fecha}.xlsx`)
    } catch (err) {
      console.error('Export error:', err)
      alert('Error exportando.')
    } finally {
      setLoadingExport(false)
    }
  }

  async function recepcionarTodos() {
    if (pendientes.length === 0) return
    const confirmar = confirm(`¿Recepcionar ${pendientes.length} pedido${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}?\n\nEsto los enviará automáticamente a Envios Now.`)
    if (!confirmar) return

    setLoadingRecepcionar(true)
    setResultado(null)

    try {
      const ids = pendientes.map(o => o.id)
      const res  = await fetch('/api/orders/batch-receive', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderIds: ids }),
      })
      const data = await res.json()
      if (data.ok) {
        setResultado({ ok: true, msg: `✅ ${data.updated} pedido${data.updated !== 1 ? 's' : ''} recepcionado${data.updated !== 1 ? 's' : ''} correctamente` })
        setTimeout(() => { window.location.reload() }, 1500)
      } else {
        setResultado({ ok: false, msg: `❌ Error: ${data.error}` })
      }
    } catch (err) {
      setResultado({ ok: false, msg: '❌ Error al recepcionar' })
    } finally {
      setLoadingRecepcionar(false)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', gap:8 }}>
        {/* Recepcionar todos */}
        {pendientes.length > 0 && (
          <button onClick={recepcionarTodos} disabled={loadingRecepcionar}
            style={{ padding:'7px 14px', background:loadingRecepcionar?'#93C5FD':'#D97706', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loadingRecepcionar?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5 }}>
            {loadingRecepcionar ? '⏳ Recepcionando...' : `📥 Recepcionar todos (${pendientes.length})`}
          </button>
        )}

        {/* Exportar Excel */}
        <button onClick={exportExcel} disabled={loadingExport}
          style={{ padding:'7px 14px', background:loadingExport?'#86EFAC':'#16A34A', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loadingExport?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:5 }}>
          {loadingExport ? '⏳ Exportando...' : '⬇ Excel'}
        </button>
      </div>

      {/* Mensaje resultado */}
      {resultado && (
        <div style={{ fontSize:12, padding:'6px 12px', borderRadius:8, background:resultado.ok?'#F0FDF4':'#FFF1F2', color:resultado.ok?'#166534':'#9F1239', border:`1px solid ${resultado.ok?'#BBF7D0':'#FECDD3'}`, fontWeight:500 }}>
          {resultado.msg}
        </div>
      )}
    </div>
  )
}
