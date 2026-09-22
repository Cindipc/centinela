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

## Instalación y configuración

Clona el repositorio y entra a la carpeta del proyecto:

```bash
git clone https://github.com/Cindipc/centinela.git
cd centinela
```

La estructura del proyecto es:

```text
centinela/
├── frontend/       # Panel web (Vue 3 + TypeScript)
├── backend/        # API y conexión con Supabase
└── database/       # Scripts y esquema de Supabase
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
