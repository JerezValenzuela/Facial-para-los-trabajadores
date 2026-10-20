import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingreso administrador" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const sessionClosed = sp.sesion === "cerrada";

  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            J
          </div>
          <h1 className="text-xl font-semibold text-slate-900">JerezCons Asistencia</h1>
          <p className="mt-1 text-sm text-slate-500">Panel de administración</p>
        </div>
        {sessionClosed && (
          <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
            Tu sesión anterior se cerró o venció. Vuelve a ingresar.
          </p>
        )}
        <div className="card p-6">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Buscas marcar asistencia?{" "}
          <Link href="/marcar" className="font-medium text-brand-700 hover:underline">
            Ir al kiosco
          </Link>
        </p>
      </div>
    </main>
  );
}
