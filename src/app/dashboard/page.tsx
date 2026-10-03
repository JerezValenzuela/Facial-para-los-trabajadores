import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth";
import { filtersToQuery, MAX_RANGE_DAYS, parseReportFilters } from "@/lib/attendance/filters";
import { loadReport } from "@/lib/attendance/report-data";
import { formatDateLabel } from "@/lib/time";
import { EmptyState, PageHeader } from "@/components/ui";
import { IconDownload } from "@/components/icons";
import { AttendanceTable } from "./attendance-table";

export const metadata: Metadata = { title: "Asistencia" };

export default async function AttendancePage(props: PageProps<"/dashboard">) {
  const sp = await props.searchParams;
  const filters = parseReportFilters(sp);
  const { supabase } = await requireAdminSession();
  const report = await loadReport(supabase, filters);
  const query = filtersToQuery(filters);

  return (
    <>
      <PageHeader
        title="Asistencia"
        description={`Del ${formatDateLabel(filters.from)} al ${formatDateLabel(filters.to)} · Tolerancia ${report.settings.entry_tolerance_minutes} min · Almuerzo ${report.settings.lunch_allowed_minutes} min`}
        actions={
          <a href={`/api/admin/export?${query}`} className="btn-primary">
            <IconDownload className="h-4 w-4" /> Descargar Excel
          </a>
        }
      />

      <form method="get" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_auto_auto] lg:items-end">
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
        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-6">Rango máximo: {MAX_RANGE_DAYS} días.</p>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Registros" value={report.totals.rows} />
        <Stat label="Con atraso" value={report.totals.late} tone="red" />
        <Stat label="Exceso de almuerzo" value={report.totals.lunchExcess} tone="red" />
        <Stat label="Incompletos" value={report.totals.incomplete} tone="yellow" />
        <Stat label="Permisos" value={report.totals.permissions} />
      </div>

      {report.rows.length === 0 ? (
        <EmptyState title="Sin registros para estos filtros">
          Prueba con otro rango de fechas o revisa que haya empleados activos.
        </EmptyState>
      ) : (
        <AttendanceTable rows={report.rows} branchNames={Object.fromEntries(report.branchName)} />
      )}
      <p className="mt-3 text-xs text-slate-500">
        Filas en <span className="font-semibold text-red-700">rojo</span>: atraso o exceso de almuerzo. En{" "}
        <span className="font-semibold text-amber-700">amarillo</span>: marcaciones incompletas. En{" "}
        <span className="font-semibold text-sky-700">celeste</span>: permiso todo el día. Toca una fila para ver sus fotos.
        Horas en hora de Ecuador.
      </p>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" | "yellow" }) {
  const color = tone === "red" && value > 0 ? "text-red-600" : tone === "yellow" && value > 0 ? "text-amber-600" : "text-slate-900";
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
