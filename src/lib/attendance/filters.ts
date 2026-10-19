import { addDays, isValidDateStr, todayInTz } from "@/lib/time";

export type ReportFilters = {
  from: string;
  to: string;
  branchId: string | null;
  employeeId: string | null;
  onlyIssues: boolean;
};

export const MAX_RANGE_DAYS = 93;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(p: Params, key: string): string | undefined {
  if (p instanceof URLSearchParams) return p.get(key) ?? undefined;
  const v = p[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Filtros del reporte desde la URL (validados; valores inválidos → por defecto).
 * Por defecto se ve SOLO el día de hoy; para más días se usa el filtro.
 */
export function parseReportFilters(p: Params, now: Date = new Date()): ReportFilters {
  const today = todayInTz(now);
  let to = get(p, "hasta") ?? today;
  if (!isValidDateStr(to)) to = today;
  let from = get(p, "desde") ?? to;
  if (!isValidDateStr(from)) from = to;
  if (from > to) [from, to] = [to, from];
  if (addDays(from, MAX_RANGE_DAYS - 1) < to) from = addDays(to, -(MAX_RANGE_DAYS - 1));

  const branch = get(p, "sucursal");
  const employee = get(p, "empleado");
  return {
    from,
    to,
    branchId: branch && UUID.test(branch) ? branch : null,
    employeeId: employee && UUID.test(employee) ? employee : null,
    onlyIssues: get(p, "novedades") === "1",
  };
}

/** "Este mes": del día 1 del mes actual hasta hoy. */
export function thisMonthRange(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/** "Mes pasado": el mes anterior completo (del 1 al último día). */
export function lastMonthRange(today: string): { from: string; to: string } {
  const lastDay = addDays(`${today.slice(0, 7)}-01`, -1);
  return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
}

export function filtersToQuery(f: ReportFilters): string {
  const q = new URLSearchParams({ desde: f.from, hasta: f.to });
  if (f.branchId) q.set("sucursal", f.branchId);
  if (f.employeeId) q.set("empleado", f.employeeId);
  if (f.onlyIssues) q.set("novedades", "1");
  return q.toString();
}
