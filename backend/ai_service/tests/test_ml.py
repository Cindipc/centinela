from __future__ import annotations

from datetime import datetime, timezone

from app.ml import compute_patterns, rank_duplicates
from app.models import StoredIncident


def incident(
    index: int,
    title: str,
    zone_id: str = "zone-1",
    zone_name: str = "Laboratorio B",
    incident_type: str = "equipo",
    priority: str = "medium",
    status: str = "pendiente",
) -> StoredIncident:
    return StoredIncident(
        id=f"00000000-0000-4000-8000-{index:012d}",
        code=f"TIC-{index:04d}",
        title=title,
        description="El equipo no enciende y muestra una luz roja.",
        type=incident_type,
        priority=priority,
        status=status,
        zone_id=zone_id,
        zone_name=zone_name,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


def test_rank_duplicates_detects_similar_recent_incident() -> None:
    candidates = [
        incident(1, "Proyector del laboratorio no enciende"),
        incident(2, "Fuga de agua en el baño", zone_name="Baños"),
    ]
    ranked = rank_duplicates(
        "El proyector del laboratorio no enciende",
        "Luz roja y sin imagen",
        "equipo",
        candidates,
        zone_id="zone-1",
    )
    assert ranked
    assert ranked[0].incidentId == candidates[0].id
    assert ranked[0].similarity > 0.5


def test_patterns_require_minimum_data() -> None:
    patterns = compute_patterns([incident(1, "Proyector no enciende")], 30)
    assert patterns.source == "insufficient_data"
    assert patterns.totalIncidents == 1


def test_patterns_group_repeated_incidents() -> None:
    items = [
        incident(index, "Proyector del laboratorio no enciende", priority="critical" if index < 3 else "medium")
        for index in range(1, 7)
    ]
    items += [
        incident(index, "No hay internet en biblioteca", zone_id="zone-2", zone_name="Biblioteca")
        for index in range(7, 11)
    ]
    patterns = compute_patterns(items, 30)
    assert patterns.source == "scikit-learn"
    assert patterns.totalIncidents == 10
    assert patterns.patterns
    assert any(pattern.severity == "urgente" for pattern in patterns.patterns)
