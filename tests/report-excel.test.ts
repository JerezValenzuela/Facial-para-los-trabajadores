import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildAttendanceWorkbook } from "@/lib/attendance/excel";
import { buildDailyReport } from "@/lib/attendance/calc";
import { parseReportFilters } from "@/lib/attendance/filters";
import type { ReportData } from "@/lib/attendance/report-data";

const ec = (date: string, time: string) => new Date(`${date}T${time}-05:00`).toISOString();

describe("filtros del reporte", () => {
  const now = new Date("2026-10-05T17:00:00Z");
  it("por defecto: últimos 7 días hasta hoy", () => {
    expect(parseReportFilters({}, now)).toMatchObject({ from: "2026-09-29", to: "2026-10-05", branchId: null });
  });
  it("invierte fechas cruzadas y limita el rango a 93 días", () => {
    expect(parseReportFilters({ desde: "2026-10-05", hasta: "2026-10-01" }, now)).toMatchObject({ from: "2026-10-01", to: "2026-10-05" });
    expect(parseReportFilters({ desde: "2025-01-01", hasta: "2026-10-05" }, now).from).toBe("2026-07-05");
  });
  it("ignora identificadores inválidos (evita inyección en filtros)", () => {
    expect(parseReportFilters({ sucursal: "' or 1=1 --", empleado: "x" }, now)).toMatchObject({ branchId: null, employeeId: null });
  });
});

describe("exportación a Excel", () => {
  it("genera filas rojas, amarillas, formatos de hora y resumen", async () => {
    const rows = buildDailyReport({
      employees: [
        { id: "e1", full_name: "Ana Pérez", cedula: "1712345675", branch_id: "b1", position: "Cajera", entry_time: "08:00:00", active: true, created_at: "2026-01-01T00:00:00Z" },
      ],
      events: [
        { employee_id: "e1", event_type: "ENTRADA", occurred_at: ec("2026-10-01", "08:20:00"), work_date: "2026-10-01", branch_id: "b1", evidence_path: "eventos/2026-10-01/entrada.jpg" },
        { employee_id: "e1", event_type: "SALIDA_ALMUERZO", occurred_at: ec("2026-10-01", "13:00:00"), work_date: "2026-10-01", branch_id: "b1" },
        { employee_id: "e1", event_type: "REGRESO_ALMUERZO", occurred_at: ec("2026-10-01", "14:10:00"), work_date: "2026-10-01", branch_id: "b1" },
        { employee_id: "e1", event_type: "SALIDA_FINAL", occurred_at: ec("2026-10-01", "18:00:00"), work_date: "2026-10-01", branch_id: "b1" },
        { employee_id: "e1", event_type: "ENTRADA", occurred_at: ec("2026-10-02", "07:55:00"), work_date: "2026-10-02", branch_id: "b1" },
      ],
      from: "2026-10-01",
      to: "2026-10-02",
      today: "2026-10-05",
      now: new Date("2026-10-05T17:00:00Z"),
      workDays: [1, 2, 3, 4, 5, 6],
      toleranceMinutes: 7,
      lunchAllowedMinutes: 60,
    });
    const report: ReportData = {
      rows,
      branches: [{ id: "b1", name: "Pucará" }],
      employees: [{ id: "e1", full_name: "Ana Pérez", branch_id: "b1", active: true }],
      branchName: new Map([["b1", "Pucará"]]),
      settings: { entry_tolerance_minutes: 7, lunch_allowed_minutes: 60, work_days: [1, 2, 3, 4, 5, 6] },
      totals: { rows: rows.length, late: 1, lunchExcess: 1, incomplete: 1 },
    };
    const jpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
      "base64",
    );
    expect(rows.find((r) => r.date === "2026-10-01")?.photoPath).toBe("eventos/2026-10-01/entrada.jpg");
    const buf = await buildAttendanceWorkbook(
      report,
      { from: "2026-10-01", to: "2026-10-02", branchId: null, employeeId: null, onlyIssues: false },
      new Map([["eventos/2026-10-01/entrada.jpg", jpeg]]),
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Asistencia")!;
    expect(ws.getCell("A1").value).toBe("JerezCons — Reporte de asistencia");
    expect(ws.getRow(4).getCell(2).value).toBe("Empleado");

    // Fila 5 = 2026-10-02 (incompleto, amarilla); fila 6 = 2026-10-01 (atraso + exceso, roja)
    const yellow = ws.getRow(5);
    const red = ws.getRow(6);
    expect(ws.getRow(4).getCell(16).value).toBe("Estado");
    expect(ws.getRow(4).getCell(17).value).toBe("Foto");
    expect(ws.getRow(4).getCell(11).value).toBe("Almuerzo permitido");
    expect(ws.getRow(4).getCell(12).value).toBe("Almuerzo tomado");
    expect(yellow.getCell(16).value).toBe("Incompleto");
    expect((yellow.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFEF3C7");
    expect((red.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFDE2E2");
    expect(red.getCell(13).value).toBe(10); // exceso de almuerzo
    expect(red.getCell(14).value).toBe(13); // atraso
    expect(red.getCell(14).font?.color?.argb).toBe("FFB91C1C");
    const permitido = red.getCell(11).value as Date; // 1:00 (una hora)
    expect([permitido.getUTCHours(), permitido.getUTCMinutes()]).toEqual([1, 0]);
    expect(red.getCell(7).numFmt).toBe("hh:mm");
    // exceljs devuelve las celdas con formato de hora como fecha sobre la época de Excel (1899-12-30).
    const entrada = red.getCell(7).value as Date;
    expect([entrada.getUTCHours(), entrada.getUTCMinutes()]).toEqual([8, 20]); // 08:20 hora local de Ecuador
    expect(red.getCell(15).numFmt).toBe("[h]:mm");

    // Foto incrustada al lado del Estado, en la fila roja (6); la amarilla no tiene foto.
    const images = ws.getImages();
    expect(images).toHaveLength(1);
    expect(Math.floor(images[0].range.tl.nativeCol)).toBe(16);
    expect(Math.floor(images[0].range.tl.nativeRow)).toBe(5);
    expect(red.height).toBeGreaterThan(40);

    const summary = wb.getWorksheet("Resumen por empleado")!;
    expect(summary.getRow(2).getCell(1).value).toBe("Ana Pérez");
    expect(summary.getRow(2).getCell(7).value).toBe(13);
  });
});
