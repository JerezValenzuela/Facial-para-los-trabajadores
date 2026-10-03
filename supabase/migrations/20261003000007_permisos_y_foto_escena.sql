-- =============================================================================
-- JerezCons Asistencia · 0007 · Permisos desde el kiosco + foto de escena
--  * permissions: el empleado registra un permiso (todo el día o por horas
--    con hora de inicio) tras ser reconocido. Uno por empleado y día.
--  * scene_path: además de la miniatura del rostro, una foto completa de la
--    escena (con el fondo) para verificar que la marcación fue en el local.
-- Solo agrega estructuras y reemplaza funciones; NO modifica datos existentes.
-- =============================================================================

create type public.permission_kind as enum ('dia_completo', 'horas');

create table public.permissions (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees (id) on delete restrict,
  work_date     date not null,
  kind          public.permission_kind not null,
  start_time    time,
  hours         numeric(4, 1),
  branch_id     uuid references public.branches (id) on delete set null,
  ip            inet,
  challenge_id  uuid,
  evidence_path text,
  scene_path    text,
  created_at    timestamptz not null default now(),
  constraint permissions_one_per_day unique (employee_id, work_date),
  constraint permissions_shape check (
    (kind = 'dia_completo' and start_time is null and hours is null)
    or (kind = 'horas' and start_time is not null and hours between 0.5 and 12)
  )
);
create index permissions_work_date_idx on public.permissions (work_date);
create index permissions_branch_idx on public.permissions (branch_id);

alter table public.permissions enable row level security;
revoke all on public.permissions from anon;
create policy permissions_admin_select on public.permissions
  for select to authenticated using ((select public.is_admin()));

alter table public.kiosk_challenges add column scene_path text;
alter table public.attendance_events add column scene_path text;

-- ---------------------------------------------------------------------------
-- Registro de marcación: igual que 0006 + copia la foto de escena del ticket.
-- ---------------------------------------------------------------------------
create or replace function public.kiosk_register_attendance(
  p_challenge_id uuid,
  p_event_type public.attendance_event_type,
  p_ip inet,
  p_ticket_ttl_seconds integer default 90
)
returns table (
  event_id uuid,
  employee_id uuid,
  event_type public.attendance_event_type,
  occurred_at timestamptz,
  work_date date,
  branch_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ch       public.kiosk_challenges%rowtype;
  v_emp      public.employees%rowtype;
  v_today    date := (now() at time zone 'America/Guayaquil')::date;
  v_last     public.attendance_event_type;
  v_last_at  timestamptz;
  v_cooldown integer;
  v_id       uuid;
begin
  select * into v_ch from public.kiosk_challenges c where c.id = p_challenge_id for update;
  if not found or v_ch.identified_at is null or v_ch.employee_id is null then
    raise exception 'TICKET_INVALIDO' using errcode = 'P0001';
  end if;
  if v_ch.marked_at is not null then
    raise exception 'TICKET_USADO' using errcode = 'P0001';
  end if;
  if v_ch.identified_at < now() - make_interval(secs => p_ticket_ttl_seconds) then
    raise exception 'TICKET_EXPIRADO' using errcode = 'P0001';
  end if;
  if v_ch.ip is distinct from p_ip then
    raise exception 'TICKET_IP' using errcode = 'P0001';
  end if;

  select * into v_emp from public.employees e where e.id = v_ch.employee_id for update;
  if not found or not v_emp.active then
    raise exception 'EMPLEADO_INACTIVO' using errcode = 'P0001';
  end if;

  select s.cooldown_seconds into v_cooldown from public.settings s where s.id = 1;

  select max(e.event_type) into v_last
  from public.attendance_events e
  where e.employee_id = v_emp.id and e.work_date = v_today;

  select max(e.occurred_at) into v_last_at
  from public.attendance_events e
  where e.employee_id = v_emp.id and e.work_date >= v_today - 1;

  if v_last_at is not null and now() - v_last_at < make_interval(secs => coalesce(v_cooldown, 60)) then
    raise exception 'COOLDOWN' using errcode = 'P0001';
  end if;

  if v_last = 'SALIDA_FINAL' then
    raise exception 'JORNADA_COMPLETA' using errcode = 'P0001';
  end if;
  if v_last is not null and p_event_type <= v_last then
    raise exception 'FUERA_DE_ORDEN' using errcode = 'P0001';
  end if;

  insert into public.attendance_events
    (employee_id, branch_id, event_type, ip, user_agent, match_distance, evidence_path, scene_path, challenge_id)
  values
    (v_emp.id, coalesce(v_ch.branch_id, v_emp.branch_id), p_event_type, p_ip,
     v_ch.user_agent, v_ch.match_distance, v_ch.evidence_path, v_ch.scene_path, v_ch.id)
  returning id into v_id;

  update public.kiosk_challenges c set marked_at = now() where c.id = v_ch.id;

  return query
    select a.id, a.employee_id, a.event_type, a.occurred_at, a.work_date, a.branch_id
    from public.attendance_events a
    where a.id = v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registro de PERMISO desde el kiosco (mismo ticket de identificación).
-- ---------------------------------------------------------------------------
create or replace function public.kiosk_register_permission(
  p_challenge_id uuid,
  p_kind public.permission_kind,
  p_hours numeric,
  p_start time,
  p_ip inet,
  p_ticket_ttl_seconds integer default 120
)
returns table (
  permission_id uuid,
  employee_id uuid,
  kind public.permission_kind,
  start_time time,
  hours numeric,
  work_date date,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ch    public.kiosk_challenges%rowtype;
  v_emp   public.employees%rowtype;
  v_today date := (now() at time zone 'America/Guayaquil')::date;
  v_id    uuid;
begin
  select * into v_ch from public.kiosk_challenges c where c.id = p_challenge_id for update;
  if not found or v_ch.identified_at is null or v_ch.employee_id is null then
    raise exception 'TICKET_INVALIDO' using errcode = 'P0001';
  end if;
  if v_ch.marked_at is not null then
    raise exception 'TICKET_USADO' using errcode = 'P0001';
  end if;
  if v_ch.identified_at < now() - make_interval(secs => p_ticket_ttl_seconds) then
    raise exception 'TICKET_EXPIRADO' using errcode = 'P0001';
  end if;
  if v_ch.ip is distinct from p_ip then
    raise exception 'TICKET_IP' using errcode = 'P0001';
  end if;

  select * into v_emp from public.employees e where e.id = v_ch.employee_id for update;
  if not found or not v_emp.active then
    raise exception 'EMPLEADO_INACTIVO' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.permissions p where p.employee_id = v_emp.id and p.work_date = v_today) then
    raise exception 'PERMISO_YA_REGISTRADO' using errcode = 'P0001';
  end if;
  if p_kind = 'horas' and (p_start is null or p_hours is null or p_hours < 0.5 or p_hours > 12) then
    raise exception 'DATOS_INVALIDOS' using errcode = 'P0001';
  end if;

  insert into public.permissions
    (employee_id, work_date, kind, start_time, hours, branch_id, ip, challenge_id, evidence_path, scene_path)
  values
    (v_emp.id, v_today, p_kind,
     case when p_kind = 'horas' then p_start end,
     case when p_kind = 'horas' then round(p_hours, 1) end,
     coalesce(v_ch.branch_id, v_emp.branch_id), p_ip, v_ch.id, v_ch.evidence_path, v_ch.scene_path)
  returning id into v_id;

  update public.kiosk_challenges c set marked_at = now() where c.id = v_ch.id;

  return query
    select p.id, p.employee_id, p.kind, p.start_time, p.hours, p.work_date, p.created_at
    from public.permissions p
    where p.id = v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Limpieza: también vacía las rutas de fotos de escena y de permisos vencidas.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_kiosk_data(p_evidence_before timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch  integer;
  v_rl  integer;
  v_ev  integer := 0;
  v_fa  integer := 0;
  v_pe  integer := 0;
begin
  delete from public.kiosk_challenges where created_at < now() - interval '2 days';
  get diagnostics v_ch = row_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_rl = row_count;
  if p_evidence_before is not null then
    update public.attendance_events set evidence_path = null, scene_path = null
     where (evidence_path is not null or scene_path is not null) and occurred_at < p_evidence_before;
    get diagnostics v_ev = row_count;
    update public.failed_attempts set evidence_path = null
     where evidence_path is not null and occurred_at < p_evidence_before;
    get diagnostics v_fa = row_count;
    update public.permissions set evidence_path = null, scene_path = null
     where (evidence_path is not null or scene_path is not null) and created_at < p_evidence_before;
    get diagnostics v_pe = row_count;
  end if;
  return jsonb_build_object('retos', v_ch, 'rate_limits', v_rl,
                            'evidencias_marcaciones', v_ev, 'evidencias_intentos', v_fa,
                            'evidencias_permisos', v_pe);
end;
$$;

revoke all on function public.kiosk_register_attendance(uuid, public.attendance_event_type, inet, integer) from public, anon, authenticated;
grant execute on function public.kiosk_register_attendance(uuid, public.attendance_event_type, inet, integer) to service_role;
revoke all on function public.kiosk_register_permission(uuid, public.permission_kind, numeric, time, inet, integer) from public, anon, authenticated;
grant execute on function public.kiosk_register_permission(uuid, public.permission_kind, numeric, time, inet, integer) to service_role;
revoke all on function public.cleanup_kiosk_data(timestamptz) from public, anon, authenticated;
grant execute on function public.cleanup_kiosk_data(timestamptz) to service_role;
