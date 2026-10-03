import type { Database } from "@/lib/supabase/database.types";

export type AttendanceEventType = Database["public"]["Enums"]["attendance_event_type"];

/** Orden estricto de la jornada. */
export const EVENT_ORDER: readonly AttendanceEventType[] = [
  "ENTRADA",
  "SALIDA_ALMUERZO",
  "REGRESO_ALMUERZO",
  "SALIDA_FINAL",
];

export const EVENT_LABEL: Record<AttendanceEventType, string> = {
  ENTRADA: "Entrada",
  SALIDA_ALMUERZO: "Salida a almuerzo",
  REGRESO_ALMUERZO: "Regreso de almuerzo",
  SALIDA_FINAL: "Salida final",
};

/** Siguiente evento válido según el último registrado hoy (null = jornada completa). */
export function nextEvent(last: AttendanceEventType | null): AttendanceEventType | null {
  if (last === null) return "ENTRADA";
  const i = EVENT_ORDER.indexOf(last);
  return i >= 0 && i < EVENT_ORDER.length - 1 ? EVENT_ORDER[i + 1] : null;
}

/** ¿Es válido registrar `candidate` si el último evento del día fue `last`? */
export function isValidTransition(last: AttendanceEventType | null, candidate: AttendanceEventType): boolean {
  return nextEvent(last) === candidate;
}

export function isEventType(v: unknown): v is AttendanceEventType {
  return typeof v === "string" && (EVENT_ORDER as readonly string[]).includes(v);
}
