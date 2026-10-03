/**
 * Reglas de negocio de asistencia (funciones puras, con pruebas unitarias).
 *
 *  Atraso          = entrada real − horario del empleado − tolerancia   (mín. 0)
 *  Almuerzo        = regreso − salida a almuerzo
 *  Exceso almuerzo = almuerzo − almuerzo permitido                       (mín. 0)
 *  Horas trabajadas= (salida final − entrada) − almuerzo
 *
 * Todos los minutos son minutos COMPLETOS (se truncan los segundos).
 * Las fechas de calendario están en America/Guayaquil.
 */
import { dateInTz, dateRange, isoWeekday, minutesBetween, zonedToUtc } from "@/lib/time";
import type { AttendanceEventType } from "./events";

export type DayRules = {
  entryTime: string; // "08:00" o "08:00:00"
  toleranceMinutes: number;
  lunchAllowedMinutes: number;
};

export type DayStatus = "completo" | "incompleto" | "sin_marcaciones" | "en_curso";

export type DaySummary = {
  date: string;
  entrada: Date | null;
  salidaAlmuerzo: Date | null;
  regresoAlmuerzo: Date | null;
  salidaFinal: Date | null;
  /** Duración del almuerzo (o minutos fuera si el almuerzo sigue en curso hoy). */
  lunchMinutes: number | null;
  lunchOngoing: boolean;
  lunchExcessMinutes: number;
  lateMinutes: number;
  workedMinutes: number | null;
  status: DayStatus;
  missing: AttendanceEventType[];
  /** Fila en rojo: atraso o exceso de almuerzo. */
  flagged: boolean;
};

export function computeLateMinutes(entrada: Date, date: string, rules: DayRules): number {
  const scheduled = zonedToUtc(date, rules.entryTime);
  return Math.max(0, minutesBetween(scheduled, entrada) - rules.toleranceMinutes);
}

export function computeLunch(
  salida: Date,
  regreso: Date,
  allowedMinutes: number,
): { minutes: number; excess: number } {
  const minutes = Math.max(0, minutesBetween(salida, regreso));
  return { minutes, excess: Math.max(0, minutes - allowedMinutes) };
}

export function summarizeDay(
  date: string,
  events: Partial<Record<AttendanceEventType, Date>>,
  rules: DayRules,
  opts: { today: string; now: Date },
): DaySummary {
  const entrada = events.ENTRADA ?? null;
  const salidaAlmuerzo = events.SALIDA_ALMUERZO ?? null;
  const regresoAlmuerzo = events.REGRESO_ALMUERZO ?? null;
  const salidaFinal = events.SALIDA_FINAL ?? null;
  const isToday = date === opts.today;

  const lateMinutes = entrada ? computeLateMinutes(entrada, date, rules) : 0;

  let lunchMinutes: number | null = null;
  let lunchExcessMinutes = 0;
  let lunchOngoing = false;
  if (salidaAlmuerzo && regresoAlmuerzo) {
    const l = computeLunch(salidaAlmuerzo, regresoAlmuerzo, rules.lunchAllowedMinutes);
    lunchMinutes = l.minutes;
    lunchExcessMinutes = l.excess;
  } else if (salidaAlmuerzo && !regresoAlmuerzo && isToday && !salidaFinal) {
    // Almuerzo en curso: se muestra cuánto lleva fuera (y el exceso en vivo).
    lunchOngoing = true;
    const l = computeLunch(salidaAlmuerzo, opts.now, rules.lunchAllowedMinutes);
    lunchMinutes = l.minutes;
    lunchExcessMinutes = l.excess;
  }

  let workedMinutes: number | null = null;
  if (entrada && salidaFinal && salidaAlmuerzo && regresoAlmuerzo && lunchMinutes !== null) {
    workedMinutes = Math.max(0, minutesBetween(entrada, salidaFinal) - lunchMinutes);
  }

  const present = [entrada, salidaAlmuerzo, regresoAlmuerzo, salidaFinal];
  const order: AttendanceEventType[] = ["ENTRADA", "SALIDA_ALMUERZO", "REGRESO_ALMUERZO", "SALIDA_FINAL"];
  const missing = order.filter((_, i) => !present[i]);
  const count = present.filter(Boolean).length;

  let status: DayStatus;
  if (count === 0) status = "sin_marcaciones";
  else if (count === 4) status = "completo";
  else status = isToday ? "en_curso" : "incompleto";

  return {
    date,
    entrada,
    salidaAlmuerzo,
    regresoAlmuerzo,
    salidaFinal,
    lunchMinutes,
    lunchOngoing,
    lunchExcessMinutes,
    lateMinutes,
    workedMinutes,
    status,
    missing,
    flagged: lateMinutes > 0 || lunchExcessMinutes > 0,
  };
}

// ---------------------------------------------------------------------------
// Reporte diario por empleado (dashboard y Excel)
// ---------------------------------------------------------------------------
export type ReportEmployee = {
  id: string;
  full_name: string;
  cedula: string;
  branch_id: string;
  position: string;
  entry_time: string;
  active: boolean;
  created_at: string;
};

export type ReportEvent = {
  employee_id: string;
  event_type: AttendanceEventType;
  occurred_at: string;
  work_date: string;
  branch_id: string | null;
};

export type ReportRow = DaySummary & {
  employeeId: string;
  employeeName: string;
  cedula: string;
  position: string;
  branchId: string;
  entryTime: string;
};

export function buildDailyReport(input: {
  employees: ReportEmployee[];
  events: ReportEvent[];
  from: string;
  to: string;
  today: string;
  now: Date;
  workDays: number[];
  toleranceMinutes: number;
  lunchAllowedMinutes: number;
}): ReportRow[] {
  const byKey = new Map<string, Partial<Record<AttendanceEventType, Date>>>();
  for (const ev of input.events) {
    const key = `${ev.employee_id}|${ev.work_date}`;
    const rec = byKey.get(key) ?? {};
    rec[ev.event_type] = new Date(ev.occurred_at);
    byKey.set(key, rec);
  }

  const lastDay = input.to > input.today ? input.today : input.to;
  const dates = input.from <= lastDay ? dateRange(input.from, lastDay) : [];
  const rows: ReportRow[] = [];

  for (const emp of input.employees) {
    const createdDate = dateInTz(new Date(emp.created_at));
    for (const date of dates) {
      const events = byKey.get(`${emp.id}|${date}`);
      const hasEvents = !!events && Object.keys(events).length > 0;
      if (!hasEvents) {
        // Sin marcaciones: solo cuenta en días laborables, con el empleado activo y ya registrado.
        if (!emp.active || date < createdDate || !input.workDays.includes(isoWeekday(date))) continue;
      }
      const summary = summarizeDay(
        date,
        events ?? {},
        {
          entryTime: emp.entry_time,
          toleranceMinutes: input.toleranceMinutes,
          lunchAllowedMinutes: input.lunchAllowedMinutes,
        },
        { today: input.today, now: input.now },
      );
      rows.push({
        ...summary,
        employeeId: emp.id,
        employeeName: emp.full_name,
        cedula: emp.cedula,
        position: emp.position,
        branchId: emp.branch_id,
        entryTime: emp.entry_time.slice(0, 5),
      });
    }
  }

  rows.sort((a, b) => (a.date === b.date ? a.employeeName.localeCompare(b.employeeName, "es") : a.date < b.date ? 1 : -1));
  return rows;
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  completo: "Completo",
  incompleto: "Incompleto",
  sin_marcaciones: "Incompleto (sin marcaciones)",
  en_curso: "En curso",
};
