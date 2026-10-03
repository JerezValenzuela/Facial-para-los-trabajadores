import "server-only";
import { serverEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";
import { TelegramChannel } from "./telegram";
import { TwilioSmsChannel } from "./twilio-sms";
import type { NotificationChannel } from "./types";

export type { NotificationChannel, NotificationMessage } from "./types";

/** Todos los canales conocidos (configurados o no). */
export function allChannels(): NotificationChannel[] {
  const env = serverEnv();
  return [
    new TelegramChannel(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID),
    new TwilioSmsChannel(
      env.SMS_ENABLED,
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_FROM_NUMBER,
      env.SMS_TO_NUMBERS.split(",").map((s) => s.trim()).filter(Boolean),
    ),
  ];
}

export function configuredChannels(): NotificationChannel[] {
  return allChannels().filter((c) => c.isConfigured());
}

export type DispatchOutcome = "pendiente_envio" | "enviada" | "error";

/**
 * Envía una alerta YA registrada en la tabla alerts.
 * Con ALERTS_ENABLED=false no envía nada: la alerta queda "pendiente_envio".
 */
export async function dispatchAlert(alert: { id: string; message: string }): Promise<DispatchOutcome> {
  const env = serverEnv();
  if (!env.ALERTS_ENABLED) return "pendiente_envio";

  const channels = configuredChannels();
  const db = supabaseAdmin();
  if (!channels.length) {
    await db
      .from("alerts")
      .update({ status: "error", error: "ALERTS_ENABLED=true pero no hay canales configurados" })
      .eq("id", alert.id);
    return "error";
  }

  const results = await Promise.allSettled(channels.map((c) => c.send({ text: alert.message })));
  const sent = channels.filter((_, i) => results[i].status === "fulfilled").map((c) => c.name);
  const errors = results
    .map((r, i) => (r.status === "rejected" ? `${channels[i].name}: ${(r.reason as Error)?.message ?? "error"}` : null))
    .filter(Boolean) as string[];

  const status: DispatchOutcome = sent.length ? "enviada" : "error";
  const { error } = await db
    .from("alerts")
    .update({
      status,
      channels: sent,
      sent_at: sent.length ? new Date().toISOString() : null,
      error: errors.length ? errors.join(" | ").slice(0, 500) : null,
    })
    .eq("id", alert.id);
  if (error) logError("alertas-update", error);
  return status;
}
