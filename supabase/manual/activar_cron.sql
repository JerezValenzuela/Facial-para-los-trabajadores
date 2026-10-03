-- =============================================================================
-- JerezCons Asistencia · ACTIVACIÓN DEL CRON (NO es una migración automática)
-- Ejecutar a mano en Supabase → SQL Editor SOLO cuando quieras activar las
-- alertas automáticas. Ver README, sección "Cómo activar las alertas".
-- pg_cron usa hora UTC (Ecuador = UTC−5).
-- =============================================================================

-- 1) Extensiones (pg_cron = programador, pg_net = llamadas HTTP desde Postgres)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Guardar la URL pública de la app y el CRON_SECRET CIFRADOS en Supabase Vault.
--    Reemplaza los dos valores antes de ejecutar (el CRON_SECRET es el de .env.local
--    / variables de Vercel). Nunca los guardes en un archivo del repositorio.
select vault.create_secret('https://TU-APP.vercel.app', 'jerezcons_app_url');
select vault.create_secret('PEGA_AQUI_TU_CRON_SECRET', 'jerezcons_cron_secret');

-- 3) Alertas cada 5 minutos (almuerzo sin regreso + intentos sospechosos).
select cron.schedule(
  'jerezcons-alertas',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'jerezcons_app_url') || '/api/cron/alertas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jerezcons_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);

-- 4) Limpieza diaria de evidencias vencidas a las 03:15 de Ecuador (08:15 UTC).
select cron.schedule(
  'jerezcons-limpieza',
  '15 8 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'jerezcons_app_url') || '/api/cron/limpieza',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jerezcons_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- -----------------------------------------------------------------------------
-- ALTERNATIVA sin URL pública (mientras la app solo corre en localhost):
-- registra las alertas en la tabla (quedan "pendiente_envio"), sin enviar mensajes.
-- select cron.schedule('jerezcons-alertas-solo-registro', '*/5 * * * *',
--   $$ select public.detect_lunch_overdue(); select public.detect_suspicious_attempts(); $$);
--
-- VERIFICAR:      select jobname, schedule, active from cron.job;
-- HISTORIAL:      select * from cron.job_run_details order by start_time desc limit 20;
-- DESACTIVAR:     select cron.unschedule('jerezcons-alertas');
--                 select cron.unschedule('jerezcons-limpieza');
-- -----------------------------------------------------------------------------
