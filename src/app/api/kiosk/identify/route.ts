import { NextResponse } from "next/server";
import { identifyBodySchema } from "@/lib/kiosk/schemas";
import { kioskError, kioskGuard, logFailedAttempt, readJsonBody } from "@/lib/kiosk/guard";
import {
  type LivenessStep,
  LIVENESS_STEPS,
  SAME_PERSON_MAX_DISTANCE,
  maxPairwiseDistance,
  meanDescriptor,
  verifyLiveness,
} from "@/lib/face/liveness";
import { EVENT_LABEL } from "@/lib/attendance/events";
import { getSettings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decodeJpegDataUrl, uploadEvidence } from "@/lib/evidence";
import { todayInTz } from "@/lib/time";
import { logError } from "@/lib/log";

/**
 * Identificación (todo se decide en el SERVIDOR):
 *  1. Consume el reto (un solo uso, vigente, misma IP).
 *  2. Re-verifica la traza de liveness contra los pasos que el servidor eligió.
 *  3. Comprueba que sea la misma persona durante todo el reto.
 *  4. Compara el descriptor en Postgres (pgvector) con el umbral configurado:
 *     0 coincidencias = desconocido; 2+ = ambigüedad (rechazo).
 *  5. Devuelve el siguiente evento válido y un ticket para confirmar.
 */
export async function POST(req: Request) {
  const raw = await readJsonBody(req, 200_000);
  const parsed = identifyBodySchema.safeParse(raw);
  const g = await kioskGuard(req, {
    route: "identify",
    perMinute: 20,
    device: parsed.success ? parsed.data.device : undefined,
    devBranchCode: parsed.success ? parsed.data.branchCode : undefined,
  });
  if (!g.ok) return g.response;
  const { ctx } = g;

  if (!parsed.success) {
    await logFailedAttempt({ reason: "datos_invalidos", ip: ctx.ip, userAgent: ctx.userAgent, branchId: ctx.branchId });
    return kioskError(400, "datos_invalidos", "Datos inválidos. Intenta de nuevo.");
  }
  const { challengeId, frames, descriptors, thumbnail } = parsed.data;
  const db = supabaseAdmin();
  const settings = await getSettings();
  const base = { ip: ctx.ip, userAgent: ctx.userAgent, branchId: ctx.branchId };

  // 1) Reto de un solo uso
  const nowIso = new Date().toISOString();
  const { data: ch, error: chErr } = await db
    .from("kiosk_challenges")
    .update({ consumed_at: nowIso })
    .eq("id", challengeId)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .eq("ip", ctx.ip)
    .select("id, steps, branch_id")
    .maybeSingle();
  if (chErr) logError("kiosk-identify", chErr);
  if (!ch) {
    await logFailedAttempt({ ...base, reason: "reto_invalido", details: { motivo: "reto_inexistente_usado_o_vencido" } });
    return kioskError(400, "reto_invalido", "La verificación caducó. Vuelve a intentarlo.");
  }
  const steps = ch.steps.filter((s): s is LivenessStep => (LIVENESS_STEPS as readonly string[]).includes(s));

  // 2) Liveness (re-verificado aquí; el "ok" del navegador no cuenta)
  const live = verifyLiveness(steps, frames);
  if (!live.ok) {
    await logFailedAttempt({ ...base, reason: "liveness_fallido", thumbnail, details: { motivo: live.reason, pasos: steps } });
    return kioskError(
      422,
      "liveness",
      "No pudimos confirmar que eres una persona frente a la cámara. Sigue las instrucciones e intenta de nuevo.",
    );
  }

  // 3) Misma persona durante todo el reto
  const spread = maxPairwiseDistance(descriptors);
  if (spread > SAME_PERSON_MAX_DISTANCE) {
    await logFailedAttempt({
      ...base,
      reason: "liveness_fallido",
      thumbnail,
      details: { motivo: "cambio_de_rostro", dispersion: Number(spread.toFixed(3)) },
    });
    return kioskError(422, "liveness", "Detectamos un cambio de rostro durante la verificación. Intenta de nuevo.");
  }

  // 4) Comparación facial dentro de Postgres
  const query = meanDescriptor(descriptors);
  const { data: matches, error: mErr } = await db.rpc("kiosk_match_face", {
    p_descriptor: JSON.stringify(query),
    p_limit: 3,
  });
  if (mErr) {
    logError("kiosk-match", mErr);
    return kioskError(503, "servicio", "Servicio no disponible. Intenta en un momento.");
  }
  const threshold = settings.face_match_threshold;
  const best = matches?.[0];
  const under = (matches ?? []).filter((m) => m.distance < threshold);

  if (under.length === 0) {
    await logFailedAttempt({
      ...base,
      reason: "cara_desconocida",
      thumbnail,
      distance: best?.distance ?? null,
      details: { umbral: threshold, mejor_distancia: best ? Number(best.distance.toFixed(3)) : null },
    });
    return kioskError(
      404,
      "desconocido",
      "No te reconocimos. Acércate, mejora la luz e intenta otra vez. Si eres nuevo, pide al administrador que registre tu rostro.",
    );
  }
  if (under.length > 1) {
    await logFailedAttempt({
      ...base,
      reason: "ambiguedad",
      thumbnail,
      distance: under[0].distance,
      details: { umbral: threshold, distancias: under.map((m) => Number(m.distance.toFixed(3))) },
    });
    return kioskError(409, "ambiguo", "No pudimos identificarte con certeza. Intenta de nuevo con mejor iluminación.");
  }

  const match = under[0];
  const firstName = match.full_name.split(/\s+/)[0];

  // 5) Estado del día del empleado
  const { data: statusRows, error: sErr } = await db.rpc("kiosk_employee_status", { p_employee_id: match.employee_id });
  const status = statusRows?.[0];
  if (sErr || !status) {
    logError("kiosk-status", sErr);
    return kioskError(503, "servicio", "Servicio no disponible. Intenta en un momento.");
  }
  if (status.day_complete || !status.next_event) {
    return NextResponse.json({
      ok: true,
      status: "complete",
      employee: { firstName, fullName: match.full_name },
      message: "Ya registraste todas tus marcaciones de hoy.",
    });
  }
  if (status.seconds_since_last !== null && status.seconds_since_last < settings.cooldown_seconds) {
    return NextResponse.json({
      ok: true,
      status: "cooldown",
      employee: { firstName, fullName: match.full_name },
      waitSeconds: settings.cooldown_seconds - status.seconds_since_last,
    });
  }

  // Evidencia (miniatura) si está habilitada
  let evidencePath: string | null = null;
  if (settings.evidence_enabled) {
    const jpeg = decodeJpegDataUrl(thumbnail);
    if (jpeg) evidencePath = await uploadEvidence("eventos", todayInTz(), jpeg);
  }

  const { error: upErr } = await db
    .from("kiosk_challenges")
    .update({
      employee_id: match.employee_id,
      match_distance: match.distance,
      identified_at: new Date().toISOString(),
      evidence_path: evidencePath,
      branch_id: ctx.branchId ?? ch.branch_id,
    })
    .eq("id", ch.id);
  if (upErr) {
    logError("kiosk-ticket", upErr);
    return kioskError(503, "servicio", "Servicio no disponible. Intenta en un momento.");
  }

  return NextResponse.json({
    ok: true,
    status: "identified",
    ticket: ch.id,
    employee: { firstName, fullName: match.full_name },
    nextEvent: status.next_event,
    nextEventLabel: EVENT_LABEL[status.next_event],
    ticketTtlSeconds: 60,
  });
}
