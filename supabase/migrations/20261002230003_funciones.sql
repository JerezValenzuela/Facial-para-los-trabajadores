-- =============================================================================
-- JerezCons Asistencia · 0003 · Funciones de negocio
--  * Kiosco (solo service_role): sucursal por IP, rate limit, comparación
--    facial con pgvector, estado del empleado y registro atómico de marcaciones.
--  * Admin (authenticated + is_admin()): consentimiento, enrolamiento y
--    borrado de biometría, siempre auditados.
--  * Cron (solo service_role): detección de almuerzos vencidos, intentos
--    sospechosos y limpieza. NO se programan aquí (ver README).
-- Todas las funciones fijan search_path = '' (sin secuestro de esquema).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Máquina de estados: siguiente evento válido según el último del día.
-- ---------------------------------------------------------------------------
create or replace function public.next_attendance_event(p_last public.attendance_event_type)
returns public.attendance_event_type
language sql
immutable
set search_path = ''
as $$
  select case
    when p_last is null                then 'ENTRADA'::public.attendance_event_type
    when p_last = 'ENTRADA'            then 'SALIDA_ALMUERZO'::public.attendance_event_type
    when p_last = 'SALIDA_ALMUERZO'    then 'REGRESO_ALMUERZO'::public.attendance_event_type
    when p_last = 'REGRESO_ALMUERZO'   then 'SALIDA_FINAL'::public.attendance_event_type
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Kiosco: sucursal a la que pertenece una IP (rango más específico gana).
-- ---------------------------------------------------------------------------
create or replace function public.kiosk_resolve_branch(p_ip inet)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select bi.branch_id
  from public.branch_ips bi
  join public.branches b on b.id = bi.branch_id
  where b.active and p_ip <<= bi.ip_range
  order by masklen(bi.ip_range) desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting de ventana fija, atómico y compartido entre instancias.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns table (allowed boolean, hits integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_window_seconds < 1 or p_max < 1 then
    raise exception 'PARAMETROS_INVALIDOS' using errcode = 'P0001';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  return query select v_hits <= p_max, v_hits;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comparación facial DENTRO de la base de datos: los descriptores guardados
-- nunca salen de Postgres. Devuelve la menor distancia por empleado.
-- ---------------------------------------------------------------------------
create or replace function public.kiosk_match_face(p_descriptor extensions.vector(128), p_limit integer default 3)
returns table (employee_id uuid, full_name text, branch_id uuid, distance real)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.full_name, e.branch_id,
         min(extensions.l2_distance(ft.descriptor, p_descriptor))::real as distance
  from public.face_templates ft
  join public.employees e on e.id = ft.employee_id
  where e.active
    and e.consent_at is not null
    and e.consent_revoked_at is null
  group by e.id, e.full_name, e.branch_id
  order by distance asc
  limit greatest(1, least(p_limit, 10));
$$;

-- ---------------------------------------------------------------------------
-- Kiosco: estado del empleado hoy (siguiente evento y segundos desde la última marca).
-- ---------------------------------------------------------------------------
create or replace function public.kiosk_employee_status(p_employee_id uuid)
returns table (next_event public.attendance_event_type, day_complete boolean, seconds_since_last integer)
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select (now() at time zone 'America/Guayaquil')::date as today
  ),
  last_today as (
    select max(e.event_type) as last_type
    from public.attendance_events e, d
    where e.employee_id = p_employee_id and e.work_date = d.today
  ),
  last_any as (
    select max(e.occurred_at) as last_at
    from public.attendance_events e, d
    where e.employee_id = p_employee_id and e.work_date >= d.today - 1
  )
  select public.next_attendance_event(lt.last_type),
         coalesce(lt.last_type = 'SALIDA_FINAL', false),
         case when la.last_at is null then null
              else floor(extract(epoch from now() - la.last_at))::integer end
  from last_today lt, last_any la;
$$;

-- ---------------------------------------------------------------------------
-- Kiosco: registro ATÓMICO de una marcación.
--  - Valida el ticket (reto identificado, no usado, no vencido, misma IP).
--  - Bloquea la fila del empleado (evita carreras/doble clic).
--  - Aplica cooldown y orden estricto de eventos.
--  - Hora oficial = now() del servidor de base de datos.
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
  v_expected public.attendance_event_type;
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

  v_expected := public.next_attendance_event(v_last);
  if v_expected is null then
    raise exception 'JORNADA_COMPLETA' using errcode = 'P0001';
  end if;
  if p_event_type <> v_expected then
    raise exception 'FUERA_DE_ORDEN' using errcode = 'P0001';
  end if;

  insert into public.attendance_events
    (employee_id, branch_id, event_type, ip, user_agent, match_distance, evidence_path, challenge_id)
  values
    (v_emp.id, coalesce(v_ch.branch_id, v_emp.branch_id), p_event_type, p_ip,
     v_ch.user_agent, v_ch.match_distance, v_ch.evidence_path, v_ch.id)
  returning id into v_id;

  update public.kiosk_challenges c set marked_at = now() where c.id = v_ch.id;

  return query
    select a.id, a.employee_id, a.event_type, a.occurred_at, a.work_date, a.branch_id
    from public.attendance_events a
    where a.id = v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: registrar consentimiento informado (LOPDP) con fecha y responsable.
-- ---------------------------------------------------------------------------
create or replace function public.admin_record_consent(p_employee_id uuid, p_version text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_version is null or char_length(p_version) not between 1 and 40 then
    raise exception 'DATOS_INVALIDOS' using errcode = 'P0001';
  end if;
  update public.employees
     set consent_at = v_at,
         consent_by = auth.uid(),
         consent_version = p_version,
         consent_revoked_at = null
   where id = p_employee_id;
  if not found then
    raise exception 'EMPLEADO_NO_EXISTE' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'registrar_consentimiento', 'employee', p_employee_id::text,
          jsonb_build_object('version', p_version, 'fecha', v_at));
  return v_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: enrolar rostro (3 a 5 vectores). Reemplaza las plantillas anteriores
-- y rechaza si la cara coincide con la de OTRO empleado (evita ambigüedad).
-- ---------------------------------------------------------------------------
create or replace function public.admin_enroll_face(
  p_employee_id uuid,
  p_descriptors jsonb,
  p_scores real[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count     integer;
  v_threshold real;
  v_vec       extensions.vector(128);
  v_dup_name  text;
  v_dup_dist  real;
  i           integer;
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if p_descriptors is null or jsonb_typeof(p_descriptors) <> 'array' then
    raise exception 'DATOS_INVALIDOS' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_descriptors);
  if v_count < 3 or v_count > 5 then
    raise exception 'MUESTRAS_INVALIDAS' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.active
      and e.consent_at is not null and e.consent_revoked_at is null
  ) then
    raise exception 'SIN_CONSENTIMIENTO' using errcode = 'P0001';
  end if;

  select s.face_match_threshold into v_threshold from public.settings s where s.id = 1;

  delete from public.face_templates ft where ft.employee_id = p_employee_id;

  for i in 0 .. v_count - 1 loop
    if jsonb_typeof(p_descriptors -> i) <> 'array' or jsonb_array_length(p_descriptors -> i) <> 128 then
      raise exception 'DATOS_INVALIDOS' using errcode = 'P0001';
    end if;

    select (array_agg(t.x::real order by t.ord))::extensions.vector(128)
      into v_vec
    from jsonb_array_elements_text(p_descriptors -> i) with ordinality as t(x, ord);

    v_dup_name := null;
    v_dup_dist := null;
    select e.full_name, extensions.l2_distance(ft.descriptor, v_vec)::real
      into v_dup_name, v_dup_dist
    from public.face_templates ft
    join public.employees e on e.id = ft.employee_id
    where ft.employee_id <> p_employee_id and e.active
    order by extensions.l2_distance(ft.descriptor, v_vec) asc
    limit 1;

    if v_dup_dist is not null and v_dup_dist < v_threshold then
      raise exception 'CARA_DUPLICADA' using errcode = 'P0001', detail = v_dup_name;
    end if;

    insert into public.face_templates (employee_id, descriptor, detection_score, created_by)
    values (p_employee_id, v_vec, p_scores[i + 1], auth.uid());
  end loop;

  update public.employees set biometric_deleted_at = null where id = p_employee_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'enrolar_rostro', 'employee', p_employee_id::text,
          jsonb_build_object('muestras', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: eliminar datos biométricos de un empleado (derecho de eliminación).
-- Revoca el consentimiento: para volver a enrolar se necesita uno nuevo.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_biometrics(p_employee_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  delete from public.face_templates ft where ft.employee_id = p_employee_id;
  get diagnostics v_n = row_count;
  update public.employees
     set consent_revoked_at = now(), biometric_deleted_at = now()
   where id = p_employee_id;
  if not found then
    raise exception 'EMPLEADO_NO_EXISTE' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'eliminar_biometria', 'employee', p_employee_id::text,
          jsonb_build_object('plantillas_eliminadas', v_n));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cron: empleados que superaron (almuerzo permitido + gracia) sin regresar.
-- Inserta UNA alerta por empleado y día (dedupe_key) en estado pendiente_envio
-- y devuelve solo las alertas NUEVAS. No se programa aquí.
-- ---------------------------------------------------------------------------
create or replace function public.detect_lunch_overdue()
returns setof public.alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  s       public.settings%rowtype;
  v_today date := (now() at time zone 'America/Guayaquil')::date;
begin
  select * into s from public.settings where id = 1;
  if not found or not s.alert_lunch_overdue then
    return;
  end if;

  return query
  with candidates as (
    select e.employee_id, coalesce(e.branch_id, emp.branch_id) as branch_id, e.work_date,
           e.occurred_at, emp.full_name, b.name as branch_name,
           floor(extract(epoch from now() - e.occurred_at) / 60)::integer as minutes_out
    from public.attendance_events e
    join public.employees emp on emp.id = e.employee_id
    left join public.branches b on b.id = coalesce(e.branch_id, emp.branch_id)
    where e.work_date = v_today
      and e.event_type = 'SALIDA_ALMUERZO'
      and now() - e.occurred_at > make_interval(mins => s.lunch_allowed_minutes + s.lunch_alert_grace_minutes)
      and not exists (
        select 1 from public.attendance_events r
        where r.employee_id = e.employee_id
          and r.work_date = e.work_date
          and r.event_type = 'REGRESO_ALMUERZO'
      )
  ),
  ins as (
    insert into public.alerts (type, employee_id, branch_id, work_date, dedupe_key, message, payload)
    select 'almuerzo_sin_regreso', c.employee_id, c.branch_id, c.work_date,
           'almuerzo_sin_regreso:' || c.employee_id || ':' || c.work_date,
           format('⏰ %s (%s) salió a almorzar a las %s y no ha regresado: lleva %s min fuera (permitido: %s min).',
                  c.full_name, coalesce(c.branch_name, 'sin sucursal'),
                  to_char(c.occurred_at at time zone 'America/Guayaquil', 'HH24:MI'),
                  c.minutes_out, s.lunch_allowed_minutes),
           jsonb_build_object('salida_almuerzo', c.occurred_at,
                              'minutos_fuera', c.minutes_out,
                              'permitido', s.lunch_allowed_minutes,
                              'sucursal', c.branch_name)
    from candidates c
    on conflict (dedupe_key) do nothing
    returning *
  )
  select * from ins;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cron: intentos fallidos repetidos desde una misma IP (alerta 3, opcional).
-- Una alerta por IP y por ventana de tiempo.
-- ---------------------------------------------------------------------------
create or replace function public.detect_suspicious_attempts()
returns setof public.alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.settings%rowtype;
  v_today  date := (now() at time zone 'America/Guayaquil')::date;
  v_bucket bigint;
begin
  select * into s from public.settings where id = 1;
  if not found or not s.alert_suspicious then
    return;
  end if;
  v_bucket := floor(extract(epoch from now()) / (s.suspicious_window_minutes * 60))::bigint;

  return query
  with agg as (
    select f.ip,
           (max(f.branch_id::text))::uuid as branch_id,
           count(*)::integer as n,
           array_agg(distinct f.reason::text) as reasons
    from public.failed_attempts f
    where f.occurred_at > now() - make_interval(mins => s.suspicious_window_minutes)
      and f.ip is not null
    group by f.ip
    having count(*) >= s.suspicious_attempts_threshold
  ),
  ins as (
    insert into public.alerts (type, branch_id, work_date, dedupe_key, message, payload)
    select 'intentos_sospechosos', a.branch_id, v_today,
           'intentos_sospechosos:' || host(a.ip) || ':' || v_bucket,
           format('🚨 %s intentos fallidos de marcación en %s min desde la IP %s%s. Motivos: %s.',
                  a.n, s.suspicious_window_minutes, host(a.ip),
                  coalesce(' (' || b.name || ')', ''),
                  array_to_string(a.reasons, ', ')),
           jsonb_build_object('ip', host(a.ip), 'intentos', a.n, 'motivos', a.reasons)
    from agg a
    left join public.branches b on b.id = a.branch_id
    on conflict (dedupe_key) do nothing
    returning *
  )
  select * from ins;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cron: limpieza de datos temporales del kiosco y rutas de evidencia vencidas.
-- (Los archivos de Storage los borra la app vía API; aquí solo se limpian rutas.)
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
begin
  delete from public.kiosk_challenges where created_at < now() - interval '2 days';
  get diagnostics v_ch = row_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_rl = row_count;
  if p_evidence_before is not null then
    update public.attendance_events set evidence_path = null
     where evidence_path is not null and occurred_at < p_evidence_before;
    get diagnostics v_ev = row_count;
    update public.failed_attempts set evidence_path = null
     where evidence_path is not null and occurred_at < p_evidence_before;
    get diagnostics v_fa = row_count;
  end if;
  return jsonb_build_object('retos', v_ch, 'rate_limits', v_rl,
                            'evidencias_marcaciones', v_ev, 'evidencias_intentos', v_fa);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución (Supabase concede EXECUTE a anon por defecto: se revoca).
-- ---------------------------------------------------------------------------
revoke all on function public.next_attendance_event(public.attendance_event_type) from public, anon;
grant execute on function public.next_attendance_event(public.attendance_event_type) to authenticated, service_role;

revoke all on function public.kiosk_resolve_branch(inet) from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.kiosk_match_face(extensions.vector, integer) from public, anon, authenticated;
revoke all on function public.kiosk_employee_status(uuid) from public, anon, authenticated;
revoke all on function public.kiosk_register_attendance(uuid, public.attendance_event_type, inet, integer) from public, anon, authenticated;
revoke all on function public.detect_lunch_overdue() from public, anon, authenticated;
revoke all on function public.detect_suspicious_attempts() from public, anon, authenticated;
revoke all on function public.cleanup_kiosk_data(timestamptz) from public, anon, authenticated;
grant execute on function public.kiosk_resolve_branch(inet) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.kiosk_match_face(extensions.vector, integer) to service_role;
grant execute on function public.kiosk_employee_status(uuid) to service_role;
grant execute on function public.kiosk_register_attendance(uuid, public.attendance_event_type, inet, integer) to service_role;
grant execute on function public.detect_lunch_overdue() to service_role;
grant execute on function public.detect_suspicious_attempts() to service_role;
grant execute on function public.cleanup_kiosk_data(timestamptz) to service_role;

revoke all on function public.admin_record_consent(uuid, text) from public, anon;
revoke all on function public.admin_enroll_face(uuid, jsonb, real[]) from public, anon;
revoke all on function public.admin_delete_biometrics(uuid) from public, anon;
grant execute on function public.admin_record_consent(uuid, text) to authenticated, service_role;
grant execute on function public.admin_enroll_face(uuid, jsonb, real[]) to authenticated, service_role;
grant execute on function public.admin_delete_biometrics(uuid) to authenticated, service_role;

-- Las funciones de trigger no deben ser invocables por la API.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.face_templates_require_consent() from public, anon, authenticated;
revoke all on function public.attendance_events_set_work_date() from public, anon, authenticated;
