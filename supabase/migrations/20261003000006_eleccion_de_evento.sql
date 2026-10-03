-- =============================================================================
-- JerezCons Asistencia · 0006 · El empleado ELIGE la marcación en el kiosco
-- Regla nueva ("solo hacia adelante"): se puede registrar cualquier evento que
-- venga DESPUÉS del último marcado hoy (permite saltarse uno olvidado, p. ej.
-- salir sin haber marcado el almuerzo), pero nunca repetir ni retroceder.
-- Solo reemplaza la función; NO modifica datos existentes.
-- =============================================================================
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

  -- El enum está ordenado: ENTRADA < SALIDA_ALMUERZO < REGRESO_ALMUERZO < SALIDA_FINAL
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
  -- Solo hacia adelante: ni repetir ni retroceder.
  if v_last is not null and p_event_type <= v_last then
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

revoke all on function public.kiosk_register_attendance(uuid, public.attendance_event_type, inet, integer) from public, anon, authenticated;
grant execute on function public.kiosk_register_attendance(uuid, public.attendance_event_type, inet, integer) to service_role;
