import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antes "middleware") de Next.js 16:
 *  1. Genera un nonce por petición y aplica una Content-Security-Policy estricta.
 *  2. Refresca la sesión de Supabase del administrador (cookies).
 *  3. Protege /dashboard: sin sesión, redirige a /login.
 *     La verificación de que el usuario ES admin se hace además en el servidor
 *     (layout del dashboard) y en la base de datos (RLS).
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' permite el backend WASM de TensorFlow.js si WebGL no está disponible.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    // Los atributos style de React requieren 'unsafe-inline' en estilos (riesgo bajo; los scripts siguen con nonce).
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabase}`,
    "media-src 'self' blob: mediastream:",
    "font-src 'self'",
    `connect-src 'self' ${supabase}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const path = request.nextUrl.pathname;
  const needsSession = path.startsWith("/dashboard") || path.startsWith("/login");

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const pendingHeaders: Record<string, string> = {};
  let isAuthenticated = false;

  if (needsSession) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            for (const c of cookiesToSet) {
              request.cookies.set(c.name, c.value);
              pendingCookies.push(c);
            }
            Object.assign(pendingHeaders, headers);
          },
        },
      },
    );
    // getClaims valida la firma del JWT (no confía ciegamente en la cookie).
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = Boolean(data?.claims?.sub);
  }

  let response: NextResponse;
  if (path.startsWith("/dashboard") && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path);
    response = NextResponse.redirect(url);
  } else if (path === "/login" && isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    response = NextResponse.redirect(url);
  } else {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  for (const c of pendingCookies) response.cookies.set(c.name, c.value, c.options);
  for (const [k, v] of Object.entries(pendingHeaders)) response.headers.set(k, v);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Todo excepto API, estáticos, imágenes optimizadas, modelos faciales y favicon.
      source: "/((?!api|_next/static|_next/image|models|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
