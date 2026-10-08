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
 */
export const TIENDAS_AUTO_NOW = new Set<string>([SENBY_STORE_ID]);

/**
 * Tiendas cuyo externalId es el ID del cliente (ej: Senby) y NUNCA
 * se debe pisar con el ID de Now. El webhook de Now igual encuentra
 * estos pedidos por el número de pedido.
 */
export const TIENDAS_PRESERVAN_EXTERNAL_ID = new Set<string>([SENBY_STORE_ID]);
