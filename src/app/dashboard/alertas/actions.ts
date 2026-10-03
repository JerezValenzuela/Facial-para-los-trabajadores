"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession, UnauthorizedError } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { serverEnv } from "@/lib/env";
import { configuredChannels, dispatchAlert } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validation";
import { logError } from "@/lib/log";

function fail(e: unknown): ActionResult {
  if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
  logError("alertas", e);
  return { ok: false, error: "Ocurrió un error inesperado." };
}

/** Reintenta el envío de una alerta pendiente o con error. */
export async function resendAlertAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminSession();
    const id = uuid.safeParse(formData.get("id"));
    if (!id.success) return { ok: false, error: "Alerta inválida." };
    if (!serverEnv().ALERTS_ENABLED) {
      return { ok: false, error: "El envío está desactivado (ALERTS_ENABLED=false). La alerta sigue registrada." };
    }
    // Lectura con RLS (confirma que el admin puede verla).
    const { data: alert } = await supabase.from("alerts").select("id, message").eq("id", id.data).maybeSingle();
    if (!alert) return { ok: false, error: "Alerta no encontrada." };
    const outcome = await dispatchAlert(alert);
    revalidatePath("/dashboard/alertas");
    return outcome === "enviada"
      ? { ok: true, message: "Alerta enviada." }
      : { ok: false, error: "No se pudo enviar. Revisa la configuración del canal." };
  } catch (e) {
    return fail(e);
  }
}

/** Envía un mensaje de prueba por los canales configurados (no queda registrado como alerta). */
export async function testNotificationAction(): Promise<ActionResult> {
  try {
    const { user } = await requireAdminSession();
    if (!serverEnv().ALERTS_ENABLED) {
      return { ok: false, error: "Activa ALERTS_ENABLED=true en las variables de entorno y reinicia el servidor." };
    }
    const channels = configuredChannels();
    if (!channels.length) return { ok: false, error: "No hay canales configurados (Telegram o SMS)." };
    const results = await Promise.allSettled(
      channels.map((c) => c.send({ text: "✅ Prueba de JerezCons Asistencia: las alertas llegan correctamente." })),
    );
    const ok = channels.filter((_, i) => results[i].status === "fulfilled").map((c) => c.name);
    const failed = results
      .map((r, i) => (r.status === "rejected" ? `${channels[i].name}: ${(r.reason as Error).message}` : null))
      .filter(Boolean);
    await supabaseAdmin()
      .from("audit_log")
      .insert({ actor_id: user.id, action: "probar_notificacion", entity: "alerts", details: { ok, fallidos: failed.length } });
    return ok.length
      ? { ok: true, message: `Mensaje de prueba enviado por: ${ok.join(", ")}.${failed.length ? ` Fallaron: ${failed.join("; ")}` : ""}` }
      : { ok: false, error: `No se pudo enviar: ${failed.join("; ")}` };
  } catch (e) {
    return fail(e);
  }
}
