import { describe, expect, it } from "vitest";
import { findForgottenExit, forgottenExitDayLabel } from "@/lib/attendance/forgot-exit";

// 2026-10-05 es lunes; 2026-10-04 domingo; 2026-10-03 sábado.
const TODAY = "2026-10-05";
const ev = (work_date: string, event_type: "ENTRADA" | "SALIDA_ALMUERZO" | "REGRESO_ALMUERZO" | "SALIDA_FINAL") => ({
  work_date,
  event_type,
});

describe("aviso de salida olvidada", () => {
  it("ayer marcó entrada pero no salida → avisa de ayer", () => {
    expect(findForgottenExit([ev("2026-10-04", "ENTRADA"), ev("2026-10-04", "SALIDA_ALMUERZO")], TODAY)).toBe("2026-10-04");
  });

  it("ayer marcó salida → no avisa", () => {
    expect(findForgottenExit([ev("2026-10-04", "ENTRADA"), ev("2026-10-04", "SALIDA_FINAL")], TODAY)).toBeNull();
  });

  it("usa el último día trabajado: el sábado sin salida y el domingo libre → avisa del sábado", () => {
    expect(findForgottenExit([ev("2026-10-02", "ENTRADA"), ev("2026-10-02", "SALIDA_FINAL"), ev("2026-10-03", "ENTRADA")], TODAY)).toBe(
      "2026-10-03",
    );
  });

  it("solo cuenta el último día: un olvido anterior ya no se repite si después marcó bien", () => {
    expect(findForgottenExit([ev("2026-10-02", "ENTRADA"), ev("2026-10-03", "ENTRADA"), ev("2026-10-03", "SALIDA_FINAL")], TODAY)).toBeNull();
  });

  it("ignora hoy y lo de hace más de 7 días", () => {
    expect(findForgottenExit([ev(TODAY, "ENTRADA")], TODAY)).toBeNull();
    expect(findForgottenExit([ev("2026-09-27", "ENTRADA")], TODAY)).toBeNull();
    expect(findForgottenExit([ev("2026-09-28", "ENTRADA")], TODAY)).toBe("2026-09-28");
  });

  it("sin marcaciones anteriores → no avisa", () => {
    expect(findForgottenExit([], TODAY)).toBeNull();
  });

  it("texto del día: “Ayer” o “El sábado 03/10”", () => {
    expect(forgottenExitDayLabel("2026-10-04", TODAY)).toBe("Ayer");
    expect(forgottenExitDayLabel("2026-10-03", TODAY)).toBe("El sábado 03/10");
    expect(forgottenExitDayLabel("2026-09-30", TODAY)).toBe("El miércoles 30/09");
  });
});
