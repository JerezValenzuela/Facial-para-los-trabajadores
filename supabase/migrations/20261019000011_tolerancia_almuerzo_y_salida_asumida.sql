-- ============================================================================
-- Dos ajustes nuevos (Configuración, iguales para todos los empleados):
--  * lunch_tolerance_minutes: el almuerzo no cuenta como exceso hasta pasar
--    "permitido + tolerancia". Ej.: 60 + 10 → volver a 1 h 12 min = 2 min.
--  * default_exit_time: si alguien olvida marcar "Salir", para calcular sus
--    horas se cuenta que salió a esta hora (17:00). Si marca, vale la real.
-- Solo AGREGA columnas con valor por defecto: no cambia datos existentes.
-- ============================================================================

alter table public.settings
  add column lunch_tolerance_minutes integer not null default 10
    check (lunch_tolerance_minutes between 0 and 60),
  add column default_exit_time time not null default '17:00';

comment on column public.settings.lunch_tolerance_minutes is 'Minutos de gracia del almuerzo antes de contar exceso (mismo para todos).';
comment on column public.settings.default_exit_time is 'Hora de salida que se asume si el empleado olvidó marcar "Salir".';
