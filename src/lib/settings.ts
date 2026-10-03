import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export type Settings = Database["public"]["Tables"]["settings"]["Row"];

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  entry_tolerance_minutes: 7,
  lunch_allowed_minutes: 60,
  lunch_alert_grace_minutes: 5,
  face_match_threshold: 0.5,
  cooldown_seconds: 60,
  liveness_steps: 2,
  evidence_enabled: true,
  evidence_retention_days: 90,
  work_days: [1, 2, 3, 4, 5, 6],
  alert_lunch_excess: true,
  alert_lunch_overdue: true,
  alert_suspicious: true,
  suspicious_attempts_threshold: 5,
  suspicious_window_minutes: 15,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
};

let cache: { value: Settings; at: number } | null = null;
const TTL_MS = 15_000;

/** Configuración para rutas de servidor (kiosco, cron). Caché corta por instancia. */
export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const { data } = await supabaseAdmin().from("settings").select("*").eq("id", 1).maybeSingle();
  const value = data ?? DEFAULT_SETTINGS;
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateSettingsCache() {
  cache = null;
}
