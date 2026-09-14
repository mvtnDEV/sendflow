export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt } from "@/lib/utils/crypto";
import { refreshMLToken } from "@/lib/integrations/mercadolibre";
import { encrypt } from "@/lib/utils/crypto";

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

  // Test token
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      platform: true,
      rawPayload: true,
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: "Pedido no encontrado" },
      { status: 404 },
    );
  }

  if (order.platform !== "MERCADOLIBRE") {
    return NextResponse.json(
      { error: "Solo pedidos de MercadoLibre tienen etiqueta Flex" },
      { status: 400 },
    );
  }

  const shippingId = (order.rawPayload as any)?.shipping?.id;
  if (!shippingId) {
    return NextResponse.json(
      { error: "Pedido sin shipping ID" },
      { status: 400 },
    );
  }

  const token = await getMLToken(order.storeId);
  if (!token) {
    return NextResponse.json(
      { error: "Token ML no disponible" },
      { status: 401 },
    );
  }

  // ── Descargar etiqueta de ML ──
  // Formato ZPL (para impresoras térmicas)
  const zplRes = await fetch(
    `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shippingId}&response_type=zpl2`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  // Formato PDF (para impresoras normales)
  const pdfRes = await fetch(
    `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shippingId}&response_type=pdf`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!pdfRes.ok) {
    const err = await pdfRes.text();
    console.error("[Label Flex] Error:", order.orderNumber, pdfRes.status, err);
    return NextResponse.json(
      {
        error: "No se pudo obtener la etiqueta",
        status: pdfRes.status,
        detail: err.slice(0, 300),
      },
      { status: pdfRes.status },
    );
  }

  const pdfBuffer = await pdfRes.arrayBuffer();

  // Guardar URL de etiqueta en el pedido
  await prisma.order.update({
    where: { id: order.id },
    data: { labelUrl: `flex-label-${shippingId}` },
  });

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiqueta-flex-${order.orderNumber.replace("#", "")}.pdf"`,
    },
  });
}
