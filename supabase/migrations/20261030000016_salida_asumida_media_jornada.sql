-- ============================================================================
-- Salida asumida en MEDIA JORNADA (días sin almuerzo del empleado, ej. sábado
-- de 7:00 a 13:00): si se olvida de marcar "Salir", sus horas se cuentan hasta
-- esta hora (13:00), igual que entre semana se cuentan hasta las 17:00.
-- Solo AGREGA una columna con valor por defecto: no cambia datos existentes.
-- ============================================================================

alter table public.settings
  add column half_day_exit_time time not null default '13:00';

comment on column public.settings.half_day_exit_time is 'Salida que se asume en media jornada (día sin almuerzo, ej. sábado) si olvidó marcar "Salir".';
