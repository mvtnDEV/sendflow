export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt } from "@/lib/utils/crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const store = url.searchParams.get("store") ?? "";

  const integration = await prisma.storeIntegration.findFirst({
    where: { platform: "MERCADOLIBRE", isActive: true, store: { name: store } },
    include: { store: { select: { name: true } } },
  });

  if (!integration) return NextResponse.json({ error: "no integration" });

  let token: string;
  try {
    token = decrypt(integration.apiKeyEnc);
  } catch (e: any) {
    return NextResponse.json({ error: "decrypt failed", detail: e.message });
  }

  const res = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  return NextResponse.json({
    store: store,
    tokenStart: token.substring(0, 20),
    tokenEnd: token.slice(-20),
    mlStatus: res.status,
    mlUserId: data.id ?? null,
    mlNickname: data.nickname ?? null,
    mlError: data.message ?? null,
  });
}
