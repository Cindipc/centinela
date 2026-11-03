# Centinela

Tu entorno, bajo control.

Centinela es una PWA para gestionar incidencias dentro de una institución (campus, oficinas, etc). Junta dos cosas que normalmente andan dispersas: reportes de seguridad (persona sospechosa, accidente, acceso no autorizado) y tickets de equipo/infraestructura (laptop dañada, red caída, proyector sin imagen). Todo pasa por el mismo flujo: se reporta, se verifica, se asigna a quien corresponde, y se le da seguimiento hasta resolverlo.

## Por qué

Hoy estos reportes se hacen por WhatsApp, correo o de boca en boca, sin verificación ni seguimiento real. Nadie sabe con certeza qué está pendiente ni quién lo está atendiendo.

## Roles

- **Usuario/empleado** — reporta incidencias, ve su historial, tiene botón de pánico
- **Seguridad** — atiende incidentes de seguridad
- **TI** — atiende tickets de equipo
- **Admin** — ve todo desde el panel web (dashboard, mapa, inventario)

## Stack

- Backend/BD: Supabase (PostgreSQL + PostGIS + Auth + Realtime + Storage)
- App móvil: Flutter
- Panel web: Vue 3 + TypeScript
- Mapas: Mapbox / Google Maps SDK
- Push: Firebase Cloud Messaging

## Estructura

```
centinela-web/    panel web (Vue 3 + TS)
centinela-app/    app móvil (Flutter)
database/         schema.sql para Supabase
```

### Frontend

Entra a la carpeta del frontend e instala las dependencias:

```bash
cd frontend

npm install
```

Dependencias principales utilizadas:

```bash
npm install vue-router@4 pinia
npm install mapbox-gl @types/mapbox-gl
npm install tailwindcss @tailwindcss/vite
```

Para iniciar el servidor de desarrollo:

```bash
npm run dev
```

### Backend

Abre otra terminal y entra a la carpeta del backend:

```bash
cd backend
```

Instala las dependencias:

```bash
npm install
```

Si estás configurando el backend desde cero:

```bash
npm init -y
npm install @supabase/supabase-js
npm install -D typescript
```

Para iniciar el backend, utiliza el script definido en `package.json`.

### Variables de entorno

Crea los archivos `.env` correspondientes a cada parte del proyecto y configura las credenciales necesarias para Supabase, Mapbox y los demás servicios utilizados.

No subas archivos `.env` al repositorio. Estos deben estar incluidos en `.gitignore`.

### Mapa del campus (Mapbox)

1. Crea una cuenta en [Mapbox](https://account.mapbox.com/) y genera un **token público de URL** (`pk...`).
2. **Restringe el token por URL/domains** en el panel de Mapbox (agrega tu dominio y `http://localhost:5173`). El token viaja al navegador por diseño; sin restricción, cualquiera podría gastar tu cuota.
3. Copia `frontend/.env.example` a `frontend/.env` y llena `VITE_MAPBOX_TOKEN`.
4. Reinicia `npm run dev`. Si el token falta o es inválido, el mapa muestra un estado claro con instrucciones.

El mapa real está en `/mapa` (`frontend/src/views/MapView.vue`); usa capas GeoJSON con agrupación, mapa de calor y edificios 3D. El centro por defecto del campus se cambia en `backend/config/map.ts` (`CAMPUS_CENTER`).

## Desarrollo

Para trabajar en el proyecto necesitas ejecutar el frontend y el backend por separado.

**Frontend:**

```bash
cd frontend
npm run dev
```

**Backend:**

```bash
cd backend
npm run dev
```

**Móvil**
```bash
cd centinela-app
flutter pub get
flutter run
```
