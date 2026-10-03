import { isIP } from "node:net";

/**
 * IP pública del cliente.
 * En Vercel, x-vercel-forwarded-for / x-real-ip / x-forwarded-for los fija la
 * plataforma (el cliente no puede falsificarlos). Si se hospeda en otro lugar,
 * debe estar detrás de un proxy que sobrescriba estas cabeceras.
 */
export function getClientIp(headers: Headers): string | null {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ip = normalizeIp(raw.split(",")[0]);
    if (ip) return ip;
  }
  return null;
}

/** Limpia puertos, corchetes y prefijos IPv4-mapeados. Devuelve null si no es una IP válida. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    ip = end > 0 ? ip.slice(1, end) : ip;
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.split(":")[0];
  }
  if (ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

/** IP de loopback, red privada, CGNAT o link-local (no sirve como "IP pública del local"). */
export function isPrivateOrLoopback(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 0
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80");
  }
  return true;
}

/**
 * Valida una IP o un rango CIDR ingresado por el admin.
 * Devuelve el texto normalizado o un mensaje de error en español.
 */
export function parseIpOrCidr(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const s = input.trim();
  const [addr, prefixRaw, extra] = s.split("/");
  if (extra !== undefined) return { ok: false, error: "Formato inválido." };
  const ip = normalizeIp(addr);
  if (!ip) return { ok: false, error: "No es una dirección IP válida." };
  const version = isIP(ip);
  if (prefixRaw === undefined) return { ok: true, value: ip };
  if (!/^\d{1,3}$/.test(prefixRaw)) return { ok: false, error: "Prefijo CIDR inválido." };
  const prefix = Number(prefixRaw);
  const max = version === 4 ? 32 : 128;
  if (prefix < 8 || prefix > max) {
    return { ok: false, error: `El prefijo debe estar entre /8 y /${max}.` };
  }
  if (version === 4) {
    const n = ip.split(".").reduce((acc, o) => acc * 256 + Number(o), 0);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const net = (n & mask) >>> 0;
    if (net !== n) {
      const netStr = [24, 16, 8, 0].map((sh) => (net >>> sh) & 255).join(".");
      return { ok: false, error: `Para /${prefix} la red correcta es ${netStr}/${prefix}.` };
    }
  }
  return { ok: true, value: `${ip}/${prefix}` };
}
