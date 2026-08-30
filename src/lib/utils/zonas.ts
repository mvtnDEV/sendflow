/**
 * Zonificación de comunas para facturación.
 *
 * Antes estaba copiada literal en `api/facturacion/route.ts` y en
 * `facturacion/page.tsx`, con el riesgo obvio de que divergieran. Acá queda una
 * sola copia.
 */

export type ZonaEnvio = 'URBANA' | 'EXTRA_URBANA' | 'RURAL'
export type ZonaRetiro = 'URBANO' | 'RURAL'

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
 * El retiro tiene su PROPIA zonificación, más chica que la del envío.
 * No se puede reusar la de arriba sin cobrar de más o de menos.
 */
const RETIRO_RURAL = new Set(['lampa', 'buin', 'isla de maipo'])

export function clasificarZona(comuna: string): ZonaEnvio {
  const c = normalizarComuna(comuna)
  if (RURALES.has(c)) return 'RURAL'
  if (EXTRA_URBANAS.has(c)) return 'EXTRA_URBANA'
  return 'URBANA'
}

export function clasificarZonaRetiro(comuna: string): ZonaRetiro {
  return RETIRO_RURAL.has(normalizarComuna(comuna)) ? 'RURAL' : 'URBANO'
}

/**
 * La comparación es EXACTA sobre el string normalizado.
 * Antes era `c.includes(r) || r.includes(c)`, bidireccional: una comuna que
 * contuviera el nombre de otra caía en la zona equivocada.
 */
export function esComunaConocida(comuna: string): boolean {
  const c = normalizarComuna(comuna)
  return RURALES.has(c) || EXTRA_URBANAS.has(c)
}

export const ZONA_LABEL: Record<ZonaEnvio, string> = {
  URBANA: 'Urbana',
  EXTRA_URBANA: 'Extra urbana',
  RURAL: 'Rural',
}
