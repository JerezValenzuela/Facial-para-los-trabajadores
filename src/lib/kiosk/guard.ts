import "server-only";
import { NextResponse } from "next/server";
import { isDevMode } from "@/lib/env";
import { getClientIp } from "@/lib/security/ip";
import { detectMobile, type DeviceSignals } from "@/lib/security/device";
import { rateLimit } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { decodeJpegDataUrl, uploadEvidence } from "@/lib/evidence";
import { todayInTz } from "@/lib/time";
import { logError } from "@/lib/log";
import type { Database, Json } from "@/lib/supabase/database.types";

export type FailedReason = Database["public"]["Enums"]["failed_attempt_reason"];

export type KioskContext = {
  ip: string;
  userAgent: string;
  branchId: string | null;
  branchName: string | null;
  devMode: boolean;
};

/** Respuesta JSON de error para el kiosco: mensaje en español, sin detalles internos. */
export function kioskError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status });
}

/** Registra un intento fallido/sospechoso (con miniatura si está habilitado). */
export async function logFailedAttempt(input: {
  reason: FailedReason;
  ip: string | null;
  userAgent: string | null;
  branchId?: string | null;
  employeeId?: string | null;
  distance?: number | null;
  details?: Json;
  thumbnail?: string | null;
}): Promise<void> {
  try {
    let evidencePath: string | null = null;
    if (input.thumbnail) {
      const settings = await getSettings();
      const jpeg = settings.evidence_enabled ? decodeJpegDataUrl(input.thumbnail) : null;
      if (jpeg) evidencePath = await uploadEvidence("intentos", todayInTz(), jpeg);
    }
    const { error } = await supabaseAdmin()
      .from("failed_attempts")
      .insert({
        reason: input.reason,
        ip: input.ip,
        user_agent: input.userAgent?.slice(0, 400) ?? null,
        branch_id: input.branchId ?? null,
        employee_id: input.employeeId ?? null,
        match_distance: input.distance ?? null,
        details: input.details ?? {},
        evidence_path: evidencePath,
      });
    if (error) logError("intento-fallido", error);
  } catch (e) {
    logError("intento-fallido", e);
  }
}

type GuardOptions = {
  route: "status" | "challenge" | "identify" | "mark";
  /** Peticiones permitidas por minuto y por IP. */
  perMinute: number;
  device?: DeviceSignals;
  /** Código de sucursal (?sucursal=) — SOLO se usa con DEV_MODE. */
  devBranchCode?: string | null;
  /** Si es false, no registra intentos fallidos (consultas de estado). */
  logFailures?: boolean;
};

/**
 * Validaciones de servidor comunes a todas las rutas del kiosco:
 *  1. IP real del cliente (cabeceras de la plataforma)
 *  2. Rate limiting por IP (en Postgres)
 *  3. Bloqueo de celulares/tablets (capa extra)
 *  4. IP autorizada para una sucursal (desactivado SOLO con DEV_MODE=true)
 */
export async function kioskGuard(
  req: Request,
  opts: GuardOptions,
): Promise<{ ok: true; ctx: KioskContext } | { ok: false; response: NextResponse }> {
  const devMode = isDevMode();
  const userAgent = req.headers.get("user-agent") ?? "";
  const log = opts.logFailures !== false;

  let ip = getClientIp(req.headers);
  if (!ip) {
    if (!devMode) {
      return { ok: false, response: kioskError(400, "sin_ip", "No se pudo determinar la conexión de este equipo.") };
    }
    ip = "127.0.0.1";
  }

  const rl = await rateLimit(`kiosk:${opts.route}:${ip}`, 60, opts.perMinute);
  if (!rl.allowed) {
    // Se registra solo el primer exceso de cada ventana (evita inundar la tabla).
    if (log && rl.hits === opts.perMinute + 1) {
      await logFailedAttempt({ reason: "rate_limit", ip, userAgent, details: { ruta: opts.route } });
    }
    return {
      ok: false,
      response: kioskError(429, "rate_limit", "Demasiados intentos seguidos. Espera un minuto."),
    };
  }

  const device = detectMobile(userAgent, req.headers.get("sec-ch-ua-mobile"), opts.device);
  if (device.mobile) {
    if (log) await logFailedAttempt({ reason: "movil_detectado", ip, userAgent, details: { motivos: device.reasons } });
    return {
      ok: false,
      response: kioskError(403, "movil", "La marcación solo está permitida desde las computadoras del local."),
    };
  }

  const db = supabaseAdmin();
  const { data: branchId, error } = await db.rpc("kiosk_resolve_branch", { p_ip: ip });
  if (error) {
    logError("kiosk-branch", error);
    return { ok: false, response: kioskError(503, "servicio", "Servicio no disponible. Intenta en un momento.") };
  }

  let resolved: string | null = branchId ?? null;
  if (!resolved) {
    if (!devMode) {
      if (log) await logFailedAttempt({ reason: "ip_no_permitida", ip, userAgent });
      return {
        ok: false,
        response: kioskError(403, "ip_no_permitida", "Este equipo no está autorizado para marcar asistencia.", { ip }),
      };
    }
    // DEV_MODE: se acepta cualquier IP; la sucursal se toma de ?sucursal= si existe.
    if (opts.devBranchCode) {
      const { data: b } = await db.from("branches").select("id").eq("code", opts.devBranchCode).eq("active", true).maybeSingle();
      resolved = b?.id ?? null;
    }
  }

  let branchName: string | null = null;
  if (resolved) {
    const { data: b } = await db.from("branches").select("name").eq("id", resolved).maybeSingle();
    branchName = b?.name ?? null;
  }

  return { ok: true, ctx: { ip, userAgent: userAgent.slice(0, 400), branchId: resolved, branchName, devMode } };
}

/** Lee un cuerpo JSON con límite de tamaño (evita cargas abusivas). */
export async function readJsonBody(req: Request, maxBytes: number): Promise<unknown | null> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
