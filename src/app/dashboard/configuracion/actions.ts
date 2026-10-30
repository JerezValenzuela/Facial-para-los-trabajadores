"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession, UnauthorizedError } from "@/lib/auth";
import { type ActionResult, zodFieldErrors } from "@/lib/action-result";
import { settingsSchema } from "@/lib/validation";
import { friendlyDbError } from "@/lib/db-errors";
import { invalidateSettingsCache } from "@/lib/settings";
import { logError } from "@/lib/log";
import { todayInTz } from "@/lib/time";

export async function updateSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminSession();
    const parsed = settingsSchema.safeParse({
      entry_tolerance_minutes: formData.get("entry_tolerance_minutes"),
      lunch_allowed_minutes: formData.get("lunch_allowed_minutes"),
      lunch_tolerance_minutes: formData.get("lunch_tolerance_minutes"),
      default_exit_time: formData.get("default_exit_time"),
      half_day_exit_time: formData.get("half_day_exit_time"),
      no_lunch_after_time: formData.get("no_lunch_after_time"),
      day_close_time: formData.get("day_close_time"),
      lunch_alert_grace_minutes: formData.get("lunch_alert_grace_minutes"),
      face_match_threshold: formData.get("face_match_threshold"),
      cooldown_seconds: formData.get("cooldown_seconds"),
      liveness_steps: formData.get("liveness_steps"),
      evidence_enabled: formData.get("evidence_enabled") === "on",
      evidence_retention_days: formData.get("evidence_retention_days"),
      work_days: formData.getAll("work_days").map(String),
      alert_lunch_excess: formData.get("alert_lunch_excess") === "on",
      alert_lunch_overdue: formData.get("alert_lunch_overdue") === "on",
      alert_suspicious: formData.get("alert_suspicious") === "on",
      suspicious_attempts_threshold: formData.get("suspicious_attempts_threshold"),
      suspicious_window_minutes: formData.get("suspicious_window_minutes"),
    });
    if (!parsed.success) {
      return { ok: false, error: "Revisa los valores marcados.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const data = { ...parsed.data, work_days: [...new Set(parsed.data.work_days)].sort(), updated_by: user.id };

    const { data: before } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
    const { error } = await supabase.from("settings").update(data).eq("id", 1);
    if (error) return { ok: false, error: friendlyDbError(error) };

    // Las tolerancias valen DESDE HOY: se guarda un periodo con fecha de inicio,
    // así los días anteriores se siguen calculando con la tolerancia que tenían.
    if (
      before &&
      (before.entry_tolerance_minutes !== parsed.data.entry_tolerance_minutes ||
        before.lunch_tolerance_minutes !== parsed.data.lunch_tolerance_minutes)
    ) {
      const { error: tolError } = await supabase.from("tolerance_periods").upsert(
        {
          starts_on: todayInTz(),
          entry_tolerance_minutes: parsed.data.entry_tolerance_minutes,
          lunch_tolerance_minutes: parsed.data.lunch_tolerance_minutes,
        },
        { onConflict: "starts_on" },
      );
      if (tolError) logError("configuracion-tolerancias", tolError);
    }

    // Auditoría: solo los campos que cambiaron.
    const changes: Record<string, { antes: unknown; despues: unknown }> = {};
    if (before) {
      for (const [k, v] of Object.entries(parsed.data)) {
        const prev = (before as Record<string, unknown>)[k];
        if (JSON.stringify(prev) !== JSON.stringify(v)) changes[k] = { antes: prev, despues: v };
      }
    }
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "actualizar_configuracion",
      entity: "settings",
      entity_id: "1",
      details: JSON.parse(JSON.stringify(changes)),
    });
    invalidateSettingsCache();
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: Object.keys(changes).length ? "Configuración guardada." : "Sin cambios." };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
    logError("configuracion", e);
    return { ok: false, error: "Ocurrió un error inesperado." };
  }
}
