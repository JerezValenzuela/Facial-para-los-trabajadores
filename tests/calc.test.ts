import { describe, expect, it } from "vitest";
import {
  buildDailyReport,
  computeLateMinutes,
  computeLunch,
  summarizeByEmployee,
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

  it("olvidó marcar el almuerzo → sigue Incompleto, pero se descuenta 1 h de almuerzo (horas asumidas)", () => {
    const s = summarizeDay(DAY, { ENTRADA: full.ENTRADA, SALIDA_FINAL: full.SALIDA_FINAL }, rules, opts);
    expect(s.status).toBe("incompleto");
    expect(s.lunchMinutes).toBeNull();
    expect(s.assumedLunch).toBe(true);
    expect(s.workedMinutes).toBe(Math.floor((full.SALIDA_FINAL.getTime() - full.ENTRADA.getTime()) / 60000) - 60);
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

describe("tolerancia de almuerzo (60 + 10)", () => {
  const out = ec(DAY, "13:00:00");
  it("hasta 1 h 10 no cuenta; 1 h 11 = 1 min; 1 h 12 = 2 min", () => {
    expect(computeLunch(out, ec(DAY, "14:05:00"), 60, 10).excess).toBe(0);
    expect(computeLunch(out, ec(DAY, "14:10:00"), 60, 10).excess).toBe(0);
    expect(computeLunch(out, ec(DAY, "14:11:00"), 60, 10).excess).toBe(1);
    expect(computeLunch(out, ec(DAY, "14:12:00"), 60, 10)).toEqual({ minutes: 72, excess: 2 });
  });
  it("la fila solo sale en rojo cuando pasa la tolerancia", () => {
    const r = { ...rules, lunchToleranceMinutes: 10 };
    const ok = summarizeDay(DAY, { ENTRADA: ec(DAY, "08:00:00"), SALIDA_ALMUERZO: out, REGRESO_ALMUERZO: ec(DAY, "14:09:00") }, r, { today: "2026-10-20", now: ec("2026-10-20", "12:00:00") });
    expect(ok.lunchExcessMinutes).toBe(0);
    expect(ok.flagged).toBe(false);
    const late = summarizeDay(DAY, { ENTRADA: ec(DAY, "08:00:00"), SALIDA_ALMUERZO: out, REGRESO_ALMUERZO: ec(DAY, "14:12:00") }, r, { today: "2026-10-20", now: ec("2026-10-20", "12:00:00") });
    expect(late.lunchExcessMinutes).toBe(2);
    expect(late.flagged).toBe(true);
  });
});

describe("cierre del día (18:30): hoy se calcula como terminado", () => {
  const T = "2026-10-19";
  const r = { ...rules, entryTime: "07:00", toleranceMinutes: 10, assumedExitTime: "17:00", lunchCutoffTime: "12:30", dayCloseTime: "18:30" };
  const before = { today: T, now: ec(T, "18:29:00") };
  const after = { today: T, now: ec(T, "19:03:00") };

  it("antes de las 18:30: sigue “En curso”, sin horas", () => {
    const s = summarizeDay(T, { ENTRADA: ec(T, "06:55:00") }, r, before);
    expect(s.status).toBe("en_curso");
    expect(s.workedMinutes).toBeNull();
  });

  it("desde las 18:30: Luis (solo Entrar 06:55) → 9 h 05 asumidas, Incompleto", () => {
    const s = summarizeDay(T, { ENTRADA: ec(T, "06:55:00") }, r, after);
    expect(s.status).toBe("incompleto");
    expect(s.workedMinutes).toBe(545);
    expect(s.assumedExit).not.toBeNull();
    expect(s.assumedLunch).toBe(true);
  });

  it("desde las 18:30: Karen (solo Entrar 13:42) → hasta las 17:00 sin almuerzo = 3 h 18", () => {
    const s = summarizeDay(T, { ENTRADA: ec(T, "13:42:00") }, r, after);
    expect(s.workedMinutes).toBe(198);
    expect(s.arrivedAfterLunch).toBe(true);
  });

  it("desde las 18:30: si salió al almuerzo y no volvió, ya no está “en almuerzo”: horas hasta el almuerzo", () => {
    const s = summarizeDay(T, { ENTRADA: ec(T, "07:00:00"), SALIDA_ALMUERZO: ec(T, "12:30:00") }, r, after);
    expect(s.lunchOngoing).toBe(false);
    expect(s.leftAtLunch).toBe(true);
    expect(s.workedMinutes).toBe(330);
  });

  it("si marcó todo, se ve igual antes y después del cierre", () => {
    const all = {
      ENTRADA: ec(T, "07:31:00"),
      SALIDA_ALMUERZO: ec(T, "12:26:00"),
      REGRESO_ALMUERZO: ec(T, "13:23:00"),
      SALIDA_FINAL: ec(T, "17:07:00"),
    };
    expect(summarizeDay(T, all, r, after).workedMinutes).toBe(summarizeDay(T, all, r, before).workedMinutes);
    expect(summarizeDay(T, all, r, after).status).toBe("completo");
  });
});

describe("entró después del almuerzo (desde las 12:30): ya viene almorzado", () => {
  const r = { ...rules, entryTime: "07:00", toleranceMinutes: 10, lunchCutoffTime: "12:30", assumedExitTime: "17:00" };
  const D = "2026-10-16";
  const after = { today: "2026-10-19", now: ec("2026-10-19", "09:00:00") };

  it("Karen: entra 13:09 y sale 17:29 → 4 h 20 completas, sin descontar almuerzo", () => {
    const s = summarizeDay(D, { ENTRADA: ec(D, "13:09:00"), SALIDA_FINAL: ec(D, "17:29:00") }, r, after);
    expect(s.workedMinutes).toBe(260);
    expect(s.arrivedAfterLunch).toBe(true);
    expect(s.assumedLunch).toBe(false);
    expect(s.status).toBe("completo");
    expect(s.missing).toEqual([]);
    expect(s.lateMinutes).toBe(359); // el atraso de entrada se mantiene
  });

  it("justo a las 12:30 también cuenta como que ya viene almorzado", () => {
    const s = summarizeDay(D, { ENTRADA: ec(D, "12:30:00"), SALIDA_FINAL: ec(D, "17:00:00") }, r, after);
    expect(s.workedMinutes).toBe(270);
    expect(s.arrivedAfterLunch).toBe(true);
  });

  it("si entra a las 12:29 sí se le descuenta la hora de almuerzo (no la marcó)", () => {
    const s = summarizeDay(D, { ENTRADA: ec(D, "12:29:00"), SALIDA_FINAL: ec(D, "17:00:00") }, r, after);
    expect(s.workedMinutes).toBe(271 - 60);
    expect(s.assumedLunch).toBe(true);
    expect(s.arrivedAfterLunch).toBe(false);
  });

  it("si entra tarde y olvida Salir: hasta las 17:00 sin descontar almuerzo (horas asumidas)", () => {
    const s = summarizeDay(D, { ENTRADA: ec(D, "13:42:00") }, r, after);
    expect(s.workedMinutes).toBe(198); // 13:42 → 17:00 = 3 h 18
    expect(s.assumedExit).not.toBeNull();
    expect(s.assumedLunch).toBe(false);
    expect(s.status).toBe("incompleto");
  });

  it("si igual marca almuerzo, se descuenta lo que tomó", () => {
    const s = summarizeDay(
      D,
      { ENTRADA: ec(D, "13:00:00"), SALIDA_ALMUERZO: ec(D, "14:00:00"), REGRESO_ALMUERZO: ec(D, "14:20:00"), SALIDA_FINAL: ec(D, "18:00:00") },
      r,
      after,
    );
    expect(s.workedMinutes).toBe(300 - 20);
    expect(s.arrivedAfterLunch).toBe(false);
  });
});

describe("sábado sin almuerzo (media jornada)", () => {
  const SAT = "2026-10-17";
  const half = { ...rules, entryTime: "07:00", lunchExpected: false, assumedExitTime: "17:00" };
  const after = { today: "2026-10-19", now: ec("2026-10-19", "09:00:00") };

  it("Entrar 07:10 y Salir 13:02 → día completo con 5 h 52 (no se descuenta almuerzo)", () => {
    const s = summarizeDay(SAT, { ENTRADA: ec(SAT, "07:10:00"), SALIDA_FINAL: ec(SAT, "13:02:00") }, half, after);
    expect(s.status).toBe("completo");
    expect(s.workedMinutes).toBe(352);
    expect(s.missing).toEqual([]);
    expect(s.lunchMinutes).toBeNull();
    expect(s.lunchExpected).toBe(false);
  });

  it("un día normal (con almuerzo) con solo Entrar y Salir sigue incompleto y se le descuenta 1 h de almuerzo", () => {
    const s = summarizeDay(SAT, { ENTRADA: ec(SAT, "07:10:00"), SALIDA_FINAL: ec(SAT, "13:02:00") }, { ...half, lunchExpected: true }, after);
    expect(s.status).toBe("incompleto");
    expect(s.workedMinutes).toBe(352 - 60);
    expect(s.assumedLunch).toBe(true);
  });

  it("si el sábado olvida marcar Salir, no se asumen las 17:00 (se pagaría de más)", () => {
    const s = summarizeDay(SAT, { ENTRADA: ec(SAT, "07:00:00") }, half, after);
    expect(s.status).toBe("incompleto");
    expect(s.workedMinutes).toBeNull();
    expect(s.assumedExit).toBeNull();
    expect(s.missing).toEqual(["SALIDA_FINAL"]);
  });

  it("si igual sale al almuerzo el sábado, se descuenta lo que tomó", () => {
    const s = summarizeDay(
      SAT,
      { ENTRADA: ec(SAT, "07:00:00"), SALIDA_ALMUERZO: ec(SAT, "12:00:00"), REGRESO_ALMUERZO: ec(SAT, "12:30:00"), SALIDA_FINAL: ec(SAT, "15:00:00") },
      half,
      after,
    );
    expect(s.status).toBe("completo");
    expect(s.workedMinutes).toBe(480 - 30);
  });

  it("en el reporte: un empleado con sábado sin almuerzo suma sus horas", () => {
    const juan: ReportEmployee = {
      id: "j1",
      full_name: "Juan Carlos Jerez",
      cedula: "1712345675",
      branch_id: "b2",
      position: "Vendedor",
      entry_time: "07:00:00",
      work_days: [6],
      entry_times: {},
      no_lunch_days: [6],
      active: true,
      created_at: "2026-09-01T12:00:00Z",
    };
    const rows = buildDailyReport({
      employees: [juan],
      events: [
        { employee_id: "j1", event_type: "ENTRADA", occurred_at: ec("2026-10-10", "07:00:00").toISOString(), work_date: "2026-10-10", branch_id: "b2" },
        { employee_id: "j1", event_type: "SALIDA_FINAL", occurred_at: ec("2026-10-10", "13:01:00").toISOString(), work_date: "2026-10-10", branch_id: "b2" },
        { employee_id: "j1", event_type: "ENTRADA", occurred_at: ec("2026-10-17", "07:10:00").toISOString(), work_date: "2026-10-17", branch_id: "b2" },
        { employee_id: "j1", event_type: "SALIDA_FINAL", occurred_at: ec("2026-10-17", "13:02:00").toISOString(), work_date: "2026-10-17", branch_id: "b2" },
      ],
      from: "2026-10-01",
      to: "2026-10-19",
      today: "2026-10-19",
      now: ec("2026-10-19", "09:00:00"),
      toleranceMinutes: 10,
      lunchAllowedMinutes: 60,
      lunchToleranceMinutes: 10,
      assumedExitTime: "17:00",
    });
    expect(rows.map((r) => [r.date, r.status, r.workedMinutes])).toEqual([
      ["2026-10-17", "completo", 352],
      ["2026-10-10", "completo", 361],
      ["2026-10-03", "sin_marcaciones", null],
    ]);
    expect(summarizeByEmployee(rows).total.workedMinutes).toBe(352 + 361);
  });
});

describe("salida olvidada: se cuenta hasta las 17:00", () => {
  const r = { ...rules, assumedExitTime: "17:00" };
  const marks = { ENTRADA: ec(DAY, "08:00:00"), SALIDA_ALMUERZO: ec(DAY, "13:00:00"), REGRESO_ALMUERZO: ec(DAY, "14:00:00") };
  const later = { today: "2026-10-20", now: ec("2026-10-20", "09:00:00") };

  it("día ya terminado sin “Salir” → horas hasta las 17:00 (9 h − 1 h de almuerzo = 8 h)", () => {
    const s = summarizeDay(DAY, marks, r, later);
    expect(s.workedMinutes).toBe(480);
    expect(s.assumedExit?.toISOString()).toBe(ec(DAY, "17:00:00").toISOString());
    expect(s.status).toBe("incompleto");
  });

  it("si marcó salida a las 17:20, se cuentan las horas reales (+20 min)", () => {
    const s = summarizeDay(DAY, { ...marks, SALIDA_FINAL: ec(DAY, "17:20:00") }, r, later);
    expect(s.workedMinutes).toBe(500);
    expect(s.assumedExit).toBeNull();
  });

  it("hoy todavía no se asume nada (puede seguir trabajando)", () => {
    const s = summarizeDay(DAY, marks, r, { today: DAY, now: ec(DAY, "18:00:00") });
    expect(s.workedMinutes).toBeNull();
    expect(s.assumedExit).toBeNull();
  });

  it("solo marcó Entrar (como Luis): se cuenta hasta las 17:00 con 1 h de almuerzo, y sigue Incompleto", () => {
    const s = summarizeDay(DAY, { ENTRADA: ec(DAY, "06:55:00") }, r, later);
    expect(s.workedMinutes).toBe(10 * 60 + 5 - 60); // 06:55 → 17:00 = 10 h 05, menos 1 h = 9 h 05
    expect(s.assumedExit?.toISOString()).toBe(ec(DAY, "17:00:00").toISOString());
    expect(s.assumedLunch).toBe(true);
    expect(s.status).toBe("incompleto");
    expect(s.missing).toEqual(["SALIDA_ALMUERZO", "REGRESO_ALMUERZO", "SALIDA_FINAL"]);
  });

  it("salió al almuerzo y no volvió a marcar: solo trabajó hasta el almuerzo (08:00 → 13:00 = 5 h)", () => {
    const s = summarizeDay(DAY, { ENTRADA: ec(DAY, "08:00:00"), SALIDA_ALMUERZO: ec(DAY, "13:00:00") }, r, later);
    expect(s.workedMinutes).toBe(300);
    expect(s.leftAtLunch).toBe(true);
    expect(s.assumedLunch).toBe(false);
    expect(s.assumedExit).toBeNull();
    expect(s.status).toBe("incompleto");
  });

  it("salió al almuerzo, no marcó el regreso pero sí la salida: se descuenta 1 h y vale su salida real", () => {
    const s = summarizeDay(
      DAY,
      { ENTRADA: ec(DAY, "08:00:00"), SALIDA_ALMUERZO: ec(DAY, "13:00:00"), SALIDA_FINAL: ec(DAY, "17:30:00") },
      r,
      later,
    );
    expect(s.workedMinutes).toBe(9 * 60 + 30 - 60);
    expect(s.assumedLunch).toBe(true);
    expect(s.leftAtLunch).toBe(false);
  });

  it("hoy, si está en el almuerzo, no se corta nada (puede volver)", () => {
    const s = summarizeDay(DAY, { ENTRADA: ec(DAY, "08:00:00"), SALIDA_ALMUERZO: ec(DAY, "13:00:00") }, r, { today: DAY, now: ec(DAY, "13:30:00") });
    expect(s.workedMinutes).toBeNull();
    expect(s.leftAtLunch).toBe(false);
    expect(s.lunchOngoing).toBe(true);
  });

  it("si entró después de las 17:00 y no marcó salida, no se inventan horas", () => {
    const s = summarizeDay(DAY, { ENTRADA: ec(DAY, "19:59:00") }, r, later);
    expect(s.workedMinutes).toBeNull();
    expect(s.assumedExit).toBeNull();
    expect(s.assumedLunch).toBe(false);
  });

  it("hoy (día en curso) no se asume el almuerzo ni la salida", () => {
    const s = summarizeDay(DAY, { ENTRADA: ec(DAY, "08:00:00"), SALIDA_FINAL: ec(DAY, "13:00:00") }, r, { today: DAY, now: ec(DAY, "14:00:00") });
    expect(s.workedMinutes).toBeNull();
    expect(s.assumedLunch).toBe(false);
  });

  it("si regresó del almuerzo después de las 17:00, no se asume", () => {
    const s = summarizeDay(DAY, { ...marks, REGRESO_ALMUERZO: ec(DAY, "17:30:00") }, r, later);
    expect(s.workedMinutes).toBeNull();
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

  it("observaciones: van en su fila; un día libre con observación también aparece", () => {
    const rows = buildDailyReport({
      ...base,
      events: [],
      observations: [
        { employee_id: "e1", work_date: "2026-10-02", note: "Pidió permiso pero no lo registró" },
        { employee_id: "e1", work_date: "2026-10-04", note: "Vino a ayudar el domingo" },
      ],
    });
    const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
    expect(byDate["2026-10-02"].observation).toBe("Pidió permiso pero no lo registró");
    expect(byDate["2026-10-01"].observation).toBeNull();
    // 4 = domingo (no trabaja): sale por la observación, como "Día libre" y no como incompleto.
    expect(byDate["2026-10-04"].observation).toBe("Vino a ayudar el domingo");
    expect(byDate["2026-10-04"].status).toBe("libre");
    expect(byDate["2026-10-04"].flagged).toBe(false);
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

describe("resumen por empleado (totales del período)", () => {
  const emp = (id: string, full_name: string): ReportEmployee => ({
    id,
    full_name,
    cedula: "1712345675",
    branch_id: "b1",
    position: "Vendedor",
    entry_time: "08:00:00",
    work_days: [1, 2, 3, 4, 5, 6],
    entry_times: {},
    active: true,
    created_at: "2026-09-01T12:00:00Z",
  });
  const ev = (employee_id: string, date: string, type: "ENTRADA" | "SALIDA_ALMUERZO" | "REGRESO_ALMUERZO" | "SALIDA_FINAL", time: string) => ({
    employee_id,
    event_type: type,
    occurred_at: ec(date, time).toISOString(),
    work_date: date,
    branch_id: "b1",
  });

  it("suma horas reales, minutos perdidos, faltas y salidas olvidadas", () => {
    const rows = buildDailyReport({
      employees: [emp("e1", "Ana"), emp("e2", "Beto")],
      events: [
        // Ana, jue 01: 08:20 (13 min de atraso con tolerancia 7), almuerzo 1 h 12 (2 min con tolerancia 10), sale 17:00
        ev("e1", "2026-10-01", "ENTRADA", "08:20:00"),
        ev("e1", "2026-10-01", "SALIDA_ALMUERZO", "13:00:00"),
        ev("e1", "2026-10-01", "REGRESO_ALMUERZO", "14:12:00"),
        ev("e1", "2026-10-01", "SALIDA_FINAL", "17:00:00"),
        // Ana, vie 02: olvidó marcar salida → se cuenta hasta las 17:00
        ev("e1", "2026-10-02", "ENTRADA", "08:00:00"),
        ev("e1", "2026-10-02", "SALIDA_ALMUERZO", "13:00:00"),
        ev("e1", "2026-10-02", "REGRESO_ALMUERZO", "14:00:00"),
        // Beto, jue 01: completo y a tiempo; vie 02: no vino (falta)
        ev("e2", "2026-10-01", "ENTRADA", "08:00:00"),
        ev("e2", "2026-10-01", "SALIDA_ALMUERZO", "13:00:00"),
        ev("e2", "2026-10-01", "REGRESO_ALMUERZO", "14:00:00"),
        ev("e2", "2026-10-01", "SALIDA_FINAL", "17:30:00"),
      ],
      from: "2026-10-01",
      to: "2026-10-02",
      today: "2026-10-05",
      now: ec("2026-10-05", "12:00:00"),
      toleranceMinutes: 7,
      lunchAllowedMinutes: 60,
      lunchToleranceMinutes: 10,
      assumedExitTime: "17:00",
    });
    const { employees, total } = summarizeByEmployee(rows);
    const ana = employees.find((e) => e.employeeName === "Ana")!;
    const beto = employees.find((e) => e.employeeName === "Beto")!;

    // Ana: día 1 = 8 h 40 − 1 h 12 = 7 h 28 (448); día 2 = 9 h − 1 h = 8 h (480)
    expect(ana.workedMinutes).toBe(448 + 480);
    expect(ana.lateMinutes).toBe(13);
    expect(ana.lunchExcessMinutes).toBe(2);
    expect(ana.lostMinutes).toBe(15);
    expect(ana.daysWorked).toBe(2);
    expect(ana.daysBadlyMarked).toBe(1);
    expect(ana.markedMinutes).toBe(448); // día bien marcado
    expect(ana.assumedMinutes).toBe(480); // día que olvidó "Salir"
    expect(ana.absences).toBe(0);

    // Beto: 9 h 30 − 1 h = 8 h 30 (510); el viernes es falta
    expect(beto.workedMinutes).toBe(510);
    expect(beto.lostMinutes).toBe(0);
    expect(beto.absences).toBe(1);

    expect(total.workedMinutes).toBe(448 + 480 + 510);
    expect(total.markedMinutes + total.assumedMinutes).toBe(total.workedMinutes);
    expect(total.lostMinutes).toBe(15);
    expect(total.daysWorked).toBe(3);
    expect(employees.map((e) => e.employeeName)).toEqual(["Ana", "Beto"]);
  });
});
