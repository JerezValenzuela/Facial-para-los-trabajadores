"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/lib/action-result";

const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  next: z.string().max(200).optional(),
});

/** Solo permite volver a rutas internas del dashboard (evita open redirect). */
function safeNext(next: string | undefined): string {
  if (next && next.startsWith("/dashboard") && !next.startsWith("//") && !next.includes("\\")) return next;
  return "/dashboard";
}

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Ingresa un correo válido y tu contraseña." };

  const ip = getClientIp(await headers()) ?? "desconocida";
  // 10 intentos cada 5 minutos por IP y 20 por correo (frena fuerza bruta).
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 300, 10),
    rateLimit(`login:email:${parsed.data.email.toLowerCase()}`, 300, 20),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { ok: false, error: "Correo o contraseña incorrectos." };

  const { data: admin } = await supabase
    .from("admin_users")
    .select("active")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!admin?.active) {
    await supabase.auth.signOut();
    return { ok: false, error: "Esta cuenta no tiene permisos de administrador." };
  }

  redirect(safeNext(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
