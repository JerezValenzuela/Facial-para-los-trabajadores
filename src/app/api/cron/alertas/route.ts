import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dispatchMany } from "@/lib/alerts";
import { serverEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * Cron de alertas (pensado para pg_cron cada 5 minutos; ver README):
 *  - Alerta 2: empleados que pasaron (almuerzo permitido + margen) sin regresar.
 *  - Alerta 3: intentos fallidos repetidos desde una misma IP.
 * La deduplicación ocurre en la BD (dedupe_key): correrlo varias veces no repite alertas.
 */
async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = supabaseAdmin();
  const [overdue, suspicious] = await Promise.all([
    db.rpc("detect_lunch_overdue"),
    db.rpc("detect_suspicious_attempts"),
  ]);
  if (overdue.error) logError("cron-almuerzo", overdue.error);
  if (suspicious.error) logError("cron-sospechosos", suspicious.error);
  const created = [...(overdue.data ?? []), ...(suspicious.data ?? [])];
  const dispatched = await dispatchMany(created);
  return NextResponse.json({
    ok: !overdue.error && !suspicious.error,
    alertsEnabled: serverEnv().ALERTS_ENABLED,
    nuevas: { almuerzo_sin_regreso: overdue.data?.length ?? 0, intentos_sospechosos: suspicious.data?.length ?? 0 },
    envio: dispatched,
  });
}

export const GET = handle;
export const POST = handle;
