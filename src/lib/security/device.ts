/**
 * Detección de celulares y tablets (capa EXTRA, no infalible):
 *  - User-Agent y la cabecera Sec-CH-UA-Mobile (las envía el navegador al servidor).
 *  - Señales del cliente: puntos táctiles, puntero grueso sin hover, tamaño de pantalla.
 * Un atacante puede falsificar todo esto (modo "sitio de escritorio", extensiones).
 * La protección real es la IP del local + liveness + evidencia + auditoría.
 * Las laptops con pantalla táctil NO se bloquean solo por ser táctiles.
 */
export type DeviceSignals = {
  maxTouchPoints?: number;
  screenWidth?: number;
  screenHeight?: number;
  coarsePointer?: boolean;
  canHover?: boolean;
};

export type DeviceVerdict = { mobile: boolean; reasons: string[] };

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|BB10|Opera Mini|IEMobile|webOS|Windows Phone/i;

export function detectMobile(userAgent: string, chUaMobile: string | null, s: DeviceSignals = {}): DeviceVerdict {
  const reasons: string[] = [];
  const ua = userAgent || "";

  if (MOBILE_UA.test(ua)) reasons.push("user_agent");
  if (chUaMobile?.trim() === "?1") reasons.push("client_hint_mobile");

  const touch = (s.maxTouchPoints ?? 0) > 0;
  // iPadOS 13+ se presenta como "Macintosh" pero tiene pantalla táctil.
  if (/Macintosh/i.test(ua) && (s.maxTouchPoints ?? 0) > 1) reasons.push("ipad_como_mac");

  const w = s.screenWidth ?? 0;
  const h = s.screenHeight ?? 0;
  const longSide = Math.max(w, h);
  const shortSide = Math.min(w, h);
  if (longSide > 0 && longSide < 1000) reasons.push("pantalla_pequena");
  if (touch && s.coarsePointer && s.canHover === false && shortSide > 0 && shortSide < 900) {
    reasons.push("tactil_sin_mouse");
  }

  return { mobile: reasons.length > 0, reasons };
}
