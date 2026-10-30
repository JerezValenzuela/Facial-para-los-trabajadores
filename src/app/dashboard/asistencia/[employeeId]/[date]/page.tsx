import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { EVENT_LABEL, EVENT_ORDER } from "@/lib/attendance/events";
import { computeSupplementary, STATUS_LABEL, summarizeDay, type DayRules } from "@/lib/attendance/calc";
import { toleranceFor } from "@/lib/attendance/tolerance";
import { entryTimeFor, hasLunch, scheduleFromRow, worksOn } from "@/lib/attendance/schedule";
import { signedEvidenceUrls } from "@/lib/evidence";
import { formatDateLabel, formatMinutes, formatSignedMinutes, formatTime, isValidDateStr, todayInTz } from "@/lib/time";
import { Badge, Notice, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Detalle del día" };

/** Detalle de un día: cada marcación con hora, sucursal, IP, distancia facial y miniatura. */
export default async function DayDetailPage(props: PageProps<"/dashboard/asistencia/[employeeId]/[date]">) {
  const { employeeId, date } = await props.params;
  if (!uuid.safeParse(employeeId).success || !isValidDateStr(date)) notFound();

  const { supabase } = await requireAdminSession();
  const [{ data: emp }, { data: events }, { data: settings }, { data: branches }, { data: observation }, { data: periods }, { data: perm }] =
    await Promise.all([
    supabase.from("employees").select("id, full_name, entry_time, work_days, entry_times, no_lunch_days, branch_id").eq("id", employeeId).maybeSingle(),
    supabase
      .from("attendance_events")
      .select("id, event_type, occurred_at, branch_id, ip, match_distance, evidence_path")
      .eq("employee_id", employeeId)
      .eq("work_date", date)
      .order("occurred_at"),
    supabase
      .from("settings")
      .select("entry_tolerance_minutes, lunch_allowed_minutes, lunch_tolerance_minutes, default_exit_time, half_day_exit_time, no_lunch_after_time, day_close_time")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("branches").select("id, name"),
    supabase.from("observations").select("note").eq("employee_id", employeeId).eq("work_date", date).maybeSingle(),
    supabase.from("tolerance_periods").select("starts_on, entry_tolerance_minutes, lunch_tolerance_minutes"),
    supabase.from("permissions").select("kind, start_time, hours").eq("employee_id", employeeId).eq("work_date", date).maybeSingle(),
  ]);
  if (!emp) notFound();

  const schedule = scheduleFromRow(emp);
  const workDay = worksOn(schedule, date);
  const byType = Object.fromEntries((events ?? []).map((e) => [e.event_type, new Date(e.occurred_at)]));
  // Tolerancias que regían ESE día (no las de hoy).
  const tol = toleranceFor(periods, date, {
    entry: settings?.entry_tolerance_minutes ?? 5,
    lunch: settings?.lunch_tolerance_minutes ?? 5,
  });
  const rules: DayRules = {
      entryTime: entryTimeFor(schedule, date),
      toleranceMinutes: tol.entry,
      lunchAllowedMinutes: settings?.lunch_allowed_minutes ?? 60,
      lunchToleranceMinutes: tol.lunch,
      assumedExitTime: settings?.default_exit_time ?? "17:00",
      halfDayExitTime: settings?.half_day_exit_time ?? "13:00",
      lunchCutoffTime: settings?.no_lunch_after_time ?? "12:30",
      dayCloseTime: settings?.day_close_time ?? "18:30",
      lunchExpected: hasLunch(schedule, date),
  };
  const permission = perm ? { kind: perm.kind, startTime: perm.start_time, hours: perm.hours } : null;
  const summary = summarizeDay(date, byType, rules, { today: todayInTz(), now: new Date() }, permission);
  if (!workDay) summary.lateMinutes = 0; // día libre: no hay hora esperada
  const supplementary = workDay ? computeSupplementary(date, summary, rules) : null;
  // URLs firmadas de 5 minutos: las miniaturas nunca son públicas.
  const urls = await signedEvidenceUrls((events ?? []).map((e) => e.evidence_path ?? "").filter(Boolean));
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">← Asistencia</Link>
      <PageHeader
        title={emp.full_name}
        description={`${formatDateLabel(date)} · ${workDay ? `Horario de entrada ${entryTimeFor(schedule, date)}` : "Día libre (no le tocaba trabajar)"}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Info label="Estado" value={<Badge tone={summary.status === "completo" ? "green" : "yellow"}>{STATUS_LABEL[summary.status]}</Badge>} />
        <Info label="Atraso" value={summary.lateMinutes ? <b className="text-red-600">{summary.lateMinutes} min</b> : "0"} />
        <Info label="Almuerzo" value={summary.lunchMinutes === null ? "—" : formatMinutes(summary.lunchMinutes)} />
        <Info label="Exceso almuerzo" value={summary.lunchExcessMinutes ? <b className="text-red-600">{summary.lunchExcessMinutes} min</b> : "0"} />
        <Info
          label="Horas trabajadas"
          value={
            summary.workedMinutes === null ? (
              "—"
            ) : (
              <>
                {formatMinutes(summary.workedMinutes)}
                {summary.leftAtLunch && (
                  <span className="block text-xs font-normal text-amber-700">
                    Salió al almuerzo y no volvió a marcar: horas solo hasta el almuerzo
                  </span>
                )}
                {(summary.assumedExit || summary.assumedLunch) && (
                  <span className="block text-xs font-normal text-slate-500">
                    Horas asumidas (no marcó bien):
                    {summary.assumedExit ? ` salida a las ${formatTime(summary.assumedExit)}` : ""}
                    {summary.assumedExit && summary.assumedLunch ? " y" : ""}
                    {summary.assumedLunch ? ` ${settings?.lunch_allowed_minutes ?? 60} min de almuerzo` : ""}
                  </span>
                )}
              </>
            )
          }
        />
        <Info
          label="Suplementarias"
          value={
            supplementary === null ? (
              <span className="text-slate-400">—</span>
            ) : (
              <b className={supplementary > 0 ? "text-emerald-700" : supplementary < 0 ? "text-red-600" : ""}>
                {formatSignedMinutes(supplementary)}
              </b>
            )
          }
        />
      </div>

      {observation?.note && (
        <div className="mb-4">
          <Notice tone="info" title="📝 Observación">
            <span className="whitespace-pre-line">{observation.note}</span>
          </Notice>
        </div>
      )}

      {summary.missing.length > 0 && summary.status !== "en_curso" && (
        <div className="mb-4">
          <Notice tone="warning">Falta: {summary.missing.map((m) => EVENT_LABEL[m].toLowerCase()).join(", ")}.</Notice>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {EVENT_ORDER.map((type) => {
          const ev = (events ?? []).find((e) => e.event_type === type);
          return (
            <div key={type} className="card overflow-hidden">
              <div className="aspect-square bg-slate-100">
                {ev?.evidence_path && urls[ev.evidence_path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[ev.evidence_path]} alt={`Evidencia de ${EVENT_LABEL[type]}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    {ev ? "Sin miniatura" : "Sin marcación"}
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3 text-sm">
                <p className="font-semibold">{EVENT_LABEL[type]}</p>
                <p className="font-mono text-lg">{ev ? formatTime(ev.occurred_at, true) : "—"}</p>
                {ev && (
                  <>
                    <p className="text-xs text-slate-500">Sucursal: {ev.branch_id ? branchName.get(ev.branch_id) : "—"}</p>
                    <p className="text-xs text-slate-500">IP: {String(ev.ip ?? "—")}</p>
                    <p className="text-xs text-slate-500">
                      Distancia facial: {ev.match_distance != null ? ev.match_distance.toFixed(3) : "—"}
                    </p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <div className="mt-1 text-lg">{value}</div>
    </div>
  );
}
