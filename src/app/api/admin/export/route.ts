import { NextResponse } from "next/server";
import { getAdminCheck } from "@/lib/auth";
import { parseReportFilters } from "@/lib/attendance/filters";
import { loadReport } from "@/lib/attendance/report-data";
import { buildAttendanceWorkbook } from "@/lib/attendance/excel";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET } from "@/lib/evidence";
import { logError } from "@/lib/log";

/** Con muchas fotos el Excel tarda más en armarse. */
export const maxDuration = 60;

/** Máximo de fotos por archivo (≈ 10 KB c/u) para que el Excel no pese demasiado. */
const MAX_PHOTOS = 600;
const CONCURRENCY = 8;

/** Descarga las miniaturas del bucket privado (solo tras verificar que es admin). */
async function downloadPhotos(paths: string[]): Promise<Map<string, Buffer>> {
  const storage = supabaseAdmin().storage.from(EVIDENCE_BUCKET);
  const out = new Map<string, Buffer>();
  const queue = [...new Set(paths)].slice(0, MAX_PHOTOS);
  async function worker() {
    for (let path = queue.shift(); path; path = queue.shift()) {
      const { data, error } = await storage.download(path);
      if (error || !data) continue; // miniatura vencida o borrada: la fila queda con "—"
      out.set(path, Buffer.from(await data.arrayBuffer()));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

/** Descarga Excel del reporte (solo admin; mismos filtros que la tabla). */
export async function GET(req: Request) {
  const check = await getAdminCheck();
  if (check.status !== "ok") {
    return NextResponse.json({ ok: false, message: "No autorizado." }, { status: 401 });
  }
  try {
    const filters = parseReportFilters(new URL(req.url).searchParams);
    const report = await loadReport(check.session.supabase, filters);
    const photos = await downloadPhotos(report.rows.map((r) => r.photoPath ?? "").filter(Boolean));
    const xlsx = await buildAttendanceWorkbook(report, filters, photos);
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
