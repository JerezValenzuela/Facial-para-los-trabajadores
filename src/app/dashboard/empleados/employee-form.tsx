"use client";

import { useActionState, useState } from "react";
import { initialActionResult } from "@/lib/action-result";
import { ActionMessage, SubmitButton } from "@/components/form-status";
import { FieldError } from "@/components/ui";
import { parseEntryTimes, WEEKDAYS } from "@/lib/attendance/schedule";
import { createEmployeeAction, updateEmployeeAction } from "./actions";

type Branch = { id: string; name: string };
type Employee = {
  id: string;
  full_name: string;
  cedula: string;
  branch_id: string;
  position: string;
  entry_time: string;
  work_days: number[];
  entry_times: unknown;
};

export function EmployeeForm({
  branches,
  employee,
  defaultWorkDays = [1, 2, 3, 4, 5, 6],
}: {
  branches: Branch[];
  employee?: Employee;
  /** Días que se marcan por defecto al crear un empleado (Configuración). */
  defaultWorkDays?: number[];
}) {
  const [state, action] = useActionState(
    employee ? updateEmployeeAction : createEmployeeAction,
    initialActionResult,
  );
  const fe = !state.ok ? state.fieldErrors : undefined;

  const baseTime = employee?.entry_time?.slice(0, 5) ?? "08:00";
  const savedTimes = parseEntryTimes(employee?.entry_times);
  const [days, setDays] = useState<number[]>(employee?.work_days ?? defaultWorkDays);
  const [sameTime, setSameTime] = useState(Object.keys(savedTimes).length === 0);
  const [time, setTime] = useState(baseTime);
  const [dayTimes, setDayTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(WEEKDAYS.map((d) => [String(d.iso), savedTimes[String(d.iso)] ?? baseTime])),
  );

  function toggleDay(iso: number) {
    setDays((cur) => (cur.includes(iso) ? cur.filter((d) => d !== iso) : [...cur, iso].sort((a, b) => a - b)));
  }

  function toggleSameTime(next: boolean) {
    // Al pasar a "horas distintas" se parte de la hora única para no escribir todo de nuevo.
    if (!next && sameTime) setDayTimes((cur) => Object.fromEntries(Object.keys(cur).map((k) => [k, time])));
    if (next && !sameTime && days.length) setTime(dayTimes[String(days[0])] ?? time);
    setSameTime(next);
  }

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
        <div className="sm:col-span-2">
          <label className="label" htmlFor="branch_id">Sucursal</label>
          <select id="branch_id" name="branch_id" required defaultValue={employee?.branch_id ?? ""} className="input sm:max-w-xs">
            <option value="" disabled>Selecciona…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <FieldError message={fe?.branch_id} />
        </div>
      </div>

      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Horario de trabajo</legend>

        <div>
          <p className="label">¿Qué días trabaja?</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d.iso);
              return (
                <label
                  key={d.iso}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition select-none ${
                    on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="work_days"
                    value={d.iso}
                    checked={on}
                    onChange={() => toggleDay(d.iso)}
                    className="sr-only"
                  />
                  {d.short}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Los días que no trabaja no aparecen en Asistencia ni en el Excel (si marca igual, sale como “Libre”).
          </p>
          <FieldError message={fe?.work_days} />
        </div>

        <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            name="same_time"
            checked={sameTime}
            onChange={(e) => toggleSameTime(e.target.checked)}
            className="h-5 w-5 accent-brand-600"
          />
          Entra a la misma hora todos los días
        </label>

        {sameTime ? (
          <div>
            <label className="label" htmlFor="entry_time">Hora de entrada</label>
            <input
              id="entry_time"
              name="entry_time"
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="input max-w-40"
            />
            <FieldError message={fe?.entry_time} />
          </div>
        ) : days.length === 0 ? (
          <p className="text-sm text-slate-500">Elige primero los días que trabaja.</p>
        ) : (
          <div>
            <p className="label">Hora de entrada de cada día</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {WEEKDAYS.filter((d) => days.includes(d.iso)).map((d) => (
                <div key={d.iso}>
                  <div className="flex items-center gap-3">
                    <label htmlFor={`entry_time_${d.iso}`} className="w-24 text-sm text-slate-700">{d.long}</label>
                    <input
                      id={`entry_time_${d.iso}`}
                      name={`entry_time_${d.iso}`}
                      type="time"
                      required
                      value={dayTimes[String(d.iso)] ?? ""}
                      onChange={(e) => setDayTimes((cur) => ({ ...cur, [String(d.iso)]: e.target.value }))}
                      className="input max-w-36"
                    />
                  </div>
                  <FieldError message={fe?.[`entry_time_${d.iso}`]} />
                </div>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <ActionMessage state={state} />
      <SubmitButton>{employee ? "Guardar cambios" : "Crear empleado"}</SubmitButton>
    </form>
  );
}
