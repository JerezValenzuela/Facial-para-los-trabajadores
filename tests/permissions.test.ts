import { describe, expect, it } from "vitest";
import { buildDailyReport, computeLateMinutes, summarizeDay, type DayRules } from "@/lib/attendance/calc";
import { formatPermission, formatPermissionHours, permissionEnd } from "@/lib/attendance/permissions";
import { permissionBodySchema } from "@/lib/kiosk/schemas";

const ec = (date: string, time: string) => new Date(`${date}T${time}-05:00`);
const DAY = "2026-10-01";
const rules: DayRules = { entryTime: "08:00", toleranceMinutes: 7, lunchAllowedMinutes: 60 };
const opts = { today: "2026-10-05", now: ec("2026-10-05", "12:00:00") };

describe("permisos: texto para el empleado y el reporte", () => {
  it("formatea horas y rango", () => {
    expect(formatPermissionHours(0.5)).toBe("30 min");
    expect(formatPermissionHours(1)).toBe("1 hora");
    expect(formatPermissionHours(1.5)).toBe("1 h 30 min");
    expect(formatPermissionHours(3)).toBe("3 horas");
    expect(permissionEnd("10:00", 2)).toBe("12:00");
    expect(permissionEnd("15:30", 1.5)).toBe("17:00");
    expect(formatPermission({ kind: "dia_completo", startTime: null, hours: null })).toBe("Todo el día");
    expect(formatPermission({ kind: "horas", startTime: "10:00:00", hours: 2 })).toBe("2 horas desde las 10:00 (hasta 12:00)");
    expect(formatPermission(null)).toBe("");
  });
});

describe("permisos: efecto en el atraso y el estado", () => {
  it("permiso por horas que cubre la entrada: la llegada esperada es el fin del permiso", () => {
    const p = { kind: "horas" as const, startTime: "08:00", hours: 2 };
    expect(computeLateMinutes(ec(DAY, "10:05:00"), DAY, rules, p)).toBe(0);
    expect(computeLateMinutes(ec(DAY, "10:20:00"), DAY, rules, p)).toBe(13);
    // Sin permiso, esa misma llegada sería un atraso de 133 min.
    expect(computeLateMinutes(ec(DAY, "10:20:00"), DAY, rules)).toBe(133);
  });

  it("permiso por horas a mitad del día no cambia el atraso de la mañana", () => {
    const p = { kind: "horas" as const, startTime: "13:00", hours: 2 };
    expect(computeLateMinutes(ec(DAY, "08:20:00"), DAY, rules, p)).toBe(13);
  });

  it("permiso de todo el día: sin atraso y estado Permiso", () => {
    const p = { kind: "dia_completo" as const, startTime: null, hours: null };
    const s = summarizeDay(DAY, {}, rules, opts, p);
    expect(s.status).toBe("permiso");
    expect(s.flagged).toBe(false);
    expect(computeLateMinutes(ec(DAY, "11:00:00"), DAY, rules, p)).toBe(0);
  });

  it("el reporte muestra el permiso aunque no haya marcaciones (incluso en día no laborable)", () => {
    const rows = buildDailyReport({
      employees: [
        { id: "e1", full_name: "Ana", cedula: "1712345675", branch_id: "b1", position: "Cajera", entry_time: "08:00:00", work_days: [1, 2, 3, 4, 5, 6], entry_times: {}, active: true, created_at: "2026-01-01T00:00:00Z" },
      ],
      events: [],
      permissions: [{ employee_id: "e1", work_date: "2026-10-04", kind: "dia_completo", start_time: null, hours: null }],
      from: "2026-10-03",
      to: "2026-10-04",
      today: "2026-10-05",
      now: opts.now,
      toleranceMinutes: 7,
      lunchAllowedMinutes: 60,
    });
    const sunday = rows.find((r) => r.date === "2026-10-04");
    expect(sunday?.status).toBe("permiso");
    expect(sunday?.permission?.kind).toBe("dia_completo");
    expect(rows.find((r) => r.date === "2026-10-03")?.status).toBe("sin_marcaciones");
  });
});

describe("permisos: validación de lo que envía el kiosco", () => {
  const base = { ticket: "11111111-1111-4111-8111-111111111111" };
  it("todo el día no necesita horas", () => {
    expect(permissionBodySchema.safeParse({ ...base, kind: "dia_completo" }).success).toBe(true);
  });
  it("por horas exige horas (múltiplos de 0.5, máx. 12) y hora de inicio", () => {
    expect(permissionBodySchema.safeParse({ ...base, kind: "horas", hours: 2, startTime: "10:00" }).success).toBe(true);
    expect(permissionBodySchema.safeParse({ ...base, kind: "horas", hours: 2 }).success).toBe(false);
    expect(permissionBodySchema.safeParse({ ...base, kind: "horas", hours: 1.25, startTime: "10:00" }).success).toBe(false);
    expect(permissionBodySchema.safeParse({ ...base, kind: "horas", hours: 13, startTime: "10:00" }).success).toBe(false);
    expect(permissionBodySchema.safeParse({ ...base, kind: "horas", hours: 2, startTime: "25:00" }).success).toBe(false);
  });
});
