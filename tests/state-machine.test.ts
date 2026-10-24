import { describe, expect, it } from "vitest";
import {
  allowedNextEvents,
  isEventType,
  isValidTransition,
  KIOSK_ACTION_LABEL,
  kioskOptions,
  lunchAllowedToday,
  nextEvent,
} from "@/lib/attendance/events";

const ec = (date: string, time: string) => new Date(`${date}T${time}-05:00`);
const ev = (event_type: "ENTRADA" | "SALIDA_ALMUERZO" | "REGRESO_ALMUERZO" | "SALIDA_FINAL", iso: string) => ({
  event_type,
  occurred_at: iso,
});
const withLunch = { lunchToday: true };
const noLunch = { lunchToday: false };

describe("orden obligatorio de las marcaciones", () => {
  it("el evento sugerido sigue el orden natural de la jornada", () => {
    expect(nextEvent(null)).toBe("ENTRADA");
    expect(nextEvent("ENTRADA")).toBe("SALIDA_ALMUERZO");
    expect(nextEvent("SALIDA_ALMUERZO")).toBe("REGRESO_ALMUERZO");
    expect(nextEvent("REGRESO_ALMUERZO")).toBe("SALIDA_FINAL");
    expect(nextEvent("SALIDA_FINAL")).toBeNull();
  });

  it("qué se puede marcar en cada momento", () => {
    expect(allowedNextEvents(null, withLunch)).toEqual(["ENTRADA"]);
    expect(allowedNextEvents("ENTRADA", withLunch)).toEqual(["SALIDA_ALMUERZO", "SALIDA_FINAL"]);
    expect(allowedNextEvents("ENTRADA", noLunch)).toEqual(["SALIDA_FINAL"]); // sábado o entró ya almorzado
    expect(allowedNextEvents("SALIDA_ALMUERZO", withLunch)).toEqual(["REGRESO_ALMUERZO"]);
    expect(allowedNextEvents("REGRESO_ALMUERZO", withLunch)).toEqual(["SALIDA_FINAL"]);
    expect(allowedNextEvents("SALIDA_FINAL", withLunch)).toEqual([]);
  });

  it("ya no se pueden saltar pasos", () => {
    expect(isValidTransition(null, "SALIDA_FINAL")).toBe(false); // primero Entrar
    expect(isValidTransition("ENTRADA", "REGRESO_ALMUERZO")).toBe(false);
    expect(isValidTransition("SALIDA_ALMUERZO", "SALIDA_FINAL")).toBe(false); // tiene que marcar el regreso
    expect(isValidTransition("ENTRADA", "SALIDA_ALMUERZO", noLunch)).toBe(false);
    expect(isValidTransition("ENTRADA", "SALIDA_FINAL")).toBe(true); // se va sin almorzar
  });

  it("no permite repetir ni retroceder", () => {
    expect(isValidTransition("ENTRADA", "ENTRADA")).toBe(false);
    expect(isValidTransition("SALIDA_ALMUERZO", "ENTRADA")).toBe(false);
    expect(isValidTransition("REGRESO_ALMUERZO", "SALIDA_ALMUERZO")).toBe(false);
    expect(isValidTransition("SALIDA_FINAL", "ENTRADA")).toBe(false);
  });
});

describe("botones del kiosco (habilitados y bloqueados)", () => {
  const D = "2026-10-21"; // miércoles
  const at = (t: string) => ec(D, t).toISOString();

  it("primera vez del día: solo Entrar", () => {
    const o = kioskOptions([], withLunch);
    expect(o.map((x) => [x.label, x.status])).toEqual([
      ["Entrar", "available"],
      ["Salir a almuerzo", "locked"],
      ["Regresar de almuerzo", "locked"],
      ["Salir", "locked"],
    ]);
    expect(o[3].note).toBe("Primero marca Entrar");
  });

  it("después de Entrar: Salir a almuerzo o Salir; el regreso bloqueado", () => {
    const o = kioskOptions([ev("ENTRADA", at("08:00:00"))], withLunch);
    expect(o.map((x) => x.status)).toEqual(["done", "available", "locked", "available"]);
    expect(o[0].at).toBe(at("08:00:00"));
    expect(o[2].note).toBe("Primero marca Salir a almuerzo");
  });

  it("después de Salir a almuerzo: SOLO Regresar de almuerzo (Salir bloqueado)", () => {
    const o = kioskOptions([ev("ENTRADA", at("08:00:00")), ev("SALIDA_ALMUERZO", at("13:00:00"))], withLunch);
    expect(o.map((x) => x.status)).toEqual(["done", "done", "available", "locked"]);
    expect(o[3].note).toBe("Primero marca Regresar de almuerzo");
  });

  it("después de Regresar: solo Salir; y al final todo marcado", () => {
    const back = kioskOptions(
      [ev("ENTRADA", at("08:00:00")), ev("SALIDA_ALMUERZO", at("13:00:00")), ev("REGRESO_ALMUERZO", at("14:00:00"))],
      withLunch,
    );
    expect(back.map((x) => x.status)).toEqual(["done", "done", "done", "available"]);
  });

  it("sábado o entró ya almorzado: tras Entrar solo Salir; los del almuerzo dicen “Hoy sin almuerzo”", () => {
    const o = kioskOptions([ev("ENTRADA", at("07:00:00"))], noLunch);
    expect(o.map((x) => x.status)).toEqual(["done", "locked", "locked", "available"]);
    expect(o[1].note).toBe("Hoy sin almuerzo");
    expect(o[2].note).toBe("Hoy sin almuerzo");
  });

  it("días viejos que se saltaron un paso: lo saltado sale “no disponible”", () => {
    const o = kioskOptions([ev("ENTRADA", at("08:00:00")), ev("REGRESO_ALMUERZO", at("14:00:00"))], withLunch);
    expect(o.map((x) => x.status)).toEqual(["done", "unavailable", "done", "available"]);
  });
});

describe("¿hoy hay almuerzo?", () => {
  const SAT = "2026-10-24";
  const WED = "2026-10-21";
  it("sábado (día sin almuerzo del empleado) → no", () => {
    expect(lunchAllowedToday({ date: SAT, noLunchDays: [6], entrada: ec(SAT, "07:00:00"), cutoffTime: "12:30" })).toBe(false);
  });
  it("entre semana entrando temprano → sí", () => {
    expect(lunchAllowedToday({ date: WED, noLunchDays: [6], entrada: ec(WED, "07:00:00"), cutoffTime: "12:30" })).toBe(true);
    expect(lunchAllowedToday({ date: WED, noLunchDays: [6], entrada: null, cutoffTime: "12:30" })).toBe(true);
  });
  it("entró a las 12:30 o después (ya viene almorzado) → no", () => {
    expect(lunchAllowedToday({ date: WED, noLunchDays: [6], entrada: ec(WED, "12:30:00"), cutoffTime: "12:30" })).toBe(false);
    expect(lunchAllowedToday({ date: WED, noLunchDays: [6], entrada: ec(WED, "12:29:00"), cutoffTime: "12:30" })).toBe(true);
  });
});

describe("textos y tipos", () => {
  it("textos de los botones del kiosco", () => {
    expect(Object.values(KIOSK_ACTION_LABEL)).toEqual(["Entrar", "Salir a almuerzo", "Regresar de almuerzo", "Salir"]);
  });

  it("valida el tipo de evento", () => {
    expect(isEventType("ENTRADA")).toBe(true);
    expect(isEventType("entrada")).toBe(false);
    expect(isEventType(42)).toBe(false);
  });
});
