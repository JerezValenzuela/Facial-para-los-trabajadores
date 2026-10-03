import type { Database } from "@/lib/supabase/database.types";

export type PermissionKind = Database["public"]["Enums"]["permission_kind"];

export type DayPermission = {
  kind: PermissionKind;
  /** "10:00" o "10:00:00" (solo permisos por horas). */
  startTime: string | null;
  hours: number | null;
};

/** 1.5 → "1 h 30 min", 2 → "2 horas", 0.5 → "30 min" */
export function formatPermissionHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? "1 hora" : `${h} horas`;
  return `${h} h ${m} min`;
}

/** "Todo el día" | "2 horas desde las 10:00 (hasta 12:00)" */
export function formatPermission(p: DayPermission | null | undefined): string {
  if (!p) return "";
  if (p.kind === "dia_completo") return "Todo el día";
  if (!p.startTime || !p.hours) return "Por horas";
  const start = p.startTime.slice(0, 5);
  return `${formatPermissionHours(p.hours)} desde las ${start} (hasta ${permissionEnd(start, p.hours)})`;
}

/** Hora de fin "HH:MM" de un permiso por horas. */
export function permissionEnd(startTime: string, hours: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = (h * 60 + m + Math.round(hours * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Opciones de duración que ve el empleado en el kiosco. */
export const PERMISSION_HOUR_OPTIONS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8] as const;
