import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { todayInTz } from "@/lib/time";
import { buildDailyReport, type ReportEvent, type ReportObservation, type ReportPermission, type ReportRow } from "./calc";
import type { ReportFilters } from "./filters";

export type ReportData = {
  rows: ReportRow[];
  branches: { id: string; name: string }[];
  employees: { id: string; full_name: string; branch_id: string; active: boolean }[];
  branchName: Map<string, string>;
  settings: { entry_tolerance_minutes: number; lunch_allowed_minutes: number };
  totals: { rows: number; late: number; lunchExcess: number; incomplete: number; permissions: number };
};

/**
 * Carga los datos del reporte con el cliente del ADMIN (pasa por RLS).
 * Lo usan la tabla del dashboard y la exportación a Excel (mismos filtros).
 */
export async function loadReport(
  supabase: SupabaseClient<Database>,
  filters: ReportFilters,
  now: Date = new Date(),
): Promise<ReportData> {
  let empQuery = supabase
    .from("employees")
    .select("id, full_name, cedula, branch_id, position, entry_time, work_days, entry_times, active, created_at")
    .order("full_name");
  if (filters.branchId) empQuery = empQuery.eq("branch_id", filters.branchId);
  if (filters.employeeId) empQuery = empQuery.eq("id", filters.employeeId);

  const [{ data: settingsRow }, { data: branches }, { data: employees }, { data: allEmployees }] = await Promise.all([
    supabase.from("settings").select("entry_tolerance_minutes, lunch_allowed_minutes").eq("id", 1).maybeSingle(),
    supabase.from("branches").select("id, name").order("name"),
    empQuery,
    supabase.from("employees").select("id, full_name, branch_id, active").order("full_name"),
  ]);

  const settings = settingsRow ?? {
    entry_tolerance_minutes: DEFAULT_SETTINGS.entry_tolerance_minutes,
    lunch_allowed_minutes: DEFAULT_SETTINGS.lunch_allowed_minutes,
  };

  const ids = (employees ?? []).map((e) => e.id);
  let events: ReportEvent[] = [];
  if (ids.length) {
    // Paginado: PostgREST limita filas por respuesta.
    const pageSize = 1000;
    for (let fromRow = 0; ; fromRow += pageSize) {
      const { data } = await supabase
        .from("attendance_events")
        .select("employee_id, event_type, occurred_at, work_date, branch_id, evidence_path")
        .gte("work_date", filters.from)
        .lte("work_date", filters.to)
        .in("employee_id", ids)
        .order("occurred_at")
        .range(fromRow, fromRow + pageSize - 1);
      events = events.concat(data ?? []);
      if (!data || data.length < pageSize) break;
    }
  }

  let permissions: ReportPermission[] = [];
  let observations: ReportObservation[] = [];
  if (ids.length) {
    const [{ data: perms }, { data: notes }] = await Promise.all([
      supabase
        .from("permissions")
        .select("employee_id, work_date, kind, start_time, hours")
        .gte("work_date", filters.from)
        .lte("work_date", filters.to)
        .in("employee_id", ids),
      supabase
        .from("observations")
        .select("employee_id, work_date, note")
        .gte("work_date", filters.from)
        .lte("work_date", filters.to)
        .in("employee_id", ids),
    ]);
    permissions = perms ?? [];
    observations = notes ?? [];
  }

  let rows = buildDailyReport({
    employees: employees ?? [],
    events,
    permissions,
    observations,
    from: filters.from,
    to: filters.to,
    today: todayInTz(now),
    now,
    toleranceMinutes: settings.entry_tolerance_minutes,
    lunchAllowedMinutes: settings.lunch_allowed_minutes,
  });
  if (filters.onlyIssues) {
    rows = rows.filter(
      (r) => r.flagged || r.status === "incompleto" || r.status === "sin_marcaciones" || r.permission || r.observation,
    );
  }

  return {
    rows,
    branches: branches ?? [],
    employees: allEmployees ?? [],
    branchName: new Map((branches ?? []).map((b) => [b.id, b.name])),
    settings,
    totals: {
      rows: rows.length,
      late: rows.filter((r) => r.lateMinutes > 0).length,
      lunchExcess: rows.filter((r) => r.lunchExcessMinutes > 0).length,
      incomplete: rows.filter((r) => r.status === "incompleto" || r.status === "sin_marcaciones").length,
      permissions: rows.filter((r) => r.permission).length,
    },
  };
}
