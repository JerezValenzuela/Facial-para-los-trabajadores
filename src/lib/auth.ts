import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export type AdminSession = {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  user: User;
  email: string;
  fullName: string | null;
};

export type AdminCheck =
  | { status: "ok"; session: AdminSession }
  | { status: "anonymous" }
  | { status: "forbidden"; email: string | null };

/**
 * Verifica (una vez por petición) que el usuario esté autenticado contra el
 * servidor de Auth (getUser, no solo la cookie) y que sea admin activo.
 */
export const getAdminCheck = cache(async (): Promise<AdminCheck> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };

  const { data: admin } = await supabase
    .from("admin_users")
    .select("email, full_name, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin?.active) return { status: "forbidden", email: user.email ?? null };
  return {
    status: "ok",
    session: { supabase, user, email: admin.email, fullName: admin.full_name },
  };
});

export class UnauthorizedError extends Error {
  constructor() {
    super("No autorizado");
  }
}

/** Para Server Actions y Route Handlers: lanza si no es admin. */
export async function requireAdminSession(): Promise<AdminSession> {
  const check = await getAdminCheck();
  if (check.status !== "ok") throw new UnauthorizedError();
  return check.session;
}
