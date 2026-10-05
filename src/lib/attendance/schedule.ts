/**
 * Horario de cada empleado: qué días trabaja y a qué hora entra cada día.
 *  - work_days: días ISO (1 = lunes … 7 = domingo).
 *  - entry_times vacío → entra a la misma hora todos los días (entry_time).
 *  - entry_times {"1":"07:00","6":"08:00"} → hora de cada día.
 * Funciones puras: se usan en el servidor, en el Excel y en el formulario.
 */
import { isoWeekday } from "@/lib/time";

export const WEEKDAYS = [
  { iso: 1, short: "Lun", letter: "L", long: "Lunes" },
  { iso: 2, short: "Mar", letter: "M", long: "Martes" },
  { iso: 3, short: "Mié", letter: "X", long: "Miércoles" },
  { iso: 4, short: "Jue", letter: "J", long: "Jueves" },
  { iso: 5, short: "Vie", letter: "V", long: "Viernes" },
  { iso: 6, short: "Sáb", letter: "S", long: "Sábado" },
  { iso: 7, short: "Dom", letter: "D", long: "Domingo" },
] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Schedule = {
  workDays: number[];
  /** Hora general "HH:MM" o "HH:MM:SS". */
  entryTime: string;
  /** Hora por día (clave = día ISO). Vacío = misma hora todos los días. */
  entryTimes: Record<string, string>;
};

/** Normaliza el JSON guardado en la BD (ignora claves u horas inválidas). */
export function parseEntryTimes(json: unknown): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (/^[1-7]$/.test(k) && typeof v === "string" && HHMM.test(v.slice(0, 5))) out[k] = v.slice(0, 5);
  }
  return out;
}

export function scheduleFromRow(row: { work_days: number[]; entry_time: string; entry_times: unknown }): Schedule {
  return { workDays: row.work_days, entryTime: row.entry_time, entryTimes: parseEntryTimes(row.entry_times) };
}

export function sameTimeEveryDay(s: Schedule): boolean {
  return Object.keys(s.entryTimes).length === 0;
}

export function worksOn(s: Schedule, date: string): boolean {
  return s.workDays.includes(isoWeekday(date));
}

/** Hora de entrada "HH:MM" para ese día de la semana. */
export function entryTimeForDay(s: Schedule, iso: number): string {
  return (s.entryTimes[String(iso)] ?? s.entryTime).slice(0, 5);
}

export function entryTimeFor(s: Schedule, date: string): string {
  return entryTimeForDay(s, isoWeekday(date));
}

/** Días en texto corto: "Lun–Sáb", "Dom", "Lun, Mié, Vie". */
export function formatWorkDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Todos los días";
  const isRun = sorted.length >= 3 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  const short = (d: number) => WEEKDAYS[d - 1]?.short ?? "?";
  if (isRun) return `${short(sorted[0])}–${short(sorted[sorted.length - 1])}`;
  return sorted.map(short).join(", ");
}

/** Resumen del horario: "Lun–Sáb · 07:00" o "Lun–Vie 07:00 · Sáb 08:00". */
export function formatSchedule(s: Schedule): string {
  if (sameTimeEveryDay(s)) return `${formatWorkDays(s.workDays)} · ${s.entryTime.slice(0, 5)}`;
  const groups = new Map<string, number[]>();
  for (const d of [...s.workDays].sort((a, b) => a - b)) {
    const t = entryTimeForDay(s, d);
    groups.set(t, [...(groups.get(t) ?? []), d]);
  }
  return [...groups.entries()].map(([t, days]) => `${formatWorkDays(days)} ${t}`).join(" · ");
}
