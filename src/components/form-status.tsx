"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  className = "btn-primary",
  confirmMessage,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  /** Si se indica, pide confirmación antes de enviar. */
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

/** Muestra el resultado de una Server Action (éxito o error). */
export function ActionMessage({ state }: { state: ActionResult<unknown> }) {
  if (state.ok && state.message) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.message}
      </p>
    );
  }
  if (!state.ok && state.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  return null;
}
