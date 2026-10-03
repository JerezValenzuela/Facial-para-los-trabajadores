"use client";

import { useActionState } from "react";
import { initialActionResult } from "@/lib/action-result";
import { ActionMessage, SubmitButton } from "@/components/form-status";
import { deleteBiometricsAction, deleteEmployeeAction, recordConsentAction, setEmployeeActiveAction } from "../actions";

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [state, action] = useActionState(setEmployeeActiveAction, initialActionResult);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <SubmitButton
        className={active ? "btn-secondary" : "btn-primary"}
        confirmMessage={active ? "¿Desactivar este empleado? No podrá marcar asistencia." : undefined}
      >
        {active ? "Desactivar empleado" : "Reactivar empleado"}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConsentForm({ id }: { id: string }) {
  const [state, action] = useActionState(recordConsentAction, initialActionResult);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-brand-600" />
        El empleado leyó el texto completo del consentimiento y aceptó libremente el tratamiento de sus datos biométricos.
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="signed" required className="mt-0.5 h-4 w-4 accent-brand-600" />
        El consentimiento firmado (físico o digital) quedó archivado por la administración.
      </label>
      <ActionMessage state={state} />
      <SubmitButton pendingText="Registrando…">Registrar consentimiento</SubmitButton>
    </form>
  );
}

export function DeleteBiometricsForm({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(deleteBiometricsAction, initialActionResult);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="delete_evidence" className="mt-0.5 h-4 w-4 accent-red-600" />
        Eliminar también las miniaturas de evidencia de sus marcaciones.
      </label>
      <div>
        <label className="label" htmlFor="confirm_text">
          Escribe <b>ELIMINAR</b> para confirmar
        </label>
        <input id="confirm_text" name="confirm_text" autoComplete="off" className="input max-w-xs" />
      </div>
      <ActionMessage state={state} />
      <SubmitButton
        className="btn-danger"
        pendingText="Eliminando…"
        confirmMessage={`Se eliminarán de forma permanente los datos biométricos de ${name} y se revocará su consentimiento. ¿Continuar?`}
      >
        Eliminar datos biométricos
      </SubmitButton>
    </form>
  );
}

export function DeleteEmployeeForm({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(deleteEmployeeAction, initialActionResult);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="label" htmlFor="confirm_delete_employee">
          Escribe <b>ELIMINAR</b> para confirmar
        </label>
        <input id="confirm_delete_employee" name="confirm_text" autoComplete="off" className="input max-w-xs" />
      </div>
      <ActionMessage state={state} />
      <SubmitButton
        className="btn-danger"
        pendingText="Eliminando…"
        confirmMessage={`Se eliminará a ${name} por completo, con todas sus marcaciones, permisos y fotos. Esto NO se puede deshacer. ¿Continuar?`}
      >
        Eliminar empleado
      </SubmitButton>
    </form>
  );
}
