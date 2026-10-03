"use server";

import { requireAdminSession, UnauthorizedError } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { EVENT_LABEL, EVENT_ORDER, type AttendanceEventType } from "@/lib/attendance/events";
import { formatPermission } from "@/lib/attendance/permissions";
import { signedEvidenceUrls } from "@/lib/evidence";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatDateLabel, formatTime, isValidDateStr } from "@/lib/time";
import { uuid } from "@/lib/validation";
import { logError } from "@/lib/log";

/** ¿La IP de la marcación pertenece a la sucursal donde se registró? */
export type IpCheck = "ok" | "otra_sucursal" | "no_registrada" | "sin_ip";

export type EvidenceItem = {
  key: AttendanceEventType | "PERMISO";
  label: string;
  time: string | null;
  branchName: string | null;
  ip: string | null;
  ipCheck: IpCheck;
  ipBranchName: string | null;
  distance: number | null;
  faceUrl: string | null;
  sceneUrl: string | null;
  detail?: string;
};

export type DayEvidence = {
  employeeName: string;
  dateLabel: string;
  items: EvidenceItem[];
};

/**
 * Fotos de un día de un empleado (rostro + escena), con la verificación de IP.
 * Solo admin; las URLs son firmadas y caducan en 5 minutos.
 */
export async function getDayEvidenceAction(employeeId: string, date: string): Promise<ActionResult<DayEvidence>> {
  try {
    const { supabase } = await requireAdminSession();
    if (!uuid.safeParse(employeeId).success || !isValidDateStr(date)) {
      return { ok: false, error: "Datos inválidos." };
    }
    const [{ data: emp }, { data: events }, { data: permission }, { data: branches }] = await Promise.all([
      supabase.from("employees").select("full_name").eq("id", employeeId).maybeSingle(),
      supabase
        .from("attendance_events")
        .select("event_type, occurred_at, branch_id, ip, match_distance, evidence_path, scene_path")
        .eq("employee_id", employeeId)
        .eq("work_date", date),
      supabase
        .from("permissions")
        .select("kind, start_time, hours, created_at, branch_id, ip, evidence_path, scene_path")
        .eq("employee_id", employeeId)
        .eq("work_date", date)
        .maybeSingle(),
      supabase.from("branches").select("id, name"),
    ]);
    if (!emp) return { ok: false, error: "Empleado no encontrado." };

    const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
    const paths = [
      ...(events ?? []).flatMap((e) => [e.evidence_path, e.scene_path]),
      permission?.evidence_path,
      permission?.scene_path,
    ].filter((p): p is string => Boolean(p));
    const urls = await signedEvidenceUrls(paths);

    // Sucursal a la que pertenece cada IP (según las IPs registradas).
    const ips = [...new Set([...(events ?? []).map((e) => e.ip), permission?.ip].filter(Boolean).map(String))];
    const ipBranch = new Map<string, string | null>();
    await Promise.all(
      ips.map(async (ip) => {
        const { data } = await supabaseAdmin().rpc("kiosk_resolve_branch", { p_ip: ip });
        ipBranch.set(ip, (data as string | null) ?? null);
      }),
    );
    const check = (ip: unknown, branchId: string | null): Pick<EvidenceItem, "ip" | "ipCheck" | "ipBranchName"> => {
      if (!ip) return { ip: null, ipCheck: "sin_ip", ipBranchName: null };
      const s = String(ip);
      const owner = ipBranch.get(s) ?? null;
      return {
        ip: s,
        ipCheck: !owner ? "no_registrada" : owner === branchId ? "ok" : "otra_sucursal",
        ipBranchName: owner ? branchName.get(owner) ?? null : null,
      };
    };

    const items: EvidenceItem[] = EVENT_ORDER.map((type) => {
      const e = (events ?? []).find((x) => x.event_type === type);
      if (!e) {
        return {
          key: type, label: EVENT_LABEL[type], time: null, branchName: null, ip: null,
          ipCheck: "sin_ip", ipBranchName: null, distance: null, faceUrl: null, sceneUrl: null,
        };
      }
      return {
        key: type,
        label: EVENT_LABEL[type],
        time: formatTime(e.occurred_at, true),
        branchName: e.branch_id ? branchName.get(e.branch_id) ?? null : null,
        ...check(e.ip, e.branch_id),
        distance: e.match_distance,
        faceUrl: e.evidence_path ? urls[e.evidence_path] ?? null : null,
        sceneUrl: e.scene_path ? urls[e.scene_path] ?? null : null,
      };
    });
    if (permission) {
      items.push({
        key: "PERMISO",
        label: "Permiso",
        time: formatTime(permission.created_at, true),
        branchName: permission.branch_id ? branchName.get(permission.branch_id) ?? null : null,
        ...check(permission.ip, permission.branch_id),
        distance: null,
        faceUrl: permission.evidence_path ? urls[permission.evidence_path] ?? null : null,
        sceneUrl: permission.scene_path ? urls[permission.scene_path] ?? null : null,
        detail: formatPermission({ kind: permission.kind, startTime: permission.start_time, hours: permission.hours }),
      });
    }
    return { ok: true, data: { employeeName: emp.full_name, dateLabel: formatDateLabel(date), items } };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
    logError("evidencias-dia", e);
    return { ok: false, error: "No se pudieron cargar las fotos." };
  }
}
