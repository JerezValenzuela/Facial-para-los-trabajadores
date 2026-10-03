"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBell,
  IconClock,
  IconSettings,
  IconShield,
  IconStore,
  IconUsers,
} from "@/components/icons";

const items = [
  { href: "/dashboard", label: "Asistencia", Icon: IconClock, exact: true },
  { href: "/dashboard/empleados", label: "Empleados", Icon: IconUsers },
  { href: "/dashboard/sucursales", label: "Sucursales e IPs", Icon: IconStore },
  { href: "/dashboard/intentos", label: "Intentos fallidos", Icon: IconShield },
  { href: "/dashboard/alertas", label: "Alertas", Icon: IconBell },
  { href: "/dashboard/configuracion", label: "Configuración", Icon: IconSettings },
] as const;

export function DashboardNav({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  if (orientation === "horizontal") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2" aria-label="Secciones">
        {items.map(({ href, label, Icon, ...rest }) => {
          const active = isActive(href, "exact" in rest ? rest.exact : false);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="space-y-1" aria-label="Secciones">
      {items.map(({ href, label, Icon, ...rest }) => {
        const active = isActive(href, "exact" in rest ? rest.exact : false);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
