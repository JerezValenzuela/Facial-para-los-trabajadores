import { z } from "zod";
import { parseIpOrCidr } from "@/lib/security/ip";

/**
 * Cédula ecuatoriana: 10 dígitos, provincia 01–24 (o 30 para extranjeros
 * registrados), tercer dígito < 6 y dígito verificador módulo 10.
 */
export function isValidCedula(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;
  const province = Number(cedula.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;
  if (Number(cedula[2]) >= 6) return false;
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(cedula[i]) * coef[i];
    if (p > 9) p -= 9;
    sum += p;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(cedula[9]);
}

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label}: mínimo ${min} caracteres.`)
    .max(max, `${label}: máximo ${max} caracteres.`);

export const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (formato HH:MM).");

export const uuid = z.uuid("Identificador inválido.");

export const employeeSchema = z.object({
  full_name: trimmed(3, 120, "Nombre").regex(/^[\p{L}\s.'-]+$/u, "El nombre solo admite letras y espacios."),
  cedula: z
    .string()
    .trim()
    .refine(isValidCedula, "Cédula ecuatoriana inválida (revisa los 10 dígitos)."),
  branch_id: uuid,
  position: trimmed(2, 80, "Cargo"),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Horario del empleado: días de trabajo y hora de entrada.
 * - same_time = true  → una sola hora para todos sus días (entry_times = {}).
 * - same_time = false → una hora por cada día elegido (errores en entry_time_N).
 */
export const scheduleSchema = z
  .object({
    work_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Elige al menos un día de trabajo."),
    same_time: z.boolean(),
    entry_time: z.string().default(""),
    day_times: z.record(z.string(), z.string()).default({}),
  })
  .superRefine((v, ctx) => {
    if (v.same_time) {
      if (!HHMM_RE.test(v.entry_time)) {
        ctx.addIssue({ code: "custom", path: ["entry_time"], message: "Hora inválida (formato HH:MM)." });
      }
      return;
    }
    for (const d of new Set(v.work_days)) {
      if (!HHMM_RE.test(v.day_times[String(d)] ?? "")) {
        ctx.addIssue({ code: "custom", path: [`entry_time_${d}`], message: "Pon la hora de entrada de este día." });
      }
    }
  })
  .transform((v) => {
    const work_days = [...new Set(v.work_days)].sort((a, b) => a - b);
    if (v.same_time) return { work_days, entry_time: v.entry_time, entry_times: {} as Record<string, string> };
    const entry_times: Record<string, string> = Object.fromEntries(work_days.map((d) => [String(d), v.day_times[String(d)]]));
    // entry_time queda como la hora del primer día (referencia general).
    return { work_days, entry_time: entry_times[String(work_days[0])], entry_times };
  });
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export const branchSchema = z.object({
  name: trimmed(2, 80, "Nombre"),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,32}$/, "Código: 2–32 caracteres (minúsculas, números o guiones)."),
  address: z
    .string()
    .trim()
    .max(200, "Dirección: máximo 200 caracteres.")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const branchIpSchema = z.object({
  branch_id: uuid,
  ip: z
    .string()
    .trim()
    .min(1, "Ingresa una IP.")
    .transform((v, ctx) => {
      const r = parseIpOrCidr(v);
      if (!r.ok) {
        ctx.addIssue({ code: "custom", message: r.error });
        return z.NEVER;
      }
      return r.value;
    }),
  label: z
    .string()
    .trim()
    .max(80, "Etiqueta: máximo 80 caracteres.")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const settingsSchema = z.object({
  entry_tolerance_minutes: z.coerce.number().int().min(0).max(120),
  lunch_allowed_minutes: z.coerce.number().int().min(10).max(240),
  lunch_alert_grace_minutes: z.coerce.number().int().min(0).max(120),
  face_match_threshold: z.coerce.number().min(0.3).max(0.65),
  cooldown_seconds: z.coerce.number().int().min(10).max(3600),
  liveness_steps: z.coerce.number().int().min(1).max(3),
  evidence_enabled: z.boolean(),
  evidence_retention_days: z.coerce.number().int().min(1).max(730),
  work_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Elige al menos un día laborable."),
  alert_lunch_excess: z.boolean(),
  alert_lunch_overdue: z.boolean(),
  alert_suspicious: z.boolean(),
  suspicious_attempts_threshold: z.coerce.number().int().min(2).max(100),
  suspicious_window_minutes: z.coerce.number().int().min(1).max(1440),
});
