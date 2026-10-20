-- ============================================================================
-- Si el empleado ENTRA desde esta hora (12:30 por defecto), ya viene almorzado:
-- ese día no se le pide almuerzo ni se le descuenta. Con Entrar + Salir el día
-- queda completo. Igual para todos; se cambia en Configuración.
-- Solo AGREGA una columna con valor por defecto: no cambia datos existentes.
-- ============================================================================

alter table public.settings
  add column no_lunch_after_time time not null default '12:30';

comment on column public.settings.no_lunch_after_time is 'Si entra desde esta hora, ese día no se descuenta almuerzo (ya viene almorzado).';
