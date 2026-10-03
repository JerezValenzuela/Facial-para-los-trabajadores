"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { STATUS_LABEL, type ReportRow } from "@/lib/attendance/calc";
import { formatPermission } from "@/lib/attendance/permissions";
import { formatDateLabel, formatMinutes, formatTime } from "@/lib/time";
import { Badge } from "@/components/ui";
import { getDayEvidenceAction, type DayEvidence, type EvidenceItem } from "./evidence-actions";

type Selected = { employeeId: string; date: string; name: string };

/** Tabla de asistencia: al tocar una fila se abren las fotos de ese día. */
export function AttendanceTable({ rows, branchNames }: { rows: ReportRow[]; branchNames: Record<string, string> }) {
  const [selected, setSelected] = useState<Selected | null>(null);

  return (
    <>
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="th">Fecha</th>
              <th className="th">Empleado</th>
              <th className="th">Sucursal</th>
              <th className="th">Horario</th>
              <th className="th">Entrada</th>
              <th className="th">Salida alm.</th>
              <th className="th">Regreso</th>
              <th className="th">Salida final</th>
              <th className="th">Alm. tomado</th>
              <th className="th">Exceso alm.</th>
              <th className="th">Atraso</th>
              <th className="th">Horas trab.</th>
              <th className="th">Permiso</th>
              <th className="th">Estado</th>
              <th className="th">Fotos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <Row
                key={`${r.employeeId}-${r.date}`}
                r={r}
                branch={branchNames[r.branchId] ?? "—"}
                onOpen={() => setSelected({ employeeId: r.employeeId, date: r.date, name: r.employeeName })}
              />
            ))}
          </tbody>
        </table>
      </div>
      {selected && <EvidenceModal selected={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function Row({ r, branch, onOpen }: { r: ReportRow; branch: string; onOpen: () => void }) {
  const incomplete = r.status === "incompleto" || r.status === "sin_marcaciones";
  const rowClass = r.flagged
    ? "bg-red-50 hover:bg-red-100/70"
    : incomplete
      ? "bg-amber-50 hover:bg-amber-100/70"
      : r.status === "permiso"
        ? "bg-sky-50 hover:bg-sky-100/70"
        : "hover:bg-slate-50";
  const hasMarks = Boolean(r.entrada || r.salidaAlmuerzo || r.regresoAlmuerzo || r.salidaFinal || r.permission);
  return (
    <tr
      className={`${rowClass} ${hasMarks ? "cursor-pointer" : ""}`}
      onClick={hasMarks ? onOpen : undefined}
      title={hasMarks ? "Ver las fotos de este día" : undefined}
    >
      <td className="td text-slate-600">{formatDateLabel(r.date)}</td>
      <td className="td font-medium">{r.employeeName}</td>
      <td className="td">{branch}</td>
      <td className="td font-mono text-slate-500">{r.entryTime}</td>
      <td className="td font-mono">{formatTime(r.entrada)}</td>
      <td className="td font-mono">{formatTime(r.salidaAlmuerzo)}</td>
      <td className="td font-mono">{formatTime(r.regresoAlmuerzo)}</td>
      <td className="td font-mono">{formatTime(r.salidaFinal)}</td>
      <td className="td">
        {r.lunchMinutes === null ? "—" : formatMinutes(r.lunchMinutes)}
        {r.lunchOngoing && <span className="ml-1 text-xs text-slate-500">(en curso)</span>}
      </td>
      <td className="td">
        {r.lunchExcessMinutes > 0 ? (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">+{r.lunchExcessMinutes} min</span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
      <td className="td">
        {r.lateMinutes > 0 ? (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">+{r.lateMinutes} min</span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
      <td className="td font-medium">{r.workedMinutes === null ? "—" : formatMinutes(r.workedMinutes)}</td>
      <td className="td text-xs">
        {r.permission ? <Badge tone="blue">{formatPermission(r.permission)}</Badge> : <span className="text-slate-400">—</span>}
      </td>
      <td className="td">
        <Badge
          tone={r.status === "completo" ? "green" : r.status === "en_curso" || r.status === "permiso" ? "blue" : "yellow"}
        >
          {STATUS_LABEL[r.status]}
        </Badge>
      </td>
      <td className="td">{hasMarks ? <span className="text-brand-700">📷 Ver</span> : <span className="text-slate-400">—</span>}</td>
    </tr>
  );
}

const IP_CHECK: Record<EvidenceItem["ipCheck"], { text: (i: EvidenceItem) => string; cls: string }> = {
  ok: { text: (i) => `✓ IP de ${i.ipBranchName ?? "la sucursal"}`, cls: "bg-emerald-100 text-emerald-800" },
  otra_sucursal: { text: (i) => `⚠ IP de otra sucursal (${i.ipBranchName})`, cls: "bg-amber-100 text-amber-900" },
  no_registrada: { text: () => "⚠ IP no registrada: posible marcación fuera del local", cls: "bg-red-100 text-red-800" },
  sin_ip: { text: () => "Sin IP", cls: "bg-slate-100 text-slate-600" },
};

/** Ventana con las fotos del día y un selector: Entrada, Salida almuerzo, Regreso, Salida o Todas. */
function EvidenceModal({ selected, onClose }: { selected: Selected; onClose: () => void }) {
  const [data, setData] = useState<DayEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<string>("TODAS");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const r = await getDayEvidenceAction(selected.employeeId, selected.date);
      if (r.ok && r.data) setData(r.data);
      else setError(r.ok ? "Sin datos." : r.error);
    });
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items = data?.items ?? [];
  const visible = view === "TODAS" ? items.filter((i) => i.time) : items.filter((i) => i.key === view);
  const tabs: { key: string; label: string }[] = [
    { key: "TODAS", label: "Todas" },
    ...items.map((i) => ({ key: i.key, label: i.key === "SALIDA_FINAL" ? "Salida" : i.label })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Fotos de ${selected.name}`}
      onClick={onClose}
    >
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
            <p className="text-sm text-slate-500">{data?.dateLabel ?? formatDateLabel(selected.date)} · ¿Qué fotos quieres ver?</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-3 text-lg" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-6 py-3">
          {tabs.map((t) => {
            const item = items.find((i) => i.key === t.key);
            const disabled = t.key !== "TODAS" && !item?.time;
            return (
              <button
                key={t.key}
                type="button"
                disabled={disabled}
                onClick={() => setView(t.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  view === t.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {t.label}
                {item?.time ? ` · ${item.time.slice(0, 5)}` : ""}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {pending && !data && <p className="text-sm text-slate-500">Cargando fotos…</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {data && visible.length === 0 && <p className="text-sm text-slate-500">No hay marcaciones para mostrar.</p>}
          <div className={`grid gap-5 ${visible.length > 1 ? "md:grid-cols-2" : ""}`}>
            {visible.map((i) => (
              <figure key={i.key} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="relative aspect-[4/3] bg-slate-100">
                  {i.sceneUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.sceneUrl} alt={`Escena: ${i.label}`} className="h-full w-full object-cover" />
                  ) : i.faceUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.faceUrl} alt={`Rostro: ${i.label}`} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">Sin foto</div>
                  )}
                  {i.sceneUrl && i.faceUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={i.faceUrl}
                      alt={`Rostro: ${i.label}`}
                      className="absolute right-2 bottom-2 h-20 w-20 rounded-lg border-2 border-white object-cover shadow"
                    />
                  )}
                </div>
                <figcaption className="space-y-1.5 p-4 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{i.label}</span>
                    <span className="font-mono text-base">{i.time ?? "—"}</span>
                  </div>
                  {i.detail && <p className="text-sky-800">{i.detail}</p>}
                  <p className="text-slate-500">Sucursal: {i.branchName ?? "—"}</p>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">IP {i.ip ?? "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${IP_CHECK[i.ipCheck].cls}`}>
                      {IP_CHECK[i.ipCheck].text(i)}
                    </span>
                  </p>
                  {i.distance !== null && (
                    <p className="text-xs text-slate-500">Coincidencia facial: distancia {i.distance.toFixed(3)}</p>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          {data && (
            <p className="mt-4 text-xs text-slate-500">
              Las fotos sin fondo son de marcaciones anteriores a esta versión (solo guardaban el rostro). Las URLs caducan en 5
              minutos.{" "}
              <Link href={`/dashboard/asistencia/${selected.employeeId}/${selected.date}`} className="font-medium text-brand-700 hover:underline">
                Ver detalle completo →
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
