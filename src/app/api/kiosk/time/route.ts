import { NextResponse } from "next/server";

/** Hora oficial del servidor (el reloj del kiosco se sincroniza con esta, nunca con la del equipo). */
export function GET() {
  return NextResponse.json({ now: new Date().toISOString() });
}
