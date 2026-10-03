import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminCheck } from "@/lib/auth";
import { isDevMode, isUnsafeProductionDevMode } from "@/lib/env";
import { logoutAction } from "@/app/login/actions";
import { IconLogout } from "@/components/icons";
import { DashboardNav } from "./nav";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · JerezCons Asistencia" } };

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const check = await getAdminCheck();
  if (check.status === "anonymous") redirect("/login");

  if (check.status === "forbidden") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Acceso denegado</h1>
          <p className="mt-2 text-sm text-slate-600">
            La cuenta {check.email ?? ""} no tiene permisos de administrador.
          </p>
          <form action={logoutAction} className="mt-4">
            <button className="btn-secondary">Cerrar sesión</button>
          </form>
        </div>
      </main>
    );
  }

  const { session } = check;
  const unsafeProd = isUnsafeProductionDevMode();
  const devMode = isDevMode();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {unsafeProd && (
        <div role="alert" className="bg-red-600 px-4 py-3 text-center text-sm font-semibold text-white">
          ⚠️ PELIGRO: DEV_MODE=true en PRODUCCIÓN. La restricción por IP está DESACTIVADA y cualquier
          equipo puede marcar asistencia. Pon DEV_MODE=false en Vercel y vuelve a desplegar.
        </div>
      )}
      {!unsafeProd && devMode && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">
          Modo desarrollo (DEV_MODE=true): la restricción por IP de sucursal está desactivada.
        </div>
      )}

      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
              J
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">JerezCons</p>
              <p className="text-xs text-slate-500">Asistencia</p>
            </div>
          </div>
          <div className="flex-1 p-3">
            <DashboardNav orientation="vertical" />
          </div>
          <div className="border-t border-slate-200 p-3">
            <p className="truncate px-3 text-xs text-slate-500" title={session.email}>
              {session.fullName ?? session.email}
            </p>
            <form action={logoutAction}>
              <button className="btn-ghost mt-1 w-full justify-start">
                <IconLogout className="h-4 w-4" /> Cerrar sesión
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white lg:hidden">
            <div className="flex h-14 items-center justify-between px-4">
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                  J
                </span>
                <span className="text-sm font-semibold">JerezCons Asistencia</span>
              </Link>
              <form action={logoutAction}>
                <button className="btn-ghost px-2" aria-label="Cerrar sesión">
                  <IconLogout className="h-5 w-5" />
                </button>
              </form>
            </div>
            <DashboardNav orientation="horizontal" />
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
