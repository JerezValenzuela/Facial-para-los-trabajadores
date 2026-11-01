"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Fondo decorativo del panel: aurora verde/azul, estrellas, rayos y un halo que
 * sigue al cursor. Además, un barrido de luz cruza la pantalla en cada cambio de sección.
 */
export function AuroraBackground() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      ref.current?.style.setProperty("--mx", `${e.clientX}px`);
      ref.current?.style.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <>
      <div ref={ref} className="jc-aurora print:hidden" aria-hidden="true">
        <div className="jc-sky" />
        <div className="jc-stars" />
        <div className="jc-aur-top" />
        <div className="jc-aur-mid" />
        <div className="jc-aur-low" />
        <div className="jc-rays" />
        <div className="jc-shade" />
        <div className="jc-halo" />
      </div>
      <div key={pathname} className="jc-sweep print:hidden" aria-hidden="true" />
    </>
  );
}
