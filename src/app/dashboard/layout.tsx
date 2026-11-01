import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminCheck } from "@/lib/auth";
import { isDevMode, isUnsafeProductionDevMode } from "@/lib/env";
import { logoutAction } from "@/app/login/actions";
import { inter } from "@/app/fonts";
import { IconLogout } from "@/components/icons";
import { AuroraBackground } from "./aurora";
import { DashboardNav } from "./nav";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · JerezCons Asistencia" } };

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const check = await getAdminCheck();
  if (check.status === "anonymous") redirect("/login");

  if (check.status === "forbidden") {
    return (
      <div className={`jc-dash flex flex-1 ${inter.className}`}>
        <AuroraBackground />
        <main className="relative z-[1] flex flex-1 items-center justify-center p-6">
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
      </div>
    );
  }

  const { session } = check;
  const unsafeProd = isUnsafeProductionDevMode();
  const devMode = isDevMode();
  const userName = session.fullName ?? session.email;

  return (
    <div className={`jc-dash flex min-h-full flex-1 flex-col ${inter.className}`}>
      <AuroraBackground />

      <div className="relative z-[1] flex flex-1 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 print:p-0">
        <header className="sticky top-3 z-[5] flex justify-center print:hidden">
          <div className="jc-nav flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[28px] p-1.5 xl:rounded-full">
            <Link href="/dashboard" className="flex items-center gap-2 pr-3 pl-1">
              <span className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[#8fe0b0] font-semibold text-[#cdf3dc] shadow-[0_0_16px_rgba(143,224,176,0.35)]">
                J
              </span>
              <span className="flex flex-col leading-[1.15]">
                <span className="text-[13px] font-medium">JerezCons</span>
                <span className="text-[10.5px] text-[#e9efe9]/60">Asistencia</span>
              </span>
            </Link>
            <span className="hidden h-[22px] w-px bg-[#dcf0e4]/15 sm:block" aria-hidden="true" />
            <DashboardNav />
            <span className="hidden h-[22px] w-px bg-[#dcf0e4]/15 sm:block" aria-hidden="true" />
            <div className="flex items-center gap-2 pr-1 pl-2">
              <span
                className="grid h-7 w-7 place-items-center rounded-full bg-[#dcf0e4]/12 text-xs font-medium"
                aria-hidden="true"
              >
                {userName.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-40 truncate text-[12.5px]" title={session.email}>
                {userName}
              </span>
              <form action={logoutAction}>
                <button
                  className="grid h-8 w-8 place-items-center rounded-full border border-[#dcf0e4]/16 text-[#e9efe9] hover:bg-[#ff8a80]/14 hover:text-[#ffb3ab]"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <IconLogout className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </header>

        {unsafeProd && (
          <div className="flex justify-center print:hidden">
            <div
              role="alert"
              className="jc-pill-alert max-w-full rounded-[22px] border border-[#ff8a80]/45 bg-[#781814]/50 px-4 py-2 text-center text-xs text-[#ffd2cc] sm:rounded-full"
            >
              <b className="font-semibold">⚠️ PELIGRO: DEV_MODE=true en PRODUCCIÓN.</b> La restricción por IP está DESACTIVADA y cualquier
              equipo puede marcar asistencia. Pon DEV_MODE=false en Vercel y vuelve a desplegar.
            </div>
          </div>
        )}
        {!unsafeProd && devMode && (
          <div className="flex justify-center print:hidden">
            <div className="jc-pill-alert max-w-full rounded-[22px] border border-[#f5c46b]/45 bg-[#5a4210]/45 px-4 py-1.5 text-center text-xs font-medium text-[#f8d48e] sm:rounded-full">
              Modo desarrollo (DEV_MODE=true): la restricción por IP de sucursal está desactivada.
            </div>
          </div>
        )}

        <main className="flex-1 print:p-0">{children}</main>
      </div>
    </div>
  );
}
