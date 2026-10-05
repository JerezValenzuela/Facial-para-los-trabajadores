import { describe, expect, it } from "vitest";
import {
  buildDailyReport,
  computeLateMinutes,
  computeLunch,
  summarizeDay,
  type DayRules,
  type ReportEmployee,
} from "@/lib/attendance/calc";

/** Instante a partir de una hora LOCAL de Ecuador (UTC−5). */
const ec = (date: string, time: string) => new Date(`${date}T${time}-05:00`);
const rules: DayRules = { entryTime: "08:00", toleranceMinutes: 7, lunchAllowedMinutes: 60 };
const DAY = "2026-10-01"; // jueves
const opts = { today: "2026-10-05", now: ec("2026-10-05", "12:00:00") };

describe("atraso = entrada real − horario − tolerancia", () => {
  it("dentro de la tolerancia no hay atraso", () => {
    expect(computeLateMinutes(ec(DAY, "08:00:00"), DAY, rules)).toBe(0);
    expect(computeLateMinutes(ec(DAY, "08:07:59"), DAY, rules)).toBe(0);
  });
  it("después de la tolerancia cuenta los minutos que exceden", () => {
    expect(computeLateMinutes(ec(DAY, "08:08:00"), DAY, rules)).toBe(1);
    expect(computeLateMinutes(ec(DAY, "08:20:30"), DAY, rules)).toBe(13);
  });
  it("llegar temprano nunca da atraso negativo", () => {
    expect(computeLateMinutes(ec(DAY, "07:40:00"), DAY, rules)).toBe(0);
  });
  it("respeta horarios con segundos (08:30:00)", () => {
    expect(computeLateMinutes(ec(DAY, "08:45:00"), DAY, { ...rules, entryTime: "08:30:00" })).toBe(8);
  });
});

describe("almuerzo y exceso", () => {
  it("almuerzo exacto de 60 min no tiene exceso", () => {
    expect(computeLunch(ec(DAY, "13:00:00"), ec(DAY, "14:00:00"), 60)).toEqual({ minutes: 60, excess: 0 });
  });
  it("exceso = duración − permitido", () => {
    expect(computeLunch(ec(DAY, "13:00:00"), ec(DAY, "14:12:40"), 60)).toEqual({ minutes: 72, excess: 12 });
  });
  it("almuerzo corto no da exceso negativo", () => {
    expect(computeLunch(ec(DAY, "13:00:00"), ec(DAY, "13:30:00"), 60)).toEqual({ minutes: 30, excess: 0 });
  });
});

describe("resumen del día", () => {
  const full = {
    ENTRADA: ec(DAY, "08:12:00"),
    SALIDA_ALMUERZO: ec(DAY, "13:00:00"),
    REGRESO_ALMUERZO: ec(DAY, "14:15:00"),
    SALIDA_FINAL: ec(DAY, "18:00:00"),
  };

  it("día completo: horas trabajadas = (salida − entrada) − almuerzo", () => {
    const s = summarizeDay(DAY, full, rules, opts);
    expect(s.status).toBe("completo");
    expect(s.lunchMinutes).toBe(75);
    expect(s.lunchExcessMinutes).toBe(15);
    expect(s.lateMinutes).toBe(5);
    // 08:12 → 18:00 = 588 min − 75 = 513 min (8 h 33 min)
    expect(s.workedMinutes).toBe(513);
    expect(s.flagged).toBe(true);
    expect(s.missing).toEqual([]);
  });

  it("día sin novedades no se marca en rojo", () => {
    const s = summarizeDay(
      DAY,
      { ...full, ENTRADA: ec(DAY, "07:58:00"), REGRESO_ALMUERZO: ec(DAY, "13:55:00") },
      rules,
      opts,
    );
    expect(s.flagged).toBe(false);
    expect(s.lateMinutes).toBe(0);
    expect(s.lunchExcessMinutes).toBe(0);
  });

  it("olvidó marcar la salida final → Incompleto, sin horas trabajadas", () => {
    const { SALIDA_FINAL: _omit, ...partial } = full;
    void _omit;
    const s = summarizeDay(DAY, partial, rules, opts);
    expect(s.status).toBe("incompleto");
    expect(s.workedMinutes).toBeNull();
    expect(s.missing).toEqual(["SALIDA_FINAL"]);
  });

  it("olvidó marcar el almuerzo → Incompleto", () => {
    const s = summarizeDay(DAY, { ENTRADA: full.ENTRADA, SALIDA_FINAL: full.SALIDA_FINAL }, rules, opts);
    expect(s.status).toBe("incompleto");
    expect(s.lunchMinutes).toBeNull();
    expect(s.workedMinutes).toBeNull();
    expect(s.missing).toEqual(["SALIDA_ALMUERZO", "REGRESO_ALMUERZO"]);
  });

  it("día sin marcaciones", () => {
    const s = summarizeDay(DAY, {}, rules, opts);
    expect(s.status).toBe("sin_marcaciones");
    expect(s.flagged).toBe(false);
  });

  it("hoy con marcaciones parciales está En curso (no Incompleto)", () => {
    const today = "2026-10-05";
    const s = summarizeDay(today, { ENTRADA: ec(today, "08:00:00") }, rules, { today, now: ec(today, "10:00:00") });
    expect(s.status).toBe("en_curso");
  });

  it("almuerzo en curso hoy muestra el exceso en vivo", () => {
    const today = "2026-10-05";
    const s = summarizeDay(
      today,
      { ENTRADA: ec(today, "08:00:00"), SALIDA_ALMUERZO: ec(today, "13:00:00") },
      rules,
      { today, now: ec(today, "14:20:00") },
    );
    expect(s.lunchOngoing).toBe(true);
    expect(s.lunchMinutes).toBe(80);
    expect(s.lunchExcessMinutes).toBe(20);
    expect(s.flagged).toBe(true);
  });
});

describe("reporte diario", () => {
  const employee: ReportEmployee = {
    id: "e1",
    full_name: "Ana Pérez",
    cedula: "1712345675",
    branch_id: "b1",
    position: "Vendedora",
    entry_time: "08:00:00",
    work_days: [1, 2, 3, 4, 5, 6],
    entry_times: {},
    active: true,
    created_at: "2026-09-01T12:00:00Z",
  };
  const base = {
    employees: [employee],
    from: "2026-10-01",
    to: "2026-10-04",
    today: "2026-10-05",
    now: ec("2026-10-05", "12:00:00"),
    toleranceMinutes: 7,
    lunchAllowedMinutes: 60,
  };

  it("los domingos sin marcaciones no aparecen; los días laborables sin marcaciones sí", () => {
    const rows = buildDailyReport({ ...base, events: [] });
    // 1 (jue), 2 (vie), 3 (sáb) son laborables; 4 es domingo.
    expect(rows.map((r) => r.date).sort()).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(rows.every((r) => r.status === "sin_marcaciones")).toBe(true);
  });

  it("un día libre CON marcaciones sí aparece, como “Libre” y sin atraso", () => {
    const rows = buildDailyReport({
      ...base,
      events: [
        { employee_id: "e1", event_type: "ENTRADA", occurred_at: ec("2026-10-04", "08:30:00").toISOString(), work_date: "2026-10-04", branch_id: "b1" },
      ],
    });
    const sunday = rows.find((r) => r.date === "2026-10-04");
    expect(sunday?.status).toBe("incompleto");
    expect(sunday?.dayOff).toBe(true);
    expect(sunday?.entryTime).toBe("Libre");
    expect(sunday?.lateMinutes).toBe(0);
    expect(sunday?.flagged).toBe(false);
  });

  it("cada empleado usa SUS días: uno que solo trabaja domingo no aparece entre semana", () => {
    const rows = buildDailyReport({ ...base, employees: [{ ...employee, work_days: [7] }], events: [] });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-04"]);
    expect(rows[0].entryTime).toBe("08:00");
    expect(rows[0].dayOff).toBe(false);
  });

  it("hora distinta por día: el atraso se calcula con la hora de ese día", () => {
    const emp = { ...employee, work_days: [4, 5, 6], entry_times: { "4": "07:00", "5": "07:00", "6": "09:00" } };
    const rows = buildDailyReport({
      ...base,
      employees: [emp],
      events: [
        // jueves 1: entra 07:20 con horario 07:00 → 13 min de atraso (tolerancia 7)
        { employee_id: "e1", event_type: "ENTRADA", occurred_at: ec("2026-10-01", "07:20:00").toISOString(), work_date: "2026-10-01", branch_id: "b1" },
        // sábado 3: entra 08:50 con horario 09:00 → a tiempo
        { employee_id: "e1", event_type: "ENTRADA", occurred_at: ec("2026-10-03", "08:50:00").toISOString(), work_date: "2026-10-03", branch_id: "b1" },
      ],
    });
    const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
    expect(byDate["2026-10-01"].entryTime).toBe("07:00");
    expect(byDate["2026-10-01"].lateMinutes).toBe(13);
    expect(byDate["2026-10-03"].entryTime).toBe("09:00");
    expect(byDate["2026-10-03"].lateMinutes).toBe(0);
  });

  it("empleados inactivos sin marcaciones y fechas anteriores al alta no generan filas", () => {
    expect(buildDailyReport({ ...base, employees: [{ ...employee, active: false }], events: [] })).toHaveLength(0);
    expect(
      buildDailyReport({ ...base, employees: [{ ...employee, created_at: "2026-10-03T15:00:00Z" }], events: [] }).map((r) => r.date),
    ).toEqual(["2026-10-03"]);
  });

  it("no incluye fechas futuras", () => {
    const rows = buildDailyReport({ ...base, from: "2026-10-05", to: "2026-10-10", events: [] });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-05"]);
  });

  it("ordena por fecha descendente y luego por nombre", () => {
    const rows = buildDailyReport({
      ...base,
      employees: [employee, { ...employee, id: "e2", full_name: "Bruno Díaz" }],
      events: [],
    });
    expect(rows[0].date).toBe("2026-10-03");
    expect(rows[0].employeeName).toBe("Ana Pérez");
    expect(rows[1].employeeName).toBe("Bruno Díaz");
  });
});
