export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import RecepcionesClient from "../recepciones/client";

// ── Las 6 tiendas que operan con Fret ──
const TIENDAS_FRET: Record<string, string> = {
  cmpk7nslz0006r5e73du6f0kp: "Comercial Bess",
  cmouw44ej0004thpecq6bct35: "Eco pañal",
  cmpbfadyd00032vgl7klna40b: "Fire Master",
  cmouw23l60003thpe1q7f16r3: "Oasis verde",
  cmovurlze000018duer7sffp4: "Protec",
  cmouw5ay40009thpewq5n2868: "Umimori",
};
const IDS_FRET = Object.keys(TIENDAS_FRET);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Creado",
  RECEIVED: "Recepcionado",
  IN_TRANSIT: "En camino",
  DELIVERED: "Entregado",
  INCIDENT: "No entregado",
};
const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY: "Shopify",
  MERCADOLIBRE: "ML Flex",
  WOOCOMMERCE: "WooCommerce",
  JUMPSELLER: "Jumpseller",
  MANUAL: "Manual",
};

const TZ = "America/Santiago";

function todayRange() {
  const now = new Date();
  const santiagoParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = santiagoParts.find((p) => p.type === "year")!.value;
  const month = santiagoParts.find((p) => p.type === "month")!.value;
  const day = santiagoParts.find((p) => p.type === "day")!.value;
  const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const santiagoDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Santiago" }),
  );
  const offsetMs = santiagoDate.getTime() - utcDate.getTime();
  const offsetHours = offsetMs / (1000 * 60 * 60);
  const sign = offsetHours >= 0 ? "+" : "-";
  const absHours = Math.abs(offsetHours);
  const offsetStr = `${sign}${String(Math.floor(absHours)).padStart(2, "0")}:00`;
  return {
    gte: new Date(`${year}-${month}-${day}T00:00:00${offsetStr}`),
    lte: new Date(`${year}-${month}-${day}T23:59:59${offsetStr}`),
  };
}

interface Props {
  searchParams: {
    status?: string;
    search?: string;
    platform?: string;
    dateFrom?: string;
    dateTo?: string;
    historial?: string;
    page?: string;
    storeId?: string;
    pageSize?: string;
  };
}

export default async function FretPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") redirect("/recepciones");

  const page = Number(searchParams.page ?? 1);
  const pageSize = Number(searchParams.pageSize ?? 50);
  const verTodo = searchParams.historial === "1";
  const todayOnly = !verTodo && !searchParams.dateFrom && !searchParams.dateTo;
  const today = new Date();
  const todayStr = today.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });

  // ── Filtro de tienda (solo dentro de las Fret) ──
  const storeFilter =
    searchParams.storeId && IDS_FRET.includes(searchParams.storeId)
      ? [searchParams.storeId]
      : IDS_FRET;

  const where: any = { storeId: { in: storeFilter } };

  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.platform) where.platform = searchParams.platform;
  if (searchParams.search) {
    where.OR = [
      { customerName: { contains: searchParams.search, mode: "insensitive" } },
      { orderNumber: { contains: searchParams.search, mode: "insensitive" } },
      { addressStreet: { contains: searchParams.search, mode: "insensitive" } },
      { externalId: { contains: searchParams.search } },
    ];
  }
  if (todayOnly) {
    where.createdAt = todayRange();
  } else if (searchParams.dateFrom || searchParams.dateTo) {
    where.createdAt = {
      ...(searchParams.dateFrom && { gte: new Date(searchParams.dateFrom) }),
      ...(searchParams.dateTo && {
        lte: new Date(searchParams.dateTo + "T23:59:59"),
      }),
    };
  }

  // ── Datos: pedidos + conteo + stats por estado ──
  const [items, total, byStatus, storesFret] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        platform: true,
        status: true,
        customerName: true,
        customerPhone: true,
        addressStreet: true,
        addressComuna: true,
        bultos: true,
        sourceId: true,
        subStoreName: true,
        createdAt: true,
        evidencePhoto1: true,
        labelUrl: true,
        mlShippedAt: true,
        rawPayload: true,
        externalId: true,
        store: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.store.findMany({
      where: { id: { in: IDS_FRET } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // ── Stats ──
  const countMap: Record<string, number> = {};
  byStatus.forEach((s) => {
    countMap[s.status] = s._count._all;
  });
  const stats = {
    total: total,
    pending: countMap["PENDING"] ?? 0,
    received: countMap["RECEIVED"] ?? 0,
    inTransit: countMap["IN_TRANSIT"] ?? 0,
    delivered: countMap["DELIVERED"] ?? 0,
    incident: countMap["INCIDENT"] ?? 0,
  };
  const pct = (n: number) =>
    stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 500 }}>
              {todayOnly
                ? "Fret — Hoy"
                : verTodo
                  ? "Fret — Historial"
                  : "Fret — Filtrado"}
            </h1>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                background: "rgba(251,146,60,.1)",
                color: "#EA580C",
                fontWeight: 600,
                border: "1px solid rgba(251,146,60,.25)",
              }}
            >
              FRET
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            {todayOnly
              ? `${todayStr} · ${total} pedido${total !== 1 ? "s" : ""}`
              : `${total} pedido${total !== 1 ? "s" : ""} encontrados`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link
            href="/fret"
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              textDecoration: "none",
              background: todayOnly ? "#0B1628" : "white",
              color: todayOnly ? "white" : "#6B7280",
              border: `1px solid ${todayOnly ? "#0B1628" : "#E2E8F0"}`,
            }}
          >
            Hoy
          </Link>
          <Link
            href="/fret?historial=1"
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              textDecoration: "none",
              background: verTodo ? "#0B1628" : "white",
              color: verTodo ? "white" : "#6B7280",
              border: `1px solid ${verTodo ? "#0B1628" : "#E2E8F0"}`,
            }}
          >
            Ver historial completo
          </Link>
        </div>
      </div>

      {/* Stat bar */}
      <div
        style={{
          background: "#0B1628",
          borderRadius: 12,
          padding: "14px 20px",
          display: "flex",
          marginBottom: 16,
          overflowX: "auto",
        }}
      >
        {[
          { label: "Total", value: stats.total, ring: null, color: "" },
          { label: "Creados", value: stats.pending, ring: null, color: "" },
          {
            label: "Recepcionados",
            value: stats.received,
            ring: pct(stats.received),
            color: "#F59E0B",
          },
          {
            label: "En camino",
            value: stats.inTransit,
            ring: pct(stats.inTransit),
            color: "#3B82F6",
          },
          {
            label: "Entregados",
            value: stats.delivered,
            ring: pct(stats.delivered),
            color: "#38BDF8",
          },
          {
            label: "No entregados",
            value: stats.incident,
            ring: null,
            color: "",
          },
        ].map((s, i, arr) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              padding: "0 14px",
              borderRight:
                i < arr.length - 1 ? "1px solid rgba(255,255,255,.08)" : "none",
              minWidth: 80,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,.4)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: 3,
              }}
            >
              {s.label}
            </div>
            {s.ring !== null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="32" height="32" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="rgba(255,255,255,.1)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke={s.color}
                    strokeWidth="3"
                    strokeDasharray={`${s.ring} ${100 - s.ring}`}
                    strokeDashoffset="25"
                    strokeLinecap="round"
                  />
                  <text
                    x="18"
                    y="22"
                    textAnchor="middle"
                    fill="white"
                    fontSize="9"
                    fontWeight="500"
                  >
                    {s.ring}%
                  </text>
                </svg>
                <span style={{ fontSize: 20, fontWeight: 500, color: "white" }}>
                  {s.value}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 20, fontWeight: 500, color: "white" }}>
                {s.value}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <form
          method="GET"
          style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}
        >
          {verTodo && <input type="hidden" name="historial" value="1" />}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "white",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              padding: "7px 12px",
              flex: 1,
              minWidth: 200,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="#9CA3AF">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
            </svg>
            <input
              name="search"
              defaultValue={searchParams.search}
              placeholder="Cliente, N° pedido, código Fret..."
              style={{
                border: "none",
                outline: "none",
                fontSize: 13,
                flex: 1,
                fontFamily: "inherit",
              }}
            />
          </div>
          <select
            name="storeId"
            defaultValue={searchParams.storeId ?? ""}
            style={{
              padding: "7px 10px",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              fontSize: 13,
              background: "white",
              fontFamily: "inherit",
            }}
          >
            <option value="">Todas las tiendas Fret</option>
            {storesFret.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={searchParams.status ?? ""}
            style={{
              padding: "7px 10px",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              fontSize: 13,
              background: "white",
              fontFamily: "inherit",
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            name="platform"
            defaultValue={searchParams.platform ?? ""}
            style={{
              padding: "7px 10px",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              fontSize: 13,
              background: "white",
              fontFamily: "inherit",
            }}
          >
            <option value="">Todas las plataformas</option>
            {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            name="pageSize"
            defaultValue={String(pageSize)}
            style={{
              padding: "7px 10px",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              fontSize: 13,
              background: "white",
              fontFamily: "inherit",
            }}
          >
            <option value="25">25 por página</option>
            <option value="50">50 por página</option>
            <option value="100">100 por página</option>
            <option value="200">200 por página</option>
          </select>
          {verTodo && (
            <>
              <input
                type="date"
                name="dateFrom"
                defaultValue={searchParams.dateFrom}
                style={{
                  padding: "7px 10px",
                  border: "1px solid #E2E8F0",
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              />
              <input
                type="date"
                name="dateTo"
                defaultValue={searchParams.dateTo}
                style={{
                  padding: "7px 10px",
                  border: "1px solid #E2E8F0",
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              />
            </>
          )}
          <button
            type="submit"
            style={{
              padding: "7px 14px",
              background: "#EA580C",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Filtrar
          </button>
          {(searchParams.search ||
            searchParams.status ||
            searchParams.platform ||
            searchParams.dateFrom ||
            searchParams.storeId) && (
            <Link
              href={verTodo ? "/fret?historial=1" : "/fret"}
              style={{
                padding: "7px 12px",
                border: "1px solid #FECDD3",
                borderRadius: 8,
                fontSize: 13,
                background: "#FFF1F2",
                color: "#9F1239",
                textDecoration: "none",
              }}
            >
              × Limpiar
            </Link>
          )}
        </form>
      </div>

      <RecepcionesClient
        orders={items as any}
        storeName="fret"
        todayOnly={todayOnly}
        total={total}
        page={page}
        totalPages={Math.ceil(total / pageSize)}
        userRole={user.role}
        userStoreId={undefined}
        searchParams={{
          historial: searchParams.historial,
          storeId: searchParams.storeId,
          status: searchParams.status,
          search: searchParams.search,
          platform: searchParams.platform,
          dateFrom: searchParams.dateFrom,
          dateTo: searchParams.dateTo,
          pageSize: String(pageSize),
        }}
      />
    </div>
  );
}
