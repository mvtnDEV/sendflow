// ─────────────────────────────────────────────────────────────────────────────
// Configuración central de operadores logísticos
// ─────────────────────────────────────────────────────────────────────────────

/** Tienda Senby (integra por API con su propio ID en externalId). */
export const SENBY_STORE_ID = "cmpanvuns000053f2gbs46t83";

/**
 * Tiendas que SIGUEN con Fret.
 * Vacío desde el 24-sep-2026: todo va a Envios Now.
 * Los pedidos viejos que ya tienen FR- se siguen cerrando en Fret igual.
 */
export const TIENDAS_FRET_ACTIVAS = new Set<string>([]);

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
