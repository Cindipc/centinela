-- =========================================================
-- CENTINELA — MIGRACIÓN 001
-- Arregla la recursión infinita de RLS en "profiles" y agrega
-- las políticas faltantes para que la página web funcione.
-- Ejecutar en Supabase → SQL Editor (pegar y Run).
-- =========================================================

-- ---------------------------------------------------------
-- 0. Extensiones requeridas (idempotente: no falla si ya existen)
-- ---------------------------------------------------------
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- 1. Helper que rompe la recursión (SECURITY DEFINER).
--    Devuelve el rol del usuario autenticado sin re-trigger de RLS.
-- ---------------------------------------------------------
create or replace function public.current_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------
-- 2. profiles — reescribir políticas (sin recursión)
-- ---------------------------------------------------------
drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_select_admin" on profiles;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_select_admin" on profiles
  for select using (public.current_role() = 'admin');

-- Directorio público: cualquier usuario autenticado puede ver
-- id/nombre/rol de los demás (se usa para joins de reporteros/asignados).
drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated" on profiles
  for select using (auth.role() = 'authenticated');

-- Permite crear el propio perfil (respaldado por el trigger de signup).
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

-- ---------------------------------------------------------
-- 3. incidents — reescribir políticas (sin recursión)
-- ---------------------------------------------------------
drop policy if exists "incidents_select_own" on incidents;
drop policy if exists "incidents_select_seguridad" on incidents;
drop policy if exists "incidents_select_ti" on incidents;
drop policy if exists "incidents_select_admin" on incidents;
drop policy if exists "incidents_insert_authenticated" on incidents;

create policy "incidents_select_own" on incidents
  for select using (reported_by = auth.uid());

create policy "incidents_select_seguridad" on incidents
  for select using (
    type = 'seguridad' and public.current_role() = 'seguridad'
  );

create policy "incidents_select_ti" on incidents
  for select using (
    type = 'equipo' and public.current_role() = 'ti'
  );

create policy "incidents_select_admin" on incidents
  for select using (public.current_role() = 'admin');

create policy "incidents_insert_authenticated" on incidents
  for insert with check (auth.uid() = reported_by);

-- Staff puede cambiar estado / reasignar / resolver
drop policy if exists "incidents_update_staff" on incidents;
create policy "incidents_update_staff" on incidents
  for update using (public.current_role() in ('admin', 'seguridad', 'ti'));

-- ---------------------------------------------------------
-- 4. zones — lectura para el frontend
-- ---------------------------------------------------------
drop policy if exists "zones_select_authenticated" on zones;
create policy "zones_select_authenticated" on zones
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------
-- 5. equipment — inventario (CRUD completo)
-- ---------------------------------------------------------
drop policy if exists "equipment_select_authenticated" on equipment;
drop policy if exists "equipment_insert_authenticated" on equipment;
drop policy if exists "equipment_update_authenticated" on equipment;
drop policy if exists "equipment_delete_authenticated" on equipment;

create policy "equipment_select_authenticated" on equipment
  for select using (auth.role() = 'authenticated');

create policy "equipment_insert_authenticated" on equipment
  for insert with check (auth.role() = 'authenticated');

create policy "equipment_update_authenticated" on equipment
  for update using (auth.role() = 'authenticated');

create policy "equipment_delete_authenticated" on equipment
  for delete using (auth.role() = 'authenticated');

-- ---------------------------------------------------------
-- 6. notifications — marcar como leídas
-- ---------------------------------------------------------
drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications
  for update using (user_id = auth.uid());

-- ---------------------------------------------------------
-- 7. panic_alerts — visibilidad de staff + pánico del usuario
-- ---------------------------------------------------------
drop policy if exists "panic_select_staff" on panic_alerts;
drop policy if exists "panic_insert_own" on panic_alerts;
drop policy if exists "panic_update_staff" on panic_alerts;

create policy "panic_select_staff" on panic_alerts
  for select using (public.current_role() in ('admin', 'seguridad'));

create policy "panic_insert_own" on panic_alerts
  for insert with check (auth.uid() = user_id);

create policy "panic_update_staff" on panic_alerts
  for update using (public.current_role() in ('admin', 'seguridad'));

-- ---------------------------------------------------------
-- 8. Trigger: al crear un usuarioen Auth se crea su fila en profiles
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- 9. Realtime — publicar tablas para postgres_changes
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- 9b. Columnas y claves foráneas que usa la web (defensivo:
--     solo agrega lo que falte, no toca lo existente)
-- ---------------------------------------------------------
alter table public.incidents add column if not exists photo_url text;
alter table public.incidents add column if not exists equipment_id uuid;
alter table public.incidents add column if not exists assigned_to uuid;
alter table public.incidents add column if not exists resolution_note text;
alter table public.incidents add column if not exists resolved_at timestamptz;
alter table public.incidents add column if not exists updated_at timestamptz default now();

alter table public.equipment add column if not exists assigned_to uuid;
alter table public.equipment add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_reported_by_fkey' and conrelid = 'public.incidents'::regclass) then
    alter table public.incidents add constraint incidents_reported_by_fkey
      foreign key (reported_by) references public.profiles(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_assigned_to_fkey' and conrelid = 'public.incidents'::regclass) then
    alter table public.incidents add constraint incidents_assigned_to_fkey
      foreign key (assigned_to) references public.profiles(id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipment_assigned_to_fkey' and conrelid = 'public.equipment'::regclass) then
    alter table public.equipment add constraint equipment_assigned_to_fkey
      foreign key (assigned_to) references public.profiles(id);
  end if;
end $$;

-- ---------------------------------------------------------
-- 10. Seed — zonas del campus (solo si la tabla está vacía)
-- ---------------------------------------------------------
do $$
begin
  if (select count(*) from public.zones) = 0 then
    insert into public.zones (id, name, building, location) values
      ('00000000-0000-4000-a000-000000000001', 'Acceso Norte', 'Garita 1',          st_setsrid(st_makepoint(-12.112, -77.028), 4326)::geography),
      ('00000000-0000-4000-a000-000000000002', 'Laboratorio B', 'Edificio B',       st_setsrid(st_makepoint(-12.115, -77.032), 4326)::geography),
      ('00000000-0000-4000-a000-000000000003', 'Estacionamiento P1', 'Nivel 1',     st_setsrid(st_makepoint(-12.110, -77.030), 4326)::geography),
      ('00000000-0000-4000-a000-000000000004', 'Perímetro Oeste', 'Cerca perimetral', st_setsrid(st_makepoint(-12.118, -77.026), 4326)::geography),
      ('00000000-0000-4000-a000-000000000005', 'Biblioteca', 'Edificio C',          st_setsrid(st_makepoint(-12.114, -77.029), 4326)::geography);
  end if;
end $$;

-- ---------------------------------------------------------
-- 11. Seed — equipos de ejemplo (solo si la tabla está vacía)
-- ---------------------------------------------------------
do $$
begin
  if (select count(*) from public.equipment) = 0 then
    insert into public.equipment (id, name, category, serial_number, zone_id, status) values
      ('00000000-0000-4000-b000-000000000001', 'Laptop Dell Latitude 5540', 'computo', 'DL-5540-001', '00000000-0000-4000-a000-000000000002', 'operativo'),
      ('00000000-0000-4000-b000-000000000002', 'Switch red Edif. A', 'red', 'SW-A1-088', '00000000-0000-4000-a000-000000000001', 'operativo'),
      ('00000000-0000-4000-b000-000000000003', 'Proyector Epson Sala C', 'av', 'EP-C3-211', '00000000-0000-4000-a000-000000000005', 'con_falla'),
      ('00000000-0000-4000-b000-000000000004', 'Cámara CCTV garita 3', 'cctv', 'CAM-G3-015', '00000000-0000-4000-a000-000000000001', 'caido'),
      ('00000000-0000-4000-b000-000000000005', 'UPS Laboratorio B', 'energia', 'UPS-B2-077', '00000000-0000-4000-a000-000000000002', 'en_reparacion');
  end if;
end $$;

-- ---------------------------------------------------------
-- 12. Seed — incidencias de ejemplo (solo si la tabla está vacía)
-- ---------------------------------------------------------
-- Usuario "Sistema" (perfil creado automáticamente por el trigger
-- on_auth_created). Las incidencias de ejemplo lo usan como
-- reportero/asignado para cumplir las FK.
-- Credenciales: sistema@centinela.local / Sistema*2026
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
select
  '00000000-0000-4000-e000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'sistema@centinela.local',
  crypt('Sistema*2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Sistema"}',
  now(), now(), '', '', ''
where not exists (select 1 from auth.users where email = 'sistema@centinela.local');

do $$
begin
  if (select count(*) from public.incidents) = 0 then
    insert into public.incidents (id, code, type, category, title, description, zone_id, priority, status, reported_by, assigned_to, created_at) values
      ('00000000-0000-4000-c000-000000000001', 'SEC-0001', 'seguridad', 'persona sospechosa', 'Intento de ingreso sin credencial', 'Persona intentó cruzar la garita 3 sin acreditación.', '00000000-0000-4000-a000-000000000001', 'high', 'en_proceso', '00000000-0000-4000-e000-000000000001', '00000000-0000-4000-e000-000000000001', now() - interval '6 hours'),
      ('00000000-0000-4000-c000-000000000002', 'TIC-0001', 'equipo', 'laptop danada', 'Laptop con pantalla rota', 'Reporte de laptop Dell con daño de pantalla en Laboratorio B.', '00000000-0000-4000-a000-000000000002', 'medium', 'pendiente', '00000000-0000-4000-e000-000000000001', '00000000-0000-4000-e000-000000000001', now() - interval '2 hours'),
      ('00000000-0000-4000-c000-000000000003', 'SEC-0002', 'seguridad', 'vidrio roto', 'Vidrio roto en estacionamiento P1', 'Vehículo con vidrio trasero roto en nivel 1.', '00000000-0000-4000-a000-000000000003', 'critical', 'pendiente', '00000000-0000-4000-e000-000000000001', '00000000-0000-4000-e000-000000000001', now() - interval '1 hours');
  end if;
end $$;


   -- ---------------------------------------------------------
-- 13. (OPCIONAL) Usuario admin de prueba.
--     Descomenta si quieres poder iniciar sesión de inmediato.
--     Credenciales: admin@centinela.local / Admin*2026
-- ---------------------------------------------------------
-- insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
-- select
--   '00000000-0000-4000-b000-000000000009',
--   '00000000-0000-0000-0000-000000000000',
--   'authenticated', 'authenticated',
--   'admin@centinela.local',
--   crypt('Admin*2026', gen_salt('bf')),
--   now(),
--   '{"provider":"email","providers":["email"]}',
--   '{"full_name":"Admin Centinela"}',
--   now(), now(), '', '', ''
-- where not exists (select 1 from auth.users where email = 'admin@centinela.local');
--
-- insert into public.profiles (id, full_name, role)
-- select id, 'Admin Centinela', 'admin'
-- from auth.users where email = 'admin@centinela.local'
-- on conflict (id) do update set role = 'admin';
--
-- insert into public.notifications (user_id, title, message, related_incident_id, is_read)
-- select '00000000-0000-4000-b000-000000000009', 'Incidencia crítica nueva',
--        'Vidrio roto en estacionamiento P1.',
--        '00000000-0000-4000-c000-000000000003', false
-- where exists (select 1 from public.profiles where id = '00000000-0000-4000-b000-000000000009')
--   and not exists (select 1 from public.notifications where related_incident_id = '00000000-0000-4000-c000-000000000003');

-- ---------------------------------------------------------
-- 14. Arreglar el 500 "Database error querying schema" en login.
--     Causa: insertar usuarios directamente en auth.users deja
--     columnas en NULL donde GoTrue espera un string vacío.
--     (Error documentado oficial). Idempotente.
-- ---------------------------------------------------------
update auth.users
set confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change               = coalesce(email_change, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    phone_change               = coalesce(phone_change, ''),
    reauthentication_token     = coalesce(reauthentication_token, '')
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null
   or email_change_token_current is null
   or phone_change_token is null
   or phone_change is null
   or reauthentication_token is null;