async function exportExcel() {
  // Construir URL con los mismos filtros activos
  const params = new URLSearchParams(window.location.search)
  if (todayOnly) params.set('todayOnly', '1')

  const res  = await fetch(`/api/orders/export?${params.toString()}`)
  const data = await res.json()

  if (!data.ok) { alert('Error exportando pedidos'); return }

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
    'N° Pedido':    o.orderNumber,
    'Tienda':       o.store?.name || '',
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
    {wch:12},{wch:20},{wch:22},{wch:14},{wch:24},{wch:28},
    {wch:16},{wch:16},{wch:14},{wch:8},{wch:14},{wch:18},{wch:18},
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')

  const fecha    = new Date().toLocaleDateString('es-CL').replace(/\//g,'-')
  const periodo  = todayOnly ? 'hoy' : 'filtrado'
  const filename = `sendflow_${storeName}_${periodo}_${fecha}.xlsx`

  XLSX.writeFile(wb, filename)
}
