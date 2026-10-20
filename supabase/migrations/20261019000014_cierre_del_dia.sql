-- ============================================================================
-- Cierre del día (18:30 por defecto): desde esa hora el día de HOY se calcula
-- como terminado (salida asumida, almuerzo asumido, "hasta el almuerzo"…) y
-- deja de salir "En curso". Antes había que esperar a la medianoche.
-- Solo AGREGA una columna con valor por defecto: no cambia datos existentes.
-- ============================================================================

alter table public.settings
  add column day_close_time time not null default '18:30';

comment on column public.settings.day_close_time is 'Desde esta hora, el día de hoy se calcula como terminado (deja de estar "En curso").';
