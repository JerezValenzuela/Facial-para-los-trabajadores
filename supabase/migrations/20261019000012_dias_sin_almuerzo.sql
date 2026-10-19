-- ============================================================================
-- Días sin almuerzo (media jornada), por empleado.
-- Esos días basta con Entrar + Salir: el día queda "Completo" y las horas
-- trabajadas = salida − entrada (no se descuenta almuerzo).
-- Por defecto el SÁBADO (los sábados no salen al almuerzo); se cambia en la
-- ficha de cada empleado. Solo AGREGA una columna: no cambia datos existentes.
-- ============================================================================

alter table public.employees
  add column no_lunch_days smallint[] not null default '{6}'
    check (no_lunch_days <@ '{1,2,3,4,5,6,7}'::smallint[]);

comment on column public.employees.no_lunch_days is 'Días ISO sin almuerzo (media jornada): Entrar + Salir = día completo.';
