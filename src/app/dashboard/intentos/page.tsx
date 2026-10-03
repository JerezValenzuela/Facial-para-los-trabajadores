import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth";
import { REASON_LABEL, SUSPICIOUS_REASONS } from "@/lib/labels";
import { signedEvidenceUrls } from "@/lib/evidence";
import { addDays, formatDateTime, isValidDateStr, todayInTz, utcBoundsForDates } from "@/lib/time";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Constants } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Intentos fallidos" };

const LIMIT = 300;

function summarizeDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  return Object.entries(details as Record<string, unknown>)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ")
    .slice(0, 160);
}

export default async function FailedAttemptsPage(props: PageProps<"/dashboard/intentos">) {
  const sp = await props.searchParams;
  const today = todayInTz();
  const to = typeof sp.hasta === "string" && isValidDateStr(sp.hasta) ? sp.hasta : today;
  const from = typeof sp.desde === "string" && isValidDateStr(sp.desde) ? sp.desde : addDays(to, -6);
  const reason =
    typeof sp.motivo === "string" && (Constants.public.Enums.failed_attempt_reason as readonly string[]).includes(sp.motivo)
      ? (sp.motivo as (typeof Constants.public.Enums.failed_attempt_reason)[number])
      : null;

  const { supabase } = await requireAdminSession();
  const { start, end } = utcBoundsForDates(from, to);
  let q = supabase
    .from("failed_attempts")
    .select("id, occurred_at, reason, ip, user_agent, branch_id, employee_id, match_distance, details, evidence_path")
    .gte("occurred_at", start.toISOString())
    .lt("occurred_at", end.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(LIMIT);
  if (reason) q = q.eq("reason", reason);

  const [{ data: attempts }, { data: branches }, { data: employees }] = await Promise.all([
    q,
    supabase.from("branches").select("id, name"),
    supabase.from("employees").select("id, full_name"),
  ]);
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const employeeName = new Map((employees ?? []).map((e) => [e.id, e.full_name]));
  const urls = await signedEvidenceUrls((attempts ?? []).map((a) => a.evidence_path ?? "").filter(Boolean));

  const counts = new Map<string, number>();
  for (const a of attempts ?? []) counts.set(a.reason, (counts.get(a.reason) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Intentos fallidos o sospechosos"
        description="Cada rechazo del kiosco queda registrado con su motivo, IP y (si está habilitado) una miniatura."
      />

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="desde">Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={to} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="motivo">Motivo</label>
          <select id="motivo" name="motivo" defaultValue={reason ?? ""} className="input min-w-56">
            <option value="">Todos</option>
            {Constants.public.Enums.failed_attempt_reason.map((r) => (
              <option key={r} value={r}>{REASON_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Filtrar</button>
      </form>

      {counts.size > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([r, n]) => (
              <Badge key={r} tone={SUSPICIOUS_REASONS.includes(r as never) ? "red" : "gray"}>
                {REASON_LABEL[r as keyof typeof REASON_LABEL]}: {n}
              </Badge>
            ))}
        </div>
      )}

      {!attempts?.length ? (
        <EmptyState title="Sin intentos fallidos en este período" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Fecha y hora</th>
                <th className="th">Motivo</th>
                <th className="th">IP</th>
                <th className="th">Sucursal</th>
                <th className="th">Empleado</th>
                <th className="th">Detalles</th>
                <th className="th">Evidencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attempts.map((a) => (
                <tr key={a.id} className={SUSPICIOUS_REASONS.includes(a.reason) ? "bg-red-50/50" : ""}>
                  <td className="td font-mono text-xs">{formatDateTime(a.occurred_at)}</td>
                  <td className="td">
                    <Badge tone={SUSPICIOUS_REASONS.includes(a.reason) ? "red" : "gray"}>{REASON_LABEL[a.reason]}</Badge>
                  </td>
                  <td className="td font-mono text-xs">{String(a.ip ?? "—")}</td>
                  <td className="td">{a.branch_id ? branchName.get(a.branch_id) ?? "—" : "—"}</td>
                  <td className="td">{a.employee_id ? employeeName.get(a.employee_id) ?? "—" : "—"}</td>
                  <td className="td max-w-xs truncate text-xs whitespace-normal text-slate-600" title={a.user_agent ?? ""}>
                    {summarizeDetails(a.details)}
                  </td>
                  <td className="td">
                    {a.evidence_path && urls[a.evidence_path] ? (
                      <a href={urls[a.evidence_path]} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={urls[a.evidence_path]} alt="Miniatura del intento" className="h-12 w-12 rounded object-cover" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {attempts?.length === LIMIT && (
        <p className="mt-2 text-xs text-slate-500">Se muestran los {LIMIT} más recientes. Reduce el rango para ver más.</p>
      )}
    </>
  );
}
