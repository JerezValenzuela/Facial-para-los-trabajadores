import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Nuevo empleado" };

export default async function NewEmployeePage() {
  const { supabase } = await requireAdminSession();
  const { data: branches } = await supabase.from("branches").select("id, name").eq("active", true).order("name");
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/empleados" className="text-sm text-slate-500 hover:text-slate-700">← Empleados</Link>
      <PageHeader
        title="Nuevo empleado"
        description="Después de crearlo podrás registrar su consentimiento y enrolar su rostro."
      />
      <div className="card p-6">
        <EmployeeForm branches={branches ?? []} />
      </div>
    </div>
  );
}
