/**
 * Registro de errores SIN datos sensibles: solo contexto, código y mensaje.
 * Nunca registrar cuerpos de petición, descriptores, llaves ni tokens.
 */
export function logError(context: string, err: unknown): void {
  if (!err) {
    console.error(`[${context}] error desconocido`);
    return;
  }
  const e = err as { code?: string; message?: string; name?: string };
  const message = typeof e.message === "string" ? e.message.slice(0, 300) : String(err).slice(0, 300);
  console.error(`[${context}]`, e.code ?? e.name ?? "error", message);
}
