import { describe, expect, it } from "vitest";
import {
  buildDailyReport,
  computeSupplementary,
  summarizeByEmployee,
  summarizeDay,
  type DayRules,
  type ReportEmployee,
} from "@/lib/attendance/calc";
import { describeTolerance, toleranceFor } from "@/lib/attendance/tolerance";
import { formatSignedMinutes } from "@/lib/time";

/** Instante a partir de una hora LOCAL de Ecuador (UTC−5). */
const ec = (date: string, time: string) => new Date(`${date}T${time}-05:00`);
const WED = "2026-10-28"; // miércoles
const SAT = "2026-10-24"; // sábado
const opts = { today: "2026-10-30", now: ec("2026-10-30", "09:00:00") };
const rules: DayRules = {
  entryTime: "07:00",
  toleranceMinutes: 5,
  lunchAllowedMinutes: 60,
  lunchToleranceMinutes: 5,
  assumedExitTime: "17:00",
  halfDayExitTime: "13:00",
  lunchCutoffTime: "12:30",
  dayCloseTime: "18:30",
};

/** Suplementarias de un día con Entrar / almuerzo / Salir (horas locales "HH:MM"). */
function supl(
  entrada: string,
  almuerzo: [string, string] | null,
  salida: string | null,
  r: DayRules = rules,
  date = WED,
) {
  const ev: Record<string, Date> = { ENTRADA: ec(date, `${entrada}:00`) };
  if (almuerzo) {
    ev.SALIDA_ALMUERZO = ec(date, `${almuerzo[0]}:00`);
    ev.REGRESO_ALMUERZO = ec(date, `${almuerzo[1]}:00`);
  }
  if (salida) ev.SALIDA_FINAL = ec(date, `${salida}:00`);
  const s = summarizeDay(date, ev, r, opts);
  return computeSupplementary(date, s, r);
}

describe("horas suplementarias (lunes a viernes, tolerancia 5 min)", () => {
  it("jornada de 7:00 a 17:00 con 1 h de almuerzo → +1 h", () => {
    expect(supl("07:00", ["12:00", "13:00"], "17:00")).toBe(60);
  });

  it("llegar antes de las 7:00 NO suma", () => {
    expect(supl("06:40", ["12:00", "13:00"], "17:00")).toBe(60);
  });

  it("entra 7:05 (dentro de la tolerancia) → +1 h; 7:06 → +59 min", () => {
    expect(supl("07:05", ["12:00", "13:00"], "17:00")).toBe(60);
    expect(supl("07:06", ["12:00", "13:00"], "17:00")).toBe(59);
  });

  it("entra 7:20 (15 min de atraso) → +45 min", () => {
    expect(supl("07:20", ["12:00", "13:00"], "17:00")).toBe(45);
  });

  it("almuerzo 1 h 05 no resta; 1 h 06 resta 1 min; 1 h 30 → +35 min", () => {
    expect(supl("07:00", ["12:00", "13:05"], "17:00")).toBe(60);
    expect(supl("07:00", ["12:00", "13:06"], "17:00")).toBe(59);
    expect(supl("07:00", ["12:00", "13:30"], "17:00")).toBe(35);
  });

  it("almorzar menos de 1 h no suma", () => {
    expect(supl("07:00", ["12:00", "12:40"], "17:00")).toBe(60);
  });

  it("quedarse más tarde NO suma: sale a las 18:00 → sigue en +1 h", () => {
    expect(supl("07:00", ["12:00", "13:00"], "18:00")).toBe(60);
    expect(supl("07:00", ["12:00", "13:00"], "17:40")).toBe(60);
  });

  it("nada suma: llega 6:40, almuerza 40 min y se queda hasta 18:30 → solo +1 h", () => {
    expect(supl("06:40", ["12:00", "12:40"], "18:30")).toBe(60);
  });

  it("quedarse más tarde no compensa el atraso: entra 7:20 y sale 17:30 → +45 min", () => {
    expect(supl("07:20", ["12:00", "13:00"], "17:30")).toBe(45);
  });

  it("irse antes sí resta: sale 16:00 → 0; 16:30 → +30 min", () => {
    expect(supl("07:00", ["12:00", "13:00"], "16:00")).toBe(0);
    expect(supl("07:00", ["12:00", "13:00"], "16:30")).toBe(30);
  });

  it("negativo = debe tiempo: entra 8:00 y almuerza 1 h 30 → −20 min; se va a las 15:00 → −1 h", () => {
    expect(supl("08:00", ["12:00", "13:30"], "17:00")).toBe(-20);
    expect(supl("07:00", ["12:00", "13:00"], "15:00")).toBe(-60);
  });

  it("cada empleado con su hora de entrada: Andrés (7:30) sale 17:00 → +30 min; aunque se quede hasta las 18:00, máximo +30 min", () => {
    const andres = { ...rules, entryTime: "07:30" };
    expect(supl("07:28", ["12:30", "13:30"], "17:00", andres)).toBe(30);
    expect(supl("07:28", ["12:30", "13:30"], "18:00", andres)).toBe(30);
    expect(supl("07:41", ["12:30", "13:30"], "18:00", andres)).toBe(24); // 6 min de atraso
  });

  it("media jornada entre semana: se cuenta solo hasta la salida de media jornada (13:00)", () => {
    expect(supl("07:00", null, "14:00", { ...rules, lunchExpected: false })).toBe(-120);
  });

  it("entró después de la salida normal → no cuenta nada de ese rato (debe las 8 h)", () => {
    expect(supl("17:30", null, "18:00")).toBe(-480);
  });

  it("olvidó marcar Salir → se calcula hasta las 17:00 (asumido)", () => {
    expect(supl("07:00", ["12:00", "13:00"], null)).toBe(60);
  });

  it("solo Entrar y Salir a las 17:00 sin almuerzo marcado → se descuenta 1 h asumida", () => {
    expect(supl("07:00", null, "17:00")).toBe(60);
  });

  it("se fue antes del almuerzo (7:00 → 11:30) → −3 h 30", () => {
    expect(supl("07:00", null, "11:30")).toBe(-210);
  });

  it("permiso por horas resta el tiempo de permiso dentro de la jornada", () => {
    // Permiso de 14:00 a 16:00 sin marcar salida/regreso: 2 h menos → −1 h.
    const ev = {
      ENTRADA: ec(WED, "07:00:00"),
      SALIDA_ALMUERZO: ec(WED, "12:00:00"),
      REGRESO_ALMUERZO: ec(WED, "13:00:00"),
      SALIDA_FINAL: ec(WED, "17:00:00"),
    };
    const s = summarizeDay(WED, ev, rules, opts, { kind: "horas", startTime: "14:00", hours: 2 });
    expect(computeSupplementary(WED, s, rules)).toBe(-60);
  });

  it("sábados no aplica (son horas extra, aparte)", () => {
    expect(supl("07:00", null, "13:00", { ...rules, lunchExpected: false }, SAT)).toBeNull();
  });

  it("faltas o días sin horas → no aplica", () => {
    const s = summarizeDay(WED, {}, rules, opts);
    expect(computeSupplementary(WED, s, rules)).toBeNull();
  });
});

describe("tolerancia con fecha de vigencia (desde hoy 5 min; antes 10)", () => {
  const periods = [
    { starts_on: "2000-01-01", entry_tolerance_minutes: 10, lunch_tolerance_minutes: 10 },
    { starts_on: "2026-10-30", entry_tolerance_minutes: 5, lunch_tolerance_minutes: 5 },
  ];
  const fallback = { entry: 5, lunch: 5 };

  it("cada día usa la tolerancia que regía ese día", () => {
    expect(toleranceFor(periods, "2026-10-29", fallback)).toEqual({ entry: 10, lunch: 10 });
    expect(toleranceFor(periods, "2026-10-30", fallback)).toEqual({ entry: 5, lunch: 5 });
    expect(toleranceFor([], "2026-10-30", fallback)).toEqual(fallback);
  });

  it("el encabezado explica el cambio solo si cae dentro del rango", () => {
    expect(describeTolerance(periods, "2026-10-01", "2026-10-29", fallback, "entry")).toBe("10 min");
    expect(describeTolerance(periods, "2026-10-30", "2026-10-30", fallback, "entry")).toBe("5 min");
    expect(describeTolerance(periods, "2026-10-01", "2026-10-30", fallback, "entry")).toBe(
      "10 min hasta el jue 29/10/2026 · 5 min desde el vie 30/10/2026",
    );
  });

  it("en el reporte: 7:08 el 29/10 es a tiempo (10 min) y el 30/10 tiene 3 min de atraso (5 min)", () => {
    const emp: ReportEmployee = {
      id: "e1",
      full_name: "Ana",
      cedula: "1712345675",
      branch_id: "b1",
      position: "Vendedora",
      entry_time: "07:00:00",
      work_days: [1, 2, 3, 4, 5, 6],
      entry_times: {},
      no_lunch_days: [6],
      active: true,
      created_at: "2026-09-01T12:00:00Z",
    };
    const day = (d: string) => [
      { employee_id: "e1", event_type: "ENTRADA" as const, occurred_at: ec(d, "07:08:00").toISOString(), work_date: d, branch_id: "b1" },
      { employee_id: "e1", event_type: "SALIDA_ALMUERZO" as const, occurred_at: ec(d, "12:00:00").toISOString(), work_date: d, branch_id: "b1" },
      { employee_id: "e1", event_type: "REGRESO_ALMUERZO" as const, occurred_at: ec(d, "13:08:00").toISOString(), work_date: d, branch_id: "b1" },
      { employee_id: "e1", event_type: "SALIDA_FINAL" as const, occurred_at: ec(d, "17:00:00").toISOString(), work_date: d, branch_id: "b1" },
    ];
    const rows = buildDailyReport({
      employees: [emp],
      events: [...day("2026-10-29"), ...day("2026-10-30")],
      from: "2026-10-29",
      to: "2026-10-30",
      today: "2026-10-31",
      now: ec("2026-10-31", "09:00:00"),
      toleranceMinutes: 5,
      lunchAllowedMinutes: 60,
      lunchToleranceMinutes: 5,
      assumedExitTime: "17:00",
      tolerancePeriods: periods,
    });
    const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
    // 29/10 (tolerancia 10): a tiempo y almuerzo de 1 h 08 sin exceso → +1 h
    expect(byDate["2026-10-29"].lateMinutes).toBe(0);
    expect(byDate["2026-10-29"].lunchExcessMinutes).toBe(0);
    expect(byDate["2026-10-29"].supplementaryMinutes).toBe(60);
    // 30/10 (tolerancia 5): 3 min de atraso y 3 min de exceso → +54 min
    expect(byDate["2026-10-30"].lateMinutes).toBe(3);
    expect(byDate["2026-10-30"].lunchExcessMinutes).toBe(3);
    expect(byDate["2026-10-30"].supplementaryMinutes).toBe(54);
    // Total neto del período
    expect(summarizeByEmployee(rows).total.supplementaryMinutes).toBe(114);
  });
});

describe("formato con signo", () => {
  it("+1 h 00 min, −20 min, 0 min y — cuando no aplica", () => {
    expect(formatSignedMinutes(60)).toBe("+1 h 00 min");
    expect(formatSignedMinutes(-20)).toBe("−20 min");
    expect(formatSignedMinutes(0)).toBe("0 min");
    expect(formatSignedMinutes(null)).toBe("—");
  });
});
