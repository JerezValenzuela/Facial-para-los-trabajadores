import { after, NextResponse } from "next/server";
import { markBodySchema } from "@/lib/kiosk/schemas";
import { type FailedReason, kioskError, kioskGuard, logFailedAttempt, readJsonBody } from "@/lib/kiosk/guard";
import { EVENT_LABEL, type AttendanceEventType } from "@/lib/attendance/events";
import { computeLateMinutes, computeLunch } from "@/lib/attendance/calc";
import { businessCode, friendlyDbError } from "@/lib/db-errors";
import { getSettings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { raiseAlert } from "@/lib/alerts";
import { formatMinutes, formatTime } from "@/lib/time";
import { logError } from "@/lib/log";

const REASON_BY_CODE: Record<string, FailedReason> = {
  FUERA_DE_ORDEN: "fuera_de_orden",
  COOLDOWN: "cooldown",
  JORNADA_COMPLETA: "jornada_completa",
  EMPLEADO_INACTIVO: "empleado_inactivo",
  TICKET_INVALIDO: "reto_invalido",
  TICKET_USADO: "reto_invalido",
  TICKET_EXPIRADO: "reto_invalido",
  TICKET_IP: "reto_invalido",
};

/**
 * Confirma la marcación con el ticket de identificación.
 * La función de BD aplica de forma ATÓMICA: ticket válido, misma IP, orden
 * estricto, cooldown y hora oficial del servidor.
 */
export async function POST(req: Request) {
  const parsed = markBodySchema.safeParse(await readJsonBody(req, 4_000));
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
    return kioskError(400, "datos_invalidos", "Datos inválidos. Intenta de nuevo.");
  }

  const db = supabaseAdmin();
  const eventType = parsed.data.eventType as AttendanceEventType;
  const { data, error } = await db.rpc("kiosk_register_attendance", {
    p_challenge_id: parsed.data.ticket,
    p_event_type: eventType,
    p_ip: ctx.ip,
    p_ticket_ttl_seconds: 90,
  });

  if (error || !data?.[0]) {
    const code = businessCode(error);
    if (!code) logError("kiosk-mark", error);
    const { data: ch } = await db
      .from("kiosk_challenges")
      .select("employee_id")
      .eq("id", parsed.data.ticket)
      .maybeSingle();
    await logFailedAttempt({
      reason: (code && REASON_BY_CODE[code]) || "datos_invalidos",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      branchId: ctx.branchId,
      employeeId: ch?.employee_id ?? null,
      details: { codigo: code ?? "error", evento: eventType },
    });
    return kioskError(409, (code ?? "error").toLowerCase(), friendlyDbError(error, "No se pudo registrar la marcación."));
  }

  const row = data[0];
  const settings = await getSettings();
  const { data: emp } = await db
    .from("employees")
    .select("full_name, entry_time, branches(name)")
    .eq("id", row.employee_id)
    .maybeSingle();
  const fullName = emp?.full_name ?? "";
  const occurredAt = new Date(row.occurred_at);
  let info: string | null = null;
  let warn = false;

  if (eventType === "ENTRADA" && emp) {
    const late = computeLateMinutes(occurredAt, row.work_date, {
      entryTime: emp.entry_time,
      toleranceMinutes: settings.entry_tolerance_minutes,
      lunchAllowedMinutes: settings.lunch_allowed_minutes,
    });
    warn = late > 0;
    info = late > 0 ? `Atraso: ${formatMinutes(late)}` : "¡Llegaste a tiempo!";
  }

  if (eventType === "REGRESO_ALMUERZO") {
    const { data: out } = await db
      .from("attendance_events")
      .select("occurred_at")
      .eq("employee_id", row.employee_id)
      .eq("work_date", row.work_date)
      .eq("event_type", "SALIDA_ALMUERZO")
      .maybeSingle();
    if (out) {
      const lunch = computeLunch(new Date(out.occurred_at), occurredAt, settings.lunch_allowed_minutes);
      warn = lunch.excess > 0;
      info =
        lunch.excess > 0
          ? `Almuerzo de ${formatMinutes(lunch.minutes)}: ${formatMinutes(lunch.excess)} de exceso`
          : `Almuerzo de ${formatMinutes(lunch.minutes)}`;
      if (lunch.excess > 0 && settings.alert_lunch_excess) {
        const branchName = (emp?.branches as { name: string } | null)?.name ?? "sin sucursal";
        // Se registra (y envía si ALERTS_ENABLED=true) después de responder al kiosco.
        after(() =>
          raiseAlert({
            type: "exceso_almuerzo",
            dedupeKey: `exceso_almuerzo:${row.employee_id}:${row.work_date}`,
            employeeId: row.employee_id,
            branchId: row.branch_id,
            workDate: row.work_date,
            message: `🍽️ ${fullName} (${branchName}) regresó del almuerzo con ${lunch.excess} min de exceso. Almuerzo de ${lunch.minutes} min; permitido ${settings.lunch_allowed_minutes} min. Regreso: ${formatTime(occurredAt)}.`,
            payload: {
              exceso_minutos: lunch.excess,
              almuerzo_minutos: lunch.minutes,
              permitido: settings.lunch_allowed_minutes,
              sucursal: branchName,
            },
          }),
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    eventType,
    eventLabel: EVENT_LABEL[eventType],
    occurredAt: row.occurred_at,
    time: formatTime(occurredAt, true),
    firstName: fullName.split(/\s+/)[0],
    info,
    warn,
  });
}
