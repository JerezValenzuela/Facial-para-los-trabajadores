"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession, UnauthorizedError } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-errors";
import { maxPairwiseDistance } from "@/lib/face/liveness";
import { logError } from "@/lib/log";

const descriptor = z.array(z.number().finite().min(-2).max(2)).length(128);

const enrollSchema = z.object({
  employeeId: z.uuid(),
  descriptors: z.array(descriptor).min(3).max(5),
  scores: z.array(z.number().min(0).max(1)).min(3).max(5),
});

/** Máxima diferencia aceptada entre muestras del mismo enrolamiento. */
const ENROLL_MAX_SPREAD = 0.6;

/**
 * Guarda SOLO los vectores (nunca fotos). La función de BD exige
 * consentimiento vigente y rechaza rostros que coinciden con otro empleado.
 */
export async function enrollFaceAction(input: unknown): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminSession();
    const parsed = enrollSchema.safeParse(input);
    if (!parsed.success || parsed.data.scores.length !== parsed.data.descriptors.length) {
      return { ok: false, error: "Muestras inválidas. Repite la captura." };
    }
    const { employeeId, descriptors, scores } = parsed.data;
    if (maxPairwiseDistance(descriptors) > ENROLL_MAX_SPREAD) {
      return { ok: false, error: "Las muestras no parecen de la misma persona. Repite la captura." };
    }
    const { data, error } = await supabase.rpc("admin_enroll_face", {
      p_employee_id: employeeId,
      p_descriptors: descriptors,
      p_scores: scores,
    });
    if (error) return { ok: false, error: friendlyDbError(error, "No se pudo guardar el enrolamiento.") };
    revalidatePath(`/dashboard/empleados/${employeeId}`);
    revalidatePath("/dashboard/empleados");
    return { ok: true, message: `Rostro enrolado con ${data} muestras.` };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
    logError("enrolar", e);
    return { ok: false, error: "Ocurrió un error inesperado." };
  }
}
