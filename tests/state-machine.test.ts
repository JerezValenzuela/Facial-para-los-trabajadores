import { describe, expect, it } from "vitest";
import { EVENT_ORDER, isEventType, isValidTransition, nextEvent } from "@/lib/attendance/events";

describe("máquina de estados de marcaciones", () => {
  it("el primer evento del día es ENTRADA", () => {
    expect(nextEvent(null)).toBe("ENTRADA");
  });

  it("sigue el orden estricto ENTRADA → SALIDA_ALMUERZO → REGRESO_ALMUERZO → SALIDA_FINAL", () => {
    let last: (typeof EVENT_ORDER)[number] | null = null;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const next = nextEvent(last);
      expect(next).not.toBeNull();
      seen.push(next!);
      last = next;
    }
    expect(seen).toEqual(["ENTRADA", "SALIDA_ALMUERZO", "REGRESO_ALMUERZO", "SALIDA_FINAL"]);
  });

  it("después de SALIDA_FINAL la jornada está completa (no hay más eventos)", () => {
    expect(nextEvent("SALIDA_FINAL")).toBeNull();
  });

  it("rechaza eventos fuera de orden", () => {
    expect(isValidTransition(null, "SALIDA_ALMUERZO")).toBe(false);
    expect(isValidTransition(null, "SALIDA_FINAL")).toBe(false);
    expect(isValidTransition("ENTRADA", "REGRESO_ALMUERZO")).toBe(false);
    expect(isValidTransition("ENTRADA", "SALIDA_FINAL")).toBe(false);
    expect(isValidTransition("SALIDA_ALMUERZO", "SALIDA_ALMUERZO")).toBe(false);
    expect(isValidTransition("SALIDA_FINAL", "ENTRADA")).toBe(false);
  });

  it("acepta solo el siguiente evento válido", () => {
    expect(isValidTransition(null, "ENTRADA")).toBe(true);
    expect(isValidTransition("ENTRADA", "SALIDA_ALMUERZO")).toBe(true);
    expect(isValidTransition("SALIDA_ALMUERZO", "REGRESO_ALMUERZO")).toBe(true);
    expect(isValidTransition("REGRESO_ALMUERZO", "SALIDA_FINAL")).toBe(true);
  });

  it("valida el tipo de evento", () => {
    expect(isEventType("ENTRADA")).toBe(true);
    expect(isEventType("entrada")).toBe(false);
    expect(isEventType(42)).toBe(false);
  });
});
