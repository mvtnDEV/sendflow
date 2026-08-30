export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { clasificarZona } from "@/lib/utils/zonas";
import { costoPorBulto, operadorDe, type Operador } from "@/lib/config/tarifas-operador";

const TZ = "America/Santiago";
const IVA_RATE = 0.19;

function getChileOffsetStr(): string {
  const now = new Date();
  const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const santiagoDate = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const offsetMs = santiagoDate.getTime() - utcDate.getTime();
  const offsetHours = offsetMs / (1000 * 60 * 60);
  const sign = offsetHours >= 0 ? "+" : "-";
  return `${sign}${String(Math.abs(offsetHours)).padStart(2, "0")}:00`;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );
  }

  const { searchParams } = req.nextUrl;
  const storeId = searchParams.get("storeId") || undefined;
  const mes = searchParams.get("mes");

  if (!mes) {
    return NextResponse.json(
      { ok: false, error: "Parámetro mes requerido (YYYY-MM)" },
      { status: 400 },
    );
  }

  const [year, month] = mes.split("-").map(Number);
  const off = getChileOffsetStr();
  const start = new Date(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00${off}`,
  );
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59${off}`,
  );

  const storeWhere: any = { isActive: true };
  if (storeId) storeWhere.id = storeId;

  const stores = await prisma.store.findMany({
    where: storeWhere,
    select: {
      id: true,
      name: true,
      rut: true,
      encargado: true,
      tarifaUrbana: true,
      tarifaExtraUrbana: true,
      tarifaRural: true,
      tarifaRetiro: true,
      fechaTarifa: true,
    },
  });

  const result = await Promise.all(
    stores.map(async (store) => {
      // ── Traer pedidos con receivedAt O inTransitAt dentro del mes ──
      // La fecha efectiva de facturación es receivedAt (con fallback a inTransitAt).
      const orders = await prisma.order.findMany({
        where: {
          storeId: store.id,
          status: { in: ["RECEIVED", "IN_TRANSIT", "DELIVERED", "INCIDENT"] },
          OR: [
            { receivedAt: { gte: start, lte: endDate } },
            {
              AND: [
                { receivedAt: null },
                { inTransitAt: { gte: start, lte: endDate } },
              ],
            },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          addressStreet: true,
          addressComuna: true,
          addressRegion: true,
          inTransitAt: true,
          deliveredAt: true,
          receivedAt: true,
          status: true,
          bultos: true,
          platform: true,
          externalId: true,
          operator: true,
        },
      });

      // ── Fecha efectiva de facturación: receivedAt || inTransitAt ──
      const ordersEnPeriodo = orders
        .map((o) => ({ ...o, fechaFacturacion: o.receivedAt ?? o.inTransitAt }))
        .filter((o) => o.fechaFacturacion) // seguridad: descartar los sin ninguna fecha
        .sort(
          (a, b) =>
            new Date(a.fechaFacturacion!).getTime() -
            new Date(b.fechaFacturacion!).getTime(),
        );

      const tarifaUrbana = store.tarifaUrbana ? Number(store.tarifaUrbana) : 0;
      const tarifaExtraUrbana = store.tarifaExtraUrbana
        ? Number(store.tarifaExtraUrbana)
        : 0;
      const tarifaRural = store.tarifaRural ? Number(store.tarifaRural) : 0;

      const ordersConZona = ordersEnPeriodo.map((o) => {
        const zona = clasificarZona(o.addressComuna);
        const tarifa =
          zona === "RURAL"
            ? tarifaRural
            : zona === "EXTRA_URBANA"
              ? tarifaExtraUrbana
              : tarifaUrbana;

        // ── Costo del operador y margen. Se cobra POR BULTO, y la tarifa la
        //    define la zona (misma logica para el precio y para el costo).
        const operador = operadorDe(o.operator, o.externalId);
        const costoUnit = costoPorBulto(operador, zona);
        const bultos = o.bultos ?? 1;

        // null = todavia no conocemos la tarifa de ese operador (hoy, Fret).
        // Se deja en null y no en 0 para no inflar el margen con un costo falso.
        const precio = tarifa * bultos;
        const costo = costoUnit === null ? null : costoUnit * bultos;
        const margen = costo === null ? null : precio - costo;

        return {
          ...o,
          zona,
          tarifa,
          storeName: store.name,
          operador,
          costoUnit,
          precio,
          costo,
          margen,
        };
      });

      // ── Desglose por operador y zona: la tabla que se muestra en pantalla ──
      const claves = new Map<string, { operador: Operador; zona: "URBANA" | "EXTRA_URBANA" | "RURAL" }>();
      ordersConZona.forEach((o) =>
        claves.set(o.operador + "|" + o.zona, { operador: o.operador, zona: o.zona }),
      );

      const desglose = [...claves.values()]
        .map(({ operador, zona }) => {
          const filas = ordersConZona.filter(
            (o) => o.operador === operador && o.zona === zona,
          );
          const bultos = filas.reduce((a, o) => a + (o.bultos ?? 1), 0);
          const ingreso = filas.reduce((a, o) => a + o.precio, 0);
          const sinTarifa = filas.some((o) => o.costo === null);
          const costo = sinTarifa ? null : filas.reduce((a, o) => a + (o.costo ?? 0), 0);
          return {
            operador,
            zona,
            pedidos: filas.length,
            bultos,
            tarifaMoovex: filas[0]?.tarifa ?? 0,
            tarifaOperador: filas[0]?.costoUnit ?? null,
            ingreso,
            costo,
            margen: costo === null ? null : ingreso - costo,
          };
        })
        .sort((a, b) =>
          a.operador === b.operador
            ? a.zona.localeCompare(b.zona)
            : a.operador.localeCompare(b.operador),
        );

      const conCosto = ordersConZona.filter((o) => o.costo !== null);
      const resumenMargen = {
        ingresoNeto: ordersConZona.reduce((a, o) => a + o.precio, 0),
        costoNeto: conCosto.reduce((a, o) => a + (o.costo ?? 0), 0),
        margenNeto: conCosto.reduce((a, o) => a + (o.margen ?? 0), 0),
        bultos: ordersConZona.reduce((a, o) => a + (o.bultos ?? 1), 0),
        pedidosConCosto: conCosto.length,
        // Pedidos cuyo operador todavia no tiene tarifa cargada.
        pedidosSinCosto: ordersConZona.length - conCosto.length,
        desglose,
      };

      function zonaResumen(
        zona: "URBANA" | "EXTRA_URBANA" | "RURAL",
        tarifa: number,
      ) {
        const cantidad = ordersConZona.filter((o) => o.zona === zona).length;
        const subtotalNeto = cantidad * tarifa;
        const iva = Math.round(subtotalNeto * IVA_RATE);
        const totalConIva = subtotalNeto + iva;
        return { cantidad, tarifa, subtotalNeto, iva, totalConIva };
      }

      const resumenZonas = {
        URBANA: zonaResumen("URBANA", tarifaUrbana),
        EXTRA_URBANA: zonaResumen("EXTRA_URBANA", tarifaExtraUrbana),
        RURAL: zonaResumen("RURAL", tarifaRural),
      };

      const netoGeneral =
        resumenZonas.URBANA.subtotalNeto +
        resumenZonas.EXTRA_URBANA.subtotalNeto +
        resumenZonas.RURAL.subtotalNeto;
      const ivaGeneral = Math.round(netoGeneral * IVA_RATE);
      const totalGeneralConIva = netoGeneral + ivaGeneral;

      return {
        store: {
          id: store.id,
          name: store.name,
          rut: store.rut,
          encargado: store.encargado,
          tarifaUrbana: store.tarifaUrbana ? Number(store.tarifaUrbana) : null,
          tarifaExtraUrbana: store.tarifaExtraUrbana
            ? Number(store.tarifaExtraUrbana)
            : null,
          tarifaRural: store.tarifaRural ? Number(store.tarifaRural) : null,
          tarifaRetiro: store.tarifaRetiro ? Number(store.tarifaRetiro) : null,
          fechaTarifa: store.fechaTarifa,
        },
        orders: ordersConZona,
        total: ordersConZona.length,
        resumenZonas,
        resumenMargen,
        netoGeneral,
        ivaGeneral,
        totalGeneralConIva,
        totalGeneral: netoGeneral,
      };
    }),
  );

  return NextResponse.json({ ok: true, data: result });
}
