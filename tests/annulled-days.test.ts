import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { annulmentLabel, buildDailyReport, summarizeByEmployee } from "@/lib/attendance/calc";
import { buildAttendanceWorkbook } from "@/lib/attendance/excel";
import type { ReportData } from "@/lib/attendance/report-data";

const ec = (date: string, time: string) => new Date(`${date}T${time}-05:00`).toISOString();

const employee = {
  id: "e1",
  full_name: "Luis Tamayo",
  cedula: "1712345675",
  branch_id: "b1",
  position: "Vendedor",
  entry_time: "07:00:00",
  work_days: [1, 2, 3, 4, 5],
  entry_times: {},
  active: true,
  created_at: "2026-01-01T00:00:00Z",
};

/** Lunes 02/11: trabajó con atraso y exceso de almuerzo · martes 03/11: no vino · miércoles 04/11: día normal. */
function day(date: string, entry: string, lunchOut: string, lunchIn: string, exit: string) {
  return [
    { employee_id: "e1", event_type: "ENTRADA" as const, occurred_at: ec(date, entry), work_date: date, branch_id: "b1" },
    { employee_id: "e1", event_type: "SALIDA_ALMUERZO" as const, occurred_at: ec(date, lunchOut), work_date: date, branch_id: "b1" },
    { employee_id: "e1", event_type: "REGRESO_ALMUERZO" as const, occurred_at: ec(date, lunchIn), work_date: date, branch_id: "b1" },
    { employee_id: "e1", event_type: "SALIDA_FINAL" as const, occurred_at: ec(date, exit), work_date: date, branch_id: "b1" },
  ];
}

function build(annulments: { employee_id: string; work_date: string; kind: string; reason: string | null }[]) {
  return buildDailyReport({
    employees: [employee],
    events: [...day("2026-11-02", "07:30:00", "12:00:00", "13:20:00", "17:00:00"), ...day("2026-11-04", "07:00:00", "12:00:00", "13:00:00", "17:00:00")],
    annulments,
    from: "2026-11-02",
    to: "2026-11-08",
    today: "2026-11-20",
    now: new Date("2026-11-20T23:00:00Z"),
    toleranceMinutes: 5,
    lunchAllowedMinutes: 60,
    lunchToleranceMinutes: 5,
    assumedExitTime: "17:00",
  });
}

const byDate = (rows: ReturnType<typeof build>, date: string) => rows.find((r) => r.date === date)!;

describe("días anulados y feriados", () => {
  it("sin anular: el lunes resta, el martes es falta", () => {
    const rows = build([]);
    expect(byDate(rows, "2026-11-02").annulment).toBeNull();
    const t = summarizeByEmployee(rows).total;
    expect(t.absences).toBe(3); // martes, jueves y viernes sin marcar
    expect(t.lateMinutes).toBe(25);
    expect(t.lunchExcessMinutes).toBe(15);
    expect(t.supplementaryMinutes).toBe(20 + 60); // lunes +20 (60 − 25 de atraso − 15 de exceso), miércoles +60
  });

  it("un día anulado se sigue viendo, pero no cuenta para nada", () => {
    const rows = build([{ employee_id: "e1", work_date: "2026-11-02", kind: "anulado", reason: " Falló la cámara " }]);
    const monday = byDate(rows, "2026-11-02");
    // Se conservan las marcaciones y los valores del día (para verlos tachados).
    expect(monday.annulment).toEqual({ kind: "anulado", reason: "Falló la cámara" });
    expect(monday.entrada).not.toBeNull();
    expect(monday.lateMinutes).toBe(25);
    expect(monday.supplementaryMinutes).toBe(20);

    const { employees, total } = summarizeByEmployee(rows);
    expect(total.lateMinutes).toBe(0);
    expect(total.lunchExcessMinutes).toBe(0);
    expect(total.lostMinutes).toBe(0);
    expect(total.daysWorked).toBe(1); // solo el miércoles
    expect(total.workedMinutes).toBe(9 * 60); // 07:00–17:00 menos 1 h de almuerzo
    expect(total.supplementaryMinutes).toBe(60);
    expect(employees).toHaveLength(1);
  });

  it("feriado: la falta de ese día desaparece", () => {
    const rows = build([{ employee_id: "e1", work_date: "2026-11-03", kind: "feriado", reason: null }]);
    const tuesday = byDate(rows, "2026-11-03");
    expect(tuesday.status).toBe("sin_marcaciones");
    expect(tuesday.annulment).toEqual({ kind: "feriado", reason: null });
    expect(summarizeByEmployee(rows).total.absences).toBe(2); // jueves y viernes
  });

  it("si todo el período está anulado, el empleado sigue en el resumen con ceros", () => {
    const rows = build(
      ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map((d) => ({
        employee_id: "e1",
        work_date: d,
        kind: "feriado",
        reason: "Feriado",
      })),
    );
    const { employees, total } = summarizeByEmployee(rows);
    expect(employees.map((e) => e.employeeName)).toEqual(["Luis Tamayo"]);
    expect(total).toMatchObject({ daysWorked: 0, absences: 0, workedMinutes: 0, supplementaryMinutes: 0, lateMinutes: 0 });
  });

  it("la anulación no hace aparecer días libres (sábado y domingo)", () => {
    const rows = build([{ employee_id: "e1", work_date: "2026-11-07", kind: "feriado", reason: null }]);
    expect(rows.find((r) => r.date === "2026-11-07")).toBeUndefined();
  });

  it("etiquetas", () => {
    expect(annulmentLabel({ kind: "feriado", reason: "Día de los Difuntos" })).toBe("Feriado");
    expect(annulmentLabel({ kind: "feriado", reason: "Día de los Difuntos" }, true)).toBe("Feriado: Día de los Difuntos");
    expect(annulmentLabel({ kind: "anulado", reason: null }, true)).toBe("Anulado");
  });

  it("Excel: la fila sale gris y tachada, y el TOTAL no la suma", async () => {
    const rows = build([{ employee_id: "e1", work_date: "2026-11-02", kind: "feriado", reason: "Día de los Difuntos" }]).filter(
      (r) => r.date === "2026-11-02" || r.date === "2026-11-04",
    );
    const report: ReportData = {
      rows,
      branches: [{ id: "b1", name: "Pucará" }],
      employees: [{ id: "e1", full_name: "Luis Tamayo", branch_id: "b1", active: true }],
      branchName: new Map([["b1", "Pucará"]]),
      settings: {
        entry_tolerance_minutes: 5,
        lunch_allowed_minutes: 60,
        lunch_tolerance_minutes: 5,
        default_exit_time: "17:00:00",
        half_day_exit_time: "13:00:00",
        no_lunch_after_time: "12:30:00",
        day_close_time: "18:30:00",
      },
      tolerancePeriods: [],
      totals: { rows: rows.length, late: 0, lunchExcess: 0, incomplete: 0, permissions: 0 },
    };
    const buf = await buildAttendanceWorkbook(report, {
      from: "2026-11-02",
      to: "2026-11-04",
      branchId: null,
      employeeId: null,
      onlyIssues: false,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Asistencia")!;
    // Fila 5 = miércoles 04 (normal); fila 6 = lunes 02 (feriado).
    const holiday = ws.getRow(6);
    expect(holiday.getCell(2).value).toBe("Luis Tamayo");
    expect(holiday.getCell(18).value).toBe("Feriado: Día de los Difuntos · no cuenta");
    expect((holiday.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFF1F5F9");
    expect(holiday.getCell(14).value).toBe(25); // el atraso se ve…
    expect(holiday.getCell(14).font?.strike).toBe(true); // …pero tachado
    expect(holiday.getCell(16).font?.strike).toBe(true);

    const totalRow = ws.getRow(7);
    expect(totalRow.getCell(14).value).toBe(0); // atraso del feriado fuera del total
    expect(totalRow.getCell(13).value).toBe(0);
    expect(totalRow.getCell(16).value).toBe(60); // solo el miércoles
    const worked = totalRow.getCell(15).value as Date;
    expect([worked.getUTCHours(), worked.getUTCMinutes()]).toEqual([9, 0]);

    const summary = wb.getWorksheet("Resumen por empleado")!;
    const headers = (summary.getRow(1).values as unknown[]).slice(1);
    const c = (name: string) => headers.indexOf(name) + 1;
    expect(summary.getRow(2).getCell(c("Días trabajados")).value).toBe(1);
    expect(summary.getRow(2).getCell(c("Atraso entrada (min)")).value).toBe(0);
  });
});
