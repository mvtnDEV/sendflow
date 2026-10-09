export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // nunca usar la caché de datos de Next con APIs externas (ML)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { encrypt } from "@/lib/utils/crypto";
import { canAccessStore, canWrite, getSessionUser } from "@/lib/utils/auth";
import { COOKIE_ML_OAUTH, leerEstadoML, nonceCoincide } from "@/lib/integrations/ml-oauth-state";

export async function GET(req: NextRequest) {
  // Toda salida limpia la cookie del flujo: el código es de un solo uso.
  const volver = (query: string) => {
    const res = NextResponse.redirect(`${process.env.APP_URL}/integraciones?${query}`);
    res.cookies.set(COOKIE_ML_OAUTH, "", { path: "/api/auth/ml", maxAge: 0 });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return volver("error=ml_no_code");

  // Quién inició el flujo: el `state` trae la tienda y un código que tiene que coincidir
  // con el de la cookie (si no, el enlace lo armó un tercero), y el usuario con sesión
  // tiene que poder escribir en esa tienda. Esta ruta está fuera del filtro de sesión del
  // proyecto (/api/auth/*), por eso se comprueba acá y no en el middleware.
  const estado = leerEstadoML(req.nextUrl.searchParams.get("state"));
  const cookie = req.cookies.get(COOKIE_ML_OAUTH)?.value;
  if (!estado || !nonceCoincide(estado.nonce, cookie)) return volver("error=ml_estado_invalido");

  const user = await getSessionUser();
  if (!user || !canWrite(user) || !canAccessStore(user, estado.storeId)) {
    return volver("error=ml_sin_permiso");
  }
  const storeId = estado.storeId;

  try {
    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID!,
        client_secret: process.env.ML_CLIENT_SECRET!,
        code,
        redirect_uri: `${process.env.APP_URL}/api/auth/ml/callback`,
      }),
    });

    const tokens = await res.json();
    // Solo el estado: la respuesta trae access_token y refresh_token y no van al log.
    console.log("[ML callback] token response:", res.status, tokens.access_token ? "ok" : "sin access_token");
    if (!tokens.access_token) throw new Error("No access token");

    const userRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const mlUser = await userRes.json();
    if (!mlUser?.id) throw new Error("ML no devolvió el usuario");

    const mlId = String(mlUser.id);
    const etiqueta: string | null = mlUser.nickname ?? null;

    // Guardar como pipe: "accessToken|refreshToken" — mismo formato que lee el webhook
    const credentials = `${tokens.access_token}|${tokens.refresh_token}`;

    {
      // Una cuenta de ML no puede estar activa en dos tiendas a la vez: el webhook de ML
      // identifica la tienda por el ID de usuario, y con dos coincidencias el pedido
      // podría caer en la equivocada.
      const enOtraTienda = await prisma.storeIntegration.findFirst({
        where: {
          platform: "MERCADOLIBRE",
          externalStoreId: mlId,
          isActive: true,
          storeId: { not: storeId },
        },
        select: { store: { select: { name: true } } },
      });
      if (enOtraTienda) {
        const tienda = encodeURIComponent(enOtraTienda.store.name);
        return volver(`error=ml_en_otra_tienda&tienda=${tienda}`);
      }

      // Una tienda puede tener VARIAS cuentas de ML (se identifican por su ID de usuario).
      // Si esta cuenta ya estaba conectada acá se actualiza (reconexión); si no, se suma.
      // El segundo criterio recoge las filas anteriores a las cuentas múltiples, que
      // todavía no tienen accountKey.
      const existente = await prisma.storeIntegration.findFirst({
        where: {
          storeId,
          platform: "MERCADOLIBRE",
          OR: [{ accountKey: mlId }, { accountKey: "", externalStoreId: mlId }],
        },
        select: { id: true },
      });

      const datos = {
        apiKeyEnc: encrypt(credentials),
        refreshToken: tokens.refresh_token ?? null,
        externalStoreId: mlId,
        accountKey: mlId,
        accountLabel: etiqueta,
        isActive: true,
        lastSyncAt: new Date(),
      };

      if (existente) {
        await prisma.storeIntegration.update({ where: { id: existente.id }, data: datos });
      } else {
        await prisma.storeIntegration.create({
          data: { storeId, platform: "MERCADOLIBRE", ...datos },
        });
      }
    }

    return volver("success=ml");
  } catch (err) {
    console.error("[ML OAuth callback]", err);
    return volver("error=ml_auth_failed");
  }
}
