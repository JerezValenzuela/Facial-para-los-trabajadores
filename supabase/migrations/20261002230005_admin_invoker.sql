-- =============================================================================
-- JerezCons Asistencia · 0005 · Endurecimiento (recomendación del linter de Supabase)
-- Las funciones de administración pasan a SECURITY INVOKER: se ejecutan con
-- los permisos del usuario y RLS decide. Así ni un error en la función puede
-- saltarse los permisos. is_admin() lee solo la fila del propio usuario.
-- =============================================================================

-- admin_users: cada usuario solo puede leer SU propia fila.
drop policy if exists admin_users_select on public.admin_users;
create policy admin_users_select_own on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.active
  );
$$;

-- Plantillas: el admin puede insertar/borrar (el trigger exige consentimiento).
create policy face_templates_admin_insert on public.face_templates
  for insert to authenticated with check ((select public.is_admin()));
create policy face_templates_admin_delete on public.face_templates
  for delete to authenticated using ((select public.is_admin()));

alter function public.admin_record_consent(uuid, text) security invoker;
alter function public.admin_enroll_face(uuid, jsonb, real[]) security invoker;
alter function public.admin_delete_biometrics(uuid) security invoker;
