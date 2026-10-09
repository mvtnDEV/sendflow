export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // nunca usar la caché de datos de Next con APIs externas (ML)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { encrypt } from "@/lib/utils/crypto";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const storeId = req.nextUrl.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(
      `${process.env.APP_URL}/integraciones?error=ml_no_code`,
    );
  }

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

    if (storeId) {
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
        return NextResponse.redirect(
          `${process.env.APP_URL}/integraciones?error=ml_en_otra_tienda&tienda=${tienda}`,
        );
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

    return NextResponse.redirect(
      `${process.env.APP_URL}/integraciones?success=ml`,
    );
  } catch (err) {
    console.error("[ML OAuth callback]", err);
    return NextResponse.redirect(
      `${process.env.APP_URL}/integraciones?error=ml_auth_failed`,
    );
  }
}
