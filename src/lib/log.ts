/**
 * Registro de errores SIN datos sensibles: solo contexto, código y mensaje.
 * Nunca registrar cuerpos de petición, descriptores, llaves ni tokens.
 */
export function logError(context: string, err: unknown): void {
  if (!err) {
    console.error(`[${context}] error desconocido`);
    return;
  }
  const e = err as {
    code?: string;
    message?: string;
    name?: string;
    details?: string;
    cause?: { code?: string; message?: string };
  };
  const message = typeof e.message === "string" ? e.message.slice(0, 300) : String(err).slice(0, 300);
  // Los errores de red traen la causa real (ENOTFOUND, certificados…) en `cause`
  // o, en supabase-js, dentro de `details` ("Caused by: …").
  const causedBy = typeof e.details === "string" ? /Caused by:\s*([^\n]{0,160})/.exec(e.details)?.[1] : undefined;
  const cause = e.cause?.code ?? e.cause?.message?.slice(0, 120) ?? causedBy;
  console.error(`[${context}]`, e.code ?? e.name ?? "error", message, cause ? `(causa: ${cause})` : "");
}
