import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth";
import {
  filtersToQuery,
  lastMonthRange,
  MAX_RANGE_DAYS,
  parseReportFilters,
  thisMonthRange,
} from "@/lib/attendance/filters";
import { summarizeByEmployee } from "@/lib/attendance/calc";
import { loadReport } from "@/lib/attendance/report-data";
import Link from "next/link";
import { addDays, formatDateLabel, formatMinutes, formatSignedMinutes, todayInTz } from "@/lib/time";
import { describeTolerance } from "@/lib/attendance/tolerance";
import { EmptyState, PageHeader } from "@/components/ui";
import { IconDownload } from "@/components/icons";
import { AttendanceTable } from "./attendance-table";
import { EmployeeSummaryTable } from "./employee-summary";

export const metadata: Metadata = { title: "Asistencia" };

export default async function AttendancePage(props: PageProps<"/dashboard">) {
  const sp = await props.searchParams;
  const filters = parseReportFilters(sp);
  const view = sp.vista === "resumen" ? "resumen" : "lista";
  const { supabase } = await requireAdminSession();
  const report = await loadReport(supabase, filters);
  const query = filtersToQuery(filters);
  const viewQuery = view === "resumen" ? "&vista=resumen" : "";
  const today = todayInTz();
  const range =
    filters.from === filters.to
      ? `${filters.from === today ? "Hoy, " : ""}${formatDateLabel(filters.from)}`
      : `Del ${formatDateLabel(filters.from)} al ${formatDateLabel(filters.to)}`;
  // Accesos rápidos que conservan la sucursal, el empleado, "solo novedades" y la vista.
  const quick = (r: { from: string; to: string }) => `/dashboard?${filtersToQuery({ ...filters, ...r })}${viewQuery}`;
  const viewHref = (v: "lista" | "resumen") => `/dashboard?${query}${v === "resumen" ? "&vista=resumen" : ""}`;
  const summary = summarizeByEmployee(report.rows);
  const tolFallback = { entry: report.settings.entry_tolerance_minutes, lunch: report.settings.lunch_tolerance_minutes };
  const quickLinks: { label: string; range: { from: string; to: string } }[] = [
    { label: "Hoy", range: { from: today, to: today } },
    { label: "Ayer", range: { from: addDays(today, -1), to: addDays(today, -1) } },
    { label: "Últimos 7 días", range: { from: addDays(today, -6), to: today } },
    { label: "Últimos 30 días", range: { from: addDays(today, -29), to: today } },
    { label: "Este mes", range: thisMonthRange(today) },
    { label: "Mes pasado", range: lastMonthRange(today) },
  ];

  return (
    <>
      <PageHeader
        title="Asistencia"
        description={`${range} · Tolerancia de entrada: ${describeTolerance(report.tolerancePeriods, filters.from, filters.to, tolFallback, "entry")} · Almuerzo ${report.settings.lunch_allowed_minutes} min (tolerancia: ${describeTolerance(report.tolerancePeriods, filters.from, filters.to, tolFallback, "lunch")})`}
        actions={
          <a href={`/api/admin/export?${query}${viewQuery}`} className="btn-primary">
            <IconDownload className="h-4 w-4" /> Descargar Excel
          </a>
        }
      />

      <form method="get" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_auto_auto] lg:items-end">
        {view === "resumen" && <input type="hidden" name="vista" value="resumen" />}
        <div>
          <label className="label" htmlFor="desde">Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={filters.from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={filters.to} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="sucursal">Sucursal</label>
          <select id="sucursal" name="sucursal" defaultValue={filters.branchId ?? ""} className="input">
            <option value="">Todas</option>
            {report.branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="empleado">Empleado</label>
          <select id="empleado" name="empleado" defaultValue={filters.employeeId ?? ""} className="input">
            <option value="">Todos</option>
            {report.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
                {e.active ? "" : " (inactivo)"}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" name="novedades" value="1" defaultChecked={filters.onlyIssues} className="h-4 w-4 accent-brand-600" />
          Solo novedades
        </label>
        <button className="btn-secondary">Aplicar filtros</button>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 sm:col-span-2 lg:col-span-6">
          <span>Ver rápido:</span>
          {quickLinks.map((q) => (
            <Link key={q.label} href={quick(q.range)} className="font-medium text-brand-700 hover:underline">
              {q.label}
            </Link>
          ))}
          <span className="text-slate-400">· Rango máximo: {MAX_RANGE_DAYS} días.</span>
        </p>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Registros" value={report.totals.rows} />
        <Stat label="Horas trabajadas" value={formatMinutes(summary.total.workedMinutes)} />
        <Stat label="Con atraso" value={report.totals.late} tone="red" />
        <Stat label="Exceso de almuerzo" value={report.totals.lunchExcess} tone="red" />
        <Stat label="Incompletos" value={report.totals.incomplete} tone="yellow" />
        <Stat label="Suplementarias" value={formatSignedMinutes(summary.total.supplementaryMinutes)} signed={summary.total.supplementaryMinutes} />
      </div>

      <div className="mb-3 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Vista">
        {(
          [
            ["lista", "📋 Lista completa"],
            ["resumen", "👤 Resumen por empleado"],
          ] as const
        ).map(([v, label]) => (
          <Link
            key={v}
            href={viewHref(v)}
            role="tab"
            aria-selected={view === v}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              view === v ? "bg-brand-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {report.rows.length === 0 ? (
        <EmptyState title="Sin registros para estos filtros">
          Prueba con otro rango de fechas o revisa que haya empleados activos.
        </EmptyState>
      ) : view === "resumen" ? (
        <EmployeeSummaryTable
          summary={summary}
          branchNames={Object.fromEntries(report.branchName)}
          detailHref={(employeeId) => `/dashboard?${filtersToQuery({ ...filters, employeeId })}`}
          defaultExitTime={report.settings.default_exit_time.slice(0, 5)}
          halfDayExitTime={report.settings.half_day_exit_time.slice(0, 5)}
        />
      ) : (
        <AttendanceTable
          rows={report.rows}
          branchNames={Object.fromEntries(report.branchName)}
          lunchAllowedMinutes={report.settings.lunch_allowed_minutes}
        />
      )}
      <p className="mt-3 text-xs text-slate-500">
        Filas en <span className="font-semibold text-red-700">rojo</span>: atraso o exceso de almuerzo. En{" "}
        <span className="font-semibold text-amber-700">amarillo</span>: marcaciones incompletas. En{" "}
        <span className="font-semibold text-sky-700">celeste</span>: permiso todo el día. “Libre” en Horario: marcó en un día
        que no le toca trabajar (no cuenta atraso). Valores con <i>*</i> en gris: no marcó bien; se cuenta hasta las{" "}
        {report.settings.default_exit_time.slice(0, 5)} con {report.settings.lunch_allowed_minutes} min de almuerzo (sábado: hasta las{" "}
        {report.settings.half_day_exit_time.slice(0, 5)}) (horas
        asumidas). Toca una fila para ver sus fotos. Horas en hora de Ecuador.
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  signed,
}: {
  label: string;
  value: number | string;
  tone?: "red" | "yellow";
  /** Para valores con signo (suplementarias): verde si es a favor, rojo si debe. */
  signed?: number;
}) {
  const n = typeof value === "number" ? value : 0;
  const color =
    signed !== undefined
      ? signed > 0
        ? "text-emerald-700"
        : signed < 0
          ? "text-red-600"
          : "text-slate-900"
      : tone === "red" && n > 0
        ? "text-red-600"
        : tone === "yellow" && n > 0
          ? "text-amber-600"
          : "text-slate-900";
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
