"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { annulmentLabel, STATUS_LABEL, summarizeByEmployee, type ReportRow } from "@/lib/attendance/calc";
import { formatPermission } from "@/lib/attendance/permissions";
import { formatDateLabel, formatMinutes, formatSignedMinutes, formatTime } from "@/lib/time";
import { Badge } from "@/components/ui";
import { annulDayAction, removeAnnulmentAction, removeHolidayAction, setHolidayAction } from "./annulment-actions";
import { getDayEvidenceAction, type DayEvidence, type EvidenceItem } from "./evidence-actions";
import { saveObservationAction } from "./observation-actions";

type Selected = { employeeId: string; date: string; name: string };

/** Qué se hace desde el menú ⋯ de una fila. */
type AnnulMode = "anular" | "feriado" | "quitar" | "quitar_feriado";
type AnnulTarget = Selected & { mode: AnnulMode };
type MenuState = { row: ReportRow; top: number; left: number };

const MENU_WIDTH = 272;

const rowKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

/**
 * Tabla de asistencia: al tocar una fila se abren las fotos de ese día.
 * El botón "+" junto a la fecha abre la observación del día (una por empleado y día).
 * El botón ⋯ (al final) anula el día o lo marca como feriado: la fila queda tachada y no cuenta.
 */
export function AttendanceTable({
  rows,
  branchNames,
  lunchAllowedMinutes = 60,
}: {
  rows: ReportRow[];
  branchNames: Record<string, string>;
  /** Almuerzo que se descuenta cuando no lo marcaron (se muestra con *). */
  lunchAllowedMinutes?: number;
}) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [noteTarget, setNoteTarget] = useState<(Selected & { initial: string }) | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [annulTarget, setAnnulTarget] = useState<AnnulTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  // Cambios recién guardados (se ven al instante, antes de que se recargue la tabla).
  const [saved, setSaved] = useState<Record<string, string | null>>({});
  const total = summarizeByEmployee(rows).total;
  const noteOf = (r: ReportRow) => {
    const k = rowKey(r.employeeId, r.date);
    return k in saved ? saved[k] : r.observation;
  };

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
              <th className="th" title="Lunes a viernes: tiempo contable − 8 h. Negativo = debe tiempo.">Suplementarias</th>
              <th className="th">Estado</th>
              <th className="th">Fotos</th>
              <th className="th w-12">
                <span className="sr-only">Opciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const common = {
                r,
                branch: branchNames[r.branchId] ?? "—",
                note: noteOf(r),
                onOpen: () => setSelected({ employeeId: r.employeeId, date: r.date, name: r.employeeName }),
                onNote: () =>
                  setNoteTarget({ employeeId: r.employeeId, date: r.date, name: r.employeeName, initial: noteOf(r) ?? "" }),
                onMenu: (button: HTMLElement) => {
                  const rect = button.getBoundingClientRect();
                  const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
                  // Si no cabe hacia abajo, se abre hacia arriba.
                  const below = rect.bottom + 6;
                  const top = below + 190 > window.innerHeight ? Math.max(8, rect.top - 196) : below;
                  setMenu((cur) => (cur?.row === r ? null : { row: r, top, left }));
                },
                menuOpen: menu?.row === r,
              };
              return r.annulment ? (
                <AnnulledRow key={`${r.employeeId}-${r.date}`} {...common} lunchAllowedMinutes={lunchAllowedMinutes} />
              ) : (
                <Row key={`${r.employeeId}-${r.date}`} {...common} lunchAllowedMinutes={lunchAllowedMinutes} />
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-brand-500 bg-brand-50 font-bold">
            <tr>
              <td className="td" colSpan={9}>
                TOTAL ({rows.length} {rows.length === 1 ? "fila" : "filas"})
              </td>
              <td className={`td ${total.lunchExcessMinutes ? "text-red-600" : "text-slate-400"}`}>{total.lunchExcessMinutes} min</td>
              <td className={`td ${total.lateMinutes ? "text-red-600" : "text-slate-400"}`}>{total.lateMinutes} min</td>
              <td className="td whitespace-nowrap">{formatMinutes(total.workedMinutes)}</td>
              <td className={`td whitespace-nowrap ${supplementaryTone(total.supplementaryMinutes)}`}>
                {formatSignedMinutes(total.supplementaryMinutes)}
              </td>
              <td className="td" colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      {menu && (
        <RowMenu
          menu={menu}
          onClose={closeMenu}
          onPick={(mode) => {
            setAnnulTarget({ employeeId: menu.row.employeeId, date: menu.row.date, name: menu.row.employeeName, mode });
            setMenu(null);
          }}
        />
      )}
      {annulTarget && <AnnulModal target={annulTarget} onClose={() => setAnnulTarget(null)} />}
      {selected && <EvidenceModal selected={selected} onClose={() => setSelected(null)} />}
      {noteTarget && (
        <ObservationModal
          target={noteTarget}
          initial={noteTarget.initial}
          onClose={() => setNoteTarget(null)}
          onSaved={(note) => setSaved((cur) => ({ ...cur, [rowKey(noteTarget.employeeId, noteTarget.date)]: note }))}
        />
      )}
    </>
  );
}

type RowProps = {
  r: ReportRow;
  branch: string;
  note: string | null;
  lunchAllowedMinutes: number;
  onOpen: () => void;
  onNote: () => void;
  onMenu: (button: HTMLElement) => void;
  menuOpen: boolean;
};

const hasMarksOf = (r: ReportRow) =>
  Boolean(r.entrada || r.salidaAlmuerzo || r.regresoAlmuerzo || r.salidaFinal || r.permission);

/** Primera celda: botón de observación + fecha (+ la observación, si hay). */
function DateCell({ r, note, onNote, struck = false }: Pick<RowProps, "r" | "note" | "onNote"> & { struck?: boolean }) {
  return (
    <td className="td text-slate-600">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // no abre las fotos
            onNote();
          }}
          title={note ? "Ver o editar la observación" : "Agregar observación"}
          aria-label={note ? `Editar observación de ${r.employeeName}` : `Agregar observación de ${r.employeeName}`}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-bold transition ${
            note
              ? "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
              : "border-slate-300 bg-white text-slate-500 hover:border-brand-500 hover:text-brand-700"
          }`}
        >
          {note ? "📝" : "+"}
        </button>
        <div className="min-w-0">
          <span className={`whitespace-nowrap ${struck ? "text-slate-400 line-through" : ""}`}>{formatDateLabel(r.date)}</span>
          {note && (
            <p className="mt-0.5 line-clamp-2 w-48 text-xs whitespace-pre-line text-slate-700" title={note}>
              {note}
            </p>
          )}
        </div>
      </div>
    </td>
  );
}

/** Última celda: botón ⋯ que abre el menú (anular día / feriado). */
function MenuCell({ r, onMenu, menuOpen }: Pick<RowProps, "r" | "onMenu" | "menuOpen">) {
  return (
    <td className="td w-12 text-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // no abre las fotos
          onMenu(e.currentTarget);
        }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Opciones del día de ${r.employeeName}`}
        title="Opciones del día"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-lg leading-none font-bold transition ${
          menuOpen
            ? "border-brand-500 bg-brand-100 text-brand-800"
            : "border-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        ⋯
      </button>
    </td>
  );
}

function Row({ r, branch, note, lunchAllowedMinutes, onOpen, onNote, onMenu, menuOpen }: RowProps) {
  const incomplete = r.status === "incompleto" || r.status === "sin_marcaciones";
  const rowClass = r.flagged
    ? "bg-red-50 hover:bg-red-100/70"
    : incomplete
      ? "bg-amber-50 hover:bg-amber-100/70"
      : r.status === "permiso"
        ? "bg-sky-50 hover:bg-sky-100/70"
        : "hover:bg-slate-50";
  const hasMarks = hasMarksOf(r);
  return (
    <tr
      className={`${rowClass} ${hasMarks ? "cursor-pointer" : ""}`}
      onClick={hasMarks ? onOpen : undefined}
      title={hasMarks ? "Ver las fotos de este día" : undefined}
    >
      <DateCell r={r} note={note} onNote={onNote} />
      <td className="td font-medium">{r.employeeName}</td>
      <td className="td">{branch}</td>
      <td className="td font-mono text-slate-500">
        {r.dayOff ? <span className="font-sans text-xs font-semibold text-sky-700">Libre</span> : r.entryTime}
      </td>
      <td className="td font-mono">{formatTime(r.entrada)}</td>
      <td className="td font-mono">{formatTime(r.salidaAlmuerzo)}</td>
      <td className="td font-mono">{formatTime(r.regresoAlmuerzo)}</td>
      <td className="td font-mono">
        {r.salidaFinal ? (
          formatTime(r.salidaFinal)
        ) : r.assumedExit ? (
          <span className="text-slate-400 italic" title="Olvidó marcar la salida: sus horas se cuentan hasta esta hora">
            {formatTime(r.assumedExit)}*
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="td">
        {r.lunchMinutes !== null && !r.assumedLunch ? (
          formatMinutes(r.lunchMinutes)
        ) : r.assumedLunch ? (
          <span className="text-slate-400 italic" title="No marcó el almuerzo: se descuenta el almuerzo permitido">
            {formatMinutes(lunchAllowedMinutes)}*
          </span>
        ) : r.arrivedAfterLunch ? (
          <span className="text-xs text-slate-400" title="Entró después del almuerzo: ya venía almorzado">
            Entró ya almorzado
          </span>
        ) : !r.lunchExpected && r.entrada ? (
          <span className="text-xs text-slate-400" title="Día sin almuerzo (media jornada)">Sin almuerzo</span>
        ) : (
          "—"
        )}
        {r.lunchOngoing && <span className="ml-1 text-xs text-slate-500">(en curso)</span>}
      </td>
      <td className="td">
        {r.lunchExcessMinutes > 0 ? (
          <span className="rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-[12.5px] font-semibold text-red-800">+{r.lunchExcessMinutes} min</span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
      <td className="td">
        {r.lateMinutes > 0 ? (
          <span className="rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-[12.5px] font-semibold text-red-800">+{r.lateMinutes} min</span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
      <td className="td font-medium whitespace-nowrap">
        {r.workedMinutes === null ? (
          "—"
        ) : r.leftAtLunch ? (
          <span title="Salió al almuerzo y no volvió a marcar: horas solo hasta el almuerzo">
            {formatMinutes(r.workedMinutes)}
            <span className="block text-xs font-normal text-amber-700">hasta el almuerzo</span>
          </span>
        ) : r.assumedExit || r.assumedLunch ? (
          <span className="text-slate-500" title="Horas asumidas: no marcó bien (hasta la salida asumida, con 1 h de almuerzo)">
            {formatMinutes(r.workedMinutes)}*
          </span>
        ) : (
          formatMinutes(r.workedMinutes)
        )}
      </td>
      <td className="td whitespace-nowrap">
        {r.supplementaryMinutes === null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span
            className={`font-semibold ${supplementaryTone(r.supplementaryMinutes)} ${r.supplementaryAssumed ? "italic opacity-80" : ""}`}
            title={r.supplementaryAssumed ? "Calculado con salida o almuerzo asumidos (no marcó bien)" : undefined}
          >
            {formatSignedMinutes(r.supplementaryMinutes)}
            {r.supplementaryAssumed ? "*" : ""}
          </span>
        )}
      </td>
      <td className="td">
        <Badge
          tone={
            r.status === "completo"
              ? "green"
              : r.status === "en_curso" || r.status === "permiso"
                ? "blue"
                : r.status === "libre"
                  ? "gray"
                  : "yellow"
          }
        >
          {STATUS_LABEL[r.status]}
        </Badge>
        {r.permission && r.status !== "permiso" && (
          <span className="mt-1 block text-xs text-sky-700">Permiso: {formatPermission(r.permission)}</span>
        )}
      </td>
      <td className="td">{hasMarks ? <span className="text-brand-700">📷 Ver</span> : <span className="text-slate-400">—</span>}</td>
      <MenuCell r={r} onMenu={onMenu} menuOpen={menuOpen} />
    </tr>
  );
}

/**
 * Fila de un día ANULADO o FERIADO: tachada y en gris. Se ve todo lo que marcó (y sus fotos),
 * pero no cuenta para nada.
 */
function AnnulledRow({ r, branch, note, lunchAllowedMinutes, onOpen, onNote, onMenu, menuOpen }: RowProps) {
  const a = r.annulment;
  if (!a) return null;
  const hasMarks = hasMarksOf(r);
  const struck = "td text-slate-400 line-through decoration-slate-400";
  const mono = `${struck} font-mono`;
  const min = (n: number) => (n > 0 ? `+${n} min` : "0");
  return (
    <tr
      className={`jc-annulled bg-slate-100 ${hasMarks ? "cursor-pointer" : ""}`}
      onClick={hasMarks ? onOpen : undefined}
      title={hasMarks ? "Día anulado (no cuenta). Toca para ver las fotos" : "Día anulado (no cuenta)"}
    >
      <DateCell r={r} note={note} onNote={onNote} struck />
      <td className={struck}>{r.employeeName}</td>
      <td className={struck}>{branch}</td>
      <td className={mono}>{r.dayOff ? "Libre" : r.entryTime}</td>
      <td className={mono}>{formatTime(r.entrada)}</td>
      <td className={mono}>{formatTime(r.salidaAlmuerzo)}</td>
      <td className={mono}>{formatTime(r.regresoAlmuerzo)}</td>
      <td className={mono}>{r.salidaFinal ? formatTime(r.salidaFinal) : r.assumedExit ? `${formatTime(r.assumedExit)}*` : "—"}</td>
      <td className={struck}>
        {r.assumedLunch
          ? `${formatMinutes(lunchAllowedMinutes)}*`
          : r.lunchMinutes !== null
            ? formatMinutes(r.lunchMinutes)
            : "—"}
      </td>
      <td className={struck}>{min(r.lunchOngoing ? 0 : r.lunchExcessMinutes)}</td>
      <td className={struck}>{min(r.lateMinutes)}</td>
      <td className={`${struck} whitespace-nowrap`}>{r.workedMinutes === null ? "—" : formatMinutes(r.workedMinutes)}</td>
      <td className={`${struck} whitespace-nowrap`}>
        {r.supplementaryMinutes === null ? "—" : formatSignedMinutes(r.supplementaryMinutes)}
      </td>
      <td className="td">
        <Badge tone="gray">
          {a.kind === "feriado" ? "📅 " : "🚫 "}
          {annulmentLabel(a)}
        </Badge>
        {a.reason && (
          <span className="mt-1 block max-w-48 text-xs text-slate-600" title={a.reason}>
            {a.reason}
          </span>
        )}
        <span className="mt-0.5 block text-[11px] text-slate-400">No cuenta</span>
      </td>
      <td className="td">{hasMarks ? <span className="text-brand-700">📷 Ver</span> : <span className="text-slate-400">—</span>}</td>
      <MenuCell r={r} onMenu={onMenu} menuOpen={menuOpen} />
    </tr>
  );
}

/** Menú flotante del botón ⋯ (se cierra al tocar fuera, con Escape o al desplazar). */
function RowMenu({
  menu,
  onClose,
  onPick,
}: {
  menu: MenuState;
  onClose: () => void;
  onPick: (mode: AnnulMode) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const r = menu.row;
  const firstName = r.employeeName.split(" ")[0];

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // El mismo botón ⋯ ya alterna el menú.
      if (!ref.current?.contains(target) && !target.closest("[aria-haspopup='menu']")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const items: { mode: AnnulMode; icon: string; label: string; hint: string }[] = !r.annulment
    ? [
        { mode: "anular", icon: "🚫", label: "Anular día", hint: `Solo ${firstName}: ese día no cuenta para nada` },
        { mode: "feriado", icon: "📅", label: "Feriado (todos)", hint: "Anula este día para todos los empleados" },
      ]
    : r.annulment.kind === "feriado"
      ? [
          { mode: "quitar", icon: "↩️", label: `Quitar anulación a ${firstName}`, hint: "Si sí trabajó y quieres que le cuente" },
          { mode: "quitar_feriado", icon: "📅", label: "Quitar el feriado a todos", hint: "El día vuelve a contar para todos" },
        ]
      : [
          { mode: "quitar", icon: "↩️", label: "Quitar anulación", hint: "El día vuelve a contar como antes" },
          { mode: "feriado", icon: "📅", label: "Feriado (todos)", hint: "Anula este día para todos los empleados" },
        ];

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Opciones del día de ${r.employeeName}`}
      className="jc-menu fixed z-40 overflow-hidden"
      style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
    >
      <p className="border-b border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        {r.employeeName} · {formatDateLabel(r.date)}
      </p>
      {items.map((it) => (
        <button
          key={it.mode}
          type="button"
          role="menuitem"
          onClick={() => onPick(it.mode)}
          className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
        >
          <span aria-hidden className="text-base leading-5">
            {it.icon}
          </span>
          <span>
            <span className="block text-sm font-medium text-slate-900">{it.label}</span>
            <span className="block text-xs text-slate-500">{it.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const ANNUL_SUGGESTIONS = ["Falló la cámara", "Error al marcar", "No se trabajó"];

const ANNUL_TEXT: Record<AnnulMode, { title: string; button: string; danger: boolean }> = {
  anular: { title: "🚫 Anular día", button: "Anular día", danger: true },
  feriado: { title: "📅 Feriado", button: "Marcar feriado", danger: true },
  quitar: { title: "↩️ Quitar anulación", button: "Quitar anulación", danger: false },
  quitar_feriado: { title: "📅 Quitar el feriado", button: "Quitar el feriado", danger: false },
};

/** Ventana de confirmación para anular / feriado / quitar (con motivo opcional). */
function AnnulModal({ target, onClose }: { target: AnnulTarget; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const text = ANNUL_TEXT[target.mode];
  const withReason = target.mode === "anular" || target.mode === "feriado";
  const dateLabel = formatDateLabel(target.date);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const r =
        target.mode === "anular"
          ? await annulDayAction(target.employeeId, target.date, reason)
          : target.mode === "feriado"
            ? await setHolidayAction(target.date, reason)
            : target.mode === "quitar"
              ? await removeAnnulmentAction(target.employeeId, target.date)
              : await removeHolidayAction(target.date);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center jc-overlay overflow-y-auto p-4 sm:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={text.title}
      onClick={onClose}
    >
      <form
        className="jc-modal w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) confirm();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{text.title}</h2>
            <p className="text-sm text-slate-500">
              {target.mode === "feriado" || target.mode === "quitar_feriado" ? "Todos los empleados" : target.name} · {dateLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary h-[34px] w-[34px] px-0 text-base" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm text-slate-700">
          {target.mode === "anular" && (
            <p>
              El {dateLabel} de <b className="text-slate-900">{target.name}</b> queda <b className="text-slate-900">tachado</b> y no
              cuenta para nada: ni horas trabajadas, ni suplementarias, ni atraso, ni exceso de almuerzo, ni falta. No se borra
              nada: sus marcaciones y fotos se siguen viendo.
            </p>
          )}
          {target.mode === "feriado" && (
            <p>
              Se anula el {dateLabel} para <b className="text-slate-900">todos los empleados</b> de las dos sucursales: queda
              tachado con la etiqueta <b className="text-slate-900">Feriado</b> y no cuenta para nada (ni horas, ni
              suplementarias, ni faltas). Si alguien sí trabajó y quieres que le cuente, luego le quitas la anulación solo a él.
            </p>
          )}
          {target.mode === "quitar" && (
            <p>
              El {dateLabel} de <b className="text-slate-900">{target.name}</b> vuelve a contar como antes (horas, suplementarias,
              atraso y faltas).
            </p>
          )}
          {target.mode === "quitar_feriado" && (
            <p>
              El {dateLabel} vuelve a contar para <b className="text-slate-900">todos</b>. Los días que anulaste uno por uno
              siguen anulados.
            </p>
          )}
          {withReason && (
            <div className="space-y-2">
              <label className="label" htmlFor="annul-reason">
                {target.mode === "feriado" ? "Nombre del feriado (opcional)" : "Motivo (opcional)"}
              </label>
              <input
                id="annul-reason"
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                placeholder={target.mode === "feriado" ? "Ej.: Día de los Difuntos" : "Ej.: Falló la cámara"}
                className="input"
              />
              {target.mode === "anular" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Rápido:</span>
                  {ANNUL_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setReason(sug)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">
            {target.mode === "anular" || target.mode === "feriado"
              ? "Lo puedes deshacer cuando quieras desde el mismo botón ⋯."
              : "Lo puedes volver a anular cuando quieras desde el mismo botón ⋯."}
          </p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={pending} className={text.danger ? "btn-danger" : "btn-primary"}>
            {pending ? "Guardando…" : text.button}
          </button>
        </div>
      </form>
    </div>
  );
}

const NOTE_SUGGESTIONS = ["Llegó tarde porque ", "Pidió permiso pero no lo registró en el kiosco", "Falló la aplicación al marcar"];

/** Ventana para escribir la observación del día (una por empleado y día). */
function ObservationModal({
  target,
  initial,
  onClose,
  onSaved,
}: {
  target: Selected;
  initial: string;
  onClose: () => void;
  onSaved: (note: string | null) => void;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save(value: string) {
    setError(null);
    startTransition(async () => {
      const r = await saveObservationAction(target.employeeId, target.date, value);
      if (r.ok) {
        onSaved(r.data?.note ?? null);
        onClose();
      } else {
        setError(r.error);
      }
    });
  }

  const unchanged = text.trim() === initial.trim();
  const canSave = !pending && !unchanged && (text.trim() !== "" || initial !== "");
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center jc-overlay overflow-y-auto p-4 sm:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={`Observación de ${target.name}`}
      onClick={onClose}
    >
      <form
        className="jc-modal w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save(text);
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">📝 Observación</h2>
            <p className="text-sm text-slate-500">
              {target.name} · {formatDateLabel(target.date)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary h-[34px] w-[34px] px-0 text-base" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="space-y-3 px-6 py-5">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canSave) save(text);
            }}
            rows={5}
            maxLength={1000}
            placeholder="Escribe lo que pasó ese día…"
            aria-label="Observación"
            className="input min-h-28 resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Rápido:</span>
            {NOTE_SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => setText((cur) => (cur.trim() ? `${cur.trimEnd()}. ${sug}` : sug))}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
              >
                {sug.trim()}
              </button>
            ))}
          </div>
          <p className="text-right text-xs text-slate-400">{text.length}/1000</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-6 py-4">
          {initial ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm("¿Borrar esta observación?")) save("");
              }}
              className="btn-danger"
            >
              Borrar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={!canSave} className="btn-primary">
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </div>
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
      className="fixed inset-0 z-50 flex items-start justify-center jc-overlay overflow-y-auto p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Fotos de ${selected.name}`}
      onClick={onClose}
    >
      <div className="jc-modal w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
            <p className="text-sm text-slate-500">{data?.dateLabel ?? formatDateLabel(selected.date)} · ¿Qué fotos quieres ver?</p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary h-[34px] w-[34px] px-0 text-base" aria-label="Cerrar">
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
                aria-pressed={view === t.key}
                className="jc-tab border-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
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
              <figure key={i.key} className="overflow-hidden rounded-[18px] border border-slate-200 bg-[#08120c]/35">
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

/** Verde si son horas a favor, rojo si debe tiempo. */
function supplementaryTone(minutes: number | null): string {
  if (!minutes) return "text-slate-500";
  return minutes > 0 ? "text-emerald-700" : "text-red-600";
}
