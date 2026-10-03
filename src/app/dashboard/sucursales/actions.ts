"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdminSession, UnauthorizedError } from "@/lib/auth";
import { type ActionResult, zodFieldErrors } from "@/lib/action-result";
import { branchIpSchema, branchSchema, uuid } from "@/lib/validation";
import { friendlyDbError } from "@/lib/db-errors";
import { detectAdminPublicIp } from "@/lib/security/public-ip";
import { parseIpOrCidr } from "@/lib/security/ip";
import { logError } from "@/lib/log";

const PATH = "/dashboard/sucursales";

function denied(e: unknown): ActionResult {
  if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
  logError("sucursales", e);
  return { ok: false, error: "Ocurrió un error inesperado." };
}

export async function createBranchAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminSession();
    const parsed = branchSchema.safeParse({
      name: formData.get("name"),
      code: formData.get("code"),
      address: formData.get("address") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: "Revisa los datos.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const { error } = await supabase.from("branches").insert(parsed.data);
    if (error) return { ok: false, error: friendlyDbError(error) };
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "crear_sucursal",
      entity: "branch",
      entity_id: parsed.data.code,
    });
    revalidatePath(PATH);
    return { ok: true, message: `Sucursal ${parsed.data.name} creada.` };
  } catch (e) {
    return denied(e);
  }
}

export async function updateBranchAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminSession();
    const id = uuid.safeParse(formData.get("id"));
    const parsed = branchSchema.omit({ code: true }).safeParse({
      name: formData.get("name"),
      address: formData.get("address") || undefined,
    });
    if (!id.success || !parsed.success) {
      return {
        ok: false,
        error: "Revisa los datos.",
        fieldErrors: parsed.success ? undefined : zodFieldErrors(parsed.error),
      };
    }
    const active = formData.get("active") === "on";
    const { error } = await supabase
      .from("branches")
      .update({ ...parsed.data, active })
      .eq("id", id.data);
    if (error) return { ok: false, error: friendlyDbError(error) };
    revalidatePath(PATH);
    return { ok: true, message: "Sucursal actualizada." };
  } catch (e) {
    return denied(e);
  }
}

async function insertIp(branchId: string, ipRange: string, label: string | null): Promise<ActionResult> {
  const { supabase, user } = await requireAdminSession();
  const { error } = await supabase
    .from("branch_ips")
    .insert({ branch_id: branchId, ip_range: ipRange, label, created_by: user.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Esa IP ya está registrada en esta sucursal." };
    return { ok: false, error: friendlyDbError(error, "No se pudo guardar la IP.") };
  }
  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: "agregar_ip",
    entity: "branch",
    entity_id: branchId,
    details: { ip: ipRange, etiqueta: label },
  });
  revalidatePath(PATH);
  return { ok: true, message: `IP ${ipRange.replace(/\/(32|128)$/, "")} agregada.` };
}

export async function addBranchIpAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const parsed = branchIpSchema.safeParse({
      branch_id: formData.get("branch_id"),
      ip: formData.get("ip"),
      label: formData.get("label") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: "Revisa la IP.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    return await insertIp(parsed.data.branch_id, parsed.data.ip, parsed.data.label);
  } catch (e) {
    return denied(e);
  }
}

/** "Agregar mi IP actual a esta sucursal": se usa estando físicamente en el local. */
export async function addMyIpAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdminSession();
    const branchId = uuid.safeParse(formData.get("branch_id"));
    if (!branchId.success) return { ok: false, error: "Sucursal inválida." };
    const detected = await detectAdminPublicIp(await headers());
    if (!detected.ip) {
      return { ok: false, error: "No se pudo detectar tu IP pública. Ingrésala manualmente." };
    }
    const parsed = parseIpOrCidr(detected.ip);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const label = `Agregada desde el dashboard (${new Date().toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })})`;
    return await insertIp(branchId.data, parsed.value, label);
  } catch (e) {
    return denied(e);
  }
}

export async function deleteBranchIpAction(formData: FormData): Promise<void> {
  const { supabase, user } = await requireAdminSession();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return;
  const { data } = await supabase.from("branch_ips").delete().eq("id", id.data).select("branch_id, ip_range");
  if (data?.[0]) {
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "eliminar_ip",
      entity: "branch",
      entity_id: data[0].branch_id,
      details: { ip: String(data[0].ip_range) },
    });
  }
  revalidatePath(PATH);
}
