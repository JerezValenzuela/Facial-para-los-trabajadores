import { describe, expect, it } from "vitest";
import {
  isEventType,
  isValidTransition,
  KIOSK_ACTION_LABEL,
  kioskOptions,
  nextEvent,
} from "@/lib/attendance/events";

describe("marcaciones elegidas por el empleado (regla: solo hacia adelante)", () => {
  it("el evento sugerido sigue el orden natural de la jornada", () => {
    expect(nextEvent(null)).toBe("ENTRADA");
    expect(nextEvent("ENTRADA")).toBe("SALIDA_ALMUERZO");
    expect(nextEvent("SALIDA_ALMUERZO")).toBe("REGRESO_ALMUERZO");
    expect(nextEvent("REGRESO_ALMUERZO")).toBe("SALIDA_FINAL");
    expect(nextEvent("SALIDA_FINAL")).toBeNull();
  });

  it("permite elegir cualquier evento posterior (saltarse uno olvidado)", () => {
    expect(isValidTransition(null, "ENTRADA")).toBe(true);
    expect(isValidTransition(null, "SALIDA_FINAL")).toBe(true);
    expect(isValidTransition("ENTRADA", "SALIDA_FINAL")).toBe(true);
    expect(isValidTransition("ENTRADA", "REGRESO_ALMUERZO")).toBe(true);
  });

  it("no permite repetir ni retroceder", () => {
    expect(isValidTransition("ENTRADA", "ENTRADA")).toBe(false);
    expect(isValidTransition("SALIDA_ALMUERZO", "ENTRADA")).toBe(false);
    expect(isValidTransition("REGRESO_ALMUERZO", "SALIDA_ALMUERZO")).toBe(false);
    expect(isValidTransition("SALIDA_FINAL", "ENTRADA")).toBe(false);
  });

  it("las 4 opciones del kiosco reflejan lo marcado hoy", () => {
    expect(kioskOptions([]).map((o) => [o.label, o.status])).toEqual([
      ["Entrar", "available"],
      ["Salir a almuerzo", "available"],
      ["Regresar de almuerzo", "available"],
      ["Salir", "available"],
    ]);
    const afterLunchOut = kioskOptions([
      { event_type: "ENTRADA", occurred_at: "2026-10-02T13:00:00Z" },
      { event_type: "SALIDA_ALMUERZO", occurred_at: "2026-10-02T18:00:00Z" },
    ]);
    expect(afterLunchOut.map((o) => o.status)).toEqual(["done", "done", "available", "available"]);
    expect(afterLunchOut[0].at).toBe("2026-10-02T13:00:00Z");

    // Se saltó el almuerzo y marcó regreso: salida a almuerzo queda "no disponible".
    const skipped = kioskOptions([
      { event_type: "ENTRADA", occurred_at: "2026-10-02T13:00:00Z" },
      { event_type: "REGRESO_ALMUERZO", occurred_at: "2026-10-02T19:00:00Z" },
    ]);
    expect(skipped.map((o) => o.status)).toEqual(["done", "unavailable", "done", "available"]);
  });

  it("textos de los botones del kiosco", () => {
    expect(Object.values(KIOSK_ACTION_LABEL)).toEqual(["Entrar", "Salir a almuerzo", "Regresar de almuerzo", "Salir"]);
  });

  it("valida el tipo de evento", () => {
    expect(isEventType("ENTRADA")).toBe(true);
    expect(isEventType("entrada")).toBe(false);
    expect(isEventType(42)).toBe(false);
  });
});
