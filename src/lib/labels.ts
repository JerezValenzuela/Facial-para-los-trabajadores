import type { Database } from "@/lib/supabase/database.types";

type Reason = Database["public"]["Enums"]["failed_attempt_reason"];
type AlertType = Database["public"]["Enums"]["alert_type"];
type AlertStatus = Database["public"]["Enums"]["alert_status"];

export const REASON_LABEL: Record<Reason, string> = {
  ip_no_permitida: "IP no permitida",
  movil_detectado: "Celular/tablet detectado",
  liveness_fallido: "Prueba de vida fallida",
  cara_desconocida: "Cara desconocida",
  ambiguedad: "Identidad ambigua",
  reto_invalido: "Reto inválido o vencido",
  fuera_de_orden: "Marcación fuera de orden",
  cooldown: "Marcación repetida (cooldown)",
  jornada_completa: "Jornada ya completa",
  empleado_inactivo: "Empleado inactivo",
  rate_limit: "Exceso de intentos",
  datos_invalidos: "Datos inválidos",
};

/** Motivos que sugieren intento de fraude (se resaltan en rojo). */
export const SUSPICIOUS_REASONS: Reason[] = [
  "ip_no_permitida",
  "movil_detectado",
  "liveness_fallido",
  "cara_desconocida",
  "ambiguedad",
  "reto_invalido",
  "rate_limit",
];

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  exceso_almuerzo: "Exceso de almuerzo",
  almuerzo_sin_regreso: "Almuerzo sin regreso",
  intentos_sospechosos: "Intentos sospechosos",
};

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  pendiente_envio: "Pendiente de envío",
  enviada: "Enviada",
  error: "Error de envío",
};

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};
