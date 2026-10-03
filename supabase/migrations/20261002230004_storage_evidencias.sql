-- =============================================================================
-- JerezCons Asistencia · 0004 · Bucket privado para miniaturas de evidencia
-- Sin políticas sobre storage.objects para este bucket: solo el servidor
-- (service_role) sube, borra y genera URLs firmadas de corta duración.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 102400, array['image/jpeg'])
on conflict (id) do nothing;
