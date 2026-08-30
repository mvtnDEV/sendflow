import type { ZonaEnvio, ZonaRetiro } from '@/lib/utils/zonas'

/**
 * Lo que cada OPERADOR le cobra a Moovex. Es el COSTO, no el precio.
 *
 * El precio que Moovex le cobra a cada tienda vive en `Store`
 * (tarifaUrbana / tarifaExtraUrbana / tarifaRural / tarifaRetiro) y sí varía
 * por tienda. El costo, en cambio, depende solo del operador y la zona: es el
 * mismo para todas las tiendas.
 *
 *   margen = precio a la tienda − costo del operador
 *
 * TODOS LOS MONTOS SON NETOS (sin IVA), igual que las tarifas de `Store`,
 * así que se restan directo.
 */
export type Operador = 'NOW' | 'FRET' | 'MOOVEX'

interface TarifasOperador {
  envio:  Record<ZonaEnvio, number> | null
  retiro: Record<ZonaRetiro, number> | null
}

export const TARIFAS_OPERADOR: Record<Operador, TarifasOperador> = {
  // Confirmadas por el usuario el 2026-08-30.
  NOW: {
    envio:  { URBANA: 2000, EXTRA_URBANA: 2600, RURAL: 2600 },
    retiro: { URBANO: 2000, RURAL: 5000 },
  },
  // Pendientes: todavía no tenemos las tarifas de Fret. Mientras estén en null
  // sus pedidos muestran costo y margen "sin dato", en vez de inventar un cero
  // que descuadraría el total.
  FRET: { envio: null, retiro: null },
  // Reparto propio: no hay costo de operador externo.
  MOOVEX: { envio: null, retiro: null },
}

/** Costo del envío, o null si todavía no se conoce la tarifa del operador. */
export function costoEnvio(operador: Operador, zona: ZonaEnvio): number | null {
  return TARIFAS_OPERADOR[operador].envio?.[zona] ?? null
}

/** Costo del retiro, o null si todavía no se conoce la tarifa del operador. */
export function costoRetiro(operador: Operador, zona: ZonaRetiro): number | null {
  return TARIFAS_OPERADOR[operador].retiro?.[zona] ?? null
}

export const OPERADOR_LABEL: Record<Operador, string> = {
  NOW: 'Now',
  FRET: 'Fret',
  MOOVEX: 'Moovex',
}

/**
 * Operador efectivo de un pedido.
 *
 * Usa la columna `operator` cuando está; si no, la deduce del externalId.
 * La deducción existe porque los pedidos anteriores a la columna la tienen en
 * null: Fret usa códigos `FR-xxxx` y Now un id numérico.
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
