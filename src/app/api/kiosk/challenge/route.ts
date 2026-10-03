import { NextResponse } from "next/server";
import { challengeBodySchema } from "@/lib/kiosk/schemas";
import { kioskError, kioskGuard, readJsonBody } from "@/lib/kiosk/guard";
import { randomSteps } from "@/lib/face/liveness";
import { getSettings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

/** Vigencia del reto: tiempo máximo para completarlo y enviar la identificación. */
const CHALLENGE_TTL_MS = 45_000;

/**
 * Emite un reto de liveness ALEATORIO decidido por el servidor, de un solo uso,
 * ligado a la IP del equipo y con caducidad corta.
 */
export async function POST(req: Request) {
  const body = challengeBodySchema.safeParse(await readJsonBody(req, 4_000));
  const g = await kioskGuard(req, {
    route: "challenge",
    perMinute: 30,
    device: body.success ? body.data.device : undefined,
    devBranchCode: body.success ? body.data.branchCode : undefined,
  });
  if (!g.ok) return g.response;

  const settings = await getSettings();
  const steps = randomSteps(settings.liveness_steps);
  const { data, error } = await supabaseAdmin()
    .from("kiosk_challenges")
    .insert({
      steps,
      ip: g.ctx.ip,
      user_agent: g.ctx.userAgent,
      branch_id: g.ctx.branchId,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    logError("kiosk-challenge", error);
    return kioskError(503, "servicio", "Servicio no disponible. Intenta en un momento.");
  }
  return NextResponse.json({ ok: true, challengeId: data.id, steps, expiresInMs: CHALLENGE_TTL_MS });
}
