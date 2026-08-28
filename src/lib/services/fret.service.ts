const FRET_API_BASE =
  "https://bqdrjwyqptqdidyjumdv.supabase.co/functions/v1/merchant-api";

// ── Mapeo subStoreName → puntoRetiro para sub-tiendas de Senby ──
const SUBSTORENAME_TO_PUNTO_RETIRO: Record<string, string> = {
  "Tienda de Jacinta": "jacinta-tien",
  "Jacinta tienda": "jacinta-tien",
  Enviame: "more-amor",
  "ETN Meli": "elige-tu-num",
  "Colo Colo": "colo-colo",
  "More amor": "more-amor",
  "Elige tu numero": "elige-tu-num",
};

// ── Puntos de retiro que ya tienen pedidos en bodega (no requieren retiro) ──
const PUNTOS_EN_BODEGA = new Set(["sendby"]);

function getFretApiKey(): string {
  return process.env.FRET_API_KEY ?? "";
}

interface FretOrder {
  referencia: string;
  destinatario: string;
  telefono: string;
  direccion: string;
  comuna: string;
  qr_code?: string;
  bultos?: number;
  email?: string;
  referencia_direccion?: string;
  observaciones?: string;
  punto_retiro?: string;
  en_bodega?: boolean;
}

interface FretCreatedOrder {
  referencia: string;
  order_code: string;
  tracking_url: string;
  needs_review: boolean;
}

interface FretResult {
  ok: boolean;
  created: FretCreatedOrder[];
  duplicated: { referencia: string; order_code: string }[];
  rejected: { referencia: string; field: string; detail: string }[];
  error?: string;
}

export function toFretPayload(order: {
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  addressStreet: string;
  addressComuna: string;
  addressNotes: string | null;
  bultos: number;
  qrCode: string;
  sourceId: string | null;
  platform: string;
  puntoRetiroFret?: string | null;
  subStoreName?: string | null;
  rawPayload?: any;
}): FretOrder {
  const rawPhone = order.customerPhone?.replace(/\D/g, "") ?? "";
  const phone = rawPhone.startsWith("56")
    ? `+56${rawPhone.slice(2)}`
    : rawPhone.startsWith("9") && rawPhone.length === 9
      ? `+56${rawPhone}`
      : "+56912345678";

  // ── QR que escaneará el conductor de Fret ──
  // ML Flex: usa shipment_id (shipping.id).
  // Resto: usa qrCode interno de Moovex (mn_XXXXXXXX).
  const shippingId = (order.rawPayload as any)?.shipping?.id;
  const qr_code =
    order.platform === "MERCADOLIBRE"
      ? shippingId
        ? String(shippingId)
        : (order.sourceId ?? order.qrCode)
      : order.qrCode;

  // ── Punto de retiro ──
  // Prioridad: puntoRetiroFret de la tienda > subStoreName mapping
  // Senby siempre usa 'sendby' porque tiene puntoRetiroFret seteado.
  const punto_retiro =
    order.puntoRetiroFret ||
    (order.subStoreName && SUBSTORENAME_TO_PUNTO_RETIRO[order.subStoreName]) ||
    undefined;

  // ── en_bodega: true para puntos que ya tienen los pedidos en bodega ──
  const esBodega = !!(punto_retiro && PUNTOS_EN_BODEGA.has(punto_retiro));

  return {
    referencia: order.orderNumber.replace("#", ""),
    destinatario: order.customerName,
    telefono: phone,
    direccion: order.addressStreet,
    comuna: order.addressComuna,
    ...(order.bultos === 1 && qr_code ? { qr_code } : {}),
    bultos: order.bultos,
    ...(punto_retiro && { punto_retiro }),
    ...(esBodega && { en_bodega: true }),
    ...(order.customerEmail && { email: order.customerEmail }),
    ...(order.addressNotes && { referencia_direccion: order.addressNotes }),
  };
}

export async function createFretOrders(
  orders: FretOrder[],
  timeoutMs: number = 15_000,
): Promise<FretResult> {
  try {
    console.log("[Fret] Creando", orders.length, "órdenes");

    const res = await fetch(`${FRET_API_BASE}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getFretApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orders }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const data = await res.json();
    console.log(
      "[Fret] Status:",
      res.status,
      "| Respuesta:",
      JSON.stringify(data).slice(0, 500),
    );

    if (!res.ok) {
      return {
        ok: false,
        created: [],
        duplicated: [],
        rejected: [],
        error: data.detail ?? data.error ?? "Error Fret",
      };
    }

    return {
      ok: true,
      created: data.created ?? [],
      duplicated: data.duplicated ?? [],
      rejected: data.rejected ?? [],
    };
  } catch (err: any) {
    console.error("[Fret] Error de conexión:", err);
    return {
      ok: false,
      created: [],
      duplicated: [],
      rejected: [],
      error: err.message,
    };
  }
}

// ── Notificar a Fret que Flex cerró la entrega ──
export async function notificarEntregaAFret(params: {
  referencia: string;
  shipmentId?: string | null;
  fecha: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const { referencia, shipmentId, fecha, timeoutMs = 8_000 } = params;

  try {
    const res = await fetch(`${FRET_API_BASE}/orders/${referencia}/status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getFretApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "delivered",
        fecha,
        ...(shipmentId && { shipment_id: String(shipmentId) }),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const bodyText = await res.text().catch(() => "");
    console.log(
      "[Fret notify] referencia:",
      referencia,
      "| status:",
      res.status,
      "| resp:",
      bodyText.slice(0, 300),
    );

    if (!res.ok) {
      return { ok: false, status: res.status, error: bodyText.slice(0, 300) };
    }
    return { ok: true, status: res.status };
  } catch (err: any) {
    console.error("[Fret notify] Error de conexión:", referencia, err.message);
    return { ok: false, error: err.message };
  }
}
