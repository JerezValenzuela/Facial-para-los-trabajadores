import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { CONSENT_PARAGRAPHS, CONSENT_TITLE, CONSENT_VERSION } from "@/lib/consent";
import { formatFullDate } from "@/lib/time";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Consentimiento" };

/** Hoja imprimible del consentimiento para firma física del empleado. */
export default async function ConsentPrintPage(props: PageProps<"/dashboard/empleados/[id]/consentimiento">) {
  const { id } = await props.params;
  if (!uuid.safeParse(id).success) notFound();
  const { supabase } = await requireAdminSession();
  const { data: e } = await supabase
    .from("employees")
    .select("full_name, cedula, position, branches(name)")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();
  const branch = (e.branches as { name: string } | null)?.name ?? "";

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-[15px] leading-relaxed text-slate-900 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-500">Vista de impresión</p>
        <PrintButton />
      </div>
      <h1 className="mb-1 text-center text-lg font-bold">{CONSENT_TITLE}</h1>
      <p className="mb-6 text-center text-xs text-slate-500">JerezCons · Versión {CONSENT_VERSION}</p>

      <p className="mb-4">
        Yo, <b>{e.full_name}</b>, con cédula de identidad N.º <b>{e.cedula}</b>, cargo <b>{e.position}</b>,
        sucursal <b>{branch}</b>, declaro haber sido informado/a de lo siguiente:
      </p>
      <ol className="mb-6 list-decimal space-y-2 pl-5">
        {CONSENT_PARAGRAPHS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <p className="mb-10">
        Por lo expuesto, otorgo mi consentimiento libre, específico, informado e inequívoco para el tratamiento
        de mis datos biométricos con la finalidad descrita.
      </p>
      <p className="mb-16">Quito, {formatFullDate(new Date())}</p>

      <div className="grid grid-cols-2 gap-10 text-center text-sm">
        <div>
          <div className="mb-1 border-t border-slate-900" />
          Firma del empleado
          <br />
          C.I. {e.cedula}
        </div>
        <div>
          <div className="mb-1 border-t border-slate-900" />
          Firma del responsable · JerezCons
        </div>
      </div>
    </div>
  );
}
