-- ============================================================================
-- Horario por empleado: qué días trabaja y a qué hora entra cada día.
--
--  * work_days: días ISO (1 = lunes … 7 = domingo). En los demás días el
--    empleado no aparece en Asistencia ni en el Excel (salvo que marque).
--  * entry_times: vacío ({}) = entra a la misma hora todos los días
--    (entry_time). Si no, la hora de cada día: {"1": "07:00", "6": "08:00"}.
--
-- Solo AGREGA columnas: no cambia ni borra datos existentes. Los empleados
-- actuales empiezan con los días laborables generales de Configuración, así
-- que el dashboard se ve igual hasta que se edite cada ficha.
-- ============================================================================

alter table public.employees
  add column work_days smallint[] not null default '{1,2,3,4,5,6}'
    check (cardinality(work_days) between 1 and 7 and work_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add column entry_times jsonb not null default '{}'::jsonb
    check (jsonb_typeof(entry_times) = 'object');

update public.employees
   set work_days = coalesce((select s.work_days from public.settings s where s.id = 1), work_days);

comment on column public.employees.work_days is 'Días que trabaja (ISO: 1 = lunes … 7 = domingo).';
comment on column public.employees.entry_times is 'Hora de entrada por día ({"1":"07:00",…}); vacío = misma hora todos los días (entry_time).';
