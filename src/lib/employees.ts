export type BiometricStatus = "sin_consentimiento" | "pendiente" | "enrolado";

export function biometricStatus(e: {
  consent_at: string | null;
  consent_revoked_at: string | null;
  templates: number;
}): BiometricStatus {
  if (!e.consent_at || e.consent_revoked_at) return "sin_consentimiento";
  return e.templates > 0 ? "enrolado" : "pendiente";
}

export const BIOMETRIC_LABEL: Record<BiometricStatus, string> = {
  sin_consentimiento: "Sin consentimiento",
  pendiente: "Pendiente de enrolar",
  enrolado: "Rostro enrolado",
};

/** Cuenta embebida de PostgREST: face_templates(count) → [{ count: n }] */
export function embeddedCount(v: unknown): number {
  if (Array.isArray(v) && v[0] && typeof (v[0] as { count?: unknown }).count === "number") {
    return (v[0] as { count: number }).count;
  }
  return 0;
}
