-- ============================================================================
-- Días anulados: el administrador anula el día de un empleado (o marca un
-- FERIADO, que lo anula para todos). Ese día NO cuenta para nada: horas,
-- suplementarias, atraso, exceso de almuerzo ni falta. No se borra nada: las
-- marcaciones y fotos siguen ahí; el dashboard y el Excel muestran la fila tachada.
-- Quitar la anulación = borrar la fila de esta tabla.
-- Solo el administrador la lee y escribe; el kiosco no tiene acceso.
-- Tabla nueva: no cambia ni borra datos existentes.
-- ============================================================================

create table public.annulled_days (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date   date not null,
  -- 'anulado' = solo ese empleado; 'feriado' = se marcó para todos ese día.
  kind        text not null default 'anulado' check (kind in ('anulado', 'feriado')),
  -- Motivo o nombre del feriado (opcional).
  reason      text check (reason is null or char_length(btrim(reason)) between 1 and 200),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint annulled_days_one_per_day unique (employee_id, work_date)
);
create index annulled_days_work_date_idx on public.annulled_days (work_date);
create index annulled_days_created_by_idx on public.annulled_days (created_by);

alter table public.annulled_days enable row level security;
revoke all on public.annulled_days from anon;

create policy annulled_days_admin_all on public.annulled_days
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

comment on table public.annulled_days is 'Días anulados por el administrador (o feriados): no cuentan en horas, suplementarias, atrasos ni faltas.';
