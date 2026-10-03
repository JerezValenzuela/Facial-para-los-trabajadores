-- =============================================================================
-- JerezCons Asistencia · Datos iniciales (idempotente: se puede correr varias veces)
-- =============================================================================

-- Sucursales
insert into public.branches (code, name, address) values
  ('pucara',    'Pucará',    null),
  ('rumicucho', 'Rumicucho', null)
on conflict (code) do nothing;

-- Configuración por defecto (una sola fila)
insert into public.settings (id) values (1)
on conflict (id) do nothing;

-- Empleado de prueba (cédula sintética con dígito verificador válido).
-- Sin consentimiento ni rostro: se enrola desde el dashboard.
insert into public.employees (full_name, cedula, branch_id, position, entry_time)
select 'Empleado de Prueba', '1712345675', b.id, 'Vendedor', '08:00'
from public.branches b
where b.code = 'pucara'
on conflict (cedula) do nothing;
