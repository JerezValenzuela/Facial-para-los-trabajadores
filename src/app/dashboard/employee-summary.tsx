import Link from "next/link";
import type { EmployeeTotals, TotalsRow } from "@/lib/attendance/calc";
import { formatMinutes } from "@/lib/time";

/**
 * Vista "Resumen por empleado": una fila por empleado con el total del período.
 * Horas trabajadas = horas REALES (lo que se paga). Los minutos perdidos ya están
 * fuera de esas horas: se muestran como información, no se restan otra vez.
 */
export function EmployeeSummaryTable({
  summary,
  branchNames,
  detailHref,
  defaultExitTime,
}: {
  summary: { employees: EmployeeTotals[]; total: TotalsRow };
  branchNames: Record<string, string>;
  detailHref: (employeeId: string) => string;
  defaultExitTime: string;
}) {
  return (
    <>
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Empleado</th>
              <th className="th">Sucursal</th>
              <th className="th text-center">Días trabajados</th>
              <th className="th text-center">Faltas</th>
              <th className="th text-center">Permisos</th>
              <th className="th text-center" title={`Se contaron sus horas hasta las ${defaultExitTime}`}>
                Olvidó salida
              </th>
              <th className="th text-center" title="Tienen entrada pero falta una marcación del almuerzo">
                Sin horas
              </th>
              <th className="th text-right">Horas trabajadas</th>
              <th className="th text-right">Atraso entrada</th>
              <th className="th text-right">Exceso almuerzo</th>
              <th className="th text-right">Minutos perdidos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summary.employees.map((e) => (
              <tr key={e.employeeId} className="hover:bg-slate-50">
                <td className="td font-medium">
                  <Link href={detailHref(e.employeeId)} className="hover:text-brand-700 hover:underline" title="Ver sus días">
                    {e.employeeName}
                  </Link>
                </td>
                <td className="td">{branchNames[e.branchId] ?? "—"}</td>
                <Cells t={e} />
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-brand-500 bg-brand-50">
            <tr>
              <td className="td font-bold" colSpan={2}>
                TOTAL ({summary.employees.length} {summary.employees.length === 1 ? "empleado" : "empleados"})
              </td>
              <Cells t={summary.total} bold />
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-slate-500">
        <li>
          <b>Horas trabajadas</b> = horas reales (de la entrada a la salida, menos el almuerzo que tomó). Es lo que se paga.
        </li>
        <li>
          <b>Minutos perdidos</b> = atraso de entrada + exceso de almuerzo. Ya están fuera de las horas reales: son
          informativos, no se restan otra vez.
        </li>
        <li>
          <b>Olvidó salida</b>: sus horas se cuentan hasta las {defaultExitTime}. <b>Sin horas</b>: falta alguna marcación del
          almuerzo; revisa esos días (toca el nombre).
        </li>
      </ul>
    </>
  );
}

function Cells({ t, bold }: { t: TotalsRow; bold?: boolean }) {
  const strong = bold ? "font-bold" : "";
  return (
    <>
      <td className={`td text-center ${strong}`}>{t.daysWorked}</td>
      <td className={`td text-center ${strong} ${t.absences ? "text-amber-700" : "text-slate-400"}`}>{t.absences}</td>
      <td className={`td text-center ${strong} ${t.permissionDays ? "" : "text-slate-400"}`}>{t.permissionDays}</td>
      <td className={`td text-center ${strong} ${t.daysAssumedExit ? "text-slate-700" : "text-slate-400"}`}>{t.daysAssumedExit}</td>
      <td className={`td text-center ${strong} ${t.daysWithoutHours ? "font-semibold text-amber-700" : "text-slate-400"}`}>
        {t.daysWithoutHours}
      </td>
      <td className="td text-right text-base font-bold whitespace-nowrap text-slate-900">{formatMinutes(t.workedMinutes)}</td>
      <td className={`td text-right whitespace-nowrap ${strong} ${t.lateMinutes ? "text-red-600" : "text-slate-400"}`}>
        {t.lateMinutes} min
      </td>
      <td className={`td text-right whitespace-nowrap ${strong} ${t.lunchExcessMinutes ? "text-red-600" : "text-slate-400"}`}>
        {t.lunchExcessMinutes} min
      </td>
      <td className="td text-right whitespace-nowrap">
        {t.lostMinutes ? (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{formatMinutes(t.lostMinutes)}</span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
    </>
  );
}
