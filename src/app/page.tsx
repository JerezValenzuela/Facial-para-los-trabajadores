import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">
          J
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">JerezCons Asistencia</h1>
        <p className="mt-2 text-sm text-slate-500">
          Control de asistencia por reconocimiento facial
        </p>
        <div className="mt-8 grid gap-3">
          <Link href="/marcar" className="btn-primary py-3 text-base">
            Abrir kiosco de marcación
          </Link>
          <Link href="/login" className="btn-secondary py-3 text-base">
            Ingreso administrador
          </Link>
        </div>
      </div>
    </main>
  );
}
