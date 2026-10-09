export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { refreshMLToken } from "@/lib/integrations/mercadolibre";
import { claveCuentaML, integracionMLDelPedido } from "@/lib/integrations/ml-cuenta";

// El token es el de la CUENTA de ML de la que vino el pedido (una tienda puede tener varias).
async function getMLToken(order: { integrationId: string | null; storeId: string }): Promise<string | null> {
  const integration = await integracionMLDelPedido(order);
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
      integrationId: true,
      rawPayload: true,
    },
  });

  // Agrupar shipping IDs por CUENTA de ML (no por tienda): una tienda puede tener varias
  // cuentas y cada etiqueta solo se puede pedir con el token de su cuenta.
  const byCuenta = new Map<string, { ref: { integrationId: string | null; storeId: string }; ids: string[] }>();
  for (const order of orders) {
    const shippingId = (order.rawPayload as any)?.shipping?.id;
    if (!shippingId) continue;
    const clave = claveCuentaML(order);
    const grupo = byCuenta.get(clave) ?? { ref: order, ids: [] };
    grupo.ids.push(String(shippingId));
    byCuenta.set(clave, grupo);
  }

  // Descargar etiquetas por cuenta (ML permite hasta 50 por request)
  const pdfParts: ArrayBuffer[] = [];

  for (const { ref, ids: shippingIds } of byCuenta.values()) {
    const token = await getMLToken(ref);
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
