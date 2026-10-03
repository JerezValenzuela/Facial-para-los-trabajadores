"use client";

import { useActionState, useEffect, useRef } from "react";
import { initialActionResult } from "@/lib/action-result";
import { ActionMessage, SubmitButton } from "@/components/form-status";
import { FieldError } from "@/components/ui";
import {
  addBranchIpAction,
  addMyIpAction,
  createBranchAction,
  updateBranchAction,
} from "./actions";

/** Limpia el formulario después de un guardado exitoso. */
function useResetOnSuccess(ok: boolean, message?: string) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (ok && message) ref.current?.reset();
  }, [ok, message]);
  return ref;
}

export function NewBranchForm() {
  const [state, action] = useActionState(createBranchAction, initialActionResult);
  const ref = useResetOnSuccess(state.ok, state.ok ? state.message : undefined);
  const fe = !state.ok ? state.fieldErrors : undefined;
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-4 sm:items-start">
      <div>
        <label className="label" htmlFor="nb-name">Nombre</label>
        <input id="nb-name" name="name" required className="input" placeholder="Ej. Carcelén" />
        <FieldError message={fe?.name} />
      </div>
      <div>
        <label className="label" htmlFor="nb-code">Código</label>
        <input id="nb-code" name="code" required className="input" placeholder="carcelen" />
        <FieldError message={fe?.code} />
      </div>
      <div>
        <label className="label" htmlFor="nb-address">Dirección (opcional)</label>
        <input id="nb-address" name="address" className="input" />
        <FieldError message={fe?.address} />
      </div>
      <div className="sm:pt-6">
        <SubmitButton className="btn-primary w-full">Crear sucursal</SubmitButton>
      </div>
      <div className="sm:col-span-4">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function EditBranchForm({
  branch,
}: {
  branch: { id: string; name: string; address: string | null; active: boolean };
}) {
  const [state, action] = useActionState(updateBranchAction, initialActionResult);
  const fe = !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <input type="hidden" name="id" value={branch.id} />
      <div>
        <label className="label" htmlFor={`name-${branch.id}`}>Nombre</label>
        <input id={`name-${branch.id}`} name="name" defaultValue={branch.name} className="input" />
        <FieldError message={fe?.name} />
      </div>
      <div>
        <label className="label" htmlFor={`addr-${branch.id}`}>Dirección</label>
        <input id={`addr-${branch.id}`} name="address" defaultValue={branch.address ?? ""} className="input" />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
        <input type="checkbox" name="active" defaultChecked={branch.active} className="h-4 w-4 accent-brand-600" />
        Activa
      </label>
      <SubmitButton className="btn-secondary">Guardar</SubmitButton>
      <div className="sm:col-span-4">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function AddIpForm({ branchId }: { branchId: string }) {
  const [state, action] = useActionState(addBranchIpAction, initialActionResult);
  const ref = useResetOnSuccess(state.ok, state.ok ? state.message : undefined);
  const fe = !state.ok ? state.fieldErrors : undefined;
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="branch_id" value={branchId} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <input name="ip" required className="input" placeholder="IP o rango, ej. 186.4.12.7 o 186.4.12.0/24" aria-label="IP o rango CIDR" />
          <FieldError message={fe?.ip} />
        </div>
        <input name="label" className="input" placeholder="Etiqueta (opcional)" aria-label="Etiqueta" />
        <SubmitButton className="btn-secondary">Agregar IP</SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function AddMyIpButton({ branchId, branchName }: { branchId: string; branchName: string }) {
  const [state, action] = useActionState(addMyIpAction, initialActionResult);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="branch_id" value={branchId} />
      <SubmitButton
        className="btn-primary"
        pendingText="Detectando IP…"
        confirmMessage={`¿Estás físicamente en ${branchName}? Se autorizará la IP pública de esta conexión para marcar asistencia en esa sucursal.`}
      >
        Agregar mi IP actual a esta sucursal
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
