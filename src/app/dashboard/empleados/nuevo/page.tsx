import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Nuevo empleado" };

export default async function NewEmployeePage() {
  const { supabase } = await requireAdminSession();
  const [{ data: branches }, { data: settings }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("active", true).order("name"),
    supabase.from("settings").select("work_days").eq("id", 1).maybeSingle(),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/empleados" className="jc-back">← Empleados</Link>
      <div className="mt-3" />
      <PageHeader
        title="Nuevo empleado"
        description="Después de crearlo podrás registrar su consentimiento y enrolar su rostro."
      />
      <div className="card p-6">
        <EmployeeForm branches={branches ?? []} defaultWorkDays={settings?.work_days} />
      </div>
    </div>
  );
}
