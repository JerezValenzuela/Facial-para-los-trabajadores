import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { EVIDENCE_BUCKET } from "@/lib/evidence";
import { addDays, todayInTz, zonedToUtc } from "@/lib/time";
import { logError } from "@/lib/log";

/**
 * Limpieza diaria (pg_cron, una vez al día):
 *  - Borra miniaturas de evidencia más antiguas que la retención configurada.
 *  - Borra retos del kiosco y contadores de rate limit viejos.
 */
async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = supabaseAdmin();
  const settings = await getSettings();
  const cutoff = addDays(todayInTz(), -settings.evidence_retention_days);
  const storage = db.storage.from(EVIDENCE_BUCKET);

  let removed = 0;
  for (const kind of ["eventos", "intentos"]) {
    const { data: folders, error } = await storage.list(kind, { limit: 1000 });
    if (error) {
      logError("limpieza-list", error);
      continue;
    }
    for (const folder of folders ?? []) {
      // Carpetas por fecha YYYY-MM-DD: se borran las anteriores al corte.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(folder.name) || folder.name >= cutoff) continue;
      const { data: files } = await storage.list(`${kind}/${folder.name}`, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${kind}/${folder.name}/${f.name}`);
      for (let i = 0; i < paths.length; i += 100) {
        const { error: rmErr } = await storage.remove(paths.slice(i, i + 100));
        if (rmErr) logError("limpieza-remove", rmErr);
        else removed += Math.min(100, paths.length - i);
      }
    }
  }

  const { data: db_result, error } = await db.rpc("cleanup_kiosk_data", {
    p_evidence_before: zonedToUtc(cutoff, "00:00").toISOString(),
  });
  if (error) logError("limpieza-db", error);

  return NextResponse.json({ ok: !error, corte: cutoff, miniaturas_borradas: removed, base_de_datos: db_result ?? null });
}

export const GET = handle;
export const POST = handle;
