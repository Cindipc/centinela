-- =========================================================
-- CENTINELA — Esquema de base de datos (Supabase/PostgreSQL)
-- Versión corregida: RLS sin recursión (helper SECURITY DEFINER),
-- trigger de perfiles y políticas completas para la web.
-- Si la BD ya existe, ejecuta únicamente migrations/001.
-- =========================================================

-- 1. Extensiones necesarias
create extension if not exists postgis;

-- 2. Tipos (enums)
create type user_role as enum ('usuario', 'seguridad', 'ti', 'admin');
create type incident_type as enum ('seguridad', 'equipo');
create type incident_priority as enum ('low', 'medium', 'high', 'critical');
create type incident_status as enum ('pendiente', 'en_proceso', 'resuelto', 'falsa_alarma');
create type verification_choice as enum ('confirmo', 'ya_no', 'falso');
create type equipment_status as enum ('operativo', 'en_reparacion', 'caido', 'con_falla');
create type panic_status as enum ('activo', 'atendido', 'falsa_alarma');

-- 3. Departamentos y zonas/edificios
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  responsible_id uuid,
  created_at timestamptz default now()
);

create table zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  building text,
  department_id uuid references departments(id),
  location geography(Point, 4326),
  created_at timestamptz default now()
);

-- 4. Perfiles de usuario (extiende auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'usuario',
  department_id uuid references departments(id),
  zone_id uuid references zones(id),
  phone text,
  created_at timestamptz default now()
);

alter table departments
  add constraint fk_department_responsible
  foreign key (responsible_id) references profiles(id);

-- 5. Contactos de confianza (botón de pánico)
create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  relation text,
  created_at timestamptz default now()
);

-- 6. Inventario de equipos
create table equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  serial_number text unique,
  zone_id uuid references zones(id),
  assigned_to uuid references profiles(id),
  status equipment_status default 'operativo',
  created_at timestamptz default now()
);

-- 7. Incidencias (seguridad + equipo, modelo unificado)
create table incidents (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type incident_type not null,
  category text,
  title text not null,
  description text,
  photo_url text,
  location geography(Point, 4326),
  zone_id uuid references zones(id),
  equipment_id uuid references equipment(id),
  priority incident_priority not null default 'medium',
  status incident_status not null default 'pendiente',
  reported_by uuid references profiles(id),
  assigned_to uuid references profiles(id),
  resolution_note text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index idx_incidents_zone on incidents(zone_id);
create index idx_incidents_status on incidents(status);
create index idx_incidents_type on incidents(type);
create index idx_incidents_location on incidents using gist(location);

-- 8. Verificación comunitaria
create table incident_verifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references incidents(id) on delete cascade,
  user_id uuid references profiles(id),
  choice verification_choice not null,
  created_at timestamptz default now(),
  unique (incident_id, user_id)
);

-- 9. Botón de pánico
create table panic_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  location geography(Point, 4326) not null,
  zone_id uuid references zones(id),
  status panic_status default 'activo',
  attended_by uuid references profiles(id),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- 10. Notificaciones
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  message text,
  related_incident_id uuid references incidents(id),
  is_read boolean default false,
  created_at timestamptz default now()
);

-- 11. Configuración de SLA
create table sla_config (
  id uuid primary key default gen_random_uuid(),
  incident_type incident_type not null,
  priority incident_priority not null,
  max_minutes integer not null,
  escalate_to_role user_role default 'admin',
  unique (incident_type, priority)
);

insert into sla_config (incident_type, priority, max_minutes, escalate_to_role) values
  ('seguridad', 'critical', 60, 'admin'),
  ('seguridad', 'high', 240, 'admin'),
  ('seguridad', 'medium', 480, 'admin'),
  ('seguridad', 'low', 1440, 'admin'),
  ('equipo', 'critical', 60, 'admin'),
  ('equipo', 'high', 240, 'admin'),
  ('equipo', 'medium', 480, 'admin'),
  ('equipo', 'low', 1440, 'admin')
on conflict (incident_type, priority) do nothing;

-- 12. Row Level Security
alter table profiles enable row level security;
alter table incidents enable row level security;
alter table equipment enable row level security;
alter table panic_alerts enable row level security;
alter table notifications enable row level security;

-- Helper SECURITY DEFINER para chequear roles sin recursión
create or replace function public.current_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Trigger: fila en profiles al crear usuario en Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1),
      'Usuario'
    ),
    'usuario',
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
exception when unique_violation then
  return new;
end;
$$;

drop trigger if exists on_auth_created on auth.users;
create trigger on_auth_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Políticas ---
drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_select_admin" on profiles;
drop policy if exists "profiles_select_authenticated" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_select_admin" on profiles for select using (public.current_role() = 'admin');
create policy "profiles_select_authenticated" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

drop policy if exists "incidents_select_own" on incidents;
drop policy if exists "incidents_select_seguridad" on incidents;
drop policy if exists "incidents_select_ti" on incidents;
drop policy if exists "incidents_select_admin" on incidents;
drop policy if exists "incidents_insert_authenticated" on incidents;
drop policy if exists "incidents_update_staff" on incidents;
create policy "incidents_select_own" on incidents for select using (reported_by = auth.uid());
create policy "incidents_select_seguridad" on incidents for select using (type = 'seguridad' and public.current_role() = 'seguridad');
create policy "incidents_select_ti" on incidents for select using (type = 'equipo' and public.current_role() = 'ti');
create policy "incidents_select_admin" on incidents for select using (public.current_role() = 'admin');
create policy "incidents_insert_authenticated" on incidents for insert with check (auth.uid() = reported_by);
create policy "incidents_update_staff" on incidents for update using (public.current_role() in ('admin', 'seguridad', 'ti'));

drop policy if exists "zones_select_authenticated" on zones;
create policy "zones_select_authenticated" on zones for select using (auth.role() = 'authenticated');

drop policy if exists "equipment_select_authenticated" on equipment;
drop policy if exists "equipment_insert_authenticated" on equipment;
drop policy if exists "equipment_update_authenticated" on equipment;
drop policy if exists "equipment_delete_authenticated" on equipment;
create policy "equipment_select_authenticated" on equipment for select using (auth.role() = 'authenticated');
create policy "equipment_insert_authenticated" on equipment for insert with check (auth.role() = 'authenticated');
create policy "equipment_update_authenticated" on equipment for update using (auth.role() = 'authenticated');
create policy "equipment_delete_authenticated" on equipment for delete using (auth.role() = 'authenticated');

drop policy if exists "notifications_select_own" on notifications;
drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_select_own" on notifications for select using (user_id = auth.uid());
create policy "notifications_update_own" on notifications for update using (user_id = auth.uid());

drop policy if exists "panic_select_staff" on panic_alerts;
drop policy if exists "panic_insert_own" on panic_alerts;
drop policy if exists "panic_update_staff" on panic_alerts;
create policy "panic_select_staff" on panic_alerts for select using (public.current_role() in ('admin', 'seguridad'));
create policy "panic_insert_own" on panic_alerts for insert with check (auth.uid() = user_id);
create policy "panic_update_staff" on panic_alerts for update using (public.current_role() in ('admin', 'seguridad'));

-- 13. Realtime — publicar tablas para postgres_changes
do $$ begin
  alter publication supabase_realtime add table public.incidents;
exception when others then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.equipment;
exception when others then null;
end $$;