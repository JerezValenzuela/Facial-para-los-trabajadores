"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession, UnauthorizedError } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-errors";
import { isValidDateStr } from "@/lib/time";
import { observationNote, uuid } from "@/lib/validation";
import { logError } from "@/lib/log";

/**
 * Guarda la observación del día de un empleado (una por día). Texto vacío = borrarla.
 * Solo admin (RLS + verificación de sesión). La auditoría guarda quién y qué día,
 * no el texto.
 */
export async function saveObservationAction(
  employeeId: string,
  date: string,
  note: string,
): Promise<ActionResult<{ note: string | null }>> {
  try {
    const { supabase, user } = await requireAdminSession();
    if (!uuid.safeParse(employeeId).success || typeof date !== "string" || !isValidDateStr(date)) {
      return { ok: false, error: "Datos inválidos." };
    }
    const parsed = observationNote.safeParse(note);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Observación inválida." };
    const text = parsed.data;

    if (!text) {
      const { error } = await supabase.from("observations").delete().eq("employee_id", employeeId).eq("work_date", date);
      if (error) return { ok: false, error: friendlyDbError(error) };
    } else {
      const { error } = await supabase
        .from("observations")
        .upsert({ employee_id: employeeId, work_date: date, note: text, updated_by: user.id }, { onConflict: "employee_id,work_date" });
      if (error) return { ok: false, error: friendlyDbError(error) };
    }

    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: text ? "guardar_observacion" : "borrar_observacion",
      entity: "employee",
      entity_id: employeeId,
      details: { fecha: date },
    });
    revalidatePath("/dashboard");
    return { ok: true, message: text ? "Observación guardada." : "Observación borrada.", data: { note: text || null } };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
    logError("observaciones", e);
    return { ok: false, error: "Ocurrió un error inesperado." };
  }
}
