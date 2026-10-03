"use client";

import { useActionState } from "react";
import { initialActionResult } from "@/lib/action-result";
import { ActionMessage, SubmitButton } from "@/components/form-status";
import { resendAlertAction, testNotificationAction } from "./actions";

export function ResendButton({ id }: { id: string }) {
  const [state, action] = useActionState(resendAlertAction, initialActionResult);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="btn-secondary px-2 py-1 text-xs" pendingText="Enviando…">
        Reenviar
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function TestNotificationButton() {
  const [state, action] = useActionState(testNotificationAction, initialActionResult);
  return (
    <form action={action} className="space-y-2">
      <SubmitButton className="btn-secondary" pendingText="Enviando…">
        Enviar mensaje de prueba
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
