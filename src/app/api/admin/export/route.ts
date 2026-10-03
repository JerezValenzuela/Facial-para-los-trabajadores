import { NextResponse } from "next/server";
import { getAdminCheck } from "@/lib/auth";
import { parseReportFilters } from "@/lib/attendance/filters";
import { loadReport } from "@/lib/attendance/report-data";
import { buildAttendanceWorkbook } from "@/lib/attendance/excel";
import { logError } from "@/lib/log";

/** Descarga Excel del reporte (solo admin; mismos filtros que la tabla). */
export async function GET(req: Request) {
  const check = await getAdminCheck();
  if (check.status !== "ok") {
    return NextResponse.json({ ok: false, message: "No autorizado." }, { status: 401 });
  }
  try {
    const filters = parseReportFilters(new URL(req.url).searchParams);
    const report = await loadReport(check.session.supabase, filters);
    const xlsx = await buildAttendanceWorkbook(report, filters);
    const name = `asistencia_${filters.from}_a_${filters.to}.xlsx`;
    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logError("excel", e);
    return NextResponse.json({ ok: false, message: "No se pudo generar el Excel." }, { status: 500 });
  }
}
