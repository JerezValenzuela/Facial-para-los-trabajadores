"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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

/** Secciones del panel. El activo se marca con una píldora menta que se desliza hasta él. */
export function DashboardNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    const measure = () => {
      const indicator = indicatorRef.current;
      const active = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!indicator) return;
      if (!active) {
        indicator.style.opacity = "0";
        return;
      }
      indicator.style.left = `${active.offsetLeft}px`;
      indicator.style.top = `${active.offsetTop}px`;
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.opacity = "1";
    };
    measure();
    // Al cargar la fuente cambian los anchos de los botones.
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pathname]);

  return (
    <nav aria-label="Secciones">
      <div ref={listRef} className="relative flex flex-wrap justify-center gap-1">
        <span ref={indicatorRef} className="jc-nav-indicator" aria-hidden="true" />
        {items.map(({ href, label, Icon, ...rest }) => {
          const active = isActive(href, "exact" in rest ? rest.exact : false);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative z-[1] flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-700 ${
                active ? "text-[#cdf3dc]" : "text-[#e9efe9]/75 hover:bg-[#dcf0e4]/[0.06] hover:text-[#e9efe9]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
