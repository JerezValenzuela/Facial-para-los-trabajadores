import { NextResponse } from "next/server";
import { permissionBodySchema } from "@/lib/kiosk/schemas";
import { kioskError, kioskGuard, logFailedAttempt, readJsonBody } from "@/lib/kiosk/guard";
import { businessCode, friendlyDbError } from "@/lib/db-errors";
import { formatPermission } from "@/lib/attendance/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatTime } from "@/lib/time";
import { logError } from "@/lib/log";

/**
 * Registra un PERMISO elegido por el empleado tras ser reconocido
 * (todo el día, o por horas con hora de inicio). Usa el mismo ticket de un
 * solo uso que una marcación; la BD valida ticket, IP y uno por día.
 */
export async function POST(req: Request) {
  const parsed = permissionBodySchema.safeParse(await readJsonBody(req, 4_000));
  const g = await kioskGuard(req, {
    route: "mark",
    perMinute: 20,
    device: parsed.success ? parsed.data.device : undefined,
    devBranchCode: parsed.success ? parsed.data.branchCode : undefined,
  });
  if (!g.ok) return g.response;
  const { ctx } = g;
  if (!parsed.success) {
    await logFailedAttempt({ reason: "datos_invalidos", ip: ctx.ip, userAgent: ctx.userAgent, branchId: ctx.branchId });
    return kioskError(400, "datos_invalidos", "Datos del permiso inválidos. Intenta de nuevo.");
  }

  const { ticket, kind, hours, startTime } = parsed.data;
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("kiosk_register_permission", {
    p_challenge_id: ticket,
    p_kind: kind,
    // Para "todo el día" la BD ignora estos valores.
    p_hours: kind === "horas" ? hours! : 0,
    p_start: kind === "horas" ? startTime! : "00:00",
    p_ip: ctx.ip,
  });

  if (error || !data?.[0]) {
    const code = businessCode(error);
    if (!code) logError("kiosk-permiso", error);
    if (code && code !== "PERMISO_YA_REGISTRADO") {
      await logFailedAttempt({
        reason: code.startsWith("TICKET") ? "reto_invalido" : "datos_invalidos",
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        branchId: ctx.branchId,
        details: { codigo: code, accion: "permiso" },
      });
    }
    return kioskError(409, (code ?? "error").toLowerCase(), friendlyDbError(error, "No se pudo registrar el permiso."));
  }

  const row = data[0];
  const { data: emp } = await db.from("employees").select("full_name").eq("id", row.employee_id).maybeSingle();
  return NextResponse.json({
    ok: true,
    firstName: (emp?.full_name ?? "").split(/\s+/)[0],
    label: "Permiso",
    time: formatTime(row.created_at, true),
    detail: formatPermission({ kind: row.kind, startTime: row.start_time, hours: row.hours }),
  });
}
