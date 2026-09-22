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

## Correrlo local

**Web**
```bash
cd centinela-web
npm install
cp .env.example .env
npm run dev
```

**Móvil**
```bash
cd centinela-app
flutter pub get
flutter run
```
