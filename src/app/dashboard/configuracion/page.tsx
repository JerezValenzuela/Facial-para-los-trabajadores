import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const { supabase } = await requireAdminSession();
  const { data } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  const s = data ?? DEFAULT_SETTINGS;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Configuración"
        description={`Reglas de negocio, reconocimiento y alertas. Última modificación: ${formatDateTime(s.updated_at)}`}
      />
      <SettingsForm values={s} />
    </div>
  );
}
