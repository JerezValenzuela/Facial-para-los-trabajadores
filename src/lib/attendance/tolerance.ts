/**
 * Tolerancias con fecha de vigencia (tabla tolerance_periods): cada día usa la
 * tolerancia que regía ese día, así que cambiarla no recalcula días anteriores.
 * Funciones puras (sin acceso a la BD).
 */
import { addDays, formatDateLabel } from "@/lib/time";

export type TolerancePeriod = {
  starts_on: string; // YYYY-MM-DD
  entry_tolerance_minutes: number;
  lunch_tolerance_minutes: number;
};

export type Tolerances = { entry: number; lunch: number };

/** Tolerancias vigentes en `date` (la fila más reciente con starts_on <= date). */
export function toleranceFor(periods: TolerancePeriod[] | null | undefined, date: string, fallback: Tolerances): Tolerances {
  let best: TolerancePeriod | null = null;
  for (const p of periods ?? []) {
    if (p.starts_on <= date && (!best || p.starts_on > best.starts_on)) best = p;
  }
  return best ? { entry: best.entry_tolerance_minutes, lunch: best.lunch_tolerance_minutes } : fallback;
}

/**
 * Texto para encabezados: "5 min" si no cambió en el rango; si cambió,
 * "10 min hasta el mié 29/10/2026 · 5 min desde el jue 30/10/2026".
 */
export function describeTolerance(
  periods: TolerancePeriod[] | null | undefined,
  from: string,
  to: string,
  fallback: Tolerances,
  kind: keyof Tolerances,
): string {
  const changes = (periods ?? []).filter((p) => p.starts_on > from && p.starts_on <= to).map((p) => p.starts_on).sort();
  let current = toleranceFor(periods, from, fallback)[kind];
  if (changes.length === 0) return `${current} min`;
  const parts: string[] = [];
  for (const day of changes) {
    const next = toleranceFor(periods, day, fallback)[kind];
    if (next === current) continue;
    parts.push(`${current} min hasta el ${formatDateLabel(addDays(day, -1))}`);
    current = next;
    parts.push(`${current} min desde el ${formatDateLabel(day)}`);
  }
  return parts.length ? [...new Set(parts)].join(" · ") : `${current} min`;
}
