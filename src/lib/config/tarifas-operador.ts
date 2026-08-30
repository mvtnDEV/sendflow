import type { ZonaEnvio } from '@/lib/utils/zonas'

/**
 * Lo que cada OPERADOR le cobra a Moovex. Es el COSTO, no el precio.
 *
 * El precio que Moovex le cobra a cada tienda vive en `Store`
 * (tarifaUrbana / tarifaExtraUrbana / tarifaRural) y sí varía por tienda.
 * El costo depende solo del operador y la zona: es el mismo para todas.
 *
 *   margen por bulto = precio de la tienda − costo del operador
 *
 * Ambos lados son NETOS (sin IVA), así que se restan directo.
 */
export type Operador = 'NOW' | 'FRET' | 'MOOVEX'

export const TARIFAS_OPERADOR: Record<Operador, Record<ZonaEnvio, number> | null> = {
  // Confirmadas por el usuario el 2026-08-30.
  NOW: { URBANA: 2000, EXTRA_URBANA: 2600, RURAL: 2600 },
  // Pendiente: todavía no tenemos las tarifas de Fret. Mientras esté en null
  // sus pedidos muestran costo y margen "sin dato", en vez de inventar un cero
  // que descuadraría el total.
  FRET: null,
  // Reparto propio: no hay costo de operador externo.
  MOOVEX: null,
}

/** Costo por bulto, o null si todavía no se conoce la tarifa del operador. */
export function costoPorBulto(operador: Operador, zona: ZonaEnvio): number | null {
  return TARIFAS_OPERADOR[operador]?.[zona] ?? null
}

/**
 * Operador efectivo de un pedido.
 *
 * Usa la columna `operator` cuando está; si no, la deduce del externalId,
 * porque los pedidos anteriores a esa columna la tienen en null: Fret usa
 * códigos `FR-xxxx` y Now un id numérico.
 */
export function operadorDe(
  operator: string | null | undefined,
  externalId: string | null | undefined,
): Operador {
  if (operator === 'NOW' || operator === 'FRET' || operator === 'MOOVEX') return operator
  if (externalId?.startsWith('FR-')) return 'FRET'
  if (externalId) return 'NOW'
  return 'MOOVEX'
}

export const OPERADOR_LABEL: Record<Operador, string> = {
  NOW: 'Now',
  FRET: 'Fret',
  MOOVEX: 'Moovex',
}
