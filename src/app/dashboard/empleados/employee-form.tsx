"use client";

import { useActionState } from "react";
import { initialActionResult } from "@/lib/action-result";
import { ActionMessage, SubmitButton } from "@/components/form-status";
import { FieldError } from "@/components/ui";
import { createEmployeeAction, updateEmployeeAction } from "./actions";

type Branch = { id: string; name: string };
type Employee = {
  id: string;
  full_name: string;
  cedula: string;
  branch_id: string;
  position: string;
  entry_time: string;
};

export function EmployeeForm({ branches, employee }: { branches: Branch[]; employee?: Employee }) {
  const [state, action] = useActionState(
    employee ? updateEmployeeAction : createEmployeeAction,
    initialActionResult,
  );
  const fe = !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4" noValidate>
      {employee && <input type="hidden" name="id" value={employee.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="full_name">Nombre completo</label>
          <input id="full_name" name="full_name" required defaultValue={employee?.full_name} className="input" autoComplete="off" />
          <FieldError message={fe?.full_name} />
        </div>
        <div>
          <label className="label" htmlFor="cedula">Cédula</label>
          <input
            id="cedula"
            name="cedula"
            required
            inputMode="numeric"
            maxLength={10}
            defaultValue={employee?.cedula}
            className="input font-mono"
            placeholder="10 dígitos"
            autoComplete="off"
          />
          <FieldError message={fe?.cedula} />
        </div>
        <div>
          <label className="label" htmlFor="position">Cargo</label>
          <input id="position" name="position" required defaultValue={employee?.position} className="input" placeholder="Ej. Vendedor" />
          <FieldError message={fe?.position} />
        </div>
        <div>
          <label className="label" htmlFor="branch_id">Sucursal</label>
          <select id="branch_id" name="branch_id" required defaultValue={employee?.branch_id ?? ""} className="input">
            <option value="" disabled>Selecciona…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <FieldError message={fe?.branch_id} />
        </div>
        <div>
          <label className="label" htmlFor="entry_time">Horario de entrada</label>
          <input
            id="entry_time"
            name="entry_time"
            type="time"
            required
            defaultValue={employee?.entry_time?.slice(0, 5) ?? "08:00"}
            className="input"
          />
          <FieldError message={fe?.entry_time} />
        </div>
      </div>
      <ActionMessage state={state} />
      <SubmitButton>{employee ? "Guardar cambios" : "Crear empleado"}</SubmitButton>
    </form>
  );
}
