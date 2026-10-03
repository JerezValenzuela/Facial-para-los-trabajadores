#!/usr/bin/env node
// =============================================================================
// Crea (o promueve) el usuario ADMINISTRADOR de JerezCons Asistencia.
// Uso:  npm run create-admin
// - Lee las llaves desde .env.local (no las imprime).
// - Pide correo, nombre y contraseña en la terminal (la contraseña no se ve).
// - Crea el usuario en Supabase Auth con el correo ya confirmado y lo registra
//   en la tabla admin_users. Si el correo ya existe, solo lo promueve a admin.
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("✗ No existe .env.local. Créalo primero (ver README).");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;
if (!url || !secret?.startsWith("sb_secret_")) {
  console.error("✗ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY válida en .env.local.");
  process.exit(1);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // No mostrar lo que se escribe (solo la pregunta).
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const headers = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!r.ok) throw new Error(`No se pudo listar usuarios (HTTP ${r.status}).`);
    const body = await r.json();
    const users = body.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log("\n=== Crear administrador · JerezCons Asistencia ===\n");
  const email = (await ask("Correo del administrador: ")).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Correo inválido.");
  const fullName = await ask("Nombre completo: ");

  let user = await findUserByEmail(email);
  if (user) {
    console.log("• El correo ya existe en Supabase Auth: se promoverá a administrador.");
  } else {
    const password = await ask("Contraseña (mín. 12 caracteres, no se mostrará): ", { hidden: true });
    if (password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres.");
    const confirm = await ask("Repite la contraseña: ", { hidden: true });
    if (password !== confirm) throw new Error("Las contraseñas no coinciden.");

    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(`No se pudo crear el usuario: ${b.msg ?? b.message ?? `HTTP ${r.status}`}`);
    }
    user = await r.json();
    console.log("✓ Usuario creado en Supabase Auth.");
  }

  const r2 = await fetch(`${url}/rest/v1/admin_users?on_conflict=user_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: user.id, email, full_name: fullName || null, active: true }),
  });
  if (!r2.ok) throw new Error(`No se pudo registrar en admin_users (HTTP ${r2.status}).`);

  console.log(`✓ ${email} es administrador. Ingresa en http://localhost:3000/login\n`);
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
