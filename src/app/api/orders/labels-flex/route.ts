export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { refreshMLToken } from "@/lib/integrations/mercadolibre";

async function getMLToken(storeId: string): Promise<string | null> {
  const integration = await prisma.storeIntegration.findFirst({
    where: { storeId, platform: "MERCADOLIBRE", isActive: true },
  });
  if (!integration) return null;

  const creds = decrypt(integration.apiKeyEnc);
  let accessToken: string;
  let refreshToken: string;

  if (creds.includes("|")) {
    [accessToken, refreshToken] = creds.split("|");
  } else {
    accessToken = creds;
    refreshToken = "";
  }

  const test = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (test.status === 401 || test.status === 403) {
    if (!refreshToken) return null;
    try {
      const refreshed = await refreshMLToken(refreshToken);
      await prisma.storeIntegration.update({
        where: { id: integration.id },
        data: {
          apiKeyEnc: encrypt(
            `${refreshed.accessToken}|${refreshed.refreshToken}`,
          ),
          refreshToken: refreshed.refreshToken,
          lastSyncAt: new Date(),
        },
      });
      return refreshed.accessToken;
    } catch {
      return null;
    }
  }

  return accessToken;
}

export async function POST(req: NextRequest) {
  const { orderIds } = await req.json();

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "orderIds requerido" }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds }, platform: "MERCADOLIBRE" },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      rawPayload: true,
    },
  });

  // Agrupar shipping IDs por tienda
  const byStore = new Map<string, string[]>();
  for (const order of orders) {
    const shippingId = (order.rawPayload as any)?.shipping?.id;
    if (!shippingId) continue;
    const ids = byStore.get(order.storeId) ?? [];
    ids.push(String(shippingId));
    byStore.set(order.storeId, ids);
  }

  // Descargar etiquetas por tienda (ML permite hasta 50 por request)
  const pdfParts: ArrayBuffer[] = [];

  for (const [storeId, shippingIds] of byStore) {
    const token = await getMLToken(storeId);
    if (!token) continue;

    // ML acepta múltiples shipping IDs separados por coma
    const uniqueIds = [...new Set(shippingIds)];
    const batchSize = 50;

    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize);
      const res = await fetch(
        `https://api.mercadolibre.com/shipment_labels?shipment_ids=${batch.join(",")}&response_type=pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        pdfParts.push(await res.arrayBuffer());
      } else {
        console.error("[Labels Flex] Error batch:", res.status);
      }
    }
  }

  if (pdfParts.length === 0) {
    return NextResponse.json(
      { error: "No se pudieron obtener etiquetas" },
      { status: 400 },
    );
  }

  // Si hay un solo PDF, devolverlo directo
  if (pdfParts.length === 1) {
    return new NextResponse(pdfParts[0], {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etiquetas-flex.pdf"`,
      },
    });
  }

  // Si hay múltiples, devolver el primero (los PDFs de ML ya vienen con múltiples páginas)
  return new NextResponse(pdfParts[0], {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiquetas-flex.pdf"`,
    },
  });
}
