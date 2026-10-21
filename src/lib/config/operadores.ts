// ─────────────────────────────────────────────────────────────────────────────
// Configuración central de operadores logísticos
// ─────────────────────────────────────────────────────────────────────────────

/** Tienda Senby (integra por API con su propio ID en externalId). */
export const SENBY_STORE_ID = "cmpanvuns000053f2gbs46t83";

/** Tiendas que van a Fret (retira Fret; mismo punto de retiro "sigan-jugand"). */
export const SIGAN_JUGANDO_STORE_ID = "cmt2181g800072mm41q6pfsb9";
export const NUBIPLAY_STORE_ID = "cmuoby9bl002ptbpyjf1se5ah";

/**
 * Tiendas que van a Fret: al crearse el pedido se envía a Fret (createOrder) y
 * el cron retry-fret reintenta los PENDING que no tengan FR-.
 * Desde el 24-sep-2026 el resto de las tiendas va a Envios Now; desde el
 * 08-oct-2026 NubiPlay y Sigan Jugando vuelven a Fret.
 * Los pedidos viejos que ya tienen FR- se siguen cerrando en Fret igual.
 */
export const TIENDAS_FRET_ACTIVAS = new Set<string>([
  SIGAN_JUGANDO_STORE_ID,
  NUBIPLAY_STORE_ID,
]);

/**
 * Tiendas con despacho automático:
 * al crearse el pedido → RECEIVED → se envía a Now → IN_TRANSIT,
 * sin pasar por el escaneo de bodega.
 * Excepción: los pedidos de SUBTIENDAS_FRET van a Fret (ver vaAFret).
 */
export const TIENDAS_AUTO_NOW = new Set<string>([SENBY_STORE_ID]);

/**
 * Sub-tiendas que van a Fret aunque el resto de su tienda vaya a Now.
 * tienda → nombres de sub-tienda. Se comparan sin distinguir mayúsculas, acentos ni espacios de más.
 * Senby / "Tienda de Jacinta" va a Fret; el resto de Senby sigue con despacho automático a Now.
 */
export const SUBTIENDAS_FRET: Record<string, string[]> = {
  [SENBY_STORE_ID]: ["Tienda de Jacinta"],
};

/**
 * La regla de SUBTIENDAS_FRET vale solo para pedidos creados desde esta fecha (00:00 hora de Chile,
 * UTC-3 en octubre). Los pedidos anteriores siguen con Now: no se reasignan ni dejan de notificar.
 */
export const SUBTIENDAS_FRET_DESDE = new Date("2026-10-21T00:00:00-03:00");

function normalizarNombre(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface PedidoOperador {
  storeId: string;
  subStoreName?: string | null;
  /** Fecha de creación del pedido; si falta se asume que es nuevo (ahora). */
  createdAt?: Date | string | null;
}

/** ¿Este pedido se despacha con Fret? (tienda de Fret, o sub-tienda de SUBTIENDAS_FRET desde su fecha de inicio). */
export function vaAFret(p: PedidoOperador): boolean {
  if (TIENDAS_FRET_ACTIVAS.has(p.storeId)) return true;
  const sub = p.subStoreName ? normalizarNombre(p.subStoreName) : "";
  if (!sub) return false;
  if (!(SUBTIENDAS_FRET[p.storeId] ?? []).some((n) => normalizarNombre(n) === sub)) return false;
  const creado = p.createdAt ? new Date(p.createdAt) : new Date();
  return creado.getTime() >= SUBTIENDAS_FRET_DESDE.getTime();
}

/** ¿Se despacha solo a Now al crearse el pedido? (tienda automática que no va a Fret). */
export function vaANowAutomatico(p: PedidoOperador): boolean {
  return TIENDAS_AUTO_NOW.has(p.storeId) && !vaAFret(p);
}

/**
 * Tiendas cuyo externalId es el ID del cliente (ej: Senby) y NUNCA
 * se debe pisar con el ID de Now. El webhook de Now igual encuentra
 * estos pedidos por el número de pedido.
 */
export const TIENDAS_PRESERVAN_EXTERNAL_ID = new Set<string>([SENBY_STORE_ID]);
