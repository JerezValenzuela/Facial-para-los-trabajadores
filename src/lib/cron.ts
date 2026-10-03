import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Las rutas /api/cron/* solo responden con el CRON_SECRET correcto en
 * "Authorization: Bearer <secreto>". Comparación en tiempo constante.
 */
export function isAuthorizedCron(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const expected = serverEnv().CRON_SECRET;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
