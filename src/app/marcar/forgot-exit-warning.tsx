"use client";

import { useEffect, useState } from "react";

/**
 * Pantalla roja completa: "AYER OLVIDASTE MARCAR TU SALIDA".
 * Se muestra unos segundos después de reconocer al empleado y antes de las
 * opciones (el paso a las opciones lo hace el temporizador del kiosco).
 */
export function ForgotExitWarning({
  firstName,
  dayLabel,
  seconds,
}: {
  firstName: string;
  /** "Ayer" o "El sábado 03/10". */
  dayLabel: string;
  seconds: number;
}) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => {
      setLeft(Math.max(1, seconds - Math.floor((performance.now() - start) / 1000)));
    }, 200);
    return () => window.clearInterval(id);
  }, [seconds]);

  return (
    <div
      role="alert"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-700 px-6 text-center text-white"
    >
      <div className="text-8xl motion-safe:animate-pulse" aria-hidden>
        ⚠️
      </div>
      <p className="mt-6 text-3xl font-semibold text-red-100">{firstName}:</p>
      <h1 className="mt-2 max-w-4xl text-5xl leading-tight font-black tracking-tight uppercase sm:text-6xl">
        {dayLabel} olvidaste marcar tu salida
      </h1>
      <p className="mt-6 max-w-2xl text-2xl font-medium text-red-50">
        ¡No te olvides! Al terminar tu jornada marca <b>“Salir”</b>.
      </p>
      <p className="mt-10 rounded-full bg-black/25 px-6 py-2 text-xl font-semibold tabular-nums">
        Continuar en {left}…
      </p>
    </div>
  );
}
