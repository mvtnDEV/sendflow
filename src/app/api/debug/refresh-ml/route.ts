export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";

export async function GET(req: NextRequest) {
  const store = req.nextUrl.searchParams.get("store") ?? "";

  const integration = await prisma.storeIntegration.findFirst({
    where: { platform: "MERCADOLIBRE", isActive: true, store: { name: store } },
    include: { store: { select: { name: true } } },
  });
  if (!integration) return NextResponse.json({ error: "no integration" });

  let refreshToken: string | null = null;
  try {
    const decrypted = decrypt(integration.apiKeyEnc);
    if (decrypted.includes("|")) {
      refreshToken = decrypted.split("|")[1];
    }
  } catch {}

  if (!refreshToken)
    return NextResponse.json({ error: "no refresh_token found" });

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

  const data = await res.json();
  if (!data.access_token) {
    return NextResponse.json({
      error: "refresh failed",
      status: res.status,
      detail: data,
    });
  }

  const newCredentials = `${data.access_token}|${data.refresh_token}`;
  await prisma.storeIntegration.update({
    where: { id: integration.id },
    data: {
      apiKeyEnc: encrypt(newCredentials),
      refreshToken: data.refresh_token,
      lastSyncAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    store: store,
    userId: data.user_id,
    tokenStart: data.access_token.substring(0, 15),
    expiresIn: data.expires_in,
  });
}
