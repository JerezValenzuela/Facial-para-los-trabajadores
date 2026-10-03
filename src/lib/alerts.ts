import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dispatchAlert } from "@/lib/notifications";
import { logError } from "@/lib/log";
import type { Database, Json } from "@/lib/supabase/database.types";

type AlertType = Database["public"]["Enums"]["alert_type"];

export type NewAlert = {
  type: AlertType;
  dedupeKey: string;
  message: string;
  employeeId?: string | null;
  branchId?: string | null;
  workDate?: string | null;
  payload?: Json;
};

/**
 * Registra la alerta (una sola vez por dedupe_key) y la despacha.
 * Siempre queda registrada en la tabla alerts; si ALERTS_ENABLED=false
 * se queda en "pendiente_envio" para verla en el dashboard.
 */
export async function raiseAlert(a: NewAlert): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from("alerts")
    .upsert(
      {
        type: a.type,
        dedupe_key: a.dedupeKey,
        message: a.message,
        employee_id: a.employeeId ?? null,
        branch_id: a.branchId ?? null,
        work_date: a.workDate ?? null,
        payload: a.payload ?? {},
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id, message");
  if (error) {
    logError("alertas", error);
    return;
  }
  const row = data?.[0];
  if (row) await dispatchAlert(row);
}

/** Despacha alertas recién creadas por funciones SQL (cron). */
export async function dispatchMany(rows: { id: string; message: string }[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = { pendiente_envio: 0, enviada: 0, error: 0 };
  for (const row of rows) counts[await dispatchAlert(row)] += 1;
  return counts;
}
