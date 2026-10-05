/**
 * Reglas de negocio de asistencia (funciones puras, con pruebas unitarias).
 *
 *  Atraso          = entrada real − horario del empleado − tolerancia   (mín. 0)
 *  Almuerzo        = regreso − salida a almuerzo
 *  Exceso almuerzo = almuerzo − almuerzo permitido                       (mín. 0)
 *  Horas trabajadas= (salida final − entrada) − almuerzo
 *
 * Permisos (registrados por el empleado en el kiosco):
 *  - Todo el día: el día cuenta como "Permiso" (sin atraso ni "Incompleto").
 *  - Por horas: si el permiso empieza antes de la hora de entrada (+ tolerancia),
 *    la entrada esperada pasa a ser el FIN del permiso (no cuenta como atraso).
 *
 * Horario por empleado (ver schedule.ts): solo aparecen sus días de trabajo.
 * Si marca en un día libre, la fila sale como "Día libre" y sin atraso.
 *
 * Todos los minutos son minutos COMPLETOS (se truncan los segundos).
 * Las fechas de calendario están en America/Guayaquil.
 */
import { dateInTz, dateRange, minutesBetween, zonedToUtc } from "@/lib/time";
import type { AttendanceEventType } from "./events";
import type { DayPermission } from "./permissions";
import { entryTimeFor, scheduleFromRow, worksOn } from "./schedule";

export type DayRules = {
  entryTime: string; // "08:00" o "08:00:00"
  toleranceMinutes: number;
  lunchAllowedMinutes: number;
};

export type DayStatus = "completo" | "incompleto" | "sin_marcaciones" | "en_curso" | "permiso";

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
  /** Permiso registrado ese día (o null). */
  permission: DayPermission | null;
};

export function computeLateMinutes(
  entrada: Date,
  date: string,
  rules: DayRules,
  permission: DayPermission | null = null,
): number {
  if (permission?.kind === "dia_completo") return 0;
  let expected = zonedToUtc(date, rules.entryTime);
  if (permission?.kind === "horas" && permission.startTime && permission.hours) {
    const start = zonedToUtc(date, permission.startTime);
    const end = new Date(start.getTime() + Math.round(permission.hours * 60) * 60000);
    // El permiso cubre el inicio de la jornada: se espera la llegada al terminar el permiso.
    if (start.getTime() <= expected.getTime() + rules.toleranceMinutes * 60000 && end > expected) {
      expected = end;
    }
  }
  return Math.max(0, minutesBetween(expected, entrada) - rules.toleranceMinutes);
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
  permission: DayPermission | null = null,
): DaySummary {
  const entrada = events.ENTRADA ?? null;
  const salidaAlmuerzo = events.SALIDA_ALMUERZO ?? null;
  const regresoAlmuerzo = events.REGRESO_ALMUERZO ?? null;
  const salidaFinal = events.SALIDA_FINAL ?? null;
  const isToday = date === opts.today;

  const lateMinutes = entrada ? computeLateMinutes(entrada, date, rules, permission) : 0;

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
  if (permission?.kind === "dia_completo" && count === 0) status = "permiso";
  else if (count === 0) status = "sin_marcaciones";
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
    permission,
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
  /** Días de trabajo (ISO 1 = lunes … 7 = domingo). */
  work_days: number[];
  /** Hora por día ({"1":"07:00"}); vacío = misma hora todos los días. */
  entry_times: unknown;
  active: boolean;
  created_at: string;
};

export type ReportEvent = {
  employee_id: string;
  event_type: AttendanceEventType;
  occurred_at: string;
  work_date: string;
  branch_id: string | null;
  /** Miniatura de evidencia de esa marcación (si se guardó). */
  evidence_path?: string | null;
};

export type ReportPermission = {
  employee_id: string;
  work_date: string;
  kind: DayPermission["kind"];
  start_time: string | null;
  hours: number | null;
};

export type ReportRow = DaySummary & {
  employeeId: string;
  employeeName: string;
  cedula: string;
  position: string;
  branchId: string;
  /** Hora de entrada de ese día ("HH:MM") o "Libre" si no le tocaba trabajar. */
  entryTime: string;
  /** Marcó en un día que no es de su horario (no cuenta atraso). */
  dayOff: boolean;
  /** Foto del día para el Excel: la de la ENTRADA o, si no hay, la de la primera marcación. */
  photoPath: string | null;
};

export function buildDailyReport(input: {
  employees: ReportEmployee[];
  events: ReportEvent[];
  from: string;
  to: string;
  today: string;
  now: Date;
  toleranceMinutes: number;
  lunchAllowedMinutes: number;
  permissions?: ReportPermission[];
}): ReportRow[] {
  const byKey = new Map<string, Partial<Record<AttendanceEventType, Date>>>();
  for (const ev of input.events) {
    const key = `${ev.employee_id}|${ev.work_date}`;
    const rec = byKey.get(key) ?? {};
    rec[ev.event_type] = new Date(ev.occurred_at);
    byKey.set(key, rec);
  }

  const order: AttendanceEventType[] = ["ENTRADA", "SALIDA_ALMUERZO", "REGRESO_ALMUERZO", "SALIDA_FINAL"];
  const photoByKey = new Map<string, { path: string; rank: number }>();
  for (const ev of input.events) {
    if (!ev.evidence_path) continue;
    const key = `${ev.employee_id}|${ev.work_date}`;
    const rank = order.indexOf(ev.event_type);
    const current = photoByKey.get(key);
    if (!current || rank < current.rank) photoByKey.set(key, { path: ev.evidence_path, rank });
  }

  const permissionByKey = new Map<string, DayPermission>();
  for (const p of input.permissions ?? []) {
    permissionByKey.set(`${p.employee_id}|${p.work_date}`, { kind: p.kind, startTime: p.start_time, hours: p.hours });
  }

  const lastDay = input.to > input.today ? input.today : input.to;
  const dates = input.from <= lastDay ? dateRange(input.from, lastDay) : [];
  const rows: ReportRow[] = [];

  for (const emp of input.employees) {
    const createdDate = dateInTz(new Date(emp.created_at));
    const schedule = scheduleFromRow(emp);
    for (const date of dates) {
      const events = byKey.get(`${emp.id}|${date}`);
      const permission = permissionByKey.get(`${emp.id}|${date}`) ?? null;
      const hasEvents = !!events && Object.keys(events).length > 0;
      const workDay = worksOn(schedule, date);
      if (!hasEvents && !permission) {
        // Sin marcaciones: solo cuenta en SUS días de trabajo, con el empleado activo y ya registrado.
        if (!emp.active || date < createdDate || !workDay) continue;
      }
      const summary = summarizeDay(
        date,
        events ?? {},
        {
          entryTime: entryTimeFor(schedule, date),
          toleranceMinutes: input.toleranceMinutes,
          lunchAllowedMinutes: input.lunchAllowedMinutes,
        },
        { today: input.today, now: input.now },
        permission,
      );
      if (!workDay) {
        // Día libre: no hay hora de entrada esperada, así que no hay atraso.
        summary.lateMinutes = 0;
        summary.flagged = summary.lunchExcessMinutes > 0;
      }
      rows.push({
        ...summary,
        employeeId: emp.id,
        employeeName: emp.full_name,
        cedula: emp.cedula,
        position: emp.position,
        branchId: emp.branch_id,
        entryTime: workDay ? entryTimeFor(schedule, date) : "Libre",
        dayOff: !workDay,
        photoPath: photoByKey.get(`${emp.id}|${date}`)?.path ?? null,
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
  permiso: "Permiso (todo el día)",
};
