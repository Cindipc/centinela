# Centinela

Centinela es una plataforma multiuniversidad para reportar, verificar y dar seguimiento a incidencias de seguridad y de equipo. El panel web funciona por universidad, con roles, licencias, auditoría y un asistente de IA opcional.

## Arquitectura

- **Frontend:** Vue 3 + TypeScript + Vite + Pinia + Mapbox GL.
- **Datos y auth:** Supabase (PostgreSQL, PostGIS, Auth, Realtime, Storage y Edge Functions).
- **Capa de datos del frontend:** TypeScript en `backend/api`, `backend/types`, `backend/config` y `backend/utils`; se importa con el alias `@backend`. No es un servidor Node separado.
- **IA:** servicio Python/FastAPI en `backend/ai_service`, con Ollama opcional, reglas de respaldo, scikit-learn y RPC de PostGIS.
- **Superadmin:** rol global (`profiles.organization_id = null`) que administra universidades, licencias y auditoría.

## Estructura

```text
backend/                 APIs TypeScript compartidas y servicio de IA
database/
  schema.sql             esquema base
  migrations/            001, 002 y 003 (multiuniversidad)
frontend/                panel Vue 3
supabase/functions/      Edge Function create-user
```

## Requisitos

- Node.js 20+ y npm.
- Proyecto de Supabase con PostGIS.
- Python 3.12+ si se usará el servicio de IA.
- Ollama opcional para clasificación con un modelo local.

## 1. Base de datos

En el SQL Editor de Supabase ejecuta, en este orden:

1. `database/schema.sql`
2. `database/migrations/001_fix_rls_recursion.sql`
3. `database/migrations/002_roles_rbac.sql`
4. `database/migrations/003_multi_tenant_licenses_audit.sql`

La migración 003 crea la universidad inicial UTP, asigna los datos existentes y habilita RLS por organización. No la ejecutes sobre una base que ya la tenga aplicada sin revisar antes su idempotencia.

### Primer superadmin

1. Crea el usuario desde **Supabase → Authentication**.
2. Asígnale el rol global:

```sql
update public.profiles
set role = 'superadmin', organization_id = null
where id = '<UUID_DEL_USUARIO>';
```

Después, ese usuario puede crear universidades y licencias desde `/superadmin`.

## 2. Frontend

```bash
cd frontend
npm install
```

Copia `frontend/.env.example` a `frontend/.env` y completa:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_MAPBOX_TOKEN=pk...
VITE_AI_API_URL=http://127.0.0.1:8001
```

`VITE_AI_API_URL` es opcional: si está vacía, la interfaz oculta el asistente de IA. Restringe el token de Mapbox por dominio en su panel.

```bash
npm run dev
npm run typecheck
npm run build
```

## 3. Edge Function create-user

La creación de cuentas pasa por la función `create-user`, que valida al administrador, su universidad y la licencia. El service role nunca llega al navegador.

Configura los secretos y despliega:

```bash
supabase secrets set SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
supabase functions deploy create-user
```

También se acepta `SUPABASE_SECRET_KEY` para proyectos con claves nuevas. Revisa `supabase/functions/.env.example`.

## 4. Servicio de IA opcional

```bash
cd backend/ai_service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

En Linux/macOS usa `source .venv/bin/activate` y `cp .env.example .env`.

Configura en `backend/ai_service/.env`:

- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
- `SUPABASE_JWT_SECRET` (HS256) o `SUPABASE_JWKS_URL` (claves asimétricas).
- `OLLAMA_URL` y `OLLAMA_MODEL`; opcionalmente `OLLAMA_VISION_MODEL`.
- `CORS_ORIGINS` con la URL del frontend.

Endpoints: `POST /ai/suggest`, `/ai/duplicates`, `/ai/patterns`, `/ai/hotspots` y `/ai/image`, además de `GET /health`. Si Ollama no está disponible, se usan reglas locales para clasificación; la IA nunca cierra ni modifica incidencias automáticamente.

Pruebas:

```bash
cd backend/ai_service
python -m pytest -q
```

## Seguridad

- RLS filtra todas las operaciones por `organization_id`; el frontend no decide la universidad.
- Los administradores solo gestionan su universidad. El rol `superadmin` se asigna manualmente en la base de datos.
- Licencias vencidas o suspendidas bloquean nuevas operaciones sin borrar el historial.
- El archivo `.env` de la raíz y los `.env` locales están fuera de Git. No compartas claves; rota cualquier secreto que se haya expuesto.
- En producción, publica el servicio de IA detrás de HTTPS y limita su CORS. No lo expongas directamente a Internet sin autenticación.
