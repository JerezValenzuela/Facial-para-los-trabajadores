import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth";
import { filtersToQuery, MAX_RANGE_DAYS, parseReportFilters } from "@/lib/attendance/filters";
import { loadReport } from "@/lib/attendance/report-data";
import { STATUS_LABEL, type ReportRow } from "@/lib/attendance/calc";
import { formatDateLabel, formatMinutes, formatTime } from "@/lib/time";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { IconDownload } from "@/components/icons";

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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registros" value={report.totals.rows} />
        <Stat label="Con atraso" value={report.totals.late} tone="red" />
        <Stat label="Exceso de almuerzo" value={report.totals.lunchExcess} tone="red" />
        <Stat label="Incompletos" value={report.totals.incomplete} tone="yellow" />
      </div>

      {report.rows.length === 0 ? (
        <EmptyState title="Sin registros para estos filtros">
          Prueba con otro rango de fechas o revisa que haya empleados activos.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="th">Fecha</th>
                <th className="th">Empleado</th>
                <th className="th">Sucursal</th>
                <th className="th">Horario</th>
                <th className="th">Entrada</th>
                <th className="th">Salida alm.</th>
                <th className="th">Regreso</th>
                <th className="th">Salida final</th>
                <th className="th">Alm. tomado</th>
                <th className="th">Exceso alm.</th>
                <th className="th">Atraso</th>
                <th className="th">Horas trab.</th>
                <th className="th">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((r) => (
                <Row key={`${r.employeeId}-${r.date}`} r={r} branch={report.branchName.get(r.branchId) ?? "—"} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Filas en <span className="font-semibold text-red-700">rojo</span>: atraso o exceso de almuerzo. En{" "}
        <span className="font-semibold text-amber-700">amarillo</span>: marcaciones incompletas. Horas en hora de Ecuador.
      </p>
    </>
  );
}

function Row({ r, branch }: { r: ReportRow; branch: string }) {
  const incomplete = r.status === "incompleto" || r.status === "sin_marcaciones";
  const rowClass = r.flagged
    ? "bg-red-50 hover:bg-red-100/70"
    : incomplete
      ? "bg-amber-50 hover:bg-amber-100/70"
      : "hover:bg-slate-50";
  const detail = `/dashboard/asistencia/${r.employeeId}/${r.date}`;
  return (
    <tr className={rowClass}>
      <td className="td text-slate-600">{formatDateLabel(r.date)}</td>
      <td className="td font-medium">
        <Link href={detail} className="hover:text-brand-700 hover:underline">{r.employeeName}</Link>
      </td>
      <td className="td">{branch}</td>
      <td className="td font-mono text-slate-500">{r.entryTime}</td>
      <td className="td font-mono">{formatTime(r.entrada)}</td>
      <td className="td font-mono">{formatTime(r.salidaAlmuerzo)}</td>
      <td className="td font-mono">{formatTime(r.regresoAlmuerzo)}</td>
      <td className="td font-mono">{formatTime(r.salidaFinal)}</td>
      <td className="td">
        {r.lunchMinutes === null ? "—" : formatMinutes(r.lunchMinutes)}
        {r.lunchOngoing && <span className="ml-1 text-xs text-slate-500">(en curso)</span>}
      </td>
      <td className="td">
        {r.lunchExcessMinutes > 0 ? (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">+{r.lunchExcessMinutes} min</span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
      <td className="td">
        {r.lateMinutes > 0 ? (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">+{r.lateMinutes} min</span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
      <td className="td font-medium">{r.workedMinutes === null ? "—" : formatMinutes(r.workedMinutes)}</td>
      <td className="td">
        <Badge tone={r.status === "completo" ? "green" : r.status === "en_curso" ? "blue" : "yellow"}>
          {STATUS_LABEL[r.status]}
        </Badge>
      </td>
    </tr>
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
