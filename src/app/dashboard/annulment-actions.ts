"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession, UnauthorizedError } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-errors";
import { dateInTz, isValidDateStr } from "@/lib/time";
import { annulmentReason, uuid } from "@/lib/validation";
import { logError } from "@/lib/log";

/**
 * Días anulados y feriados (solo admin: RLS + verificación de sesión).
 * Anular NO borra nada: las marcaciones y fotos siguen ahí; el día solo deja de contar.
 * Quitar la anulación lo devuelve a como estaba.
 */

function validDate(date: unknown): date is string {
  return typeof date === "string" && isValidDateStr(date);
}

function parseReason(reason: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const parsed = annulmentReason.safeParse(typeof reason === "string" ? reason : "");
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Motivo inválido." };
  return { ok: true, value: parsed.data || null };
}

function failure(e: unknown): ActionResult<never> {
  if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
  logError("dias-anulados", e);
  return { ok: false, error: "Ocurrió un error inesperado." };
}

/** Anula el día de UN empleado (si ya estaba como feriado, queda como anulado con este motivo). */
export async function annulDayAction(employeeId: string, date: string, reason: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminSession();
    if (!uuid.safeParse(employeeId).success || !validDate(date)) return { ok: false, error: "Datos inválidos." };
    const r = parseReason(reason);
    if (!r.ok) return r;

    const { error } = await supabase
      .from("annulled_days")
      .upsert(
        { employee_id: employeeId, work_date: date, kind: "anulado", reason: r.value, created_by: user.id },
        { onConflict: "employee_id,work_date" },
      );
    if (error) return { ok: false, error: friendlyDbError(error) };

    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "anular_dia",
      entity: "employee",
      entity_id: employeeId,
      details: { fecha: date },
    });
    revalidatePath("/dashboard");
    return { ok: true, message: "Día anulado." };
  } catch (e) {
    return failure(e);
  }
}

/** Quita la anulación (o el feriado) solo a ese empleado: el día vuelve a contar. */
export async function removeAnnulmentAction(employeeId: string, date: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminSession();
    if (!uuid.safeParse(employeeId).success || !validDate(date)) return { ok: false, error: "Datos inválidos." };

    const { error } = await supabase.from("annulled_days").delete().eq("employee_id", employeeId).eq("work_date", date);
    if (error) return { ok: false, error: friendlyDbError(error) };

    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "quitar_anulacion",
      entity: "employee",
      entity_id: employeeId,
      details: { fecha: date },
    });
    revalidatePath("/dashboard");
    return { ok: true, message: "Anulación quitada." };
  } catch (e) {
    return failure(e);
  }
}

/**
 * Feriado: anula ese día para TODOS los empleados (las dos sucursales).
 * A quien ya tenía el día anulado se le respeta su anulación.
 */
export async function setHolidayAction(date: string, name: string): Promise<ActionResult<{ count: number }>> {
  try {
    const { supabase, user } = await requireAdminSession();
    if (!validDate(date)) return { ok: false, error: "Fecha inválida." };
    const r = parseReason(name);
    if (!r.ok) return r;

    const { data: employees, error: empError } = await supabase.from("employees").select("id, created_at");
    if (empError) return { ok: false, error: friendlyDbError(empError) };
    // Solo quienes ya estaban registrados ese día.
    const ids = (employees ?? []).filter((e) => dateInTz(new Date(e.created_at)) <= date).map((e) => e.id);
    if (ids.length === 0) return { ok: false, error: "No hay empleados registrados en esa fecha." };

    const { error } = await supabase.from("annulled_days").upsert(
      ids.map((id) => ({ employee_id: id, work_date: date, kind: "feriado", reason: r.value, created_by: user.id })),
      { onConflict: "employee_id,work_date", ignoreDuplicates: true },
    );
    if (error) return { ok: false, error: friendlyDbError(error) };

    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "marcar_feriado",
      entity: "settings",
      entity_id: null,
      details: { fecha: date, empleados: ids.length },
    });
    revalidatePath("/dashboard");
    return { ok: true, message: "Feriado marcado.", data: { count: ids.length } };
  } catch (e) {
    return failure(e);
  }
}

/** Quita el feriado de ese día a todos (las anulaciones individuales se mantienen). */
export async function removeHolidayAction(date: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminSession();
    if (!validDate(date)) return { ok: false, error: "Fecha inválida." };

    const { error } = await supabase.from("annulled_days").delete().eq("work_date", date).eq("kind", "feriado");
    if (error) return { ok: false, error: friendlyDbError(error) };

    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "quitar_feriado",
      entity: "settings",
      entity_id: null,
      details: { fecha: date },
    });
    revalidatePath("/dashboard");
    return { ok: true, message: "Feriado quitado." };
  } catch (e) {
    return failure(e);
  }
}
