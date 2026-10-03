-- =============================================================================
-- JerezCons Asistencia · 0002 · Row Level Security
-- Regla general: SOLO un administrador autenticado (fila activa en admin_users)
-- puede leer/escribir. El kiosco NO usa la API pública: pasa por rutas de
-- servidor con la secret key (service_role), que salta RLS de forma controlada.
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.active
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Activar RLS en TODAS las tablas.
alter table public.admin_users      enable row level security;
alter table public.branches         enable row level security;
alter table public.branch_ips       enable row level security;
alter table public.employees        enable row level security;
alter table public.face_templates   enable row level security;
alter table public.attendance_events enable row level security;
alter table public.failed_attempts  enable row level security;
alter table public.alerts           enable row level security;
alter table public.settings         enable row level security;
alter table public.kiosk_challenges enable row level security;
alter table public.rate_limits      enable row level security;
alter table public.audit_log        enable row level security;

-- Capa extra: el rol anónimo no tiene ningún privilegio sobre estas tablas.
revoke all on all tables in schema public from anon;
-- Tablas internas del kiosco: ni siquiera usuarios autenticados.
revoke all on public.kiosk_challenges, public.rate_limits from authenticated;

-- ---------------------------------------------------------------------------
-- admin_users: un admin solo puede ver la lista (altas/bajas vía secret key).
-- ---------------------------------------------------------------------------
create policy admin_users_select on public.admin_users
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Catálogos gestionados por el admin (CRUD completo)
-- ---------------------------------------------------------------------------
create policy branches_admin_all on public.branches
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy branch_ips_admin_all on public.branch_ips
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy employees_admin_all on public.employees
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Biometría: el admin puede ver cuántas plantillas hay; altas/bajas solo vía
-- funciones auditadas (admin_enroll_face / admin_delete_biometrics).
-- ---------------------------------------------------------------------------
create policy face_templates_admin_select on public.face_templates
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Registros de solo lectura para el admin (los escribe el servidor)
-- ---------------------------------------------------------------------------
create policy attendance_events_admin_select on public.attendance_events
  for select to authenticated using ((select public.is_admin()));

create policy failed_attempts_admin_select on public.failed_attempts
  for select to authenticated using ((select public.is_admin()));

create policy alerts_admin_select on public.alerts
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Configuración: leer y actualizar (nunca insertar otra fila ni borrar)
-- ---------------------------------------------------------------------------
create policy settings_admin_select on public.settings
  for select to authenticated using ((select public.is_admin()));
create policy settings_admin_update on public.settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Auditoría: inmutable. El admin lee e inserta registros a su nombre.
-- ---------------------------------------------------------------------------
create policy audit_log_admin_select on public.audit_log
  for select to authenticated using ((select public.is_admin()));
create policy audit_log_admin_insert on public.audit_log
  for insert to authenticated
  with check ((select public.is_admin()) and actor_id = (select auth.uid()));

-- kiosk_challenges y rate_limits: sin políticas => solo service_role.
