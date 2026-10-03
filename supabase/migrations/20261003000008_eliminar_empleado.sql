-- ============================================================================
-- Eliminar un empleado por completo (desde la ficha del empleado).
--
-- Borra en UNA transacción: plantillas faciales, marcaciones, permisos, retos
-- del kiosco, intentos fallidos y alertas del empleado, y luego el empleado.
-- Devuelve las rutas de fotos del bucket "evidencias" para que el servidor
-- las borre de Storage. Solo la ejecuta el servidor (service_role) después de
-- verificar que quien lo pide es administrador; la auditoría guarda quién fue,
-- sin datos personales del empleado eliminado.
-- ============================================================================

create or replace function public.admin_delete_employee(p_employee_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_paths text[];
  v_ev    integer;
  v_pe    integer;
  v_ft    integer;
  v_fa    integer;
  v_al    integer;
begin
  perform 1 from public.employees where id = p_employee_id for update;
  if not found then
    raise exception 'EMPLEADO_NO_EXISTE' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct p), '{}') into v_paths
    from (
      select unnest(array[a.evidence_path, a.scene_path]) as p
        from public.attendance_events a where a.employee_id = p_employee_id
      union all
      select unnest(array[pe.evidence_path, pe.scene_path])
        from public.permissions pe where pe.employee_id = p_employee_id
      union all
      select unnest(array[k.evidence_path, k.scene_path])
        from public.kiosk_challenges k where k.employee_id = p_employee_id
      union all
      select f.evidence_path
        from public.failed_attempts f where f.employee_id = p_employee_id
    ) s
   where p is not null;

  delete from public.permissions where employee_id = p_employee_id;
  get diagnostics v_pe = row_count;
  delete from public.attendance_events where employee_id = p_employee_id;
  get diagnostics v_ev = row_count;
  delete from public.face_templates where employee_id = p_employee_id;
  get diagnostics v_ft = row_count;
  delete from public.failed_attempts where employee_id = p_employee_id;
  get diagnostics v_fa = row_count;
  delete from public.alerts where employee_id = p_employee_id;
  get diagnostics v_al = row_count;
  delete from public.kiosk_challenges where employee_id = p_employee_id;
  delete from public.employees where id = p_employee_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (p_actor_id, 'eliminar_empleado', 'employee', p_employee_id::text,
          jsonb_build_object('marcaciones', v_ev, 'permisos', v_pe, 'plantillas', v_ft,
                             'intentos', v_fa, 'alertas', v_al, 'fotos', cardinality(v_paths)));

  return jsonb_build_object('marcaciones', v_ev, 'permisos', v_pe, 'plantillas', v_ft,
                            'intentos', v_fa, 'alertas', v_al, 'rutas', to_jsonb(v_paths));
end;
$$;

revoke all on function public.admin_delete_employee(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_employee(uuid, uuid) to service_role;
