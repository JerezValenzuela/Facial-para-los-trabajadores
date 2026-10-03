import { NextResponse } from "next/server";
import { abortBodySchema } from "@/lib/kiosk/schemas";
import { kioskGuard, logFailedAttempt, readJsonBody } from "@/lib/kiosk/guard";
import { sanitizeFrame, traceStats, type LivenessFrame } from "@/lib/face/liveness";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * El kiosco avisa que un reto se quedó sin tiempo. Solo sirve para diagnóstico:
 * cierra el reto (ya no podrá usarse) y registra el intento con un resumen
 * de los giros alcanzados, para ajustar umbrales con datos reales.
 */
export async function POST(req: Request) {
  const parsed = abortBodySchema.safeParse(await readJsonBody(req, 120_000));
  const g = await kioskGuard(req, {
    route: "identify",
    perMinute: 20,
    device: parsed.success ? parsed.data.device : undefined,
    devBranchCode: parsed.success ? parsed.data.branchCode : undefined,
  });
  if (!g.ok) return g.response;
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { ctx } = g;
  const { data: ch } = await supabaseAdmin()
    .from("kiosk_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", parsed.data.challengeId)
    .is("consumed_at", null)
    .eq("ip", ctx.ip)
    .select("steps")
    .maybeSingle();
  if (!ch) return NextResponse.json({ ok: true });

  const frames = parsed.data.frames.map(sanitizeFrame).filter((f): f is LivenessFrame => f !== null);
  await logFailedAttempt({
    reason: "liveness_fallido",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    branchId: ctx.branchId,
    details: {
      motivo: parsed.data.reason,
      pasos: ch.steps,
      pasos_cumplidos: parsed.data.stepIndex,
      ...traceStats(frames),
    },
  });
  return NextResponse.json({ ok: true });
}
