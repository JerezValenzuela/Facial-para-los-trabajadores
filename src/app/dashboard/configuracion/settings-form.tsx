"use client";

import { useActionState, type ReactNode } from "react";
import { initialActionResult } from "@/lib/action-result";
import { ActionMessage, SubmitButton } from "@/components/form-status";
import { FieldError } from "@/components/ui";
import { WEEKDAY_LABEL } from "@/lib/labels";
import { updateSettingsAction } from "./actions";

export type SettingsValues = {
  entry_tolerance_minutes: number;
  lunch_allowed_minutes: number;
  lunch_alert_grace_minutes: number;
  face_match_threshold: number;
  cooldown_seconds: number;
  liveness_steps: number;
  evidence_enabled: boolean;
  evidence_retention_days: number;
  work_days: number[];
  alert_lunch_excess: boolean;
  alert_lunch_overdue: boolean;
  alert_suspicious: boolean;
  suspicious_attempts_threshold: number;
  suspicious_window_minutes: number;
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function NumberField({
  name,
  label,
  help,
  value,
  min,
  max,
  step = 1,
  error,
}: {
  name: string;
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  error?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type="number" min={min} max={max} step={step} defaultValue={value} className="input" required />
      {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
      <FieldError message={error} />
    </div>
  );
}

function Toggle({ name, label, help, checked }: { name: string; label: string; help?: string; checked: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-4 w-4 accent-brand-600" />
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        {help && <span className="mt-0.5 block text-xs text-slate-500">{help}</span>}
      </span>
    </label>
  );
}

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, action] = useActionState(updateSettingsAction, initialActionResult);
  const fe = !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-6">
      <Section title="Reglas de asistencia">
        <NumberField name="entry_tolerance_minutes" label="Tolerancia de entrada (min)" value={values.entry_tolerance_minutes} min={0} max={120}
          help="Atraso = entrada real − horario − tolerancia." error={fe?.entry_tolerance_minutes} />
        <NumberField name="lunch_allowed_minutes" label="Almuerzo permitido (min)" value={values.lunch_allowed_minutes} min={10} max={240}
          help="Exceso = duración real − permitido." error={fe?.lunch_allowed_minutes} />
        <NumberField name="cooldown_seconds" label="Espera entre marcaciones (s)" value={values.cooldown_seconds} min={10} max={3600}
          help="Evita marcaciones dobles del mismo empleado." error={fe?.cooldown_seconds} />
        <div className="sm:col-span-2">
          <p className="label">Días laborables</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <label key={d} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                <input type="checkbox" name="work_days" value={d} defaultChecked={values.work_days.includes(d)} className="h-4 w-4 accent-brand-600" />
                {WEEKDAY_LABEL[d]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Los días no laborables sin marcaciones no aparecen como “Incompleto”.</p>
          <FieldError message={fe?.work_days} />
        </div>
      </Section>

      <Section title="Reconocimiento facial y prueba de vida">
        <NumberField name="face_match_threshold" label="Umbral de coincidencia (distancia)" value={values.face_match_threshold} min={0.3} max={0.65} step={0.01}
          help="Menor = más estricto. Recomendado 0.45–0.50. Si 2 empleados quedan bajo el umbral, se rechaza por ambigüedad." error={fe?.face_match_threshold} />
        <NumberField name="liveness_steps" label="Retos de vida por marcación" value={values.liveness_steps} min={1} max={3}
          help="Parpadeo o giros de cabeza, en orden aleatorio. Recomendado: 2." error={fe?.liveness_steps} />
      </Section>

      <Section title="Evidencia (miniaturas)" description="Foto pequeña (160×160) guardada en almacenamiento privado al marcar o al fallar un intento.">
        <Toggle name="evidence_enabled" label="Guardar miniatura de cada marcación" checked={values.evidence_enabled} />
        <NumberField name="evidence_retention_days" label="Retención (días)" value={values.evidence_retention_days} min={1} max={730}
          help="La limpieza automática borra las miniaturas más antiguas." error={fe?.evidence_retention_days} />
      </Section>

      <Section title="Alertas" description="Se registran siempre; se envían solo con ALERTS_ENABLED=true.">
        <Toggle name="alert_lunch_excess" label="Exceso de almuerzo al regresar" checked={values.alert_lunch_excess} />
        <Toggle name="alert_lunch_overdue" label="Almuerzo sin regreso (cron)" help="Cuando pasa el almuerzo permitido + margen." checked={values.alert_lunch_overdue} />
        <NumberField name="lunch_alert_grace_minutes" label="Margen para “sin regreso” (min)" value={values.lunch_alert_grace_minutes} min={0} max={120} error={fe?.lunch_alert_grace_minutes} />
        <Toggle name="alert_suspicious" label="Intentos sospechosos repetidos (cron)" checked={values.alert_suspicious} />
        <NumberField name="suspicious_attempts_threshold" label="Intentos para alertar" value={values.suspicious_attempts_threshold} min={2} max={100} error={fe?.suspicious_attempts_threshold} />
        <NumberField name="suspicious_window_minutes" label="Ventana de tiempo (min)" value={values.suspicious_window_minutes} min={1} max={1440} error={fe?.suspicious_window_minutes} />
      </Section>

      <div className="flex items-center gap-3">
        <SubmitButton>Guardar configuración</SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
