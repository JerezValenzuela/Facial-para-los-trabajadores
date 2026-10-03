import type { Metadata } from "next";
import { KioskClient } from "./kiosk-client";

export const metadata: Metadata = { title: "Marcar asistencia" };

/**
 * Kiosco público de marcación. No requiere login: la identidad la determina
 * el reconocimiento facial y TODA la validación de seguridad ocurre en el servidor.
 * ?sucursal=<código> solo se usa con DEV_MODE=true (en producción manda la IP).
 */
export default async function KioskPage(props: PageProps<"/marcar">) {
  const sp = await props.searchParams;
  const branchCode =
    typeof sp.sucursal === "string" && /^[a-z0-9-]{2,32}$/.test(sp.sucursal) ? sp.sucursal : undefined;
  return <KioskClient branchCode={branchCode} />;
}
