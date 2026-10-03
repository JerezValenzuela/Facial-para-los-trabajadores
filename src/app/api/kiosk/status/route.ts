import { NextResponse } from "next/server";
import { challengeBodySchema } from "@/lib/kiosk/schemas";
import { kioskGuard, readJsonBody } from "@/lib/kiosk/guard";

/**
 * Estado del kiosco al abrir /marcar: ¿este equipo puede marcar?
 * No registra intentos fallidos (es solo una consulta de configuración).
 */
export async function POST(req: Request) {
  const body = challengeBodySchema.safeParse(await readJsonBody(req, 4_000));
  const g = await kioskGuard(req, {
    route: "status",
    perMinute: 30,
    device: body.success ? body.data.device : undefined,
    devBranchCode: body.success ? body.data.branchCode : undefined,
    logFailures: false,
  });
  if (!g.ok) return g.response;
  return NextResponse.json({
    ok: true,
    branchName: g.ctx.branchName,
    devMode: g.ctx.devMode,
    serverTime: new Date().toISOString(),
  });
}
