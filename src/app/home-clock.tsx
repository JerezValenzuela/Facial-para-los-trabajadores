"use client";

import { useEffect, useState } from "react";
import { formatFullDate, formatTime } from "@/lib/time";

/** Reloj de la página de inicio (hora de Ecuador), se actualiza cada segundo. */
export function HomeClock() {
  // Se muestra después de montar para que el HTML del servidor y del navegador coincidan.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const date = now ? formatFullDate(now) : "";
  return (
    <div className="flex flex-col gap-1.5 border-t-2 border-[#201e1d] pt-[clamp(12px,2.2vh,20px)]">
      <div className="text-[clamp(36px,min(5vw,8vh),64px)] leading-none font-bold tracking-[-0.03em] tabular-nums">
        {now ? formatTime(now, true) : "--:--:--"}
      </div>
      <div className="min-h-6 text-base font-medium text-[#55504d]">{date.charAt(0).toUpperCase() + date.slice(1)}</div>
    </div>
  );
}
