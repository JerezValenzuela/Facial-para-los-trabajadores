-- ============================================================================
-- Tolerancias con FECHA DE VIGENCIA (pedido del dueño: "aplica solo desde hoy").
-- Cada fila dice desde qué día vale cada tolerancia; un día se calcula con la
-- fila más reciente cuya fecha sea <= ese día. Así, cambiar la tolerancia no
-- recalcula los días anteriores.
--
--  * Base (desde 2000-01-01): las tolerancias vigentes hasta ayer (10 / 10).
--  * Desde 2026-10-30: 5 minutos en la entrada y 5 en el regreso del almuerzo.
--
-- También deja settings con los valores actuales (5 / 5) para la pantalla de
-- Configuración y los mensajes del kiosco. No toca marcaciones ni empleados.
-- ============================================================================

create table public.tolerance_periods (
  starts_on               date primary key,
  entry_tolerance_minutes integer not null check (entry_tolerance_minutes between 0 and 120),
  lunch_tolerance_minutes integer not null check (lunch_tolerance_minutes between 0 and 60),
  created_at              timestamptz not null default now(),
  created_by              uuid default auth.uid() references auth.users (id) on delete set null
);
create index tolerance_periods_created_by_idx on public.tolerance_periods (created_by);

alter table public.tolerance_periods enable row level security;
revoke all on public.tolerance_periods from anon;

create policy tolerance_periods_admin_all on public.tolerance_periods
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Base: lo que valía hasta ayer.
insert into public.tolerance_periods (starts_on, entry_tolerance_minutes, lunch_tolerance_minutes)
select date '2000-01-01', s.entry_tolerance_minutes, s.lunch_tolerance_minutes
from public.settings s where s.id = 1;

-- Desde hoy: 5 y 5.
insert into public.tolerance_periods (starts_on, entry_tolerance_minutes, lunch_tolerance_minutes)
values (date '2026-10-30', 5, 5);

update public.settings set entry_tolerance_minutes = 5, lunch_tolerance_minutes = 5 where id = 1;

comment on table public.tolerance_periods is 'Tolerancias de entrada y de almuerzo con fecha de vigencia (no recalculan días anteriores).';
