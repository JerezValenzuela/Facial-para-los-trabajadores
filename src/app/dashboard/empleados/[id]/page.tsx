import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { BIOMETRIC_LABEL, biometricStatus, embeddedCount } from "@/lib/employees";
import { CONSENT_PARAGRAPHS, CONSENT_TITLE, CONSENT_VERSION } from "@/lib/consent";
import { formatDateTime } from "@/lib/time";
import { signedEvidenceUrls } from "@/lib/evidence";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { IconCamera } from "@/components/icons";
import { EmployeeForm } from "../employee-form";
import { ActiveToggle, ConsentForm, DeleteBiometricsForm } from "./employee-panels";

export const metadata: Metadata = { title: "Empleado" };

export default async function EmployeeDetailPage(props: PageProps<"/dashboard/empleados/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!uuid.safeParse(id).success) notFound();

  const { supabase } = await requireAdminSession();
  const [{ data: e }, { data: branches }, { data: lastPhoto }] = await Promise.all([
    supabase
      .from("employees")
      .select("*, face_templates(count)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("branches").select("id, name").order("name"),
    // Foto del empleado = la última miniatura que le tomó el kiosco al marcar
    // (no se guardan fotos del enrolamiento, solo vectores).
    supabase
      .from("attendance_events")
      .select("evidence_path, occurred_at")
      .eq("employee_id", id)
      .not("evidence_path", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!e) notFound();
  const photoUrl = lastPhoto?.evidence_path
    ? (await signedEvidenceUrls([lastPhoto.evidence_path]))[lastPhoto.evidence_path] ?? null
    : null;
  const initials = e.full_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  const templates = embeddedCount(e.face_templates);
  const status = biometricStatus({ ...e, templates });
  const hasConsent = status !== "sin_consentimiento";

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/empleados" className="text-sm text-slate-500 hover:text-slate-700">← Empleados</Link>
      <div className="mt-3 mb-2 flex items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`Foto de ${e.full_name}`}
            className="h-28 w-28 rounded-2xl border-4 border-white object-cover shadow-md"
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-slate-200 text-3xl font-bold text-slate-500 shadow-inner">
            {initials}
          </div>
        )}
        <p className="text-xs text-slate-500">
          {lastPhoto?.occurred_at
            ? `Última foto tomada por el kiosco: ${formatDateTime(lastPhoto.occurred_at)}`
            : "Aún sin foto: aparecerá después de su primera marcación en el kiosco."}
        </p>
      </div>
      <PageHeader
        title={e.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {e.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}
            <Badge tone={status === "enrolado" ? "green" : status === "pendiente" ? "yellow" : "gray"}>
              {BIOMETRIC_LABEL[status]}
            </Badge>
          </span>
        }
        actions={
          e.active && hasConsent ? (
            <Link href={`/dashboard/empleados/${e.id}/enrolar`} className="btn-primary">
              <IconCamera className="h-4 w-4" /> {templates > 0 ? "Re-enrolar rostro" : "Enrolar rostro"}
            </Link>
          ) : undefined
        }
      />

      {sp.creado === "1" && (
        <div className="mb-4">
          <Notice tone="success" title="Empleado creado">
            Siguiente paso: imprime el consentimiento, haz que el empleado lo firme y regístralo abajo.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-900">Datos del empleado</h2>
          <EmployeeForm branches={branches ?? []} employee={e} />
        </section>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-2 font-semibold text-slate-900">Estado</h2>
            <p className="mb-3 text-sm text-slate-600">
              Un empleado inactivo no puede marcar, pero su historial se conserva.
            </p>
            <ActiveToggle id={e.id} active={e.active} />
          </section>
        </aside>
      </div>

      <section className="card mt-6 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Consentimiento y datos biométricos (LOPDP)</h2>
          <Link
            href={`/dashboard/empleados/${e.id}/consentimiento`}
            target="_blank"
            className="btn-secondary text-xs"
          >
            Imprimir consentimiento
          </Link>
        </div>

        {hasConsent ? (
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-slate-500">Consentimiento registrado</p>
              <p className="font-medium">{formatDateTime(e.consent_at)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-slate-500">Versión del texto</p>
              <p className="font-mono font-medium">{e.consent_version}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-slate-500">Plantillas faciales</p>
              <p className="font-medium">{templates} {templates === 1 ? "muestra" : "muestras"}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {e.consent_revoked_at && (
              <Notice tone="warning">
                Consentimiento revocado / datos eliminados el {formatDateTime(e.consent_revoked_at)}. Para volver a
                enrolar se necesita un consentimiento nuevo.
              </Notice>
            )}
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="mb-2 font-semibold">{CONSENT_TITLE}</p>
              {CONSENT_PARAGRAPHS.map((p) => (
                <p key={p} className="mb-2">{p}</p>
              ))}
              <p className="text-xs text-slate-500">Versión {CONSENT_VERSION}</p>
            </div>
            <ConsentForm id={e.id} />
          </div>
        )}

        {(templates > 0 || hasConsent) && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50/40 p-4">
            <h3 className="mb-1 font-semibold text-red-800">Eliminar datos biométricos</h3>
            <p className="mb-3 text-sm text-slate-600">
              Borra de forma permanente las plantillas faciales de este empleado y revoca su consentimiento
              (derecho de eliminación). El historial de asistencia se conserva.
            </p>
            <DeleteBiometricsForm id={e.id} name={e.full_name} />
          </div>
        )}
      </section>
    </div>
  );
}
