"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

type Rect = { l: number; t: number; w: number };

/**
 * Secciones del panel. El activo se marca con una píldora menta: al tocar otra sección
 * se estira hasta ella y luego se recoge, sin esperar a que cargue la página.
 */
export function DashboardNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const lastRect = useRef<Rect | null>(null);
  // Sección tocada mientras la página nueva todavía carga.
  const [clicked, setClicked] = useState<{ href: string; from: string } | null>(null);
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const activeHref = items.find(({ href, ...rest }) => isActive(href, "exact" in rest ? rest.exact : false))?.href;
  const targetHref = clicked && clicked.from === pathname ? clicked.href : activeHref;

  useEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const place = (r: Rect) => {
      indicator.style.left = `${r.l}px`;
      indicator.style.top = `${r.t}px`;
      indicator.style.width = `${r.w}px`;
    };
    const measure = (animate: boolean) => {
      const el = targetHref ? listRef.current?.querySelector<HTMLElement>(`[data-href="${targetHref}"]`) : null;
      if (!el) {
        indicator.style.opacity = "0";
        lastRect.current = null;
        return;
      }
      const next = { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth };
      const prev = lastRect.current;
      lastRect.current = next;
      indicator.style.opacity = "1";
      if (animate && prev && prev.t === next.t && (prev.l !== next.l || prev.w !== next.w)) {
        // Fase 1: se estira cubriendo origen y destino. Fase 2: se recoge en el destino.
        const left = Math.min(prev.l, next.l);
        indicator.dataset.stretch = "";
        place({ l: left, t: next.t, w: Math.max(prev.l + prev.w, next.l + next.w) - left });
        timer = setTimeout(() => {
          delete indicator.dataset.stretch;
          place(next);
        }, 190);
      } else {
        place(next);
      }
    };

    measure(true);
    // Al cargar la fuente cambian los anchos de los botones.
    void document.fonts?.ready.then(() => measure(false));
    const onResize = () => measure(false);
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [targetHref]);

  return (
    <nav aria-label="Secciones">
      <div ref={listRef} className="relative flex flex-wrap justify-center gap-1">
        <span ref={indicatorRef} className="jc-nav-indicator" aria-hidden="true" />
        {items.map(({ href, label, Icon, ...rest }) => {
          const active = isActive(href, "exact" in rest ? rest.exact : false);
          const highlighted = href === targetHref;
          return (
            <Link
              key={href}
              href={href}
              data-href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => setClicked({ href, from: pathname })}
              className={`relative z-[1] flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-300 ${
                highlighted ? "text-[#cdf3dc]" : "text-[#e9efe9]/75 hover:bg-[#dcf0e4]/[0.06] hover:text-[#e9efe9]"
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
