import "server-only";
import { z } from "zod";

/**
 * Variables de entorno del SERVIDOR, validadas con zod.
 * Nunca importar este archivo desde un componente cliente ("server-only" lo impide).
 * Los mensajes de error nunca incluyen los valores, solo el nombre de la variable.
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_"),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
  DEV_MODE: bool,
  CRON_SECRET: z.string().min(32),
  ALERTS_ENABLED: bool,
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_CHAT_ID: z.string().optional().default(""),
  SMS_ENABLED: bool,
  TWILIO_ACCOUNT_SID: z.string().optional().default(""),
  TWILIO_AUTH_TOKEN: z.string().optional().default(""),
  TWILIO_FROM_NUMBER: z.string().optional().default(""),
  SMS_TO_NUMBERS: z.string().optional().default(""),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const vars = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variables de entorno inválidas o faltantes: ${vars}`);
  }
  cached = parsed.data;
  return cached;
}

/** DEV_MODE desactiva SOLO la restricción por IP. */
export function isDevMode(): boolean {
  return serverEnv().DEV_MODE;
}

/** Situación peligrosa: producción con DEV_MODE activo (se muestra aviso rojo en el dashboard). */
export function isUnsafeProductionDevMode(): boolean {
  const env = serverEnv();
  return env.NODE_ENV === "production" && env.DEV_MODE;
}
