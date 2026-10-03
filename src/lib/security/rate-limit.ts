import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

export type RateLimitResult = { allowed: boolean; hits: number };

/**
 * Rate limit de ventana fija guardado en Postgres (funciona con varias
 * instancias serverless). Si la verificación falla, se BLOQUEA (fail-closed).
 */
export async function rateLimit(
  key: string,
  windowSeconds: number,
  max: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error || !data?.[0]) {
    logError("rate-limit", error);
    return { allowed: false, hits: 0 };
  }
  return { allowed: data[0].allowed, hits: data[0].hits };
}
