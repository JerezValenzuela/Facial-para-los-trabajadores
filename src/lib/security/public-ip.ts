import "server-only";
import { getClientIp, isPrivateOrLoopback, normalizeIp } from "@/lib/security/ip";

export type DetectedIp = { ip: string | null; source: "request" | "ipify" | "none" };

/**
 * IP pública del equipo del administrador (para "Agregar mi IP actual").
 * - En producción (Vercel) es la IP de origen de la petición.
 * - En localhost la petición llega como 127.0.0.1/::1; como el servidor corre
 *   en la misma computadora, se consulta la IP pública a ipify. Ese respaldo
 *   NUNCA se usa en producción (devolvería la IP del servidor, no la del local).
 */
export async function detectAdminPublicIp(headers: Headers): Promise<DetectedIp> {
  const reqIp = getClientIp(headers);
  if (reqIp && !isPrivateOrLoopback(reqIp)) return { ip: reqIp, source: "request" };
  if (process.env.NODE_ENV === "production") return { ip: null, source: "none" };
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (r.ok) {
      const body = (await r.json()) as { ip?: string };
      const ip = normalizeIp(body.ip);
      if (ip) return { ip, source: "ipify" };
    }
  } catch {
    // sin conexión o servicio caído
  }
  return { ip: null, source: "none" };
}

/** "1.2.3.4/32" → "1.2.3.4" (las IP exactas se muestran sin prefijo). */
export function displayIpRange(range: unknown): string {
  const s = String(range ?? "");
  return s.replace(/\/(32|128)$/, "");
}
