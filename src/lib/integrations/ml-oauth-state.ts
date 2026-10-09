import { randomBytes, timingSafeEqual } from "node:crypto";

/*
  Protección del flujo de conexión con Mercado Libre contra CSRF.

  Sin esto, el callback confiaba en que `state` fuera un ID de tienda cualquiera: quien
  conociera el ID de una tienda podía armar un enlace para vincular SU cuenta de ML a
  ella. Ahora `state` lleva el ID de la tienda MÁS un código aleatorio de un solo uso,
  y ese mismo código viaja en una cookie httpOnly. Solo quien inició el flujo desde su
  navegador (con sesión) tiene las dos cosas, y un enlace armado por un tercero no trae
  la cookie.
*/

export const COOKIE_ML_OAUTH = "ml_oauth";
export const COOKIE_ML_OAUTH_MAX_AGE = 10 * 60; // segundos: lo que tarda en autorizar en ML

/** Los IDs de tienda son cuid (letras y números), así que el punto no puede aparecer en ellos. */
export function crearEstadoML(storeId: string): { state: string; nonce: string } {
  const nonce = randomBytes(24).toString("base64url");
  return { state: `${storeId}.${nonce}`, nonce };
}

export function leerEstadoML(state: string | null): { storeId: string; nonce: string } | null {
  if (!state) return null;
  const partes = state.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  return { storeId: partes[0], nonce: partes[1] };
}

/** Comparación en tiempo constante del código del `state` con el de la cookie. */
export function nonceCoincide(delState: string, deCookie: string | undefined): boolean {
  if (!deCookie) return false;
  const a = Buffer.from(delState);
  const b = Buffer.from(deCookie);
  return a.length === b.length && timingSafeEqual(a, b);
}
