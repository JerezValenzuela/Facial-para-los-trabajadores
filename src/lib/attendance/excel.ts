import "server-only";
import ExcelJS from "exceljs";
import { STATUS_LABEL, type ReportRow } from "./calc";
import type { ReportData } from "./report-data";
import type { ReportFilters } from "./filters";
import { formatDateTime, TZ } from "@/lib/time";

const RED_FILL = "FFFDE2E2";
const RED_TEXT = "FFB91C1C";
const YELLOW_FILL = "FFFEF3C7";
const HEADER_FILL = "FFEA580C";
const BORDER = { style: "thin" as const, color: { argb: "FFE2E8F0" } };

/** Hora local de Ecuador como fracción de día (valor de hora nativo de Excel). */
function excelTime(d: Date | null): number | null {
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (n("hour") * 3600 + n("minute") * 60 + n("second")) / 86400;
}

function excelDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function minutesToDuration(min: number | null): number | null {
  return min === null ? null : min / 1440;
}

const PHOTO_PX = 56;
const PHOTO_ROW_HEIGHT = 46; // puntos (≈ 61 px)

/**
 * Libro Excel con formato profesional; respeta exactamente los filtros del dashboard.
 * `photos`: miniaturas JPEG por ruta de evidencia (las descarga la ruta de exportación).
 */
export async function buildAttendanceWorkbook(
  report: ReportData,
  filters: ReportFilters,
  photos: Map<string, Buffer> = new Map(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "JerezCons Asistencia";
  wb.created = new Date();

  // ------------------------------------------------------------------ Asistencia
  const ws = wb.addWorksheet("Asistencia", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });

  const columns: { header: string; key: string; width: number; fmt?: string }[] = [
    { header: "Fecha", key: "date", width: 12, fmt: "dd/mm/yyyy" },
    { header: "Empleado", key: "name", width: 30 },
    { header: "Cédula", key: "cedula", width: 13 },
    { header: "Sucursal", key: "branch", width: 13 },
    { header: "Cargo", key: "position", width: 16 },
    { header: "Horario", key: "schedule", width: 9 },
    { header: "Entrada", key: "in", width: 10, fmt: "hh:mm" },
    { header: "Salida almuerzo", key: "lunchOut", width: 10, fmt: "hh:mm" },
    { header: "Regreso almuerzo", key: "lunchIn", width: 10, fmt: "hh:mm" },
    { header: "Salida final", key: "out", width: 10, fmt: "hh:mm" },
    { header: "Almuerzo permitido", key: "lunchAllowed", width: 11, fmt: "[h]:mm" },
    { header: "Almuerzo tomado", key: "lunch", width: 11, fmt: "[h]:mm" },
    { header: "Exceso almuerzo (min)", key: "excess", width: 11, fmt: "0" },
    { header: "Atraso (min)", key: "late", width: 10, fmt: "0" },
    { header: "Horas trabajadas", key: "worked", width: 11, fmt: "[h]:mm" },
    { header: "Estado", key: "status", width: 26 },
    { header: "Foto", key: "photo", width: 10 },
  ];
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const col = (key: string) => columns.findIndex((c) => c.key === key) + 1;

  const branchFilter = filters.branchId ? report.branchName.get(filters.branchId) ?? "—" : "Todas";
  const employeeFilter = filters.employeeId
    ? report.employees.find((e) => e.id === filters.employeeId)?.full_name ?? "—"
    : "Todos";

  ws.mergeCells(1, 1, 1, columns.length);
  ws.getCell(1, 1).value = "JerezCons — Reporte de asistencia";
  ws.getCell(1, 1).font = { size: 16, bold: true, color: { argb: "FF0F172A" } };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, columns.length);
  ws.getCell(2, 1).value =
    `Período: ${filters.from.split("-").reverse().join("/")} al ${filters.to.split("-").reverse().join("/")}` +
    `  ·  Sucursal: ${branchFilter}  ·  Empleado: ${employeeFilter}` +
    `${filters.onlyIssues ? "  ·  Solo novedades" : ""}` +
    `  ·  Tolerancia: ${report.settings.entry_tolerance_minutes} min  ·  Almuerzo permitido: ${report.settings.lunch_allowed_minutes} min` +
    `  ·  Generado: ${formatDateTime(new Date())} (hora de Ecuador)`;
  ws.getCell(2, 1).font = { size: 10, color: { argb: "FF475569" } };

  const header = ws.getRow(4);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  });
  header.height = 32;

  report.rows.forEach((r: ReportRow, idx) => {
    const row = ws.getRow(5 + idx);
    const values: Record<string, unknown> = {
      date: excelDate(r.date),
      name: r.employeeName,
      cedula: r.cedula,
      branch: report.branchName.get(r.branchId) ?? "",
      position: r.position,
      schedule: r.entryTime,
      in: excelTime(r.entrada),
      lunchOut: excelTime(r.salidaAlmuerzo),
      lunchIn: excelTime(r.regresoAlmuerzo),
      out: excelTime(r.salidaFinal),
      lunchAllowed: minutesToDuration(report.settings.lunch_allowed_minutes),
      lunch: r.lunchOngoing ? null : minutesToDuration(r.lunchMinutes),
      excess: r.lunchOngoing ? null : r.lunchExcessMinutes,
      late: r.lateMinutes,
      worked: minutesToDuration(r.workedMinutes),
      status: STATUS_LABEL[r.status],
      photo: null,
    };
    const incomplete = r.status === "incompleto" || r.status === "sin_marcaciones";
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = (values[c.key] ?? null) as ExcelJS.CellValue;
      if (c.fmt) cell.numFmt = c.fmt;
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      cell.alignment = { vertical: "middle", horizontal: i <= 4 ? "left" : "center" };
      if (r.flagged) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_FILL } };
      else if (incomplete) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_FILL } };
    });
    // Minutos en exceso bien visibles.
    if (r.lunchExcessMinutes > 0 && !r.lunchOngoing) row.getCell(col("excess")).font = { bold: true, color: { argb: RED_TEXT } };
    if (r.lateMinutes > 0) row.getCell(col("late")).font = { bold: true, color: { argb: RED_TEXT } };

    // Foto del trabajador (miniatura de su marcación de ese día), al lado del estado.
    const jpeg = r.photoPath ? photos.get(r.photoPath) : undefined;
    if (jpeg) {
      row.height = PHOTO_ROW_HEIGHT;
      const imageId = wb.addImage({ buffer: jpeg as unknown as ExcelJS.Buffer, extension: "jpeg" });
      ws.addImage(imageId, {
        tl: { col: col("photo") - 1 + 0.12, row: row.number - 1 + 0.06 },
        ext: { width: PHOTO_PX, height: PHOTO_PX },
        editAs: "oneCell",
      });
    } else if (r.photoPath || r.status !== "sin_marcaciones") {
      const cell = row.getCell(col("photo"));
      cell.value = "—";
      cell.font = { color: { argb: "FF94A3B8" } };
    }
  });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + Math.max(report.rows.length, 1), column: columns.length } };

  const legendRow = 6 + report.rows.length;
  ws.getCell(legendRow, 1).value = "Rojo: atraso o exceso de almuerzo · Amarillo: marcaciones incompletas · Horas en America/Guayaquil · Foto: miniatura de la entrada del día (o de la primera marcación)";
  ws.getCell(legendRow, 1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };

  // ------------------------------------------------------------------ Resumen
  const sum = wb.addWorksheet("Resumen por empleado", { views: [{ state: "frozen", ySplit: 1 }] });
  sum.columns = [
    { header: "Empleado", key: "name", width: 30 },
    { header: "Sucursal", key: "branch", width: 14 },
    { header: "Días con registros", key: "days", width: 12 },
    { header: "Días completos", key: "complete", width: 12 },
    { header: "Días incompletos", key: "incomplete", width: 12 },
    { header: "Atrasos (veces)", key: "lateCount", width: 12 },
    { header: "Atraso total (min)", key: "lateTotal", width: 13 },
    { header: "Excesos almuerzo (veces)", key: "excessCount", width: 13 },
    { header: "Exceso total (min)", key: "excessTotal", width: 13 },
    { header: "Horas trabajadas", key: "worked", width: 13 },
  ];
  const agg = new Map<string, { name: string; branch: string; days: number; complete: number; incomplete: number; lateCount: number; lateTotal: number; excessCount: number; excessTotal: number; worked: number }>();
  for (const r of report.rows) {
    const a = agg.get(r.employeeId) ?? {
      name: r.employeeName,
      branch: report.branchName.get(r.branchId) ?? "",
      days: 0, complete: 0, incomplete: 0, lateCount: 0, lateTotal: 0, excessCount: 0, excessTotal: 0, worked: 0,
    };
    if (r.status !== "sin_marcaciones") a.days += 1;
    if (r.status === "completo") a.complete += 1;
    if (r.status === "incompleto" || r.status === "sin_marcaciones") a.incomplete += 1;
    if (r.lateMinutes > 0) { a.lateCount += 1; a.lateTotal += r.lateMinutes; }
    if (r.lunchExcessMinutes > 0 && !r.lunchOngoing) { a.excessCount += 1; a.excessTotal += r.lunchExcessMinutes; }
    a.worked += r.workedMinutes ?? 0;
    agg.set(r.employeeId, a);
  }
  [...agg.values()]
    .sort((x, y) => x.name.localeCompare(y.name, "es"))
    .forEach((a) => {
      const row = sum.addRow({ ...a, worked: a.worked / 1440 });
      row.getCell("worked").numFmt = "[h]:mm";
      if (a.lateTotal > 0) row.getCell("lateTotal").font = { bold: true, color: { argb: RED_TEXT } };
      if (a.excessTotal > 0) row.getCell("excessTotal").font = { bold: true, color: { argb: RED_TEXT } };
    });
  sum.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sum.getRow(1).height = 32;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
