import { prisma } from "@/lib/db/prisma";
import type { StoreIntegration } from "@prisma/client";

/**
 * Una tienda puede tener VARIAS cuentas de Mercado Libre (ej: Comercial Bess tiene dos
 * cuentas Flex y se factura todo bajo una sola tienda). Cada pedido de ML guarda la
 * integración de la que vino (`order.integrationId`), y es esa la que tiene que dar el
 * token: un token de la cuenta A no puede ver los envíos de la cuenta B.
 *
 * Si el pedido no trae integración (pedidos manuales, o su cuenta se desconectó), se
 * cae a la primera cuenta activa de la tienda, que es lo que se hacía antes de existir
 * las cuentas múltiples.
 */
export async function integracionMLDelPedido(order: {
  integrationId: string | null;
  storeId: string;
}): Promise<StoreIntegration | null> {
  if (order.integrationId) {
    const propia = await prisma.storeIntegration.findFirst({
      where: { id: order.integrationId, platform: "MERCADOLIBRE", isActive: true },
    });
    if (propia) return propia;
  }
  return prisma.storeIntegration.findFirst({
    where: { storeId: order.storeId, platform: "MERCADOLIBRE", isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Clave de agrupación para cachear tokens: una por cuenta, no por tienda. */
export const claveCuentaML = (order: { integrationId: string | null; storeId: string }) =>
  order.integrationId ?? `tienda:${order.storeId}`;
