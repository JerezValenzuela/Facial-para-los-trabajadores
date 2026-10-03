import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { allChannels } from "@/lib/notifications";
import { ALERT_STATUS_LABEL, ALERT_TYPE_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui";
import { ResendButton, TestNotificationButton } from "./alert-buttons";

export const metadata: Metadata = { title: "Alertas" };

export default async function AlertsPage() {
  const { supabase } = await requireAdminSession();
  const env = serverEnv();
  const channels = allChannels().map((c) => ({ name: c.name, configured: c.isConfigured() }));

  const [{ data: alerts }, { data: branches }] = await Promise.all([
    supabase
      .from("alerts")
      .select("id, type, status, message, created_at, sent_at, channels, error, branch_id")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("branches").select("id, name"),
  ]);
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Todas las alertas quedan registradas aquí, se envíen o no por Telegram/SMS."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold">Estado del envío</h2>
          {env.ALERTS_ENABLED ? (
            <Notice tone="success">ALERTS_ENABLED=true: las alertas nuevas se envían por los canales configurados.</Notice>
          ) : (
            <Notice tone="warning" title="Envío desactivado (ALERTS_ENABLED=false)">
              Las alertas se registran como “Pendiente de envío” y no se manda ningún mensaje. Para activarlas,
              sigue la sección “Cómo activar las alertas” del README.
            </Notice>
          )}
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {channels.map((c) => (
              <li key={c.name}>
                <Badge tone={c.configured ? "green" : "gray"}>
                  {c.name === "telegram" ? "Telegram" : "SMS (Twilio)"}: {c.configured ? "configurado" : "no configurado"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Probar canales</h2>
          <p className="mb-3 text-sm text-slate-600">Envía un mensaje de prueba sin registrar una alerta.</p>
          <TestNotificationButton />
        </div>
      </div>

      {!alerts?.length ? (
        <EmptyState title="Sin alertas registradas">
          Aparecerán aquí los excesos de almuerzo, almuerzos sin regreso e intentos sospechosos.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Fecha</th>
                <th className="th">Tipo</th>
                <th className="th">Sucursal</th>
                <th className="th">Mensaje</th>
                <th className="th">Estado</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td className="td font-mono text-xs">{formatDateTime(a.created_at)}</td>
                  <td className="td">
                    <Badge tone={a.type === "intentos_sospechosos" ? "red" : "orange"}>{ALERT_TYPE_LABEL[a.type]}</Badge>
                  </td>
                  <td className="td">{a.branch_id ? branchName.get(a.branch_id) ?? "—" : "—"}</td>
                  <td className="td max-w-xl text-sm whitespace-normal">
                    {a.message}
                    {a.error && <p className="mt-1 text-xs text-red-600">{a.error}</p>}
                  </td>
                  <td className="td">
                    <Badge tone={a.status === "enviada" ? "green" : a.status === "error" ? "red" : "yellow"}>
                      {ALERT_STATUS_LABEL[a.status]}
                    </Badge>
                    {a.sent_at && (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(a.sent_at)} · {a.channels.join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="td">{a.status !== "enviada" && env.ALERTS_ENABLED && <ResendButton id={a.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
