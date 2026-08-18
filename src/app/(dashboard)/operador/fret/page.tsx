export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import RecepcionesClient from "@/app/(dashboard)/recepciones/client";

const TIENDAS_FRET = new Set([
  "cmpk7nslz0006r5e73du6f0kp", // Comercial Bess
  "cmouw44ej0004thpecq6bct35", // Eco pañal
  "cmpbfadyd00032vgl7klna40b", // Fire Master
  "cmouw23l60003thpe1q7f16r3", // Oasis verde
  "cmovurlze000018duer7sffp4", // Protec
  "cmouw5ay40009thpewq5n2868", // Umimori
]);

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
  const range = todayRange();

  const storeIds =
    searchParams.storeId && TIENDAS_FRET.has(searchParams.storeId)
      ? [searchParams.storeId]
      : Array.from(TIENDAS_FRET);

  const where: any = {
    storeId: { in: storeIds },
  };

  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.search) {
    where.OR = [
      { customerName: { contains: searchParams.search, mode: "insensitive" } },
      { orderNumber: { contains: searchParams.search, mode: "insensitive" } },
      { addressStreet: { contains: searchParams.search, mode: "insensitive" } },
    ];
  }
  if (todayOnly) {
    where.createdAt = range;
  } else if (searchParams.dateFrom || searchParams.dateTo) {
    where.createdAt = {
      ...(searchParams.dateFrom && { gte: new Date(searchParams.dateFrom) }),
      ...(searchParams.dateTo && {
        lte: new Date(searchParams.dateTo + "T23:59:59"),
      }),
    };
  }

  const [items, total, storesFret] = await Promise.all([
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
    prisma.store.findMany({
      where: { id: { in: Array.from(TIENDAS_FRET) } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
                border: "1px solid rgba(251,146,60,.2)",
              }}
            >
              Fret
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
            href="/operador/fret"
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
            href="/operador/fret?historial=1"
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
            Ver historial
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}
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
              placeholder="Cliente, N° pedido..."
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
            <option value="PENDING">Creado</option>
            <option value="RECEIVED">Recepcionado</option>
            <option value="IN_TRANSIT">En camino</option>
            <option value="DELIVERED">Entregado</option>
            <option value="INCIDENT">No entregado</option>
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
            }}
          >
            Filtrar
          </button>
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
