from __future__ import annotations

import math

from .ml import haversine_m
from .models import (
    AssignmentReport,
    GeoPoint,
    IncidentPriority,
    IncidentType,
    StaffInput,
    StaffSuggestion,
)
from .rules import assignment_reasons_names


def _priority_value(priority: IncidentPriority) -> float:
    return {"low": 0.3, "medium": 0.5, "high": 0.75, "critical": 0.95}[priority]


def _staff_point(staff: StaffInput) -> GeoPoint | None:
    if staff.latitude is None or staff.longitude is None:
        return None
    return GeoPoint(lat=staff.latitude, lng=staff.longitude)


def _score_staff(
    staff: StaffInput,
    report_point: GeoPoint | None,
    report_zone: str | None,
    incident_type: IncidentType,
    priority: IncidentPriority,
) -> StaffSuggestion:
    staff_point = _staff_point(staff)
    distance: float | None = None
    if report_point and staff_point:
        distance = haversine_m(
            report_point.lat,
            report_point.lng,
            staff_point.lat,
            staff_point.lng,
        )
    proximity = math.exp(-distance / 1200.0) if distance is not None else 0.35
    load_score = max(0.0, 1.0 - staff.activeLoad / 5.0)
    same_zone = bool(
        (report_zone and staff.zone and report_zone.strip().lower() == staff.zone.strip().lower())
    )
    role_match = staff.role == incident_type
    urgency = _priority_value(priority)

    score = (
        0.40 * urgency
        + 0.27 * proximity
        + 0.18 * load_score
        + 0.10 * (1.0 if same_zone else 0.0)
        + 0.05 * (1.0 if role_match else 0.3)
    )

    reasons: list[str] = []
    if distance is not None:
        reasons.append(f"A {distance:.0f} m del reporte")
    if same_zone:
        reasons.append("Ya cubre la zona del incidente")
    if staff.activeLoad == 0:
        reasons.append("Sin reportes abiertos")
    else:
        reasons.append(f"{staff.activeLoad} reporte(s) abierto(s)")
    if role_match:
        reasons.append(f"Perfil de {incident_type}")
    if priority in {"critical", "high"}:
        reasons.append(f"Prioridad {assignment_reasons_names(priority)}")

    eta = None
    if distance is not None:
        # Caminata rápida en campus ~1.4 m/s + margen de confirmación.
        eta = round(distance / 1.4 / 60.0 + 1.5, 1)

    return StaffSuggestion(
        id=staff.id,
        name=staff.name,
        role=staff.role,
        zone=staff.zone,
        point=staff_point,
        distanceMeters=round(distance, 1) if distance is not None else None,
        activeLoad=staff.activeLoad,
        score=round(score, 3),
        etaMinutes=eta,
        reasons=reasons,
    )


def suggest_staff(
    report: AssignmentReport,
    staff: list[StaffInput],
) -> list[StaffSuggestion]:
    available = [item for item in staff if item.available]
    if not available:
        return []
    matching = [item for item in available if item.role == report.type]
    candidates = matching or available
    suggestions = [
        _score_staff(item, report.point, report.zone, report.type, report.priority)
        for item in candidates
    ]
    suggestions.sort(
        key=lambda item: (
            -item.score,
            item.distanceMeters if item.distanceMeters is not None else 99999,
            item.activeLoad,
            item.name,
        )
    )
    return suggestions[:5]
