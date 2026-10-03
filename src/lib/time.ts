/**
 * Utilidades de fecha/hora. La BD guarda todo en UTC; la app MUESTRA y
 * CALCULA días laborables en America/Guayaquil (UTC-5, sin horario de verano).
 * Las fechas "de calendario" se manejan como texto YYYY-MM-DD.
 */
export const TZ = "America/Guayaquil";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(instant: Date) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFormatter.formatToParts(instant)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Diferencia (minutos) entre la hora local de Guayaquil y UTC en ese instante. Ej: -300. */
export function tzOffsetMinutes(instant: Date): number {
  const z = zonedParts(instant);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** Fecha YYYY-MM-DD en Guayaquil para un instante dado. */
export function dateInTz(instant: Date): string {
  const z = zonedParts(instant);
  return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
}

export function todayInTz(now: Date = new Date()): string {
  return dateInTz(now);
}

/** Convierte fecha + hora local de Guayaquil ("2026-10-02", "08:00[:00]") a un instante UTC. */
export function zonedToUtc(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss = 0] = timeStr.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offset = tzOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60000);
}

/** Inicio (inclusive) y fin (exclusivo) en UTC de un rango de fechas locales. */
export function utcBoundsForDates(from: string, to: string): { start: Date; end: Date } {
  return { start: zonedToUtc(from, "00:00"), end: zonedToUtc(addDays(to, 1), "00:00") };
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha de calendario. */
export function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Lista de fechas (inclusive) entre from y to. */
export function dateRange(from: string, to: string, maxDays = 370): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < maxDays) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Minutos completos transcurridos de a hasta b (trunca los segundos). */
export function minutesBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 60000);
}

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// ---------------------------------------------------------------------------
// Formato para mostrar (español, hora de Ecuador)
// ---------------------------------------------------------------------------
const timeFmt = new Intl.DateTimeFormat("es-EC", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const timeSecFmt = new Intl.DateTimeFormat("es-EC", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const dateTimeFmt = new Intl.DateTimeFormat("es-EC", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const longDateFmt = new Intl.DateTimeFormat("es-EC", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fullDateFmt = new Intl.DateTimeFormat("es-EC", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function toDate(v: Date | string): Date {
  return typeof v === "string" ? new Date(v) : v;
}

export function formatTime(v: Date | string | null | undefined, withSeconds = false): string {
  if (!v) return "—";
  return (withSeconds ? timeSecFmt : timeFmt).format(toDate(v));
}

export function formatDateTime(v: Date | string | null | undefined): string {
  if (!v) return "—";
  return dateTimeFmt.format(toDate(v));
}

/** "jue., 02/10/2026" a partir de "2026-10-02". */
export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return longDateFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

/** "jueves, 2 de octubre de 2026" (hoy en Guayaquil). */
export function formatFullDate(instant: Date): string {
  return fullDateFmt.format(instant);
}

/** 135 → "2 h 15 min" */
export function formatMinutes(total: number | null | undefined): string {
  if (total === null || total === undefined) return "—";
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m} min`;
  return `${sign}${h} h ${pad(m)} min`;
}

/** "08:00:00" → "08:00" */
export function shortTime(t: string | null | undefined): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
