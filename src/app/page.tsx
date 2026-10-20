import Link from "next/link";
import { todayInTz } from "@/lib/time";
import { IconArrowRight, IconLayout, IconScanFace, IconTap } from "@/components/icons";
import { HomeClock } from "./home-clock";
import { archivo } from "./fonts";


const FOCUS = "focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#201e1d] focus-visible:outline-solid";
const PRESS =
  "border-2 border-[#201e1d] text-white shadow-[8px_8px_0_#201e1d] transition-[background-color,translate,box-shadow] duration-100 " +
  "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:text-white hover:shadow-[10px_10px_0_#201e1d] " +
  "active:translate-x-1.5 active:translate-y-1.5 active:shadow-[2px_2px_0_#201e1d]";

function Brand({ className }: { className: string }) {
  return (
    <span className={className}>
      <span className="text-[#e8590c]">Jerez</span>
      <span className="text-[#1747a6]">Cons</span>
    </span>
  );
}

export default function Home() {
  const year = todayInTz().slice(0, 4);
  return (
    <div
      className={`${archivo.className} grid h-dvh min-h-[560px] flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[#f3f2f2] text-[#201e1d]`}
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#201e1d] px-[clamp(20px,4vw,56px)] py-3.5">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 grid-cols-2" aria-hidden>
            <span className="bg-[#e8590c]" />
            <span className="bg-[#1747a6]" />
            <span className="bg-[#1747a6]" />
            <span className="bg-[#e8590c]" />
          </div>
          <Brand className="text-xl font-extrabold tracking-[-0.02em]" />
        </div>
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="h-2.5 w-2.5 bg-[#1f9d55]" aria-hidden />
          Sistema activo
        </div>
      </header>

      <main className="grid min-h-0 auto-rows-[minmax(max-content,1fr)] grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] overflow-x-hidden overflow-y-auto">
        <section className="relative z-[1] flex flex-col justify-between gap-[clamp(20px,4vh,40px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,64px)] shadow-[2px_0_0_#201e1d,0_2px_0_#201e1d]">
          <div className="flex flex-col gap-[clamp(12px,2.2vh,20px)]">
            <p className="text-[13px] font-bold tracking-[0.12em] text-[#1747a6] uppercase">Control de asistencia</p>
            <h1 className="m-0 text-[clamp(44px,min(7.5vw,13vh),132px)] leading-[0.95] font-extrabold tracking-[-0.045em] whitespace-nowrap">
              <Brand className="" />
            </h1>
            <p className="m-0 max-w-[440px] text-[clamp(16px,2.2vh,19px)] leading-[1.45] text-pretty">
              Registro de entradas y salidas del personal mediante reconocimiento facial.
            </p>
          </div>
          <HomeClock />
        </section>

        <section className="flex flex-col gap-[clamp(16px,3vh,28px)] px-[clamp(28px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
          <Link
            href="/marcar"
            className={`flex min-h-[180px] flex-1 cursor-pointer flex-col justify-between gap-5 bg-[#e8590c] px-[clamp(20px,3vw,40px)] py-[clamp(20px,3.5vh,40px)] hover:bg-[#d24f08] active:bg-[#a83d05] ${PRESS} ${FOCUS}`}
          >
            <div className="flex items-start justify-between gap-4">
              <IconScanFace className="h-16 w-16" />
              <span className="flex items-center gap-2 bg-white px-3.5 py-2.5 text-[15px] font-extrabold tracking-[0.08em] text-[#201e1d] uppercase">
                <IconTap />
                Presione aquí
              </span>
            </div>
            <div className="flex items-end justify-between gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-[clamp(32px,min(4vw,7vh),56px)] leading-none font-extrabold tracking-[-0.03em]">
                  Registrar ahora
                </span>
                <span className="text-[clamp(15px,2vh,18px)] font-medium">
                  Mira a la cámara para registrar tu entrada o salida
                </span>
              </div>
              <IconArrowRight className="h-11 w-11 shrink-0" />
            </div>
          </Link>

          <Link
            href="/login"
            className={`flex cursor-pointer items-center justify-between gap-6 bg-[#1747a6] px-[clamp(20px,3vw,40px)] py-[clamp(16px,2.6vh,24px)] hover:bg-[#123a8a] active:bg-[#0e2e6e] ${PRESS} ${FOCUS}`}
          >
            <div className="flex items-center gap-4">
              <IconLayout />
              <div className="flex flex-col gap-0.5">
                <span className="text-[22px] font-bold">Panel de administración</span>
                <span className="text-[15px] opacity-85">Acceso solo para administradores</span>
              </div>
            </div>
            <IconArrowRight className="h-7 w-7 shrink-0" />
          </Link>
        </section>
      </main>

      <footer className="flex flex-wrap justify-between gap-4 border-t-2 border-[#201e1d] px-[clamp(20px,4vw,56px)] py-3 text-sm text-[#55504d]">
        <span>© {year} JerezCons</span>
        <span>Asistencia por reconocimiento facial</span>
      </footer>
    </div>
  );
}
