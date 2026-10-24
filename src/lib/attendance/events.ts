import type { Database } from "@/lib/supabase/database.types";
import { isoWeekday, zonedToUtc } from "@/lib/time";

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
 * Contexto del día que decide si hoy se habilitan los botones del almuerzo:
 * false en un día sin almuerzo del empleado (ej. sábado) o si ENTRÓ desde la
 * hora de corte (12:30, ya viene almorzado).
 */
export type KioskDayContext = { lunchToday: boolean };

/** ¿Hoy puede salir al almuerzo? (día con almuerzo y no entró ya almorzado). */
export function lunchAllowedToday(input: {
  date: string;
  noLunchDays: number[] | null | undefined;
  entrada: Date | null;
  cutoffTime: string | null | undefined;
}): boolean {
  if ((input.noLunchDays ?? []).includes(isoWeekday(input.date))) return false;
  if (input.entrada && input.cutoffTime && input.entrada >= zonedToUtc(input.date, input.cutoffTime)) return false;
  return true;
}

/** Último evento del día según el orden de la jornada (null = no marcó nada hoy). */
export function lastEventOf(today: { event_type: AttendanceEventType }[]): AttendanceEventType | null {
  const i = Math.max(-1, ...today.map((e) => EVENT_ORDER.indexOf(e.event_type)));
  return i >= 0 ? EVENT_ORDER[i] : null;
}

/**
 * ORDEN OBLIGATORIO (sin saltarse pasos). Lo que se puede marcar ahora:
 *  - nada marcado      → Entrar
 *  - Entrar            → Salir a almuerzo o Salir (si hoy no hay almuerzo: solo Salir)
 *  - Salir a almuerzo  → solo Regresar de almuerzo (no puede irse sin marcar el regreso)
 *  - Regresar          → Salir
 *  - Salir             → nada (jornada completa)
 * La misma regla la aplica la base de datos al registrar (kiosk_register_attendance).
 */
export function allowedNextEvents(last: AttendanceEventType | null, ctx: KioskDayContext): AttendanceEventType[] {
  switch (last) {
    case null:
      return ["ENTRADA"];
    case "ENTRADA":
      return ctx.lunchToday ? ["SALIDA_ALMUERZO", "SALIDA_FINAL"] : ["SALIDA_FINAL"];
    case "SALIDA_ALMUERZO":
      return ["REGRESO_ALMUERZO"];
    case "REGRESO_ALMUERZO":
      return ["SALIDA_FINAL"];
    default:
      return [];
  }
}

export function isValidTransition(
  last: AttendanceEventType | null,
  candidate: AttendanceEventType,
  ctx: KioskDayContext = { lunchToday: true },
): boolean {
  return allowedNextEvents(last, ctx).includes(candidate);
}

export type KioskOption = {
  event: AttendanceEventType;
  label: string;
  /**
   * done = ya marcado hoy; available = se puede elegir ahora;
   * locked = bloqueado por el orden (ver note); unavailable = quedó atrás sin marcar.
   */
  status: "done" | "available" | "locked" | "unavailable";
  /** ISO de la marcación si ya se hizo. */
  at: string | null;
  /** Por qué está bloqueado (ej. "Primero marca Entrar"). */
  note?: string;
};

/** Las 4 opciones del kiosco con su estado según lo marcado hoy (orden obligatorio). */
export function kioskOptions(
  today: { event_type: AttendanceEventType; occurred_at: string }[],
  ctx: KioskDayContext = { lunchToday: true },
): KioskOption[] {
  const done = new Map(today.map((e) => [e.event_type, e.occurred_at]));
  const last = lastEventOf(today);
  const lastIndex = last ? EVENT_ORDER.indexOf(last) : -1;
  const allowed = allowedNextEvents(last, ctx);
  const needed = allowed[0]; // lo que falta marcar primero

  return EVENT_ORDER.map((event, i) => {
    const base = { event, label: KIOSK_ACTION_LABEL[event], at: done.get(event) ?? null };
    if (done.has(event)) return { ...base, status: "done" as const };
    if (allowed.includes(event)) return { ...base, status: "available" as const };
    if (i < lastIndex) return { ...base, status: "unavailable" as const };
    const lunchButton = event === "SALIDA_ALMUERZO" || event === "REGRESO_ALMUERZO";
    const note =
      last === "ENTRADA" && lunchButton && !ctx.lunchToday
        ? "Hoy sin almuerzo"
        : needed
          ? `Primero marca ${KIOSK_ACTION_LABEL[needed]}`
          : undefined;
    return { ...base, status: "locked" as const, note };
  });
}

export function isEventType(v: unknown): v is AttendanceEventType {
  return typeof v === "string" && (EVENT_ORDER as readonly string[]).includes(v);
}
