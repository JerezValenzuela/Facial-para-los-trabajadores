import "server-only";
import ExcelJS from "exceljs";
import { STATUS_LABEL, summarizeByEmployee, type ReportRow } from "./calc";
import { formatPermission } from "./permissions";
import type { ReportData } from "./report-data";
import type { ReportFilters } from "./filters";
import { formatDateTime, formatSignedMinutes, formatTime, TZ } from "@/lib/time";
import { describeTolerance } from "./tolerance";

const RED_FILL = "FFFDE2E2";
const RED_TEXT = "FFB91C1C";
const YELLOW_FILL = "FFFEF3C7";
const BLUE_FILL = "FFE0F2FE";
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

const TOTAL_FILL = "FFFFEDD5";
const GREEN_TEXT = "FF047857";
/** Minutos con signo (Excel no muestra horas negativas en formato de hora). */
const SIGNED_MIN = '+0" min";-0" min";0" min"';
const MUTED_TEXT = "FF64748B";

/**
 * Libro Excel con formato profesional; respeta exactamente los filtros del dashboard.
 * `photos`: miniaturas JPEG por ruta de evidencia (las descarga la ruta de exportación).
 * `openSummary`: el archivo se abre directamente en la hoja "Resumen por empleado".
 */
export async function buildAttendanceWorkbook(
  report: ReportData,
  filters: ReportFilters,
  photos: Map<string, Buffer> = new Map(),
  options: { openSummary?: boolean } = {},
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
    { header: "Horas suplementarias (min)", key: "supl", width: 14, fmt: SIGNED_MIN },
    { header: "Permiso", key: "permission", width: 30 },
    { header: "Estado", key: "status", width: 26 },
    { header: "Foto", key: "photo", width: 10 },
    { header: "Observaciones", key: "observation", width: 45 },
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
  const tol = { entry: report.settings.entry_tolerance_minutes, lunch: report.settings.lunch_tolerance_minutes };
  ws.getCell(2, 1).value =
    `Período: ${filters.from.split("-").reverse().join("/")} al ${filters.to.split("-").reverse().join("/")}` +
    `  ·  Sucursal: ${branchFilter}  ·  Empleado: ${employeeFilter}` +
    `${filters.onlyIssues ? "  ·  Solo novedades" : ""}` +
    `  ·  Tolerancia de entrada: ${describeTolerance(report.tolerancePeriods, filters.from, filters.to, tol, "entry")}  ·  Almuerzo permitido: ${report.settings.lunch_allowed_minutes} min` +
    ` (tolerancia: ${describeTolerance(report.tolerancePeriods, filters.from, filters.to, tol, "lunch")})  ·  Salida si olvidan marcar: ${report.settings.default_exit_time.slice(0, 5)} (sábado: ${report.settings.half_day_exit_time.slice(0, 5)})` +
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
      out: excelTime(r.salidaFinal ?? r.assumedExit),
      lunchAllowed: r.lunchExpected ? minutesToDuration(report.settings.lunch_allowed_minutes) : null,
      lunch: r.lunchOngoing
        ? null
        : r.assumedLunch
          ? minutesToDuration(report.settings.lunch_allowed_minutes)
          : r.arrivedAfterLunch
            ? "Entró ya almorzado"
            : r.lunchMinutes === null && !r.lunchExpected && r.entrada
              ? "Sin almuerzo"
            : minutesToDuration(r.lunchMinutes),
      excess: r.lunchOngoing ? null : r.lunchExcessMinutes,
      late: r.lateMinutes,
      worked: minutesToDuration(r.workedMinutes),
      supl: r.supplementaryMinutes,
      permission: formatPermission(r.permission) || null,
      status: r.leftAtLunch
        ? `${STATUS_LABEL[r.status]} · salió al almuerzo y no volvió a marcar: horas solo hasta el almuerzo`
        : r.assumedExit || r.assumedLunch
          ? `${STATUS_LABEL[r.status]} · no marcó bien: horas asumidas` +
            (r.assumedExit ? ` (salida ${formatTime(r.assumedExit)}` : " (") +
            (r.assumedExit && r.assumedLunch ? ", " : "") +
            (r.assumedLunch ? `${report.settings.lunch_allowed_minutes} min de almuerzo` : "") +
            ")"
          : STATUS_LABEL[r.status],
      photo: null,
      observation: r.observation,
    };
    const incomplete = r.status === "incompleto" || r.status === "sin_marcaciones";
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = (values[c.key] ?? null) as ExcelJS.CellValue;
      if (c.fmt) cell.numFmt = c.fmt;
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      cell.alignment =
        c.key === "observation"
          ? { vertical: "middle", horizontal: "left", wrapText: true }
          : { vertical: "middle", horizontal: i <= 4 ? "left" : "center" };
      if (r.flagged) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_FILL } };
      else if (incomplete) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_FILL } };
      else if (r.status === "permiso") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_FILL } };
    });
    // Minutos en exceso bien visibles.
    if (r.lunchExcessMinutes > 0 && !r.lunchOngoing) row.getCell(col("excess")).font = { bold: true, color: { argb: RED_TEXT } };
    if (r.lateMinutes > 0) row.getCell(col("late")).font = { bold: true, color: { argb: RED_TEXT } };
    if (r.supplementaryMinutes !== null) {
      const supl = row.getCell(col("supl"));
      supl.font = {
        bold: true,
        italic: r.supplementaryAssumed,
        color: { argb: r.supplementaryMinutes > 0 ? GREEN_TEXT : r.supplementaryMinutes < 0 ? RED_TEXT : MUTED_TEXT },
      };
      if (r.supplementaryAssumed) supl.note = "Calculado con salida o almuerzo asumidos (no marcó bien).";
    }
    if (r.assumedExit) {
      // Salida asumida (olvidó marcar): en cursiva gris y con nota.
      const out = row.getCell(col("out"));
      out.font = { italic: true, color: { argb: MUTED_TEXT } };
      out.note = `Olvidó marcar "Salir": sus horas se cuentan hasta las ${formatTime(r.assumedExit)}.`;
    }
    if (r.assumedLunch) {
      const lunchCell = row.getCell(col("lunch"));
      lunchCell.font = { italic: true, color: { argb: MUTED_TEXT } };
      lunchCell.note = `No marcó el almuerzo: se descuenta el almuerzo permitido (${report.settings.lunch_allowed_minutes} min).`;
    }
    if (r.leftAtLunch) row.getCell(col("status")).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    if (r.assumedExit || r.assumedLunch) {
      row.getCell(col("worked")).font = { italic: true, color: { argb: MUTED_TEXT } };
      row.getCell(col("status")).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    }

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

  const { employees: totalsByEmployee, total } = summarizeByEmployee(report.rows);

  // Fila TOTAL (fuera del autofiltro): suma de horas, excesos y atrasos del período filtrado.
  const totalRow = ws.getRow(5 + report.rows.length);
  totalRow.getCell(col("name")).value = `TOTAL (${report.rows.length} ${report.rows.length === 1 ? "fila" : "filas"})`;
  totalRow.getCell(col("excess")).value = total.lunchExcessMinutes;
  totalRow.getCell(col("late")).value = total.lateMinutes;
  totalRow.getCell(col("worked")).value = minutesToDuration(total.workedMinutes);
  totalRow.getCell(col("worked")).numFmt = "[h]:mm";
  totalRow.getCell(col("supl")).value = total.supplementaryMinutes;
  totalRow.getCell(col("supl")).numFmt = SIGNED_MIN;
  // En horas, al lado (texto legible): "+12 h 30 min".
  totalRow.getCell(col("supl") + 1).value = formatSignedMinutes(total.supplementaryMinutes);
  columns.forEach((_, i) => {
    const cell = totalRow.getCell(i + 1);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    cell.border = { top: { style: "medium", color: { argb: HEADER_FILL } }, bottom: BORDER };
    cell.alignment = { vertical: "middle", horizontal: i <= 4 ? "left" : "center" };
  });
  totalRow.height = 22;

  const legendRow = 7 + report.rows.length;
  ws.getCell(legendRow, 1).value =
    "Rojo: atraso o exceso de almuerzo · Amarillo: marcaciones incompletas · Celeste: permiso todo el día · " +
    "Gris cursiva: no marcó bien, horas asumidas (hasta la salida asumida, con el almuerzo permitido) · Horas en America/Guayaquil · " +
    "Foto: miniatura de la entrada del día (o de la primera marcación)";
  ws.getCell(legendRow, 1).font = { italic: true, size: 9, color: { argb: MUTED_TEXT } };

  // ------------------------------------------------------------------ Resumen por empleado
  const sum = wb.addWorksheet("Resumen por empleado", { views: [{ state: "frozen", ySplit: 1 }] });
  sum.columns = [
    { header: "Empleado", key: "name", width: 30 },
    { header: "Sucursal", key: "branch", width: 14 },
    { header: "Días trabajados", key: "daysWorked", width: 11 },
    { header: "Faltas (sin marcar)", key: "absences", width: 11 },
    { header: "Días con permiso", key: "permissionDays", width: 11 },
    { header: "No marcó bien (días)", key: "daysBadlyMarked", width: 12 },
    { header: "Días sin horas (revisar)", key: "daysWithoutHours", width: 12 },
    { header: "Horas marcadas", key: "marked", width: 12 },
    { header: "Horas asumidas (no marcó bien)", key: "assumed", width: 14 },
    { header: "TOTAL HORAS", key: "worked", width: 13 },
    { header: "Suplementarias (min)", key: "supl", width: 13 },
    { header: "Suplementarias (horas)", key: "suplText", width: 15 },
    { header: "Atraso entrada (min)", key: "late", width: 12 },
    { header: "Exceso almuerzo (min)", key: "excess", width: 12 },
    { header: "Minutos perdidos (total)", key: "lost", width: 13 },
  ];
  const summaryRow = (t: (typeof totalsByEmployee)[number] | typeof total, name: string, branch: string) => {
    const row = sum.addRow({
      name,
      branch,
      daysWorked: t.daysWorked,
      absences: t.absences,
      permissionDays: t.permissionDays,
      daysBadlyMarked: t.daysBadlyMarked,
      daysWithoutHours: t.daysWithoutHours,
      marked: t.markedMinutes / 1440,
      assumed: t.assumedMinutes / 1440,
      worked: t.workedMinutes / 1440,
      supl: t.supplementaryMinutes,
      suplText: formatSignedMinutes(t.supplementaryMinutes),
      late: t.lateMinutes,
      excess: t.lunchExcessMinutes,
      lost: t.lostMinutes,
    });
    for (const k of ["marked", "assumed", "worked"]) row.getCell(k).numFmt = "[h]:mm";
    row.getCell("supl").numFmt = SIGNED_MIN;
    const suplColor = t.supplementaryMinutes > 0 ? GREEN_TEXT : t.supplementaryMinutes < 0 ? RED_TEXT : MUTED_TEXT;
    row.getCell("supl").font = { bold: true, color: { argb: suplColor } };
    row.getCell("suplText").font = { bold: true, color: { argb: suplColor } };
    row.getCell("worked").font = { bold: true };
    if (t.assumedMinutes > 0) row.getCell("assumed").font = { italic: true, color: { argb: "FFB45309" } };
    row.eachCell((cell, n) => {
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      cell.alignment = { vertical: "middle", horizontal: n <= 2 ? "left" : "center" };
    });
    if (t.lostMinutes > 0) row.getCell("lost").font = { bold: true, color: { argb: RED_TEXT } };
    if (t.daysWithoutHours > 0) row.getCell("daysWithoutHours").font = { bold: true, color: { argb: "FFB45309" } };
    return row;
  };
  for (const e of totalsByEmployee) summaryRow(e, e.employeeName, report.branchName.get(e.branchId) ?? "");
  const grand = summaryRow(total, "TOTAL", "");
  grand.eachCell((cell) => {
    cell.font = { ...(cell.font ?? {}), bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    cell.border = { top: { style: "medium", color: { argb: HEADER_FILL } }, bottom: BORDER, left: BORDER, right: BORDER };
  });
  sum.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sum.getRow(1).height = 44;

  const notes = [
    `Período: ${filters.from.split("-").reverse().join("/")} al ${filters.to.split("-").reverse().join("/")}  ·  Sucursal: ${branchFilter}  ·  Empleado: ${employeeFilter}`,
    "Horas marcadas = días bien marcados (de la entrada a la salida, menos el almuerzo que tomó).",
    `Horas asumidas = días que no marcó bien: se cuenta hasta las ${report.settings.default_exit_time.slice(0, 5)} con ${report.settings.lunch_allowed_minutes} min de almuerzo (sábado / media jornada: hasta las ${report.settings.half_day_exit_time.slice(0, 5)}, sin almuerzo). TOTAL HORAS = marcadas + asumidas. Si no se pagan los días mal marcados, pagar solo las horas marcadas.`,
    "Minutos perdidos = atraso de entrada + exceso de almuerzo. Ya están fuera de las horas reales: son informativos, NO se restan otra vez.",
    "Horas suplementarias (lunes a viernes) = tiempo contable de cada día − 8 h: llegar antes no suma; atraso y exceso de almuerzo (pasada la tolerancia) restan; quedarse más tarde suma; los permisos restan. Positivo = horas a favor; negativo = debe tiempo. Sábados: no aplica (horas extra).",
    "No marcó bien = días con entrada incompletos. Si salió al almuerzo y no volvió a marcar, solo se cuentan sus horas hasta el almuerzo (horas marcadas).",
    "Días sin horas (revisar): no se pudieron calcular (ej. entró después de la hora de salida asumida y no marcó \"Salir\"); revisar.",
  ];
  notes.forEach((text, i) => {
    const cell = sum.getCell(totalsByEmployee.length + 4 + i, 1);
    cell.value = text;
    cell.font = { italic: true, size: 9, color: { argb: MUTED_TEXT } };
  });

  if (options.openSummary) wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: "visible" }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
