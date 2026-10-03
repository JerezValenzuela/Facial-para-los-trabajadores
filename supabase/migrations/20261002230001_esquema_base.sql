-- =============================================================================
-- JerezCons Asistencia · 0001 · Esquema base
-- Fechas/horas en UTC (timestamptz). La "fecha laboral" (work_date) se calcula
-- en America/Guayaquil (UTC-5, sin horario de verano).
-- =============================================================================

create extension if not exists vector with schema extensions;

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
create type public.attendance_event_type as enum (
  'ENTRADA', 'SALIDA_ALMUERZO', 'REGRESO_ALMUERZO', 'SALIDA_FINAL'
);

create type public.failed_attempt_reason as enum (
  'ip_no_permitida',
  'movil_detectado',
  'liveness_fallido',
  'cara_desconocida',
  'ambiguedad',
  'reto_invalido',
  'fuera_de_orden',
  'cooldown',
  'jornada_completa',
  'empleado_inactivo',
  'rate_limit',
  'datos_invalidos'
);

create type public.alert_type as enum (
  'exceso_almuerzo', 'almuerzo_sin_regreso', 'intentos_sospechosos'
);

create type public.alert_status as enum ('pendiente_envio', 'enviada', 'error');

-- ----------------------------------------------------------------------------
-- Utilidades
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Administradores (vinculados a auth.users)
-- ----------------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Sucursales e IPs permitidas
-- ----------------------------------------------------------------------------
create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z0-9-]{2,32}$'),
  name       text not null check (char_length(name) between 2 and 80),
  address    text check (address is null or char_length(address) <= 200),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();

-- ip_range admite una IP exacta (/32, /128) o un rango CIDR del proveedor.
create table public.branch_ips (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches (id) on delete cascade,
  ip_range   cidr not null,
  label      text check (label is null or char_length(label) <= 80),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (branch_id, ip_range)
);
create index branch_ips_created_by_idx on public.branch_ips (created_by);

-- ----------------------------------------------------------------------------
-- Empleados
-- ----------------------------------------------------------------------------
create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null check (char_length(full_name) between 3 and 120),
  cedula               text not null unique check (cedula ~ '^[0-9]{10}$'),
  branch_id            uuid not null references public.branches (id),
  position             text not null check (char_length(position) between 2 and 80),
  entry_time           time not null,
  active               boolean not null default true,
  -- Consentimiento informado LOPDP (datos biométricos = datos sensibles)
  consent_at           timestamptz,
  consent_by           uuid references auth.users (id) on delete set null,
  consent_version      text,
  consent_revoked_at   timestamptz,
  biometric_deleted_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index employees_branch_idx on public.employees (branch_id);
create index employees_consent_by_idx on public.employees (consent_by);
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Plantillas faciales: SOLO el vector descriptor (128 dimensiones), nunca fotos.
-- ----------------------------------------------------------------------------
create table public.face_templates (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id) on delete cascade,
  descriptor      extensions.vector(128) not null,
  detection_score real,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null
);
create index face_templates_employee_idx on public.face_templates (employee_id);
create index face_templates_created_by_idx on public.face_templates (created_by);

-- Defensa en profundidad: no se puede guardar biometría sin consentimiento vigente.
create or replace function public.face_templates_require_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.employees e
    where e.id = new.employee_id
      and e.consent_at is not null
      and e.consent_revoked_at is null
  ) then
    raise exception 'SIN_CONSENTIMIENTO' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger face_templates_consent before insert on public.face_templates
  for each row execute function public.face_templates_require_consent();

-- ----------------------------------------------------------------------------
-- Marcaciones
-- ----------------------------------------------------------------------------
create table public.attendance_events (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id) on delete restrict,
  branch_id      uuid references public.branches (id) on delete set null,
  event_type     public.attendance_event_type not null,
  occurred_at    timestamptz not null default now(),
  work_date      date not null,
  ip             inet,
  user_agent     text,
  match_distance real,
  evidence_path  text,
  challenge_id   uuid,
  created_at     timestamptz not null default now(),
  -- Un mismo evento no puede repetirse en el mismo día laboral.
  -- Su índice (employee_id, work_date, event_type) cubre las consultas por (empleado, fecha).
  constraint attendance_events_unique_per_day unique (employee_id, work_date, event_type)
);
create index attendance_events_occurred_at_idx on public.attendance_events (occurred_at);
create index attendance_events_branch_idx on public.attendance_events (branch_id);

-- work_date siempre se deriva de occurred_at en hora de Ecuador (no se confía en el cliente).
create or replace function public.attendance_events_set_work_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.work_date := (new.occurred_at at time zone 'America/Guayaquil')::date;
  return new;
end;
$$;
create trigger attendance_events_work_date
  before insert or update of occurred_at on public.attendance_events
  for each row execute function public.attendance_events_set_work_date();

-- ----------------------------------------------------------------------------
-- Intentos fallidos o sospechosos
-- ----------------------------------------------------------------------------
create table public.failed_attempts (
  id             uuid primary key default gen_random_uuid(),
  occurred_at    timestamptz not null default now(),
  reason         public.failed_attempt_reason not null,
  ip             inet,
  user_agent     text,
  branch_id      uuid references public.branches (id) on delete set null,
  employee_id    uuid references public.employees (id) on delete set null,
  match_distance real,
  details        jsonb not null default '{}'::jsonb,
  evidence_path  text
);
create index failed_attempts_occurred_at_idx on public.failed_attempts (occurred_at desc);
create index failed_attempts_ip_idx on public.failed_attempts (ip, occurred_at desc);
create index failed_attempts_branch_idx on public.failed_attempts (branch_id);
create index failed_attempts_employee_idx on public.failed_attempts (employee_id);

-- ----------------------------------------------------------------------------
-- Alertas (con deduplicación por dedupe_key)
-- ----------------------------------------------------------------------------
create table public.alerts (
  id          uuid primary key default gen_random_uuid(),
  type        public.alert_type not null,
  status      public.alert_status not null default 'pendiente_envio',
  employee_id uuid references public.employees (id) on delete set null,
  branch_id   uuid references public.branches (id) on delete set null,
  work_date   date,
  dedupe_key  text not null unique,
  message     text not null,
  payload     jsonb not null default '{}'::jsonb,
  channels    text[] not null default '{}',
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index alerts_created_at_idx on public.alerts (created_at desc);
create index alerts_employee_idx on public.alerts (employee_id, work_date);
create index alerts_branch_idx on public.alerts (branch_id);

-- ----------------------------------------------------------------------------
-- Configuración (una sola fila, editable desde el dashboard)
-- ----------------------------------------------------------------------------
create table public.settings (
  id                            smallint primary key default 1 check (id = 1),
  entry_tolerance_minutes       integer  not null default 7   check (entry_tolerance_minutes between 0 and 120),
  lunch_allowed_minutes         integer  not null default 60  check (lunch_allowed_minutes between 10 and 240),
  lunch_alert_grace_minutes     integer  not null default 5   check (lunch_alert_grace_minutes between 0 and 120),
  -- Distancia euclidiana máxima entre descriptores (menor = más estricto).
  face_match_threshold          real     not null default 0.5 check (face_match_threshold between 0.3 and 0.65),
  cooldown_seconds              integer  not null default 60  check (cooldown_seconds between 10 and 3600),
  liveness_steps                integer  not null default 2   check (liveness_steps between 1 and 3),
  evidence_enabled              boolean  not null default true,
  evidence_retention_days       integer  not null default 90  check (evidence_retention_days between 1 and 730),
  -- Días laborables ISO: 1 = lunes … 7 = domingo.
  work_days                     smallint[] not null default '{1,2,3,4,5,6}'
    check (cardinality(work_days) between 1 and 7 and work_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  alert_lunch_excess            boolean  not null default true,
  alert_lunch_overdue           boolean  not null default true,
  alert_suspicious              boolean  not null default true,
  suspicious_attempts_threshold integer  not null default 5   check (suspicious_attempts_threshold between 2 and 100),
  suspicious_window_minutes     integer  not null default 15  check (suspicious_window_minutes between 1 and 1440),
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references auth.users (id) on delete set null
);
create index settings_updated_by_idx on public.settings (updated_by);
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Retos de liveness del kiosco (un solo uso, caducan en segundos)
-- ----------------------------------------------------------------------------
create table public.kiosk_challenges (
  id             uuid primary key default gen_random_uuid(),
  steps          text[] not null,
  ip             inet not null,
  user_agent     text,
  branch_id      uuid references public.branches (id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  consumed_at    timestamptz,             -- usado por /identify (un solo uso)
  employee_id    uuid references public.employees (id) on delete cascade,
  match_distance real,
  identified_at  timestamptz,
  evidence_path  text,
  marked_at      timestamptz              -- usado por /mark (un solo uso)
);
create index kiosk_challenges_created_at_idx on public.kiosk_challenges (created_at);
create index kiosk_challenges_employee_idx on public.kiosk_challenges (employee_id);
create index kiosk_challenges_branch_idx on public.kiosk_challenges (branch_id);

-- ----------------------------------------------------------------------------
-- Rate limiting (ventana fija, compartido entre instancias serverless)
-- ----------------------------------------------------------------------------
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);

-- ----------------------------------------------------------------------------
-- Auditoría de acciones administrativas sensibles
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb
);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
