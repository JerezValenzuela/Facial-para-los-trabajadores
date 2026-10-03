import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { Notice, PageHeader } from "@/components/ui";
import { EnrollClient } from "./enroll-client";

export const metadata: Metadata = { title: "Enrolar rostro" };

export default async function EnrollPage(props: PageProps<"/dashboard/empleados/[id]/enrolar">) {
  const { id } = await props.params;
  if (!uuid.safeParse(id).success) notFound();
  const { supabase } = await requireAdminSession();
  const { data: e } = await supabase
    .from("employees")
    .select("id, full_name, active, consent_at, consent_revoked_at")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const canEnroll = e.active && e.consent_at && !e.consent_revoked_at;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/dashboard/empleados/${e.id}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← {e.full_name}
      </Link>
      <PageHeader
        title={`Enrolar rostro · ${e.full_name}`}
        description="Se capturan de 3 a 5 muestras. Solo se guarda el vector numérico de cada muestra: ninguna foto sale de este equipo."
      />
      {canEnroll ? (
        <EnrollClient employeeId={e.id} employeeName={e.full_name} />
      ) : (
        <Notice tone="warning" title="No se puede enrolar">
          {e.active
            ? "Primero registra el consentimiento informado del empleado."
            : "El empleado está desactivado."}{" "}
          <Link href={`/dashboard/empleados/${e.id}`} className="font-medium underline">
            Ir a la ficha del empleado
          </Link>
        </Notice>
      )}
    </div>
  );
}
