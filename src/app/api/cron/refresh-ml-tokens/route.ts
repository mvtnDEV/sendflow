export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integrations = await prisma.storeIntegration.findMany({
    where: { platform: "MERCADOLIBRE", isActive: true },
    include: { store: { select: { name: true } } },
  });

  const results: any[] = [];

  for (const int of integrations) {
    try {
      // Verificar si el token actual funciona
      const testRes = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${int.apiKeyEnc}` },
      });

      if (testRes.ok) {
        results.push({ store: int.store.name, status: "token_valido" });
        continue;
      }

      // Token expirado — intentar refresh
      const refreshToken = (int as any).refreshToken;
      if (!refreshToken) {
        console.warn(
          "[ML Refresh] ⚠️ Token expirado SIN refresh_token:",
          int.store.name,
        );
        results.push({ store: int.store.name, status: "expirado_sin_refresh" });
        continue;
      }

      const res = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: process.env.ML_APP_ID,
          client_secret: process.env.ML_APP_SECRET,
          refresh_token: refreshToken,
        }),
      });

      if (!res.ok) {
        console.error(
          "[ML Refresh] ❌ Error renovando:",
          int.store.name,
          res.status,
        );
        results.push({
          store: int.store.name,
          status: "error_refresh",
          code: res.status,
        });
        continue;
      }

      const data = await res.json();
      await prisma.storeIntegration.update({
        where: { id: int.id },
        data: {
          apiKeyEnc: data.access_token,
          lastSyncAt: new Date(),
        },
      });

      console.log("[ML Refresh] ✅ Token renovado:", int.store.name);
      results.push({ store: int.store.name, status: "renovado" });
    } catch (err: any) {
      results.push({
        store: int.store.name,
        status: "error",
        detail: err.message,
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
