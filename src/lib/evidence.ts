import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

export const EVIDENCE_BUCKET = "evidencias";
const MAX_BYTES = 60 * 1024;
/** Foto de escena (cuadro completo, con el fondo): un poco más grande. */
export const SCENE_MAX_BYTES = 95 * 1024;

/**
 * Valida una miniatura JPEG enviada por el kiosco (data URL base64) y la
 * devuelve como bytes. Rechaza cualquier cosa que no sea un JPEG pequeño.
 */
export function decodeJpegDataUrl(dataUrl: string | undefined | null, maxBytes = MAX_BYTES): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith("data:image/jpeg;base64,")) return null;
  const b64 = dataUrl.slice("data:image/jpeg;base64,".length);
  if (b64.length > Math.ceil((maxBytes * 4) / 3) + 4) return null;
  const buf = Buffer.from(b64, "base64");
  // Firma JPEG: FF D8 FF … FF D9
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}

/** Sube la miniatura a Storage privado. Ruta: <tipo>/<fecha>/<uuid>.jpg */
export async function uploadEvidence(
  kind: "eventos" | "intentos",
  workDate: string,
  jpeg: Buffer,
): Promise<string | null> {
  const path = `${kind}/${workDate}/${randomUUID()}.jpg`;
  const { error } = await supabaseAdmin()
    .storage.from(EVIDENCE_BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (error) {
    logError("evidencia", error);
    return null;
  }
  return path;
}

/** URLs firmadas de corta duración (solo para el admin ya verificado). */
export async function signedEvidenceUrls(paths: string[], expiresInSeconds = 300): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await supabaseAdmin()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUrls(unique, expiresInSeconds);
  if (error || !data) {
    logError("evidencia-url", error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const item of data) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}
