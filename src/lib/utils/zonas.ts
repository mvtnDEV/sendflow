/**
 * Zonificación de comunas para facturación.
 *
 * Antes estaba copiada literal en `api/facturacion/route.ts` y en
 * `facturacion/page.tsx`, con el riesgo obvio de que divergieran. Acá queda
 * una sola copia.
 *
 * La tarifa la define la ZONA (tanto lo que Moovex le cobra a la tienda como
 * lo que el operador le cobra a Moovex). La comuna solo sirve para saber en
 * qué zona cae.
 */

export type ZonaEnvio = 'URBANA' | 'EXTRA_URBANA' | 'RURAL'

/** minúsculas, sin tildes y sin espacios de sobra */
export function normalizarComuna(comuna: string): string {
  return (comuna ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const EXTRA_URBANAS = new Set(['colina', 'padre hurtado'])

const RURALES = new Set([
  'paine',
  'pirque',
  'til til',
  'tiltil',
  'melipilla',
  'penaflor',
  'isla de maipo',
  'lampa',
  // Buin faltaba: sus envíos se venían facturando como urbanos.
  'buin',
])

/**
 * La comparación es EXACTA sobre el string normalizado. Antes era
 * `c.includes(r) || r.includes(c)`, bidireccional: una comuna que contuviera
 * el nombre de otra caía en la zona equivocada.
 */
export function clasificarZona(comuna: string): ZonaEnvio {
  const c = normalizarComuna(comuna)
  if (RURALES.has(c)) return 'RURAL'
  if (EXTRA_URBANAS.has(c)) return 'EXTRA_URBANA'
  return 'URBANA'
}

export const ZONA_LABEL: Record<ZonaEnvio, string> = {
  URBANA: 'Urbana',
  EXTRA_URBANA: 'Extra urbana',
  RURAL: 'Rural',
}
