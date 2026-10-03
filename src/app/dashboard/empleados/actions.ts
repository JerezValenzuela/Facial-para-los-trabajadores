"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession, UnauthorizedError } from "@/lib/auth";
import { type ActionResult, zodFieldErrors } from "@/lib/action-result";
import { employeeSchema, uuid } from "@/lib/validation";
import { friendlyDbError } from "@/lib/db-errors";
import { CONSENT_VERSION } from "@/lib/consent";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET } from "@/lib/evidence";
import { logError } from "@/lib/log";

const LIST = "/dashboard/empleados";

function fail(e: unknown): ActionResult {
  if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
  logError("empleados", e);
  return { ok: false, error: "Ocurrió un error inesperado." };
}

function readEmployee(formData: FormData) {
  return employeeSchema.safeParse({
    full_name: formData.get("full_name"),
    cedula: formData.get("cedula"),
    branch_id: formData.get("branch_id"),
    position: formData.get("position"),
    entry_time: formData.get("entry_time"),
  });
}

export async function createEmployeeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let newId: string | null = null;
  try {
    const { supabase, user } = await requireAdminSession();
    const parsed = readEmployee(formData);
    if (!parsed.success) {
      return { ok: false, error: "Revisa los datos del formulario.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const { data, error } = await supabase.from("employees").insert(parsed.data).select("id").single();
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Ya existe un empleado con esa cédula.", fieldErrors: { cedula: "Cédula ya registrada." } };
      }
      return { ok: false, error: friendlyDbError(error) };
    }
    newId = data.id;
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "crear_empleado",
      entity: "employee",
      entity_id: data.id,
    });
    revalidatePath(LIST);
  } catch (e) {
    return fail(e);
  }
  redirect(`${LIST}/${newId}?creado=1`);
}

export async function updateEmployeeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminSession();
    const id = uuid.safeParse(formData.get("id"));
    const parsed = readEmployee(formData);
    if (!id.success) return { ok: false, error: "Empleado inválido." };
    if (!parsed.success) {
      return { ok: false, error: "Revisa los datos del formulario.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const { error } = await supabase.from("employees").update(parsed.data).eq("id", id.data);
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Ya existe otro empleado con esa cédula.", fieldErrors: { cedula: "Cédula ya registrada." } };
      }
      return { ok: false, error: friendlyDbError(error) };
    }
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: "editar_empleado",
      entity: "employee",
      entity_id: id.data,
    });
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${id.data}`);
    return { ok: true, message: "Datos guardados." };
  } catch (e) {
    return fail(e);
  }
}

export async function setEmployeeActiveAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminSession();
    const id = uuid.safeParse(formData.get("id"));
    if (!id.success) return { ok: false, error: "Empleado inválido." };
    const active = formData.get("active") === "true";
    const { error } = await supabase.from("employees").update({ active }).eq("id", id.data);
    if (error) return { ok: false, error: friendlyDbError(error) };
    await supabase.from("audit_log").insert({
      actor_id: user.id,
      action: active ? "activar_empleado" : "desactivar_empleado",
      entity: "employee",
      entity_id: id.data,
    });
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${id.data}`);
    return { ok: true, message: active ? "Empleado activado." : "Empleado desactivado: ya no podrá marcar." };
  } catch (e) {
    return fail(e);
  }
}

export async function recordConsentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminSession();
    const id = uuid.safeParse(formData.get("id"));
    if (!id.success) return { ok: false, error: "Empleado inválido." };
    if (formData.get("consent") !== "on" || formData.get("signed") !== "on") {
      return { ok: false, error: "Debes confirmar ambas casillas para registrar el consentimiento." };
    }
    const { error } = await supabase.rpc("admin_record_consent", {
      p_employee_id: id.data,
      p_version: CONSENT_VERSION,
    });
    if (error) return { ok: false, error: friendlyDbError(error) };
    revalidatePath(`${LIST}/${id.data}`);
    revalidatePath(LIST);
    return { ok: true, message: "Consentimiento registrado. Ya puedes enrolar el rostro." };
  } catch (e) {
    return fail(e);
  }
}

/** Derecho de eliminación (LOPDP): borra plantillas y, opcionalmente, las miniaturas de evidencia. */
export async function deleteBiometricsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminSession();
    const id = uuid.safeParse(formData.get("id"));
    if (!id.success) return { ok: false, error: "Empleado inválido." };
    if (formData.get("confirm_text") !== "ELIMINAR") {
      return { ok: false, error: 'Escribe ELIMINAR para confirmar.' };
    }
    const { data: removed, error } = await supabase.rpc("admin_delete_biometrics", { p_employee_id: id.data });
    if (error) return { ok: false, error: friendlyDbError(error) };

    let evidenceRemoved = 0;
    if (formData.get("delete_evidence") === "on") {
      const admin = supabaseAdmin();
      const [{ data: ev }, { data: fa }] = await Promise.all([
        admin.from("attendance_events").select("id, evidence_path").eq("employee_id", id.data).not("evidence_path", "is", null),
        admin.from("failed_attempts").select("id, evidence_path").eq("employee_id", id.data).not("evidence_path", "is", null),
      ]);
      const paths = [...(ev ?? []), ...(fa ?? [])].map((r) => r.evidence_path!).filter(Boolean);
      for (let i = 0; i < paths.length; i += 100) {
        await admin.storage.from(EVIDENCE_BUCKET).remove(paths.slice(i, i + 100));
      }
      await Promise.all([
        admin.from("attendance_events").update({ evidence_path: null }).eq("employee_id", id.data),
        admin.from("failed_attempts").update({ evidence_path: null }).eq("employee_id", id.data),
      ]);
      evidenceRemoved = paths.length;
      await supabase.from("audit_log").insert({
        actor_id: user.id,
        action: "eliminar_evidencias",
        entity: "employee",
        entity_id: id.data,
        details: { miniaturas: evidenceRemoved },
      });
    }
    revalidatePath(`${LIST}/${id.data}`);
    revalidatePath(LIST);
    return {
      ok: true,
      message: `Datos biométricos eliminados (${removed ?? 0} plantillas${
        evidenceRemoved ? `, ${evidenceRemoved} miniaturas` : ""
      }). El consentimiento quedó revocado.`,
    };
  } catch (e) {
    return fail(e);
  }
}
