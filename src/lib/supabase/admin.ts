import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cliente con la SECRET KEY (salta RLS). Uso exclusivo en el servidor:
 * rutas del kiosco, cron y tareas que validan permisos por su cuenta.
 * Nunca exponer este cliente ni sus resultados crudos al navegador.
 */
let client: SupabaseClient<Database> | null = null;

export function supabaseAdmin(): SupabaseClient<Database> {
  if (client) return client;
  const env = serverEnv();
  client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "jerezcons-asistencia-server" } },
  });
  return client;
}
