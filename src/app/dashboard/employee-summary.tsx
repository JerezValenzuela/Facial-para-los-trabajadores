import Link from "next/link";
import type { EmployeeTotals, TotalsRow } from "@/lib/attendance/calc";
import { formatMinutes, formatSignedMinutes } from "@/lib/time";

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
  halfDayExitTime = "13:00",
}: {
  summary: { employees: EmployeeTotals[]; total: TotalsRow };
  branchNames: Record<string, string>;
  detailHref: (employeeId: string) => string;
  defaultExitTime: string;
  /** Salida asumida en media jornada (sábado). */
  halfDayExitTime?: string;
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
              <th className="th text-center" title="Días con entrada que no marcó completos (amarillo)">
                No marcó bien
              </th>
              <th className="th text-center" title="Días con entrada cuyas horas no se pueden calcular">
                Sin horas
              </th>
              <th className="th text-right">Horas marcadas</th>
              <th className="th text-right" title="Horas de los días que no marcó bien">Horas asumidas</th>
              <th className="th text-right">Total horas</th>
              <th className="th text-right" title="Lunes a viernes: tiempo contable − 8 h por día (suma neta). Negativo = debe tiempo.">
                Suplementarias
              </th>
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
          <b>Horas marcadas</b> = días bien marcados (de la entrada a la salida, menos el almuerzo que tomó).{" "}
          <b>Horas asumidas</b> = días que no marcó bien: se cuenta hasta las {defaultExitTime} con 1 h de almuerzo (sábado / media jornada: hasta las {halfDayExitTime}, sin almuerzo).{" "}
          <b>Total horas</b> = las dos juntas. Si decides no pagar los días mal marcados, paga solo las <b>horas marcadas</b>.
        </li>
        <li>
          <b>Suplementarias</b> (lunes a viernes) = tiempo contable de cada día − 8 h. Nada suma (ni llegar antes, ni volver
          antes del almuerzo, ni quedarse después de las {defaultExitTime}): el atraso y el exceso de almuerzo (pasada la
          tolerancia), irse antes y los permisos restan. Es la suma neta del
          período: <span className="text-emerald-700">positivo</span> = horas a favor, <span className="text-red-600">negativo</span> = debe tiempo.
        </li>
        <li>
          <b>Minutos perdidos</b> = atraso de entrada + exceso de almuerzo. Ya están fuera de las horas reales: son
          informativos, no se restan otra vez.
        </li>
        <li>
          <b>No marcó bien</b>: días con entrada que no marcó completos (amarillo). Si salió al almuerzo y no volvió a marcar,
          solo se cuentan sus horas hasta el almuerzo. <b>Sin horas</b>: no se
          pudieron calcular (por ejemplo, entró después de la hora de salida asumida y no marcó “Salir”); revisa esos días (toca el nombre).
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
      <td className={`td text-center ${strong} ${t.daysBadlyMarked ? "font-semibold text-amber-700" : "text-slate-400"}`}>{t.daysBadlyMarked}</td>
      <td className={`td text-center ${strong} ${t.daysWithoutHours ? "font-semibold text-amber-700" : "text-slate-400"}`}>
        {t.daysWithoutHours}
      </td>
      <td className={`td text-right whitespace-nowrap ${strong}`}>{formatMinutes(t.markedMinutes)}</td>
      <td className={`td text-right whitespace-nowrap ${strong} ${t.assumedMinutes ? "text-amber-700" : "text-slate-400"}`}>
        {formatMinutes(t.assumedMinutes)}
      </td>
      <td className="td text-right text-base font-bold whitespace-nowrap text-slate-900">{formatMinutes(t.workedMinutes)}</td>
      <td
        className={`td text-right text-base font-bold whitespace-nowrap ${
          t.supplementaryMinutes > 0 ? "text-emerald-700" : t.supplementaryMinutes < 0 ? "text-red-600" : "text-slate-400"
        }`}
      >
        {formatSignedMinutes(t.supplementaryMinutes)}
      </td>
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
