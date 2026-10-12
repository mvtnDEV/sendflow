// Estados de Envios Now → estado de SendFlow.
// Now manda los estados en español en el webhook, pero su reporte/API también usa
// los equivalentes en inglés; se aceptan ambos y se ignoran mayúsculas, espacios y tildes.
const ESTADOS_NOW: Record<string, string> = {
  entregado: "DELIVERED",
  delivered: "DELIVERED",
  cancelado: "CANCELLED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  pendiente: "INCIDENT",
  "no entregado": "INCIDENT",
  not_delivered: "INCIDENT",
  fallido: "INCIDENT",
  failed: "INCIDENT",
};

export function estadoDesdeNow(state: unknown): string | undefined {
  const clave = String(state ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  return ESTADOS_NOW[clave];
}
