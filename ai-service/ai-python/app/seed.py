from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

from .config import Settings
from .models import (
    GeoPoint,
    IncidentPriority,
    IncidentType,
    StaffInput,
    StoredIncident,
    StoredZone,
)

CAMPUS_CENTER = GeoPoint(lat=20.5873, lng=-90.0036)

ZONE_DEFINITIONS: tuple[tuple[str, float, float, float], ...] = (
    ("Acceso principal", 0.0012, 0.0006, 0.18),
    ("Estacionamiento", -0.0008, 0.0010, 0.16),
    ("Edificio A - Aulas", 0.0004, -0.0005, 0.12),
    ("Edificio B - Laboratorios", 0.0016, -0.0009, 0.14),
    ("Biblioteca", -0.0003, -0.0012, 0.06),
    ("Cafetería", 0.0009, 0.0003, 0.08),
    ("Centro de Cómputo", 0.0018, 0.0006, 0.10),
    ("Canchas deportivas", -0.0015, -0.0004, 0.05),
    ("Área administrativa", 0.0010, -0.0018, 0.05),
    ("Talleres", -0.0012, 0.0015, 0.06),
)

SECURITY_CATALOG: tuple[tuple[str, str, str], ...] = (
    ("Intento de robo en estacionamiento", "Reportan a una persona revisando vehículos y forcejeando puertas.", "Robo/Hurto"),
    ("Persona sospechosa cerca del acceso", "Individuo sin credencial merodea el acceso principal.", "Acceso no autorizado"),
    ("Agresión entre estudiantes", "Dos estudiantes discutieron y comenzaron a empujarse en el pasillo.", "Agresión/Violencia"),
    ("Alumno con desmayo en el aula", "El estudiante refiere mareo y dolor de cabeza; se encuentra consciente.", "Emergencia médica"),
    ("Humo en el laboratorio", "Se percibe olor a quemado y humo ligero cerca de una toma de corriente.", "Incendio"),
    ("Cámara de seguridad sin señal", "La cámara del pasillo norte dejó de transmitir durante la madrugada.", "Vigilancia"),
    ("Cristal roto en la cafetería", "Se encontró una ventana dañada y vidrios en el piso.", "Daño/Vandalismo"),
    ("Motocicleta sin placas en el campus", "Vehículo permanece estacionado cerca de la cancha sin identificación.", "Vehículo"),
    ("Botón de pánico activado", "Se activó el botón de pánico del acceso peatonal y no hay respuesta.", "Robo/Hurto"),
    ("Puerta de emergencia abierta", "La puerta lateral está abierta fuera de horario y sin vigilancia.", "Acceso no autorizado"),
    ("Amenaza verbal en el estacionamiento", "Una persona amenazó al guardia al solicitarle identificación.", "Agresión/Violencia"),
    ("Intrusión en área administrativa", "Se observó a una persona ajena revisando escritorios.", "Acceso no autorizado"),
    ("Pelea en las canchas", "Grupo de personas discute y empuja a un estudiante.", "Agresión/Violencia"),
    ("Persona lesionada en escaleras", "Un estudiante cayó y presenta dolor en el tobillo.", "Emergencia médica"),
    ("Alarma activada en biblioteca", "La alarma sonó y no se identifica la causa.", "Vigilancia"),
    ("Robo de mochila en cafetería", "La estudiante reporta la desaparición de su mochila con laptop.", "Robo/Hurto"),
)

EQUIPMENT_CATALOG: tuple[tuple[str, str, str], ...] = (
    ("Sin internet en el laboratorio", "Los equipos del laboratorio no tienen conexión desde hace 20 minutos.", "Red/Conectividad"),
    ("Proyector no enciende", "El proyector del aula no responde y la clase está por comenzar.", "Hardware"),
    ("Falla de energía en edificio B", "Se fue la luz en dos aulas y el UPS emite alarma.", "Energía"),
    ("Aire acondicionado sin funcionar", "El aula se encuentra muy calurosa y el equipo no responde.", "Infraestructura/Clima"),
    ("Computadora no arranca", "La PC del centro de cómputo queda en pantalla negra.", "Hardware"),
    ("Sistema de asistencia caído", "La plataforma muestra error al registrar asistencia.", "Software"),
    ("Cuenta bloqueada", "Un docente no puede iniciar sesión en el portal.", "Acceso/Credenciales"),
    ("Cable de red dañado", "El cable del switch está expuesto y se desconecta intermitentemente.", "Red/Conectividad"),
    ("Impresora atascada", "La impresora de administración marca error de papel.", "Hardware"),
    ("Fuga de agua en baños", "Hay agua en el pasillo y riesgo de caída.", "Infraestructura/Clima"),
    ("Wifi lento en biblioteca", "Los estudiantes reportan cortes y velocidad muy baja.", "Red/Conectividad"),
    ("Router sin señal", "El router del edificio A tiene luz roja desde la mañana.", "Red/Conectividad"),
    ("Contacto eléctrico con chispa", "Se observa chispa en un contacto del taller y olor a plástico.", "Energía"),
    ("Actualización fallida del sistema", "El sistema de inventario muestra error después de actualizar.", "Software"),
    ("Monitor sin imagen", "El monitor del laboratorio de cómputo no muestra imagen.", "Hardware"),
    ("Filtración en techo", "El techo del aula 3 gotea sobre las computadoras.", "Infraestructura/Clima"),
)

PRIORITY_WEIGHTS: dict[IncidentType, tuple[IncidentPriority, ...]] = {
    "seguridad": ("low", "medium", "high", "critical"),
    "equipo": ("low", "medium", "high", "critical"),
}

PRIORITY_PROBABILITIES: dict[IncidentType, tuple[float, float, float, float]] = {
    "seguridad": (0.10, 0.45, 0.33, 0.12),
    "equipo": (0.18, 0.52, 0.25, 0.05),
}


def zone_point(zone_name: str) -> GeoPoint:
    for name, offset_lat, offset_lng, _weight in ZONE_DEFINITIONS:
        if name == zone_name:
            return GeoPoint(
                lat=round(CAMPUS_CENTER.lat + offset_lat, 6),
                lng=round(CAMPUS_CENTER.lng + offset_lng, 6),
            )
    return CAMPUS_CENTER


def synthetic_zones() -> list[StoredZone]:
    return [
        StoredZone(
            id=f"demo-zone-{index}",
            name=name,
            point=GeoPoint(
                lat=round(CAMPUS_CENTER.lat + offset_lat, 6),
                lng=round(CAMPUS_CENTER.lng + offset_lng, 6),
            ),
        )
        for index, (name, offset_lat, offset_lng, _weight) in enumerate(ZONE_DEFINITIONS, start=1)
    ]


def _jitter(rng: random.Random, point: GeoPoint, spread: float = 0.00035) -> GeoPoint:
    return GeoPoint(
        lat=round(point.lat + rng.uniform(-spread, spread), 6),
        lng=round(point.lng + rng.uniform(-spread, spread), 6),
    )


def _created_at(
    rng: random.Random,
    now: datetime,
    incident_type: IncidentType,
    spread_days: int,
) -> str:
    days_ago = rng.randint(0, max(0, spread_days))
    day = now - timedelta(days=days_ago)
    while day.weekday() >= 5 and rng.random() < 0.78:
        day -= timedelta(days=1)

    if incident_type == "seguridad":
        hour = rng.choices(
            [6, 7, 8, 12, 13, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2],
            weights=[2, 2, 2, 3, 2, 4, 4, 5, 8, 10, 9, 7, 5, 3, 1],
        )[0]
    else:
        hour = rng.choices(
            [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
            weights=[2, 5, 8, 9, 8, 5, 4, 6, 7, 7, 5, 3, 2, 1],
        )[0]

    minute = rng.choice([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
    moment = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def generate_demo_incidents(
    settings: Settings,
    count: int = 140,
    spread_days: int = 59,
) -> list[StoredIncident]:
    rng = random.Random(settings.synthetic_seed)
    now = datetime.now(UTC)
    zones = synthetic_zones()
    zone_weights = [weight for _name, _lat, _lng, weight in ZONE_DEFINITIONS]
    incidents: list[StoredIncident] = []

    for index in range(count):
        incident_type: IncidentType = rng.choices(
            ("seguridad", "equipo"), weights=(0.62, 0.38)
        )[0]
        catalog = SECURITY_CATALOG if incident_type == "seguridad" else EQUIPMENT_CATALOG
        title, description, _category = rng.choice(catalog)
        zone = rng.choices(zones, weights=zone_weights)[0]
        point = _jitter(rng, zone.point or CAMPUS_CENTER)
        priority = rng.choices(
            PRIORITY_WEIGHTS[incident_type],
            weights=PRIORITY_PROBABILITIES[incident_type],
        )[0]
        status = rng.choices(
            ("pendiente", "en_proceso", "resuelto", "falsa_alarma"),
            weights=(0.28, 0.18, 0.48, 0.06),
        )[0]
        prefix = "SEC" if incident_type == "seguridad" else "TIC"
        incidents.append(
            StoredIncident(
                id=f"demo-{index + 1:04d}",
                code=f"{prefix}-{1000 + index + 1}",
                title=title,
                description=description,
                type=incident_type,
                priority=priority,
                status=status,
                zone_id=zone.id,
                zone_name=zone.name,
                created_at=_created_at(rng, now, incident_type, spread_days),
                point=point,
                is_synthetic=True,
            )
        )

    incidents.sort(key=lambda item: item.created_at, reverse=True)
    return incidents


def synthetic_staff() -> list[StaffInput]:
    return [
        StaffInput(
            id="demo-staff-1",
            name="Guardia Ana Pech",
            role="seguridad",
            zone="Acceso principal",
            zoneId="demo-zone-1",
            latitude=CAMPUS_CENTER.lat + 0.0012,
            longitude=CAMPUS_CENTER.lng + 0.0006,
            activeLoad=1,
        ),
        StaffInput(
            id="demo-staff-2",
            name="Guardia Luis Canul",
            role="seguridad",
            zone="Estacionamiento",
            zoneId="demo-zone-2",
            latitude=CAMPUS_CENTER.lat - 0.0008,
            longitude=CAMPUS_CENTER.lng + 0.0010,
            activeLoad=2,
        ),
        StaffInput(
            id="demo-staff-3",
            name="Guardia María Uc",
            role="seguridad",
            zone="Edificio B - Laboratorios",
            zoneId="demo-zone-4",
            latitude=CAMPUS_CENTER.lat + 0.0016,
            longitude=CAMPUS_CENTER.lng - 0.0009,
            activeLoad=0,
        ),
        StaffInput(
            id="demo-staff-4",
            name="Soporte Diego May",
            role="ti",
            zone="Centro de Cómputo",
            zoneId="demo-zone-7",
            latitude=CAMPUS_CENTER.lat + 0.0018,
            longitude=CAMPUS_CENTER.lng + 0.0006,
            activeLoad=2,
        ),
        StaffInput(
            id="demo-staff-5",
            name="Soporte Valeria Chan",
            role="ti",
            zone="Edificio A - Aulas",
            zoneId="demo-zone-3",
            latitude=CAMPUS_CENTER.lat + 0.0004,
            longitude=CAMPUS_CENTER.lng - 0.0005,
            activeLoad=1,
        ),
        StaffInput(
            id="demo-staff-6",
            name="Soporte Jorge Balam",
            role="ti",
            zone="Área administrativa",
            zoneId="demo-zone-9",
            latitude=CAMPUS_CENTER.lat + 0.0010,
            longitude=CAMPUS_CENTER.lng - 0.0018,
            activeLoad=3,
        ),
    ]
