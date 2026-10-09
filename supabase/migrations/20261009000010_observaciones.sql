-- ============================================================================
-- Observaciones del administrador: UNA por empleado y por día
-- (ej. "llegó tarde porque…", "pidió permiso pero no lo puso", "falló la app").
-- Se ven en el dashboard (botón "+" junto a la fecha) y en el Excel.
-- Solo el administrador las lee y escribe; el kiosco no tiene acceso.
-- Tabla nueva: no cambia ni borra datos existentes.
-- ============================================================================

create table public.observations (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date   date not null,
  note        text not null check (char_length(btrim(note)) between 1 and 1000),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint observations_one_per_day unique (employee_id, work_date)
);
create index observations_work_date_idx on public.observations (work_date);
create index observations_created_by_idx on public.observations (created_by);
create index observations_updated_by_idx on public.observations (updated_by);
create trigger observations_updated_at before update on public.observations
  for each row execute function public.set_updated_at();

alter table public.observations enable row level security;
revoke all on public.observations from anon;

create policy observations_admin_all on public.observations
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

comment on table public.observations is 'Observación del administrador por empleado y día (dashboard + Excel).';
