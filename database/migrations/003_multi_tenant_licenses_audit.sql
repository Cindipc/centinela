-- =========================================================
-- CENTINELA — MIGRACIÓN 003
-- Multiuniversidad (multi-tenant), licencias, auditoría, RLS por
-- organización, coherencia de relaciones y funciones PostGIS para IA.
--
-- Ejecutar DESPUÉS de:
--   database/schema.sql
--   database/migrations/001_fix_rls_recursion.sql
--   database/migrations/002_roles_rbac.sql
--   (y del seed incluido en 001)
--
-- Es idempotente en lo posible. NO elimina datos: asigna todo lo
-- existente a la universidad inicial (UTP). No agrega NOT NULL a
-- profiles.organization_id porque el superadmin es global.
-- =========================================================

-- ---------------------------------------------------------
-- 0. Rol superadmin
--    Se compara siempre con role::text para poder usar el valor
--    nuevo dentro de la misma transacción de la migración.
-- ---------------------------------------------------------
alter type public.user_role add value if not exists 'superadmin';

-- ---------------------------------------------------------
-- 1. Tablas nuevas
-- ---------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  address text,
  center_lat double precision,
  center_lng double precision,
  status text not null default 'activa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_status_check check (status in ('activa', 'suspendida')),
  constraint organizations_center_check check (
    (center_lat is null and center_lng is null)
    or (center_lat between -90 and 90 and center_lng between -180 and 180)
  )
);

alter table public.organizations add column if not exists slug text;
alter table public.organizations add column if not exists center_lat double precision;
alter table public.organizations add column if not exists center_lng double precision;
alter table public.organizations add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_organizations_slug
  on public.organizations(slug) where slug is not null;

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan text not null default 'basico',
  status text not null default 'activa',
  start_date date not null default current_date,
  end_date date not null,
  max_users integer not null default 100,
  max_zones integer not null default 20,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint licenses_status_check check (status in ('activa', 'vencida', 'suspendida', 'pendiente')),
  constraint licenses_dates_check check (end_date >= start_date),
  constraint licenses_limits_check check (max_users > 0 and max_zones > 0)
);

alter table public.licenses add column if not exists notes text;
alter table public.licenses add column if not exists updated_at timestamptz not null default now();

-- Si una versión previa creó estas restricciones con otros nombres/valores,
-- se normalizan aquí (sin tocar filas).
alter table public.licenses drop constraint if exists licenses_status_check;
alter table public.licenses add constraint licenses_status_check
  check (status in ('activa', 'vencida', 'suspendida', 'pendiente'));
alter table public.licenses drop constraint if exists licenses_dates_check;
alter table public.licenses add constraint licenses_dates_check check (end_date >= start_date);
alter table public.licenses drop constraint if exists licenses_limits_check;
alter table public.licenses add constraint licenses_limits_check check (max_users > 0 and max_zones > 0);

create index if not exists idx_licenses_org_end
  on public.licenses(organization_id, end_date desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- Compatibilidad con el script preliminar que usaba record_id uuid.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs'
      and column_name = 'record_id' and data_type = 'uuid'
  ) then
    alter table public.audit_logs
      alter column record_id type text using record_id::text;
  end if;
end $$;

create index if not exists idx_audit_org_date
  on public.audit_logs(organization_id, created_at desc);
create index if not exists idx_audit_user_date
  on public.audit_logs(user_id, created_at desc);
create index if not exists idx_audit_table_date
  on public.audit_logs(table_name, created_at desc);

-- FK de auditoría: el log sobrevive si se elimina el perfil (queda user_id null).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_user_id_fkey'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete set null not valid;
  end if;
end $$;

-- ---------------------------------------------------------
-- 2. Universidad inicial (UTP) y licencia inicial
--    Los datos existentes se asignan a esta universidad.
-- ---------------------------------------------------------
insert into public.organizations (id, name, slug, address, center_lat, center_lng)
values (
  '00000000-0000-4000-d000-000000000001',
  'Universidad Tecnológica del Poniente',
  'utp',
  'Calle 29 s/n, Col. Tres Cruces, Maxcanú, Yucatán, 97800',
  20.5873,
  -90.0036
)
on conflict (id) do update set
  name = excluded.name,
  slug = coalesce(public.organizations.slug, excluded.slug),
  address = coalesce(public.organizations.address, excluded.address),
  center_lat = coalesce(public.organizations.center_lat, excluded.center_lat),
  center_lng = coalesce(public.organizations.center_lng, excluded.center_lng);

insert into public.licenses (organization_id, plan, status, start_date, end_date, max_users, max_zones)
select
  '00000000-0000-4000-d000-000000000001',
  'institucional',
  'activa',
  current_date,
  current_date + 365,
  500,
  50
where not exists (
  select 1 from public.licenses
  where organization_id = '00000000-0000-4000-d000-000000000001'
);

-- ---------------------------------------------------------
-- 3. organization_id en tablas institucionales + backfill
-- ---------------------------------------------------------
do $$
declare
  t text;
  v_default_org constant uuid := '00000000-0000-4000-d000-000000000001';
begin
  foreach t in array array[
    'profiles', 'departments', 'zones', 'equipment', 'incidents',
    'panic_alerts', 'notifications', 'emergency_contacts',
    'incident_verifications', 'sla_config'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists organization_id uuid',
      t
    );
    if t = 'profiles' then
      -- No tocar a un superadmin global que ya exista.
      execute format(
        'update public.%I set organization_id = %L where organization_id is null and role::text <> ''superadmin''',
        t, v_default_org
      );
    else
      execute format(
        'update public.%I set organization_id = %L where organization_id is null',
        t, v_default_org
      );
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = t || '_organization_id_fkey'
        and conrelid = format('public.%I', t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organization_id) references public.organizations(id) on delete cascade',
        t, t || '_organization_id_fkey'
      );
    end if;

    execute format(
      'create index if not exists %I on public.%I(organization_id)',
      'idx_' || t || '_org', t
    );

    -- profiles queda nullable: el superadmin no pertenece a una universidad.
    if t <> 'profiles' then
      execute format(
        'alter table public.%I alter column organization_id set not null',
        t
      );
    end if;
  end loop;
end $$;

-- Un perfil que no sea superadmin siempre debe tener universidad.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_org_required'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_org_required
      check (organization_id is not null or role::text = 'superadmin');
  end if;
end $$;

-- ---------------------------------------------------------
-- 4. Unicidad por universidad (no global)
-- ---------------------------------------------------------
alter table public.incidents drop constraint if exists incidents_code_key;
alter table public.incidents drop constraint if exists incidents_org_code_key;
alter table public.incidents
  add constraint incidents_org_code_key unique (organization_id, code);

alter table public.equipment drop constraint if exists equipment_serial_number_key;
drop index if exists public.uq_equipment_org_serial;
create unique index uq_equipment_org_serial
  on public.equipment(organization_id, serial_number)
  where serial_number is not null;

alter table public.sla_config drop constraint if exists sla_config_incident_type_priority_key;
alter table public.sla_config drop constraint if exists sla_config_org_type_priority_key;
alter table public.sla_config
  add constraint sla_config_org_type_priority_key
  unique (organization_id, incident_type, priority);

create unique index if not exists uq_zones_org_name
  on public.zones(organization_id, name);
create unique index if not exists uq_departments_org_name
  on public.departments(organization_id, name);

-- ---------------------------------------------------------
-- 5. Funciones auxiliares seguras (SECURITY DEFINER)
-- ---------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role::text = 'superadmin' from public.profiles where id = auth.uid()),
    false
  )
$$;

create or replace function public.license_is_active(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.licenses l
    join public.organizations o on o.id = l.organization_id
    where l.organization_id = p_org
      and l.status = 'activa'
      and l.start_date <= current_date
      and l.end_date >= current_date
      and o.status = 'activa'
  )
$$;

create or replace function public.effective_license_status(
  p_status text,
  p_start_date date,
  p_end_date date
)
returns text
language sql
stable
as $$
  select case
    when p_status = 'suspendida' then 'suspendida'
    when p_status = 'pendiente' or p_start_date > current_date then 'pendiente'
    when p_status = 'vencida' or p_end_date < current_date then 'vencida'
    else 'activa'
  end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_licenses_updated_at on public.licenses;
create trigger trg_licenses_updated_at
  before update on public.licenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- 6. Autollenado de organización y coherencia de relaciones
-- ---------------------------------------------------------
create or replace function public.set_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_org_id();
  end if;
  return new;
end $$;

-- Comprueba que un registro referenciado pertenezca a la misma universidad.
create or replace function public.assert_same_org(
  p_table regclass,
  p_id uuid,
  p_org uuid,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  if p_id is null then
    return;
  end if;
  if p_org is null then
    raise exception 'La universidad es obligatoria para %', p_label;
  end if;

  execute format('select organization_id from %s where id = $1', p_table)
    into v_org using p_id;

  if v_org is null then
    raise exception '% no encontrado o sin universidad', p_label;
  end if;
  if v_org <> p_org then
    raise exception '% pertenece a otra universidad', p_label;
  end if;
end $$;

create or replace function public.validate_profile_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is null and new.role::text <> 'superadmin' then
    raise exception 'Todo usuario que no sea superadmin debe pertenecer a una universidad';
  end if;

  if new.department_id is not null then
    perform public.assert_same_org(
      'public.departments'::regclass, new.department_id,
      new.organization_id, 'El departamento'
    );
  end if;
  if new.zone_id is not null then
    perform public.assert_same_org(
      'public.zones'::regclass, new.zone_id,
      new.organization_id, 'La zona'
    );
  end if;
  return new;
end $$;

create or replace function public.validate_department_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.responsible_id is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.responsible_id,
      new.organization_id, 'El responsable'
    );
  end if;
  return new;
end $$;

create or replace function public.validate_zone_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.department_id is not null then
    perform public.assert_same_org(
      'public.departments'::regclass, new.department_id,
      new.organization_id, 'El departamento de la zona'
    );
  end if;
  return new;
end $$;

create or replace function public.validate_equipment_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.zone_id is not null then
    perform public.assert_same_org(
      'public.zones'::regclass, new.zone_id,
      new.organization_id, 'La zona del equipo'
    );
  end if;
  if new.assigned_to is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.assigned_to,
      new.organization_id, 'El usuario asignado'
    );
  end if;
  return new;
end $$;

create or replace function public.validate_incident_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.zone_id is not null then
    perform public.assert_same_org(
      'public.zones'::regclass, new.zone_id,
      new.organization_id, 'La zona de la incidencia'
    );
  end if;
  if new.equipment_id is not null then
    perform public.assert_same_org(
      'public.equipment'::regclass, new.equipment_id,
      new.organization_id, 'El equipo de la incidencia'
    );
  end if;
  if new.reported_by is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.reported_by,
      new.organization_id, 'El reportante'
    );
  end if;
  if new.assigned_to is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.assigned_to,
      new.organization_id, 'El usuario asignado'
    );
  end if;
  return new;
end $$;

create or replace function public.validate_panic_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.user_id,
      new.organization_id, 'El usuario de la alerta'
    );
  end if;
  if new.zone_id is not null then
    perform public.assert_same_org(
      'public.zones'::regclass, new.zone_id,
      new.organization_id, 'La zona de la alerta'
    );
  end if;
  if new.attended_by is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.attended_by,
      new.organization_id, 'El usuario que atiende'
    );
  end if;
  return new;
end $$;

create or replace function public.validate_notification_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.user_id,
      new.organization_id, 'El destinatario'
    );
  end if;
  if new.related_incident_id is not null then
    perform public.assert_same_org(
      'public.incidents'::regclass, new.related_incident_id,
      new.organization_id, 'La incidencia relacionada'
    );
  end if;
  return new;
end $$;

create or replace function public.validate_emergency_contact_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.user_id,
      new.organization_id, 'El dueño del contacto'
    );
  end if;
  return new;
end $$;

create or replace function public.validate_verification_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.incident_id is not null then
    perform public.assert_same_org(
      'public.incidents'::regclass, new.incident_id,
      new.organization_id, 'La incidencia verificada'
    );
  end if;
  if new.user_id is not null then
    perform public.assert_same_org(
      'public.profiles'::regclass, new.user_id,
      new.organization_id, 'El usuario que verifica'
    );
  end if;
  return new;
end $$;

-- ---------------------------------------------------------
-- 7. Licencias: bloqueo de nuevas operaciones y límites
-- ---------------------------------------------------------
create or replace function public.enforce_license_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text := coalesce(TG_ARGV[0], 'general');
  v_max int;
  v_count int;
begin
  if new.organization_id is null then
    return new; -- superadmin global
  end if;

  if not public.license_is_active(new.organization_id) then
    raise exception 'La universidad no tiene una licencia activa. No se permiten nuevas operaciones institucionales.';
  end if;

  if v_kind in ('users', 'zones') then
    select case when v_kind = 'users' then l.max_users else l.max_zones end
      into v_max
      from public.licenses l
     where l.organization_id = new.organization_id
       and l.status = 'activa'
       and l.start_date <= current_date
       and l.end_date >= current_date
     order by l.end_date desc
     limit 1;

    if v_max is null then
      raise exception 'La universidad no tiene una licencia activa.';
    end if;

    if v_kind = 'users' then
      select count(*) into v_count
        from public.profiles
       where organization_id = new.organization_id;
    else
      select count(*) into v_count
        from public.zones
       where organization_id = new.organization_id;
    end if;

    if v_count >= v_max then
      raise exception 'Límite de la licencia alcanzado (% de %).', v_count, v_max;
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------
-- 8. Anti-escalada y anti-cambio de universidad
-- ---------------------------------------------------------
create or replace function public.prevent_superadmin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role::text = 'superadmin'
     and auth.uid() is not null
     and not public.is_superadmin() then
    raise exception 'Solo un superadmin puede asignar el rol superadmin';
  end if;
  return new;
end $$;

create or replace function public.prevent_org_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     and auth.uid() is not null
     and not public.is_superadmin() then
    raise exception 'No puedes cambiar la universidad de un registro';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------
-- 9. Instalación idempotente de triggers
-- ---------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'departments', 'zones', 'equipment', 'incidents',
    'panic_alerts', 'notifications', 'emergency_contacts',
    'incident_verifications', 'sla_config'
  ]
  loop
    execute format('drop trigger if exists trg_01_set_org on public.%I', t);
    execute format('drop trigger if exists trg_10_set_org on public.%I', t);
    execute format('create trigger trg_10_set_org before insert on public.%I for each row execute function public.set_organization_id()', t);

    execute format('drop trigger if exists trg_02_license_limit on public.%I', t);
    execute format('drop trigger if exists trg_20_license_rules on public.%I', t);

    execute format('drop trigger if exists trg_90_prevent_org_change on public.%I', t);
    execute format('create trigger trg_90_prevent_org_change before update of organization_id on public.%I for each row execute function public.prevent_org_change()', t);
  end loop;

  -- Bloqueo de altas institucionales con licencia vencida/suspendida.
  foreach t in array array['profiles', 'departments', 'zones', 'equipment', 'incidents', 'sla_config']
  loop
    execute format('create trigger trg_20_license_rules before insert on public.%I for each row execute function public.enforce_license_rules(%L)', t, case when t = 'profiles' then 'users' when t = 'zones' then 'zones' else 'general' end);
  end loop;
end $$;

-- Validaciones de coherencia.
drop trigger if exists trg_30_validate_org on public.profiles;
create trigger trg_30_validate_org
  before insert or update of organization_id, role, department_id, zone_id on public.profiles
  for each row execute function public.validate_profile_org();

drop trigger if exists trg_30_validate_org on public.departments;
create trigger trg_30_validate_org
  before insert or update of organization_id, responsible_id on public.departments
  for each row execute function public.validate_department_org();

drop trigger if exists trg_30_validate_org on public.zones;
create trigger trg_30_validate_org
  before insert or update of organization_id, department_id on public.zones
  for each row execute function public.validate_zone_org();

drop trigger if exists trg_30_validate_org on public.equipment;
create trigger trg_30_validate_org
  before insert or update of organization_id, zone_id, assigned_to on public.equipment
  for each row execute function public.validate_equipment_org();

drop trigger if exists trg_30_validate_org on public.incidents;
create trigger trg_30_validate_org
  before insert or update of organization_id, zone_id, equipment_id, reported_by, assigned_to on public.incidents
  for each row execute function public.validate_incident_org();

drop trigger if exists trg_30_validate_org on public.panic_alerts;
create trigger trg_30_validate_org
  before insert or update of organization_id, user_id, zone_id, attended_by on public.panic_alerts
  for each row execute function public.validate_panic_org();

drop trigger if exists trg_30_validate_org on public.notifications;
create trigger trg_30_validate_org
  before insert or update of organization_id, user_id, related_incident_id on public.notifications
  for each row execute function public.validate_notification_org();

drop trigger if exists trg_30_validate_org on public.emergency_contacts;
create trigger trg_30_validate_org
  before insert or update of organization_id, user_id on public.emergency_contacts
  for each row execute function public.validate_emergency_contact_org();

drop trigger if exists trg_30_validate_org on public.incident_verifications;
create trigger trg_30_validate_org
  before insert or update of organization_id, incident_id, user_id on public.incident_verifications
  for each row execute function public.validate_verification_org();

drop trigger if exists trg_40_prevent_superadmin_escalation on public.profiles;
create trigger trg_40_prevent_superadmin_escalation
  before insert or update of role on public.profiles
  for each row execute function public.prevent_superadmin_escalation();

-- ---------------------------------------------------------
-- 10. Auditoría inmutable (INSERT solo vía trigger SECURITY DEFINER)
-- ---------------------------------------------------------
create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
  v_old jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_user uuid := auth.uid();
begin
  begin
    v_org := nullif(v_row ->> 'organization_id', '')::uuid;
  exception when invalid_text_representation then
    v_org := null;
  end;

  -- Evita violar la FK al borrar el propio perfil.
  if v_user is not null and not exists (select 1 from public.profiles where id = v_user) then
    v_user := null;
  end if;

  -- En organizations el registro ES la universidad.
  if v_org is null and TG_TABLE_NAME = 'organizations' then
    begin
      v_org := nullif(v_row ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      v_org := null;
    end;
  end if;

  insert into public.audit_logs (
    organization_id, user_id, action, table_name, record_id, old_data, new_data
  ) values (
    v_org,
    v_user,
    TG_OP,
    TG_TABLE_NAME,
    v_row ->> 'id',
    v_old,
    v_new
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'licenses', 'profiles', 'departments', 'zones',
    'equipment', 'incidents', 'incident_verifications', 'panic_alerts',
    'notifications', 'emergency_contacts', 'sla_config'
  ]
  loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.log_audit()', t);
  end loop;
end $$;

-- Validar la FK de auditoría una vez que profiles ya está migrado.
update public.audit_logs a
   set user_id = null
 where a.user_id is not null
   and not exists (select 1 from public.profiles p where p.id = a.user_id);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_user_id_fkey'
      and conrelid = 'public.audit_logs'::regclass
      and not convalidated
  ) then
    alter table public.audit_logs validate constraint audit_logs_user_id_fkey;
  end if;
end $$;

-- ---------------------------------------------------------
-- 11. Alta de usuario: la organización viene de app_metadata
--     (raw_app_meta_data no puede ser modificada por el cliente).
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, role, phone, organization_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Usuario'),
    'usuario',
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_app_meta_data ->> 'organization_id', '')::uuid
  );
  return new;
exception when unique_violation then
  return new;
end $$;

drop trigger if exists on_auth_created on auth.users;
create trigger on_auth_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- 12. RLS: activar y eliminar políticas antiguas/permisivas
-- ---------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'licenses', 'audit_logs', 'profiles', 'departments',
    'zones', 'equipment', 'incidents', 'incident_verifications',
    'panic_alerts', 'notifications', 'emergency_contacts', 'sla_config'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'organizations', 'licenses', 'audit_logs', 'profiles', 'departments',
        'zones', 'equipment', 'incidents', 'incident_verifications',
        'panic_alerts', 'notifications', 'emergency_contacts', 'sla_config'
      ])
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 12a. Superadmin.
create policy "organizations_select_superadmin" on public.organizations
  for select using (public.is_superadmin());
create policy "organizations_insert_superadmin" on public.organizations
  for insert with check (public.is_superadmin());
create policy "organizations_update_superadmin" on public.organizations
  for update using (public.is_superadmin()) with check (public.is_superadmin());

create policy "licenses_select_superadmin" on public.licenses
  for select using (public.is_superadmin());
create policy "licenses_insert_superadmin" on public.licenses
  for insert with check (public.is_superadmin());
create policy "licenses_update_superadmin" on public.licenses
  for update using (public.is_superadmin()) with check (public.is_superadmin());

create policy "audit_select_superadmin" on public.audit_logs
  for select using (public.is_superadmin());

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'departments', 'zones', 'equipment', 'incidents',
    'incident_verifications', 'panic_alerts', 'notifications',
    'emergency_contacts', 'sla_config'
  ]
  loop
    execute format(
      'create policy "%s_all_superadmin" on public.%I for all using (public.is_superadmin()) with check (public.is_superadmin())',
      t, t
    );
  end loop;
end $$;

-- 12b. Admin de universidad: todo dentro de su propia organización.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'departments', 'zones', 'equipment', 'incidents',
    'incident_verifications', 'panic_alerts', 'notifications', 'sla_config'
  ]
  loop
    execute format($p$
      create policy "%s_all_org_admin" on public.%I for all
        using (organization_id = public.current_org_id() and public.current_role()::text = 'admin')
        with check (organization_id = public.current_org_id() and public.current_role()::text = 'admin')
    $p$, t, t);
  end loop;
end $$;

-- 12c. Lectura institucional y permisos por rol.
create policy "organizations_select_own" on public.organizations
  for select using (id = public.current_org_id());

create policy "licenses_select_org_admin" on public.licenses
  for select using (
    organization_id = public.current_org_id()
    and public.current_role()::text = 'admin'
  );

create policy "audit_select_org_admin" on public.audit_logs
  for select using (
    organization_id = public.current_org_id()
    and public.current_role()::text = 'admin'
  );

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_select_org" on public.profiles
  for select using (organization_id = public.current_org_id());

create policy "departments_select_org" on public.departments
  for select using (organization_id = public.current_org_id());
create policy "zones_select_org" on public.zones
  for select using (organization_id = public.current_org_id());
create policy "sla_select_org" on public.sla_config
  for select using (organization_id = public.current_org_id());

create policy "equipment_select_org" on public.equipment
  for select using (organization_id = public.current_org_id());
create policy "equipment_all_ti" on public.equipment
  for all using (
    organization_id = public.current_org_id()
    and public.current_role()::text = 'ti'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role()::text = 'ti'
  );

create policy "incidents_select_own" on public.incidents
  for select using (reported_by = auth.uid());
create policy "incidents_select_seguridad" on public.incidents
  for select using (
    organization_id = public.current_org_id()
    and type = 'seguridad'
    and public.current_role()::text = 'seguridad'
  );
create policy "incidents_select_ti" on public.incidents
  for select using (
    organization_id = public.current_org_id()
    and type = 'equipo'
    and public.current_role()::text = 'ti'
  );
create policy "incidents_insert_authenticated" on public.incidents
  for insert with check (
    reported_by = auth.uid()
    and organization_id = public.current_org_id()
  );
create policy "incidents_update_staff" on public.incidents
  for update
  using (
    organization_id = public.current_org_id()
    and (
      (public.current_role()::text = 'seguridad' and type = 'seguridad')
      or (public.current_role()::text = 'ti' and type = 'equipo')
    )
  )
  with check (
    organization_id = public.current_org_id()
    and (
      (public.current_role()::text = 'seguridad' and type = 'seguridad')
      or (public.current_role()::text = 'ti' and type = 'equipo')
    )
  );

create policy "verif_select_org" on public.incident_verifications
  for select using (organization_id = public.current_org_id());
create policy "verif_insert_own" on public.incident_verifications
  for insert with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
  );

create policy "panic_select_own" on public.panic_alerts
  for select using (user_id = auth.uid());
create policy "panic_select_seguridad" on public.panic_alerts
  for select using (
    organization_id = public.current_org_id()
    and public.current_role()::text = 'seguridad'
  );
create policy "panic_insert_own" on public.panic_alerts
  for insert with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
  );
create policy "panic_update_seguridad" on public.panic_alerts
  for update using (
    organization_id = public.current_org_id()
    and public.current_role()::text = 'seguridad'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_role()::text = 'seguridad'
  );

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "contacts_all_own" on public.emergency_contacts
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------
-- 13. Storage: cada foto nueva se guarda bajo la carpeta de la organización.
--     El bucket sigue siendo público (lectura), pero la subida se aísla.
-- ---------------------------------------------------------
drop policy if exists "incident_photos_insert" on storage.objects;
drop policy if exists "incident_photos_read" on storage.objects;
drop policy if exists "incident_photos_insert_org" on storage.objects;

create policy "incident_photos_insert_org" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'incidents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "incident_photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'incidents');

-- ---------------------------------------------------------
-- 14. Funciones para backend/IA y paneles
-- ---------------------------------------------------------
create or replace function public.my_context()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'role', p.role,
    'organization_id', p.organization_id,
    'organization_name', o.name,
    'organization_status', o.status,
    'organization_center', case
      when o.center_lat is not null and o.center_lng is not null
        then jsonb_build_object('lat', o.center_lat, 'lng', o.center_lng)
      else null
    end,
    'license', (
      select jsonb_build_object(
        'id', l.id,
        'plan', l.plan,
        'status', public.effective_license_status(l.status, l.start_date, l.end_date),
        'start_date', l.start_date,
        'end_date', l.end_date,
        'max_users', l.max_users,
        'max_zones', l.max_zones
      )
      from public.licenses l
      where l.organization_id = p.organization_id
      order by l.end_date desc
      limit 1
    )
  )
  from public.profiles p
  left join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid()
$$;

create or replace function public.license_usage(p_org uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_org uuid := coalesce(p_org, public.current_org_id());
  v_license record;
begin
  if v_org is null then
    raise exception 'No hay universidad asociada al usuario';
  end if;
  if auth.uid() is not null and not public.is_superadmin() and v_org <> public.current_org_id() then
    raise exception 'No puedes consultar otra universidad';
  end if;

  select l.* into v_license
    from public.licenses l
   where l.organization_id = v_org
   order by l.end_date desc
   limit 1;

  return jsonb_build_object(
    'organization_id', v_org,
    'license_id', v_license.id,
    'plan', v_license.plan,
    'status', case
      when v_license.id is null then 'sin_licencia'
      else public.effective_license_status(v_license.status, v_license.start_date, v_license.end_date)
    end,
    'start_date', v_license.start_date,
    'end_date', v_license.end_date,
    'max_users', v_license.max_users,
    'max_zones', v_license.max_zones,
    'user_count', (select count(*) from public.profiles where organization_id = v_org),
    'zone_count', (select count(*) from public.zones where organization_id = v_org)
  );
end $$;

create or replace function public.platform_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() then
    raise exception 'Solo un superadmin puede consultar las estadísticas globales';
  end if;

  return jsonb_build_object(
    'organizations', (select count(*) from public.organizations),
    'organizations_active', (select count(*) from public.organizations where status = 'activa'),
    'licenses_active', (
      select count(distinct l.organization_id) from public.licenses l
      where public.effective_license_status(l.status, l.start_date, l.end_date) = 'activa'
    ),
    'licenses_expired', (
      select count(distinct l.organization_id) from public.licenses l
      where public.effective_license_status(l.status, l.start_date, l.end_date) = 'vencida'
    ),
    'licenses_suspended', (
      select count(distinct l.organization_id) from public.licenses l
      where public.effective_license_status(l.status, l.start_date, l.end_date) = 'suspendida'
    ),
    'licenses_pending', (
      select count(distinct l.organization_id) from public.licenses l
      where public.effective_license_status(l.status, l.start_date, l.end_date) = 'pendiente'
    ),
    'admins', (select count(*) from public.profiles where role::text = 'admin'),
    'users', (select count(*) from public.profiles where role::text = 'usuario'),
    'profiles', (select count(*) from public.profiles),
    'incidents', (select count(*) from public.incidents),
    'open_incidents', (
      select count(*) from public.incidents
      where status not in ('resuelto', 'falsa_alarma')
    ),
    'panic_alerts_active', (select count(*) from public.panic_alerts where status = 'activo'),
    'equipment', (select count(*) from public.equipment)
  );
end $$;

-- Código secuencial POR universidad. Evita que RLS haga contar solo las
-- incidencias propias del usuario y genera códigos legibles.
create or replace function public.next_incident_code(
  p_type text,
  p_org uuid default null
)
returns text
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  v_org uuid := coalesce(p_org, public.current_org_id());
  v_prefix text := case when p_type = 'equipo' then 'TIC' else 'SEC' end;
  v_next integer;
begin
  if p_type not in ('equipo', 'seguridad') then
    raise exception 'Tipo de incidencia inválido';
  end if;
  if v_org is null then
    raise exception 'No hay universidad asociada al usuario';
  end if;
  if auth.uid() is not null and not public.is_superadmin() and v_org <> public.current_org_id() then
    raise exception 'No puedes generar códigos para otra universidad';
  end if;

  -- Serializa la generación por universidad y tipo para evitar colisiones.
  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || v_prefix, 0));

  select coalesce(max((regexp_replace(code, '^[A-Z]+-', ''))::integer), 0) + 1
    into v_next
    from public.incidents
   where organization_id = v_org
     and code ~ ('^' || v_prefix || '-[0-9]+$');

  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end $$;

-- Incidencias dentro de un radio (PostGIS geography, metros reales).
create or replace function public.incidents_nearby(
  p_org uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 500,
  p_limit integer default 50
)
returns table (
  id uuid,
  code text,
  title text,
  type public.incident_type,
  priority public.incident_priority,
  status public.incident_status,
  zone_id uuid,
  zone_name text,
  created_at timestamptz,
  distance_m double precision
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() and p_org <> public.current_org_id() then
    raise exception 'No puedes consultar otra universidad';
  end if;

  return query
  select
    i.id, i.code, i.title, i.type, i.priority, i.status,
    i.zone_id, z.name,
    i.created_at,
    st_distance(
      i.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    ) as distance_m
  from public.incidents i
  left join public.zones z on z.id = i.zone_id
  where i.organization_id = p_org
    and i.location is not null
    and st_dwithin(
      i.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  order by distance_m
  limit greatest(1, least(p_limit, 500));
end $$;

-- Agrupación geográfica de incidencias (DBSCAN en metros, proyección 3857).
create or replace function public.incident_hotspots(
  p_org uuid,
  p_radius_m double precision default 250,
  p_min_points integer default 3,
  p_days integer default 30
)
returns table (
  cluster_id integer,
  incident_count integer,
  center_lat double precision,
  center_lng double precision,
  first_incident timestamptz,
  last_incident timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() and p_org <> public.current_org_id() then
    raise exception 'No puedes consultar otra universidad';
  end if;

  return query
  with points as (
    select
      i.id,
      i.created_at,
      st_transform(i.location::geometry, 3857) as geom
    from public.incidents i
    where i.organization_id = p_org
      and i.location is not null
      and i.status not in ('resuelto', 'falsa_alarma')
      and i.created_at >= now() - make_interval(days => greatest(1, p_days))
  ),
  clustered as (
    select
      p.*,
      st_clusterdbscan(p.geom, eps := p_radius_m, minpoints := greatest(2, p_min_points))
        over () as cid
    from points p
  )
  select
    c.cid::integer as cluster_id,
    count(*)::integer as incident_count,
    st_y(st_transform(st_centroid(st_collect(c.geom)), 4326)) as center_lat,
    st_x(st_transform(st_centroid(st_collect(c.geom)), 4326)) as center_lng,
    min(c.created_at) as first_incident,
    max(c.created_at) as last_incident
  from clustered c
  where c.cid is not null
  group by c.cid
  order by incident_count desc;
end $$;

-- Estadísticas por zona/edificio.
create or replace function public.zone_incident_stats(
  p_org uuid,
  p_days integer default 30
)
returns table (
  zone_id uuid,
  zone_name text,
  building text,
  total_incidents bigint,
  security_incidents bigint,
  equipment_incidents bigint,
  open_incidents bigint,
  last_incident timestamptz,
  latitude double precision,
  longitude double precision
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() and p_org <> public.current_org_id() then
    raise exception 'No puedes consultar otra universidad';
  end if;

  return query
  select
    z.id,
    z.name,
    z.building,
    count(i.id) as total_incidents,
    count(i.id) filter (where i.type = 'seguridad') as security_incidents,
    count(i.id) filter (where i.type = 'equipo') as equipment_incidents,
    count(i.id) filter (where i.status not in ('resuelto', 'falsa_alarma')) as open_incidents,
    max(i.created_at) as last_incident,
    st_y(z.location::geometry) as latitude,
    st_x(z.location::geometry) as longitude
  from public.zones z
  left join public.incidents i
    on i.zone_id = z.id
   and i.created_at >= now() - make_interval(days => greatest(1, p_days))
  where z.organization_id = p_org
  group by z.id, z.name, z.building, z.location
  order by total_incidents desc, z.name;
end $$;

-- Serie diaria para que Scikit-learn analice patrones por universidad.
create or replace function public.incident_daily_stats(
  p_org uuid,
  p_days integer default 180
)
returns table (
  day date,
  total bigint,
  security bigint,
  equipment bigint,
  critical bigint,
  resolved bigint
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() and p_org <> public.current_org_id() then
    raise exception 'No puedes consultar otra universidad';
  end if;

  return query
  select
    (i.created_at at time zone 'UTC')::date as day,
    count(*) as total,
    count(*) filter (where i.type = 'seguridad') as security,
    count(*) filter (where i.type = 'equipo') as equipment,
    count(*) filter (where i.priority = 'critical') as critical,
    count(*) filter (where i.status in ('resuelto', 'falsa_alarma')) as resolved
  from public.incidents i
  where i.organization_id = p_org
    and i.created_at >= now() - make_interval(days => greatest(1, p_days))
  group by 1
  order by 1;
end $$;

-- Permisos de ejecución: solo usuarios autenticados y service_role.
revoke all on function public.my_context() from public;
revoke all on function public.license_usage(uuid) from public;
revoke all on function public.platform_stats() from public;
revoke all on function public.next_incident_code(text, uuid) from public;
revoke all on function public.incidents_nearby(uuid, double precision, double precision, double precision, integer) from public;
revoke all on function public.incident_hotspots(uuid, double precision, integer, integer) from public;
revoke all on function public.zone_incident_stats(uuid, integer) from public;
revoke all on function public.incident_daily_stats(uuid, integer) from public;

grant execute on function public.my_context() to authenticated, service_role;
grant execute on function public.license_usage(uuid) to authenticated, service_role;
grant execute on function public.platform_stats() to authenticated, service_role;
grant execute on function public.next_incident_code(text, uuid) to authenticated, service_role;
grant execute on function public.incidents_nearby(uuid, double precision, double precision, double precision, integer) to authenticated, service_role;
grant execute on function public.incident_hotspots(uuid, double precision, integer, integer) to authenticated, service_role;
grant execute on function public.zone_incident_stats(uuid, integer) to authenticated, service_role;
grant execute on function public.incident_daily_stats(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------
-- 15. Corregir coordenadas del seed (estaban invertidas y en Lima).
--     La UTP está en Maxcanú, Yucatán. ST_MakePoint(longitud, latitud).
--     Si el administrador conoce coordenadas más precisas, puede mover
--     los puntos desde el mapa (modo "Editar zonas").
-- ---------------------------------------------------------
update public.zones
   set location = st_setsrid(st_makepoint(-90.0030, 20.5880), 4326)::geography
 where id = '00000000-0000-4000-a000-000000000001'; -- Acceso Norte
update public.zones
   set location = st_setsrid(st_makepoint(-90.0035, 20.5865), 4326)::geography
 where id = '00000000-0000-4000-a000-000000000002'; -- Laboratorio B
update public.zones
   set location = st_setsrid(st_makepoint(-90.0025, 20.5874), 4326)::geography
 where id = '00000000-0000-4000-a000-000000000003'; -- Estacionamiento P1
update public.zones
   set location = st_setsrid(st_makepoint(-90.0050, 20.5870), 4326)::geography
 where id = '00000000-0000-4000-a000-000000000004'; -- Perímetro Oeste
update public.zones
   set location = st_setsrid(st_makepoint(-90.0042, 20.5868), 4326)::geography
 where id = '00000000-0000-4000-a000-000000000005'; -- Biblioteca

-- ---------------------------------------------------------
-- 16. Realtime (idempotente)
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
do $$ begin
  alter publication supabase_realtime add table public.panic_alerts;
exception when others then null;
end $$;

-- ---------------------------------------------------------
-- 17. Primer superadmin (manual, no automatizado)
-- ---------------------------------------------------------
-- 1) Crea el usuario en Supabase → Authentication → Users.
-- 2) Ejecuta, reemplazando el UUID:
--    update public.profiles
--       set role = 'superadmin', organization_id = null
--     where id = '<UUID_DEL_SUPERADMIN>';
--
-- Nota: la licencia inicial de la UTP vence en 365 días. Renuévala desde
-- el panel de superadmin antes de esa fecha.
