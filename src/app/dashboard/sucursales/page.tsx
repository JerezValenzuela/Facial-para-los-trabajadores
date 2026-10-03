import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireAdminSession } from "@/lib/auth";
import { isDevMode } from "@/lib/env";
import { detectAdminPublicIp, displayIpRange } from "@/lib/security/public-ip";
import { formatDateTime } from "@/lib/time";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/form-status";
import { IconTrash } from "@/components/icons";
import { deleteBranchIpAction } from "./actions";
import { AddIpForm, AddMyIpButton, EditBranchForm, NewBranchForm } from "./branch-forms";

export const metadata: Metadata = { title: "Sucursales e IPs" };

export default async function BranchesPage() {
  const { supabase } = await requireAdminSession();
  const [{ data: branches }, { data: ips }, detected] = await Promise.all([
    supabase.from("branches").select("id, code, name, address, active").order("name"),
    supabase.from("branch_ips").select("id, branch_id, ip_range, label, created_at").order("created_at"),
    detectAdminPublicIp(await headers()),
  ]);

  return (
    <>
      <PageHeader
        title="Sucursales e IPs permitidas"
        description="El kiosco solo acepta marcaciones desde las IPs públicas registradas para cada sucursal."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Notice tone="info" title="¿Cómo funciona?">
          Abre este panel desde una computadora conectada al internet del local y pulsa{" "}
          <b>“Agregar mi IP actual”</b>. Si el proveedor cambia la IP, las marcaciones aparecerán como
          “IP no permitida” en Intentos fallidos: repite el proceso.
        </Notice>
        <div className="card p-4 text-sm">
          <p className="text-slate-500">Tu IP pública detectada ahora</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-900">{detected.ip ?? "No detectada"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {detected.source === "ipify" && "Detectada vía ipify.org porque estás en localhost."}
            {detected.source === "request" && "Detectada desde tu conexión."}
            {detected.source === "none" && "Ingresa la IP manualmente."}
            {isDevMode() && " · DEV_MODE activo: la restricción por IP está desactivada."}
          </p>
        </div>
      </div>

      {!branches?.length ? (
        <EmptyState title="No hay sucursales" />
      ) : (
        <div className="space-y-6">
          {branches.map((b) => {
            const list = (ips ?? []).filter((i) => i.branch_id === b.id);
            return (
              <section key={b.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{b.name}</h2>
                    <span className="font-mono text-xs text-slate-500">{b.code}</span>
                    {b.active ? <Badge tone="green">Activa</Badge> : <Badge>Inactiva</Badge>}
                  </div>
                  <Badge tone={list.length ? "blue" : "yellow"}>
                    {list.length} IP{list.length === 1 ? "" : "s"} autorizada{list.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="space-y-5 p-5">
                  <EditBranchForm branch={b} />

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-700">IPs permitidas</h3>
                    {list.length === 0 ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Sin IPs: con DEV_MODE=false nadie podrá marcar en esta sucursal.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {list.map((ip) => (
                          <li key={ip.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-medium">{displayIpRange(ip.ip_range)}</p>
                              <p className="truncate text-xs text-slate-500">
                                {ip.label ?? "Sin etiqueta"} · {formatDateTime(ip.created_at)}
                              </p>
                            </div>
                            <form action={deleteBranchIpAction}>
                              <input type="hidden" name="id" value={ip.id} />
                              <SubmitButton
                                className="btn-ghost px-2 text-red-600 hover:bg-red-50"
                                pendingText="…"
                                confirmMessage={`¿Quitar la IP ${displayIpRange(ip.ip_range)} de ${b.name}?`}
                              >
                                <IconTrash className="h-4 w-4" />
                                <span className="sr-only">Eliminar</span>
                              </SubmitButton>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start">
                    <AddMyIpButton branchId={b.id} branchName={b.name} />
                    <AddIpForm branchId={b.id} />
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="card mt-8 p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Nueva sucursal</h2>
        <NewBranchForm />
      </section>
    </>
  );
}
