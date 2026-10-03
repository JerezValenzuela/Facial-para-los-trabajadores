import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth";
import { BIOMETRIC_LABEL, biometricStatus, embeddedCount } from "@/lib/employees";
import { shortTime } from "@/lib/time";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
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
      .select("id, full_name, cedula, position, entry_time, active, branch_id, consent_at, consent_revoked_at, face_templates(count)")
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

      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" method="get">
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
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Nombre</th>
                <th className="th">Cédula</th>
                <th className="th">Sucursal</th>
                <th className="th">Cargo</th>
                <th className="th">Entrada</th>
                <th className="th">Biometría</th>
                <th className="th">Estado</th>
                <th className="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => {
                const status = biometricStatus(e);
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-900">
                      <Link href={`/dashboard/empleados/${e.id}`} className="hover:text-brand-700 hover:underline">
                        {e.full_name}
                      </Link>
                    </td>
                    <td className="td font-mono text-slate-600">{e.cedula}</td>
                    <td className="td">{branchName.get(e.branch_id) ?? "—"}</td>
                    <td className="td">{e.position}</td>
                    <td className="td font-mono">{shortTime(e.entry_time)}</td>
                    <td className="td">
                      <Badge tone={status === "enrolado" ? "green" : status === "pendiente" ? "yellow" : "gray"}>
                        {BIOMETRIC_LABEL[status]}
                        {status === "enrolado" ? ` (${e.templates})` : ""}
                      </Badge>
                    </td>
                    <td className="td">{e.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/empleados/${e.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                          Editar
                        </Link>
                        {e.active && status !== "sin_consentimiento" && (
                          <Link href={`/dashboard/empleados/${e.id}/enrolar`} className="btn-primary px-3 py-1.5 text-xs">
                            <IconCamera className="h-4 w-4" /> {status === "enrolado" ? "Re-enrolar" : "Enrolar"}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
