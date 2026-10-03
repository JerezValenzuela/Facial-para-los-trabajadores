/**
 * Traduce errores de Postgres/PostgREST a mensajes en español SIN filtrar
 * detalles internos (nombres de tablas, SQL, etc.).
 */
const KNOWN: Record<string, string> = {
  SIN_CONSENTIMIENTO: "El empleado no tiene un consentimiento informado vigente.",
  CARA_DUPLICADA: "Este rostro es demasiado parecido al de otro empleado registrado.",
  MUESTRAS_INVALIDAS: "Se necesitan entre 3 y 5 muestras faciales.",
  DATOS_INVALIDOS: "Los datos enviados no son válidos.",
  NO_AUTORIZADO: "No tienes permisos para esta acción.",
  EMPLEADO_NO_EXISTE: "El empleado no existe.",
  EMPLEADO_INACTIVO: "El empleado está desactivado.",
  JORNADA_COMPLETA: "Ya registraste todas las marcaciones de hoy.",
  FUERA_DE_ORDEN: "Esa marcación ya no está disponible hoy (ya registraste una posterior).",
  COOLDOWN: "Acabas de marcar. Espera un momento antes de volver a intentarlo.",
  TICKET_INVALIDO: "La verificación no es válida. Vuelve a intentarlo.",
  TICKET_USADO: "Esta verificación ya fue utilizada.",
  TICKET_EXPIRADO: "La verificación caducó. Vuelve a intentarlo.",
  TICKET_IP: "La verificación no corresponde a este equipo.",
  PERMISO_YA_REGISTRADO: "Ya registraste un permiso hoy. Si necesitas cambiarlo, avisa al administrador.",
};

export type PgLikeError = { code?: string; message?: string; details?: string | null } | null | undefined;

/** Código de negocio (p. ej. "COOLDOWN") si el error proviene de un RAISE de nuestras funciones. */
export function businessCode(err: PgLikeError): string | null {
  if (!err?.message) return null;
  const msg = err.message.trim();
  return msg in KNOWN ? msg : null;
}

export function friendlyDbError(err: PgLikeError, fallback = "No se pudo completar la operación."): string {
  if (!err) return fallback;
  const code = businessCode(err);
  if (code === "CARA_DUPLICADA" && err.details) {
    return `Este rostro es demasiado parecido al de ${err.details}. Verifica que no esté ya registrado.`;
  }
  if (code) return KNOWN[code];
  switch (err.code) {
    case "23505":
      return "Ya existe un registro con esos datos (valor duplicado).";
    case "23503":
      return "No se puede completar: hay registros relacionados.";
    case "23514":
      return "Algún valor está fuera del rango permitido.";
    case "22P02":
      return "Formato de dato inválido.";
    case "42501":
      return "No tienes permisos para esta acción.";
    default:
      return fallback;
  }
}
