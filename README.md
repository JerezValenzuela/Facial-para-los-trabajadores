# JerezCons Asistencia

Control de asistencia por **reconocimiento facial** para JerezCons (sucursales **Pucará** y **Rumicucho**).
Funciona con la cámara de cualquier computadora normal, abriendo un link en el navegador.
Zona horaria: `America/Guayaquil`. Interfaz en español.

- **Kiosco** (`/marcar`): página pública sin login. El rostro identifica al empleado, con prueba de vida y validación en el servidor.
- **Dashboard** (`/dashboard`): administrador con usuario y contraseña. Asistencia, Excel, empleados, enrolamiento, sucursales e IPs, intentos fallidos, alertas y configuración.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + pgvector, Auth, RLS, Storage) · `@vladmandic/face-api` · exceljs · zod · vitest.

---

## Índice
1. [Arquitectura y decisiones de seguridad](#1-arquitectura-y-decisiones-de-seguridad)
2. [Instalación](#2-instalación)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Base de datos](#4-base-de-datos)
5. [Cómo crear el administrador](#5-cómo-crear-el-administrador)
6. [Cómo probar en localhost](#6-cómo-probar-en-localhost)
7. [Cómo activar las alertas](#7-cómo-activar-las-alertas)
8. [Despliegue en Vercel](#8-despliegue-en-vercel)
9. [Reglas de negocio](#9-reglas-de-negocio)
10. [Seguridad y límites conocidos](#10-seguridad-y-límites-conocidos)
11. [Estructura del proyecto](#11-estructura-del-proyecto)

---

## 1. Arquitectura y decisiones de seguridad

```
 Navegador del kiosco (PC del local)                     Servidor Next.js                       Supabase
 ───────────────────────────────────                     ────────────────                       ────────
 cámara → face-api (detector, 68 puntos,  ── POST ──▶  /api/kiosk/challenge  ─────────────▶  kiosk_challenges (reto der→izq→centro,
          descriptor 128D)                                  · IP del local / rate limit           un solo uso, 45 s, ligado a la IP)
 sigue el reto (giros + centro) y envía                     · bloqueo de móviles
 traza de puntos + 2 descriptores + miniatura ─────▶  /api/kiosk/identify   ─────────────▶  kiosk_match_face() con pgvector
                                                            · re-verifica liveness                (los vectores NUNCA salen de Postgres)
                                                            · misma persona todo el reto
                                                            · umbral y ambigüedad
 "¡Hola, Ana! ¿Vas a…?" (4 botones)    ── POST ──▶  /api/kiosk/mark        ─────────────▶  kiosk_register_attendance()
                                                                                                  (atómico: ticket, IP, orden,
                                                                                                   cooldown, hora del servidor)
```

### ¿Comparación facial en el servidor o en el cliente?
**Decisión: en el servidor, dentro de Postgres (pgvector).** El navegador calcula el vector del rostro que tiene enfrente y lo envía. Postgres lo compara con las plantillas guardadas y solo devuelve *quién es* y *qué tan parecido*.

| | En el cliente | **En el servidor (elegido)** |
|---|---|---|
| Exposición de biometría | Habría que enviar los vectores de TODOS los empleados al kiosco público | Las plantillas nunca salen de la base de datos |
| Decisión de identidad | La toma el navegador (manipulable) | La toma el servidor con umbral y regla de ambigüedad |
| Rendimiento | Instantáneo | ~5 ms en BD con 15 empleados × 5 muestras, más la latencia de red |

**Trade-off honesto:** el vector y la prueba de vida se calculan en el navegador, y alguien que controle ese navegador podría enviar datos fabricados. Calcular el vector en el servidor (TensorFlow en Vercel) costaría segundos por arranque en frío y funciones pesadas, y no eliminaría el problema de fondo: una cámara web 2D no prueba la presencia física. Por eso la seguridad se apoya en **varias capas**:
1. El **reto lo emite el servidor**: de un solo uso, caduca en 45 s y está ligado a la IP. El servidor **re-verifica** la secuencia de puntos (giro a la derecha, luego a la izquierda, y vuelta al centro) y que la cara sea la misma al inicio y al final.
2. **IP pública del local**: hay que estar físicamente en la tienda.
3. **Miniatura de evidencia** en cada marcación e intento fallido.
4. **Auditoría** completa: intentos fallidos, alertas por intentos repetidos y registro de acciones del administrador.

### Otras decisiones
- **El empleado elige su marcación**: tras reconocerlo, el kiosco muestra “¡Hola, (nombre)! ¿Vas a…?” con **Entrar · Salir a almuerzo · Regresar de almuerzo · Salir**. También puede registrar un **Permiso**: *todo el día* o *por horas* (cuántas y desde qué hora). Tiene **15 segundos** para elegir (cuenta regresiva en pantalla); si no elige, se descarta y debe escanearse de nuevo. Lo ya marcado hoy aparece con ✓ y su hora. Regla “solo hacia adelante”: puede saltarse un paso olvidado (p. ej. salir sin marcar almuerzo, que quedará como *Incompleto*), pero nunca repetir ni retroceder.
- **Registro atómico en la base de datos** (`kiosk_register_attendance`): bloqueo de fila, ticket de un solo uso, regla “solo hacia adelante” y restricción única `(empleado, día, evento)`. Ni dos clics simultáneos ni un replay pueden duplicar o desordenar marcaciones.
- **Hora oficial = `now()` del servidor de base de datos.** La fecha laboral (`work_date`) se calcula por trigger en `America/Guayaquil`.
- **Rate limiting en Postgres**: funciona aunque Vercel ejecute varias instancias en paralelo.
- **RLS en las 12 tablas.** Las funciones de administración son `SECURITY INVOKER`, así que RLS también decide dentro de ellas. Las funciones del kiosco y del cron solo las puede ejecutar `service_role`.
- **CSP con nonce por petición**, más HSTS, `X-Frame-Options: DENY` y `Permissions-Policy` (la cámara solo se permite en el propio sitio).

---

## 2. Instalación

Requisitos: **Node.js ≥ 20.9** (probado con 22), npm, y un proyecto de Supabase (ya creado: `coufusmhvjgskxcbjhya`).

```bash
npm install
```

`npm install` copia automáticamente los modelos faciales a `public/models/` (script `postinstall`).

Scripts útiles:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:3000 |
| `npm test` | Pruebas unitarias (vitest) |
| `npm run typecheck` | Verificación de tipos |
| `npm run lint` | ESLint |
| `npm run build` | Build de producción |
| `npm run create-admin` | Crea o promueve al administrador (interactivo) |

---

## 3. Variables de entorno

Copia `.env.example` a `.env.local` y complétalo. **`.env.local` nunca se sube al repositorio** (está en `.gitignore`).

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Llave publicable (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | Sí | Llave secreta (`sb_secret_…`). **Solo servidor.** Nunca en el cliente ni en logs |
| `DEV_MODE` | Sí | `true` desactiva **solo** la restricción por IP (para probar desde casa). **En producción: `false`** |
| `CRON_SECRET` | Sí | Secreto aleatorio (≥ 32 caracteres) que protege `/api/cron/*` |
| `ALERTS_ENABLED` | Sí | `false`: las alertas se registran como “pendiente_envio” y **no se envía nada**. `true`: se envían |
| `TELEGRAM_BOT_TOKEN` | Para alertas | Token del bot de Telegram |
| `TELEGRAM_CHAT_ID` | Para alertas | Chat o grupo que recibe las alertas |
| `SMS_ENABLED` | No | `true` activa el canal SMS (Twilio). Apagado por defecto |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `SMS_TO_NUMBERS` | No | Credenciales Twilio; destinatarios separados por coma (`+5939…`) |

> Si `NODE_ENV=production` y `DEV_MODE=true`, el dashboard muestra una **franja roja** de advertencia.

---

## 4. Base de datos

Las migraciones están versionadas en `supabase/migrations/` y **ya están aplicadas** en el proyecto `coufusmhvjgskxcbjhya`:

| Archivo | Contenido |
|---|---|
| `…0001_esquema_base.sql` | Tablas, tipos, índices, triggers (work_date, consentimiento) y pgvector |
| `…0002_rls.sql` | RLS en todas las tablas y la función `is_admin()` |
| `…0003_funciones.sql` | Kiosco (sucursal por IP, rate limit, comparación facial, registro atómico), administración (consentimiento, enrolamiento y borrado biométrico) y cron (alertas y limpieza) |
| `…0004_storage_evidencias.sql` | Bucket privado `evidencias` |
| `…0005_admin_invoker.sql` | Endurecimiento: funciones de administración como SECURITY INVOKER |
| `…0006_eleccion_de_evento.sql` | El empleado elige su marcación (regla “solo hacia adelante”) |
| `…0007_permisos_y_foto_escena.sql` | Permisos (todo el día / por horas) y foto de escena |
| `…0008_eliminar_empleado.sql` | `admin_delete_employee`: borra al empleado y todo lo suyo en una transacción (solo el servidor) |
| `…0009_horario_por_empleado.sql` | Horario por empleado: `work_days` (días que trabaja) y `entry_times` (hora de cada día) |

Tablas: `branches`, `branch_ips`, `employees`, `face_templates`, `attendance_events`, `failed_attempts`, `alerts`, `settings` y `admin_users`, más tres de soporte: `kiosk_challenges` (retos de un solo uso), `rate_limits` y `audit_log`.

**Datos iniciales** (`supabase/seed.sql`, ya aplicado): sucursales Pucará y Rumicucho, configuración por defecto y un “Empleado de Prueba” (cédula sintética `1712345675`).

**En un proyecto Supabase nuevo**, ejecuta en el SQL Editor, en orden, los 5 archivos de `supabase/migrations/` y luego `supabase/seed.sql`. Con la CLI de Supabase: `supabase link --project-ref <ref>` y `supabase db push`.

---

## 5. Cómo crear el administrador

### Opción A (recomendada): script interactivo
```bash
npm run create-admin
```
Te pide correo, nombre y contraseña (mínimo 12 caracteres; no se muestra al escribir). Crea el usuario en Supabase Auth con el correo confirmado y lo registra en `admin_users`. Si el correo ya existe, solo lo promueve a administrador.

### Opción B: manual
1. Supabase → **Authentication → Users → Add user → Create new user** (marca “Auto Confirm User”).
2. Copia el **User UID** y ejecuta en el SQL Editor:
   ```sql
   insert into public.admin_users (user_id, email, full_name)
   values ('<USER_UID>', 'tu@correo.com', 'Tu Nombre');
   ```

### Importante: desactiva el registro público
Supabase → **Authentication → Sign In / Providers → “Allow new users to sign up” → desactivar**.
Aunque un usuario registrado sin estar en `admin_users` no ve ningún dato (RLS), no hay razón para permitir registros.

---

## 6. Cómo probar en localhost

1. `.env.local` con `DEV_MODE=true` y `ALERTS_ENABLED=false`.
2. `npm run dev`
3. Dashboard: http://localhost:3000/login. Entra con tu administrador.
4. **Empleados → Nuevo empleado**. Luego imprime y registra el consentimiento y **enrola el rostro** (5 muestras guiadas).
5. Kiosco: **http://localhost:3000/marcar?sucursal=pucara** (en Chrome o Edge; permite la cámara).
   - Con `DEV_MODE=true` cualquier IP puede marcar; `?sucursal=` indica en qué sucursal queda registrada la marcación.
   - En producción `?sucursal=` se ignora: **la sucursal la determina la IP**.
6. Revisa el dashboard: tabla, detalle con miniaturas, Excel e intentos fallidos.

La lista completa de pruebas manuales está en **[docs/CHECKLIST_PRUEBAS.md](docs/CHECKLIST_PRUEBAS.md)**.

> La cámara del navegador solo funciona en `localhost` o con **HTTPS**. Para probar desde otra computadora de la red local hace falta HTTPS (en producción Vercel ya lo da).

---

## 7. Cómo activar las alertas

Hoy está todo listo pero **apagado**: las alertas se registran en **Dashboard → Alertas** como “Pendiente de envío” y el cron **no está programado**.

| Alerta | Cuándo se genera |
|---|---|
| Exceso de almuerzo | Al registrar el REGRESO_ALMUERZO con exceso (inmediata) |
| Almuerzo sin regreso | Cron cada 5 min: pasó el almuerzo permitido + margen (5 min) y no regresó. Una por empleado y día |
| Intentos sospechosos | Cron: N intentos fallidos desde una IP en la ventana configurada (5 en 15 min) |

### Paso 1. Crear el bot de Telegram
1. En Telegram, abre **@BotFather** → `/newbot` → elige nombre y usuario. Copia el **token** (formato `123456789:AA…`).
2. Crea un grupo (por ejemplo “Asistencia JerezCons”), agrega al bot y escribe cualquier mensaje en el grupo.
3. Abre en el navegador `https://api.telegram.org/bot<TOKEN>/getUpdates` y copia el valor de `"chat":{"id": …}`. En grupos es un número negativo, por ejemplo `-1001234567890`.

### Paso 2. Variables de entorno
En `.env.local` (y en Vercel → Settings → Environment Variables):
```
TELEGRAM_BOT_TOKEN=<token del paso 1>
TELEGRAM_CHAT_ID=<chat id del paso 1>
ALERTS_ENABLED=true
```
Reinicia el servidor (`npm run dev`) o vuelve a desplegar en Vercel. En **Dashboard → Alertas** verás “Telegram: configurado”. Pulsa **“Enviar mensaje de prueba”**.
*(SMS opcional: `SMS_ENABLED=true` y las variables `TWILIO_*`. Funciona en paralelo con Telegram.)*

### Paso 3. Programar el cron (pg_cron de Supabase, gratis)
El cron necesita una **URL pública**, así que esto se hace después de desplegar en Vercel.
1. Abre `supabase/manual/activar_cron.sql`.
2. En Supabase → **SQL Editor**, pega el contenido **reemplazando** `https://TU-APP.vercel.app` por tu URL y `PEGA_AQUI_TU_CRON_SECRET` por tu `CRON_SECRET`. Así ambos quedan guardados **cifrados en Supabase Vault**.
3. Ejecuta. Se crean 2 trabajos: `jerezcons-alertas` (cada 5 min) y `jerezcons-limpieza` (diario, 03:15 de Ecuador).
4. Verifica: `select jobname, schedule, active from cron.job;` y, a los 5 min, `select * from cron.job_run_details order by start_time desc limit 5;`.

Para probarlo a mano: `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://TU-APP.vercel.app/api/cron/alertas`.
Para desactivar: `select cron.unschedule('jerezcons-alertas');`.

> Mientras solo haya localhost, el mismo archivo incluye una alternativa comentada que **solo registra** las alertas en la base de datos (sin enviar) usando directamente las funciones SQL.

---

## 8. Despliegue en Vercel

> El push a GitHub y el despliegue se harán cuando lo pidas. Estos son los pasos.

1. **GitHub**: crea un repositorio privado y sube la rama `main` (el `.gitignore` ya excluye `.env*`).
2. **Vercel → Add New → Project** → importa el repositorio (Next.js se detecta solo).
3. **Environment Variables** (Production): las de la sección 3, con **`DEV_MODE=false`** y un `CRON_SECRET` nuevo y distinto al de desarrollo.
4. **Deploy.** Comprueba que el dashboard NO muestre la franja roja.
5. Supabase → **Authentication → URL Configuration → Site URL** = tu URL de Vercel.
6. **En cada sucursal**, desde una computadora conectada al internet del local: entra al dashboard → **Sucursales e IPs → “Agregar mi IP actual a esta sucursal”**.
   - Si el proveedor cambia la IP, los intentos aparecerán como “IP no permitida”: repite el paso o pide al proveedor una **IP fija**.
7. **Computadoras del kiosco**: Chrome con `https://TU-APP.vercel.app/marcar` en pantalla completa (F11) o en modo kiosco (`chrome --kiosk https://…/marcar`), con el permiso de cámara en “Permitir siempre”.
8. Activa las alertas siguiendo la sección 7.

---

## 9. Reglas de negocio

Todas se editan en **Dashboard → Configuración** (tabla `settings`):

| Regla | Valor inicial | Fórmula |
|---|---|---|
| Tolerancia de entrada | 7 min | **Atraso** = entrada real − horario del empleado − tolerancia (mín. 0) |
| Almuerzo permitido | 60 min | **Exceso** = duración real del almuerzo − permitido (mín. 0) |
| Horas trabajadas | — | (salida final − entrada) − duración del almuerzo |
| Cooldown entre marcaciones | 60 s | Rechaza marcaciones del mismo empleado antes de ese tiempo |
| Horario del empleado | en su ficha | Cada empleado tiene **sus días de trabajo** y su hora de entrada: la misma todos los días o **una hora distinta por día**. En los días que no trabaja no aparece en Asistencia ni en el Excel; si marca igual, sale como “Libre” y sin atraso |
| Días por defecto | Configuración | Solo pre-marcan los días al crear un empleado nuevo |
| Vista del dashboard | hoy | Al entrar se ve solo el día de hoy; para más días: filtros o “Ver rápido” (Ayer, Últimos 7 / 30 días) |
| Umbral facial | 0.50 | Distancia euclidiana máxima. Menor es más estricto. Si 2 empleados quedan bajo el umbral, se rechaza por ambigüedad |
| Prueba de vida | fija | Girar la cabeza a la derecha, luego a la izquierda y mirar al centro. Sin parpadeo. Funciona aunque la webcam entregue la imagen en espejo. Si un intento se queda sin tiempo, se registra en Intentos fallidos con el giro alcanzado (para diagnóstico) |
| Permiso | uno por día | *Todo el día*: el día figura como “Permiso” (sin atraso ni “Incompleto”). *Por horas*: si empieza antes de la hora de entrada, la llegada esperada pasa a ser el fin del permiso |
| Evidencia | activada, 90 días | Miniatura del rostro (160×160) + **foto de escena** con el fondo (480×360) en el bucket privado, para comprobar que la marcación fue en el local. En el dashboard, tocar una fila abre las fotos del día con la verificación de IP. La limpieza diaria borra las vencidas |

Estados del día: **Completo**, **En curso** (hoy, con marcaciones parciales), **Incompleto** (faltó alguna marcación) e **Incompleto (sin marcaciones)**. Las filas con atraso o exceso van en **rojo**; las incompletas, en **amarillo**. Los minutos se cuentan completos (se truncan los segundos).

---

## 10. Seguridad y límites conocidos

Medidas implementadas:
- Validación con **zod** en todas las entradas. Errores sin detalles internos y logs sin secretos ni biometría.
- Rate limiting por IP en las rutas del kiosco y en el login (también por correo).
- Bloqueo de celulares y tablets por User-Agent, `Sec-CH-UA-Mobile`, pantalla táctil sin mouse y tamaño de pantalla. **No es infalible**: se puede falsificar (por ejemplo, “sitio de escritorio” o extensiones). Es una capa extra.
- Liveness: reto fijo derecha → izquierda → centro emitido por el servidor, de un solo uso y re-verificado con la traza de puntos, más el control de “misma persona” y de “un solo rostro”. **Límite:** sin cámara de profundidad o infrarroja, un video bien hecho reproducido en otra pantalla podría pasar. La IP del local, la miniatura y la auditoría hacen que ese fraude sea visible y rastreable.
- Biometría: solo vectores (nunca fotos de enrolamiento), consentimiento obligatorio (lo exige un trigger en la BD), borrado con auditoría y miniaturas en un bucket privado con URLs firmadas de 5 minutos.

---

## 11. Estructura del proyecto

```
src/
  proxy.ts                    CSP con nonce + sesión + protección de /dashboard
  app/
    marcar/                   Kiosco (UI)
    login/                    Login del administrador
    dashboard/                Asistencia, empleados, sucursales, intentos, alertas, configuración
    api/kiosk/                status · time · challenge · identify · mark
    api/admin/export/         Excel
    api/cron/                 alertas · limpieza (CRON_SECRET)
  lib/
    attendance/               estados, cálculos, reporte, filtros, Excel
    face/                     face-api (navegador) y liveness (compartido con el servidor)
    kiosk/                    guard anti-fraude y esquemas
    notifications/            NotificationChannel: Telegram, Twilio SMS
    security/                 IP, dispositivo, rate limit
    supabase/                 clientes (sesión con RLS / secret key) y tipos
supabase/
  migrations/                 SQL versionado (ya aplicado)
  seed.sql                    datos iniciales
  manual/activar_cron.sql     programación de pg_cron (manual)
scripts/                      create-admin, copy-models
tests/                        pruebas unitarias
docs/CHECKLIST_PRUEBAS.md     pruebas manuales
```
