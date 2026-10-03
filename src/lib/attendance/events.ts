import type { Database } from "@/lib/supabase/database.types";

export type AttendanceEventType = Database["public"]["Enums"]["attendance_event_type"];

/** Orden natural de la jornada. */
export const EVENT_ORDER: readonly AttendanceEventType[] = [
  "ENTRADA",
  "SALIDA_ALMUERZO",
  "REGRESO_ALMUERZO",
  "SALIDA_FINAL",
];

/** Nombres para reportes (dashboard y Excel). */
export const EVENT_LABEL: Record<AttendanceEventType, string> = {
  ENTRADA: "Entrada",
  SALIDA_ALMUERZO: "Salida a almuerzo",
  REGRESO_ALMUERZO: "Regreso de almuerzo",
  SALIDA_FINAL: "Salida final",
};

/** Texto de los botones del kiosco ("¿Vas a…?"). */
export const KIOSK_ACTION_LABEL: Record<AttendanceEventType, string> = {
  ENTRADA: "Entrar",
  SALIDA_ALMUERZO: "Salir a almuerzo",
  REGRESO_ALMUERZO: "Regresar de almuerzo",
  SALIDA_FINAL: "Salir",
};

/** Siguiente evento natural según el último registrado hoy (null = jornada completa). */
export function nextEvent(last: AttendanceEventType | null): AttendanceEventType | null {
  if (last === null) return "ENTRADA";
  const i = EVENT_ORDER.indexOf(last);
  return i >= 0 && i < EVENT_ORDER.length - 1 ? EVENT_ORDER[i + 1] : null;
}

/**
 * Regla "solo hacia adelante": el empleado elige cualquier evento POSTERIOR al
 * último marcado hoy (puede saltarse uno olvidado), pero nunca repetir ni
 * retroceder. La misma regla la aplica la base de datos al registrar.
 */
export function isValidTransition(last: AttendanceEventType | null, candidate: AttendanceEventType): boolean {
  if (last === null) return true;
  return EVENT_ORDER.indexOf(candidate) > EVENT_ORDER.indexOf(last);
}

export type KioskOption = {
  event: AttendanceEventType;
  label: string;
  /** done = ya marcado hoy; available = se puede elegir; unavailable = quedó atrás. */
  status: "done" | "available" | "unavailable";
  /** ISO de la marcación si ya se hizo. */
  at: string | null;
};

/** Las 4 opciones del kiosco con su estado según lo marcado hoy. */
export function kioskOptions(today: { event_type: AttendanceEventType; occurred_at: string }[]): KioskOption[] {
  const done = new Map(today.map((e) => [e.event_type, e.occurred_at]));
  const lastIndex = Math.max(-1, ...today.map((e) => EVENT_ORDER.indexOf(e.event_type)));
  return EVENT_ORDER.map((event, i) => ({
    event,
    label: KIOSK_ACTION_LABEL[event],
    status: done.has(event) ? "done" : i > lastIndex ? "available" : "unavailable",
    at: done.get(event) ?? null,
  }));
}

export function isEventType(v: unknown): v is AttendanceEventType {
  return typeof v === "string" && (EVENT_ORDER as readonly string[]).includes(v);
}
