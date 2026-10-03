"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { initialActionResult } from "@/lib/action-result";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialActionResult);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="email" className="label">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input"
          placeholder="admin@jerezcons.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="input"
        />
      </div>
      {!state.ok && state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full py-2.5">
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
