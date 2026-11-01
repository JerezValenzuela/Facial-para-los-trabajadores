import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth";
import { BIOMETRIC_LABEL, biometricStatus, embeddedCount } from "@/lib/employees";
import { formatSchedule, scheduleFromRow } from "@/lib/attendance/schedule";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui";
import { IconCamera, IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Empleados" };

export default async function EmployeesPage(props: PageProps<"/dashboard/empleados">) {
  const sp = await props.searchParams;
  const branchFilter = typeof sp.sucursal === "string" ? sp.sucursal : "";
  const statusFilter = typeof sp.estado === "string" ? sp.estado : "activos";

  const { supabase } = await requireAdminSession();
  const [{ data: branches }, { data: rows }] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase
      .from("employees")
      .select("id, full_name, cedula, position, entry_time, work_days, entry_times, no_lunch_days, active, branch_id, consent_at, consent_revoked_at, face_templates(count)")
      .order("full_name"),
  ]);

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const employees = (rows ?? [])
    .map((e) => ({ ...e, templates: embeddedCount(e.face_templates) }))
    .filter((e) => (branchFilter ? e.branch_id === branchFilter : true))
    .filter((e) => (statusFilter === "todos" ? true : statusFilter === "inactivos" ? !e.active : e.active));

  return (
    <>
      <PageHeader
        title="Empleados"
        description={`${employees.length} empleado${employees.length === 1 ? "" : "s"} en la vista actual`}
        actions={
          <Link href="/dashboard/empleados/nuevo" className="btn-primary">
            <IconPlus className="h-4 w-4" /> Nuevo empleado
          </Link>
        }
      />

      {sp.eliminado === "1" && (
        <div className="mb-4">
          <Notice tone="success" title="Empleado eliminado">
            Se borraron sus datos, rostro, marcaciones, permisos y fotos. Ya no aparece en Asistencia ni en el Excel.
          </Notice>
        </div>
      )}

      <form className="card jc-filters mb-4 flex w-fit max-w-full flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label" htmlFor="sucursal">Sucursal</label>
          <select id="sucursal" name="sucursal" defaultValue={branchFilter} className="input min-w-44">
            <option value="">Todas</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="estado">Estado</label>
          <select id="estado" name="estado" defaultValue={statusFilter} className="input min-w-36">
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <button className="btn-secondary">Filtrar</button>
      </form>

      {employees.length === 0 ? (
        <EmptyState title="No hay empleados con estos filtros">
          Crea uno con el botón “Nuevo empleado”.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {employees.map((e) => {
            const status = biometricStatus(e);
            const initials = e.full_name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? "")
              .join("");
            return (
              <article key={e.id} className="card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-300 bg-slate-100 text-[15px] font-medium"
                    aria-hidden="true"
                  >
                    {initials}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={`/dashboard/empleados/${e.id}`}
                      className="truncate text-[15px] font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {e.full_name}
                    </Link>
                    <span className="font-mono text-[11.5px] text-slate-500">{e.cedula}</span>
                  </div>
                  {e.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-[12.5px]">
                  <dt className="text-slate-500">Sucursal</dt>
                  <dd>{branchName.get(e.branch_id) ?? "—"}</dd>
                  <dt className="text-slate-500">Cargo</dt>
                  <dd>{e.position}</dd>
                  <dt className="text-slate-500">Horario</dt>
                  <dd>{formatSchedule(scheduleFromRow(e))}</dd>
                  <dt className="text-slate-500">Biometría</dt>
                  <dd>
                    <Badge tone={status === "enrolado" ? "green" : status === "pendiente" ? "yellow" : "gray"}>
                      {BIOMETRIC_LABEL[status]}
                      {status === "enrolado" ? ` (${e.templates})` : ""}
                    </Badge>
                  </dd>
                </dl>
                <div className="mt-auto flex justify-end gap-2">
                  <Link href={`/dashboard/empleados/${e.id}`} className="btn-secondary px-3.5 py-1.5 text-xs">
                    Editar
                  </Link>
                  {e.active && status !== "sin_consentimiento" && (
                    <Link href={`/dashboard/empleados/${e.id}/enrolar`} className="btn-primary px-3.5 py-1.5 text-xs">
                      <IconCamera className="h-4 w-4" /> {status === "enrolado" ? "Re-enrolar" : "Enrolar"}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
