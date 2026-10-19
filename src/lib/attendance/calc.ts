/**
 * Reglas de negocio de asistencia (funciones puras, con pruebas unitarias).
 *
 *  Atraso          = entrada real − horario del empleado − tolerancia   (mín. 0)
 *  Almuerzo        = regreso − salida a almuerzo
 *  Exceso almuerzo = almuerzo − permitido − tolerancia de almuerzo     (mín. 0)
 *                    (60 + 10: volver a 1 h 10 no cuenta; a 1 h 12 son 2 min)
 *  Horas trabajadas= (salida final − entrada) − almuerzo   ← horas REALES (lo que se paga)
 *  Minutos perdidos= atraso + exceso de almuerzo (informativo: ya están fuera
 *                    de las horas reales, NO se restan otra vez)
 *
 * Días sin almuerzo (media jornada, ej. sábado): con Entrar + Salir el día está
 * completo y Horas trabajadas = salida − entrada (no se descuenta almuerzo).
 *
 * No marcó bien (día ya terminado, con Entrar marcado):
 *  - sin "Salir" → se cuenta hasta la hora de salida asumida (17:00 en Configuración);
 *  - sin almuerzo marcado (o a medias) → se descuenta el almuerzo permitido (1 h);
 *  - salió al almuerzo y no marcó nada más → solo trabajó hasta la salida al
 *    almuerzo (se suman solo esos minutos, son reales: no se asume nada).
 * El día sigue "Incompleto" (se ve que no marcó) y esas horas se suman aparte como
 * "horas asumidas", para poder decidir si se pagan. Si marca, vale la hora real.
 * En media jornada (sin almuerzo) no se asume la salida: se pagaría de más.
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
import { entryTimeFor, hasLunch, scheduleFromRow, worksOn } from "./schedule";

export type DayRules = {
  entryTime: string; // "08:00" o "08:00:00"
  toleranceMinutes: number;
  lunchAllowedMinutes: number;
  /** Gracia del almuerzo: el exceso empieza después de permitido + tolerancia. */
  lunchToleranceMinutes?: number;
  /** Si olvidó marcar "Salir" (día ya terminado), sus horas se cuentan hasta esta hora. */
  assumedExitTime?: string | null;
  /** false = día sin almuerzo (media jornada): basta Entrar + Salir. Por defecto true. */
  lunchExpected?: boolean;
};

export type DayStatus = "completo" | "incompleto" | "sin_marcaciones" | "en_curso" | "permiso" | "libre";

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
  /** Olvidó marcar "Salir": hora que se usó para las horas trabajadas (o null). */
  assumedExit: Date | null;
  /** No marcó el almuerzo (o lo marcó a medias): se descontó el almuerzo permitido. */
  assumedLunch: boolean;
  /** Salió al almuerzo y no volvió a marcar: horas solo hasta la salida al almuerzo. */
  leftAtLunch: boolean;
  /** false = día sin almuerzo (media jornada). */
  lunchExpected: boolean;
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
  toleranceMinutes = 0,
): { minutes: number; excess: number } {
  const minutes = Math.max(0, minutesBetween(salida, regreso));
  return { minutes, excess: Math.max(0, minutes - allowedMinutes - toleranceMinutes) };
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
    const l = computeLunch(salidaAlmuerzo, regresoAlmuerzo, rules.lunchAllowedMinutes, rules.lunchToleranceMinutes);
    lunchMinutes = l.minutes;
    lunchExcessMinutes = l.excess;
  } else if (salidaAlmuerzo && !regresoAlmuerzo && isToday && !salidaFinal) {
    // Almuerzo en curso: se muestra cuánto lleva fuera (y el exceso en vivo).
    lunchOngoing = true;
    const l = computeLunch(salidaAlmuerzo, opts.now, rules.lunchAllowedMinutes, rules.lunchToleranceMinutes);
    lunchMinutes = l.minutes;
    lunchExcessMinutes = l.excess;
  }

  const lunchExpected = rules.lunchExpected !== false;
  // Día sin almuerzo y sin marcaciones de almuerzo: basta Entrar + Salir.
  const noLunchDay = !lunchExpected && !salidaAlmuerzo && !regresoAlmuerzo;

  const dayOver = date < opts.today;
  let workedMinutes: number | null = null;
  let assumedExit: Date | null = null;
  let assumedLunch = false;
  let leftAtLunch = false;
  if (entrada && salidaAlmuerzo && !regresoAlmuerzo && !salidaFinal && dayOver) {
    // Salió al almuerzo y no volvió a marcar: solo trabajó hasta el almuerzo.
    workedMinutes = Math.max(0, minutesBetween(entrada, salidaAlmuerzo));
    leftAtLunch = true;
  } else if (entrada) {
    // Almuerzo que se descuenta: el real; ninguno en media jornada; o, si no lo
    // marcó (o lo marcó a medias) en un día ya terminado, el permitido (1 h).
    let lunch: number | null = null;
    if (salidaAlmuerzo && regresoAlmuerzo) lunch = lunchMinutes;
    else if (noLunchDay) lunch = 0;
    else if (lunchExpected && dayOver) {
      lunch = rules.lunchAllowedMinutes;
      assumedLunch = true;
    }

    let exit = salidaFinal;
    // La salida asumida (17:00) es para jornadas con almuerzo; en media jornada
    // (ej. sábado) se pagaría de más, así que ahí no se asume.
    if (!exit && lunchExpected && dayOver && rules.assumedExitTime) {
      const candidate = zonedToUtc(date, rules.assumedExitTime);
      const lastMark = [entrada, salidaAlmuerzo, regresoAlmuerzo].reduce<Date>((a, b) => (b && b > a ? b : a), entrada);
      if (candidate > lastMark) exit = assumedExit = candidate;
    }

    if (exit && lunch !== null) {
      workedMinutes = Math.max(0, minutesBetween(entrada, exit) - lunch);
    } else {
      // No se pudo calcular: no queda nada asumido.
      assumedExit = null;
      assumedLunch = false;
    }
  }

  const present = [entrada, salidaAlmuerzo, regresoAlmuerzo, salidaFinal];
  const order: AttendanceEventType[] = ["ENTRADA", "SALIDA_ALMUERZO", "REGRESO_ALMUERZO", "SALIDA_FINAL"];
  const missing = order.filter(
    (type, i) => !present[i] && !(noLunchDay && (type === "SALIDA_ALMUERZO" || type === "REGRESO_ALMUERZO")),
  );
  const count = present.filter(Boolean).length;

  let status: DayStatus;
  if (permission?.kind === "dia_completo" && count === 0) status = "permiso";
  else if (count === 0) status = "sin_marcaciones";
  else if (missing.length === 0) status = "completo";
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
    assumedExit,
    assumedLunch,
    leftAtLunch,
    lunchExpected,
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
  /** Días sin almuerzo (media jornada). Por defecto ninguno. */
  no_lunch_days?: number[];
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

export type ReportObservation = {
  employee_id: string;
  work_date: string;
  note: string;
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
  /** Observación del administrador para ese día (o null). */
  observation: string | null;
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
  lunchToleranceMinutes?: number;
  assumedExitTime?: string | null;
  permissions?: ReportPermission[];
  observations?: ReportObservation[];
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

  const observationByKey = new Map<string, string>();
  for (const o of input.observations ?? []) observationByKey.set(`${o.employee_id}|${o.work_date}`, o.note);

  const lastDay = input.to > input.today ? input.today : input.to;
  const dates = input.from <= lastDay ? dateRange(input.from, lastDay) : [];
  const rows: ReportRow[] = [];

  for (const emp of input.employees) {
    const createdDate = dateInTz(new Date(emp.created_at));
    const schedule = scheduleFromRow(emp);
    for (const date of dates) {
      const events = byKey.get(`${emp.id}|${date}`);
      const permission = permissionByKey.get(`${emp.id}|${date}`) ?? null;
      const observation = observationByKey.get(`${emp.id}|${date}`) ?? null;
      const hasEvents = !!events && Object.keys(events).length > 0;
      const workDay = worksOn(schedule, date);
      // Un día con observación siempre se muestra (la escribió el administrador).
      if (!hasEvents && !permission && !observation) {
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
          lunchToleranceMinutes: input.lunchToleranceMinutes,
          assumedExitTime: input.assumedExitTime,
          lunchExpected: hasLunch(schedule, date),
        },
        { today: input.today, now: input.now },
        permission,
      );
      if (!workDay) {
        // Día libre: no hay hora de entrada esperada, así que no hay atraso.
        summary.lateMinutes = 0;
        summary.flagged = summary.lunchExcessMinutes > 0;
        if (!hasEvents && !permission) summary.status = "libre";
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
        observation,
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
  libre: "Día libre",
};

// ---------------------------------------------------------------------------
// Totales por empleado (resumen del dashboard y hoja "Resumen" del Excel)
// ---------------------------------------------------------------------------
export type EmployeeTotals = {
  employeeId: string;
  employeeName: string;
  branchId: string;
  /** Días con entrada marcada. */
  daysWorked: number;
  daysComplete: number;
  /** Días con entrada que no marcó completos (amarillo "Incompleto"). */
  daysBadlyMarked: number;
  /** Días con entrada pero sin horas calculables (faltan marcaciones del almuerzo). */
  daysWithoutHours: number;
  /** Días de trabajo sin ninguna marcación ni permiso. */
  absences: number;
  permissionDays: number;
  /** Total de horas (marcadas + asumidas), en minutos. */
  workedMinutes: number;
  /** Horas de días bien marcados (reales). */
  markedMinutes: number;
  /** Horas de días que no marcó bien (hasta las 17:00 con 1 h de almuerzo). */
  assumedMinutes: number;
  lateMinutes: number;
  lunchExcessMinutes: number;
  /** Atraso + exceso de almuerzo (informativo; ya no están en las horas reales). */
  lostMinutes: number;
};

export type TotalsRow = Omit<EmployeeTotals, "employeeId" | "employeeName" | "branchId">;

export function summarizeByEmployee(rows: ReportRow[]): { employees: EmployeeTotals[]; total: TotalsRow } {
  const blank = (): TotalsRow => ({
    daysWorked: 0,
    daysComplete: 0,
    daysBadlyMarked: 0,
    daysWithoutHours: 0,
    absences: 0,
    permissionDays: 0,
    workedMinutes: 0,
    markedMinutes: 0,
    assumedMinutes: 0,
    lateMinutes: 0,
    lunchExcessMinutes: 0,
    lostMinutes: 0,
  });
  const add = (t: TotalsRow, r: ReportRow) => {
    const excess = r.lunchOngoing ? 0 : r.lunchExcessMinutes;
    if (r.entrada) t.daysWorked += 1;
    if (r.status === "completo") t.daysComplete += 1;
    const assumed = Boolean(r.assumedExit || r.assumedLunch);
    if (r.entrada && r.status === "incompleto") t.daysBadlyMarked += 1;
    if (r.entrada && r.workedMinutes === null && r.status !== "en_curso") t.daysWithoutHours += 1;
    if (r.status === "sin_marcaciones") t.absences += 1;
    if (r.permission) t.permissionDays += 1;
    t.workedMinutes += r.workedMinutes ?? 0;
    if (assumed) t.assumedMinutes += r.workedMinutes ?? 0;
    else t.markedMinutes += r.workedMinutes ?? 0;
    t.lateMinutes += r.lateMinutes;
    t.lunchExcessMinutes += excess;
    t.lostMinutes += r.lateMinutes + excess;
  };

  const byEmployee = new Map<string, EmployeeTotals>();
  const total = blank();
  for (const r of rows) {
    let e = byEmployee.get(r.employeeId);
    if (!e) {
      e = { employeeId: r.employeeId, employeeName: r.employeeName, branchId: r.branchId, ...blank() };
      byEmployee.set(r.employeeId, e);
    }
    add(e, r);
    add(total, r);
  }
  const employees = [...byEmployee.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "es"));
  return { employees, total };
}
