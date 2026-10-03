import { describe, expect, it } from "vitest";
import {
  addDays,
  dateInTz,
  dateRange,
  formatMinutes,
  formatTime,
  isValidDateStr,
  isoWeekday,
  tzOffsetMinutes,
  utcBoundsForDates,
  zonedToUtc,
} from "@/lib/time";

describe("zona horaria America/Guayaquil (UTC−5)", () => {
  it("el desfase es −300 minutos todo el año (sin horario de verano)", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(-300);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(-300);
  });

  it("08:00 en Ecuador son las 13:00 UTC", () => {
    expect(zonedToUtc("2026-10-02", "08:00").toISOString()).toBe("2026-10-02T13:00:00.000Z");
  });

  it("la fecha local cambia a medianoche de Ecuador, no de UTC", () => {
    // 03:00 UTC del 3 de octubre = 22:00 del 2 de octubre en Ecuador
    expect(dateInTz(new Date("2026-10-03T03:00:00Z"))).toBe("2026-10-02");
    expect(dateInTz(new Date("2026-10-03T05:00:00Z"))).toBe("2026-10-03");
  });

  it("los límites UTC de un rango cubren el día local completo", () => {
    const { start, end } = utcBoundsForDates("2026-10-01", "2026-10-02");
    expect(start.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-03T05:00:00.000Z");
  });

  it("formatea horas en hora local", () => {
    expect(formatTime("2026-10-02T13:05:09Z")).toBe("08:05");
    expect(formatTime("2026-10-02T13:05:09Z", true)).toBe("08:05:09");
    expect(formatTime(null)).toBe("—");
  });
});

describe("utilidades de calendario", () => {
  it("suma días cruzando meses", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("día de la semana ISO", () => {
    expect(isoWeekday("2026-10-05")).toBe(1); // lunes
    expect(isoWeekday("2026-10-04")).toBe(7); // domingo
  });
  it("rango inclusivo de fechas", () => {
    expect(dateRange("2026-10-01", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(dateRange("2026-10-03", "2026-10-01")).toEqual([]);
  });
  it("valida fechas reales", () => {
    expect(isValidDateStr("2026-02-29")).toBe(false);
    expect(isValidDateStr("2028-02-29")).toBe(true);
    expect(isValidDateStr("2026-13-01")).toBe(false);
    expect(isValidDateStr("hoy")).toBe(false);
  });
  it("formatea minutos como horas", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(513)).toBe("8 h 33 min");
    expect(formatMinutes(null)).toBe("—");
  });
});
