-- =========================================================
-- CENTINELA — MIGRACIÓN 002
-- Roles: RLS de emergency_contacts y departments, bucket de fotos
-- de incidencias y política de feed para el rol "usuario".
-- Ejecutar en Supabase → SQL Editor (pegar y Run). Es idempotente.
-- =========================================================

-- ---------------------------------------------------------
-- 1. emergency_contacts — cada usuario ve y edita solo los suyos.
--    Antes de esto la tabla no tenía RLS: cualquier usuario
--    autenticado podía leer el teléfono de todos los contactos.
-- ---------------------------------------------------------
alter table public.emergency_contacts enable row level security;

drop policy if exists "contacts_select_own" on public.emergency_contacts;
drop policy if exists "contacts_insert_own" on public.emergency_contacts;
drop policy if exists "contacts_update_own" on public.emergency_contacts;
drop policy if exists "contacts_delete_own" on public.emergency_contacts;

create policy "contacts_select_own" on public.emergency_contacts
  for select using (user_id = auth.uid());

create policy "contacts_insert_own" on public.emergency_contacts
  for insert with check (user_id = auth.uid());

create policy "contacts_update_own" on public.emergency_contacts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "contacts_delete_own" on public.emergency_contacts
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------
-- 2. departments — lectura para la web (formulario de alta
--    de usuarios y filtros por zona).
-- ---------------------------------------------------------
alter table public.departments enable row level security;

drop policy if exists "departments_select_authenticated" on public.departments;
create policy "departments_select_authenticated" on public.departments
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------
-- 3. Storage — bucket público para las fotos de las incidencias.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('incidents', 'incidents', true)
on conflict (id) do update set public = true;

drop policy if exists "incident_photos_insert" on storage.objects;
drop policy if exists "incident_photos_read" on storage.objects;

create policy "incident_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'incidents');

create policy "incident_photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'incidents');

-- ---------------------------------------------------------
-- 4. Feed del rol "usuario".
--    Con las políticas actuales el rol "usuario" solo lee sus
--    propios reportes (incidents_select_own), por lo que la vista
--    Inicio no mostraría incidencias ajenas. Descomenta este
--    bloque si quieres que cualquier empleado vea el feed de
--    incidencias del campus en modo solo lectura.
-- ---------------------------------------------------------
-- drop policy if exists "incidents_select_feed_usuario" on public.incidents;
-- create policy "incidents_select_feed_usuario" on public.incidents
--   for select using (public.current_role() = 'usuario');

-- ---------------------------------------------------------
-- 5. Registro cerrado: nadie puede crear su propia cuenta desde
--    el cliente. Las altas las hace la Edge Function "create-user"
--    con el service role (que ignora RLS).
--    Este bloque es una red de seguridad para installs antiguas
--    que tengan "Sign up" habilitado en Supabase Auth.
-- ---------------------------------------------------------
-- update auth.settings
--    set enable_signup = false
--  where (select count(*) from auth.users) > 0;

-- ---------------------------------------------------------
-- 6. Comprobación: el primer admin debe existir antes de usar
--    la Edge Function. Crea el usuario en Supabase → Authentication
--    y ejecuta esto con su id:
--    update public.profiles set role = 'admin' where id = '<UUID>';
-- ---------------------------------------------------------