export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/utils/auth";
import { listOrders } from "@/lib/services/order.service";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import RecepcionesClient from "@/app/(dashboard)/recepciones/client";

const SENBY_STORE_ID = "cmpanvuns000053f2gbs46t83";
const TIENDAS_FRET = new Set([
  "cmpk7nslz0006r5e73du6f0kp",
  "cmouw44ej0004thpecq6bct35",
  "cmpbfadyd00032vgl7klna40b",
  "cmouw23l60003thpe1q7f16r3",
  "cmovurlze000018duer7sffp4",
  "cmouw5ay40009thpewq5n2868",
]);

const TZ = "America/Santiago";

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

export default async function NowPage({ searchParams }: Props) {
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

  // ── Tiendas que van a Now = todas excepto Fret y Senby ──
  const todasLasTiendas = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const tiendaNow = todasLasTiendas
    .filter((s) => !TIENDAS_FRET.has(s.id))
    .map((s) => s.id);

  const filterStore =
    searchParams.storeId && tiendaNow.includes(searchParams.storeId)
      ? searchParams.storeId
      : undefined;

  const result = await listOrders({
    storeId: filterStore,
    status: searchParams.status,
    search: searchParams.search,
    platform: searchParams.platform,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    todayOnly,
    page,
    pageSize,
    superAdminView: true,
  });

  // Filtrar solo pedidos de tiendas Now
  const itemsNow = (result.items as any[]).filter((o) =>
    tiendaNow.includes(o.store?.id ?? ""),
  );

  const storesNow = todasLasTiendas.filter((s) => !TIENDAS_FRET.has(s.id));

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
                ? "Now — Hoy"
                : verTodo
                  ? "Now — Historial"
                  : "Now — Filtrado"}
            </h1>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                background: "rgba(34,197,94,.1)",
                color: "#16A34A",
                fontWeight: 600,
                border: "1px solid rgba(34,197,94,.2)",
              }}
            >
              EnviosNow
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            {todayOnly
              ? `${todayStr} · ${itemsNow.length} pedido${itemsNow.length !== 1 ? "s" : ""}`
              : `${result.total} pedido${result.total !== 1 ? "s" : ""} encontrados`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link
            href="/operador/now"
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
            href="/operador/now?historial=1"
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
            <option value="">Todas las tiendas Now</option>
            {storesNow.map((s) => (
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
              background: "#16A34A",
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
        orders={itemsNow}
        storeName="now"
        todayOnly={todayOnly}
        total={itemsNow.length}
        page={page}
        totalPages={Math.ceil(itemsNow.length / pageSize)}
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
