-- ============================================================================
-- ORDEN OBLIGATORIO de las marcaciones (ya no se pueden saltar pasos).
--   nada            → solo Entrar
--   Entrar          → Salir a almuerzo o Salir (si hoy no hay almuerzo: solo Salir)
--   Salir a almuerzo→ solo Regresar de almuerzo (no puede irse sin marcar el regreso)
--   Regresar        → solo Salir
-- Hoy no hay almuerzo si es su día sin almuerzo (employees.no_lunch_days, ej.
-- sábado) o si entró desde settings.no_lunch_after_time (12:30).
-- Solo reemplaza la función de registro (misma firma): no cambia datos.
-- ============================================================================

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
  v_entry    time;
  v_cutoff   time;
  v_lunch    boolean := true;
  v_allowed  boolean;
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
  -- ORDEN OBLIGATORIO (sin saltarse pasos):
  --   nada → Entrar · Entrar → Salir a almuerzo o Salir · Salir a almuerzo → solo
  --   Regresar · Regresar → Salir. Tras Entrar no hay almuerzo si hoy es su día
  --   sin almuerzo (ej. sábado) o si entró desde la hora de corte (12:30).
  if v_last = 'ENTRADA' then
    select (e.occurred_at at time zone 'America/Guayaquil')::time into v_entry
    from public.attendance_events e
    where e.employee_id = v_emp.id and e.work_date = v_today and e.event_type = 'ENTRADA';
    select s.no_lunch_after_time into v_cutoff from public.settings s where s.id = 1;
    v_lunch := not (extract(isodow from v_today)::smallint = any (v_emp.no_lunch_days))
               and not (v_cutoff is not null and v_entry is not null and v_entry >= v_cutoff);
  end if;

  v_allowed := case
    when v_last is null then p_event_type = 'ENTRADA'
    when v_last = 'ENTRADA' then p_event_type = 'SALIDA_FINAL' or (p_event_type = 'SALIDA_ALMUERZO' and v_lunch)
    when v_last = 'SALIDA_ALMUERZO' then p_event_type = 'REGRESO_ALMUERZO'
    when v_last = 'REGRESO_ALMUERZO' then p_event_type = 'SALIDA_FINAL'
    else false
  end;
  if not v_allowed then
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

revoke all on function public.kiosk_register_attendance(uuid, public.attendance_event_type, inet, integer) from public, anon, authenticated;
grant execute on function public.kiosk_register_attendance(uuid, public.attendance_event_type, inet, integer) to service_role;
