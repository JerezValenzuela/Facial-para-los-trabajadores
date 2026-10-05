/**
 * Aviso de "olvidaste marcar tu salida".
 * Se mira el ÚLTIMO día anterior a hoy en que el empleado marcó algo (dentro
 * de los últimos 7 días): si ese día no tiene SALIDA_FINAL, se olvidó.
 * Se usa el último día trabajado y no "ayer" de calendario, para que el
 * lunes avise de un sábado olvidado aunque el domingo haya sido libre.
 */
import { addDays, isoWeekday } from "@/lib/time";
import type { AttendanceEventType } from "./events";
import { WEEKDAYS } from "./schedule";

export const FORGOT_EXIT_LOOKBACK_DAYS = 7;

/** Fecha del último día trabajado sin salida final, o null si no se olvidó. */
export function findForgottenExit(
  events: { work_date: string; event_type: AttendanceEventType }[],
  today: string,
): string | null {
  const since = addDays(today, -FORGOT_EXIT_LOOKBACK_DAYS);
  const past = events.filter((e) => e.work_date < today && e.work_date >= since);
  if (past.length === 0) return null;
  const last = past.reduce((max, e) => (e.work_date > max ? e.work_date : max), past[0].work_date);
  const closed = past.some((e) => e.work_date === last && e.event_type === "SALIDA_FINAL");
  return closed ? null : last;
}

/** "Ayer" o "El sábado 03/10". */
export function forgottenExitDayLabel(date: string, today: string): string {
  if (date === addDays(today, -1)) return "Ayer";
  const day = WEEKDAYS[isoWeekday(date) - 1].long.toLowerCase();
  const [, month, dayOfMonth] = date.split("-");
  return `El ${day} ${dayOfMonth}/${month}`;
}
