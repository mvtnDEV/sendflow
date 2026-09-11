export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";

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
      // ── Desencriptar y extraer access_token ──
      let accessToken: string;
      let refreshToken: string | null = int.refreshToken ?? null;

      try {
        const decrypted = decrypt(int.apiKeyEnc);
        if (decrypted.includes("|")) {
          accessToken = decrypted.split("|")[0];
          if (!refreshToken) refreshToken = decrypted.split("|")[1] ?? null;
        } else {
          accessToken = decrypted;
        }
      } catch {
        accessToken = int.apiKeyEnc;
      }

      // ── Verificar si el token actual funciona ──
      const testRes = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (testRes.ok) {
        results.push({ store: int.store.name, status: "token_valido" });
        continue;
      }

      // ── Token expirado — intentar refresh ──
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
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.ML_CLIENT_ID!,
          client_secret: process.env.ML_CLIENT_SECRET!,
          refresh_token: refreshToken,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(
          "[ML Refresh] ❌ Error renovando:",
          int.store.name,
          res.status,
          err,
        );
        results.push({
          store: int.store.name,
          status: "error_refresh",
          code: res.status,
        });
        continue;
      }

      const data = await res.json();
      const newCredentials = `${data.access_token}|${data.refresh_token}`;

      await prisma.storeIntegration.update({
        where: { id: int.id },
        data: {
          apiKeyEnc: encrypt(newCredentials),
          refreshToken: data.refresh_token ?? refreshToken,
          lastSyncAt: new Date(),
        },
      });

      console.log("[ML Refresh] ✅ Token renovado:", int.store.name);
      results.push({ store: int.store.name, status: "renovado" });
    } catch (err: any) {
      console.error("[ML Refresh] Error:", int.store.name, err.message);
      results.push({
        store: int.store.name,
        status: "error",
        detail: err.message,
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
