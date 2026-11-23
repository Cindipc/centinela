from __future__ import annotations

import os
from datetime import UTC, datetime

os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["JAVA_AI_URL"] = "http://127.0.0.1:59998"
os.environ["OLLAMA_URL"] = "http://127.0.0.1:59999"
os.environ["AI_AUTH_REQUIRED"] = "false"

from fastapi.testclient import TestClient

from app.assignment import suggest_staff
from app.config import Settings
from app.main import app
from app.ml import cluster_reports, compute_hotspots, compute_patterns, filter_incidents
from app.models import AssignmentReport, GeoPoint
from app.rules import classify, fallback_summary
from app.seed import generate_demo_incidents, synthetic_staff, synthetic_zones


def demo_settings() -> Settings:
    return Settings(
        supabase_url="",
        supabase_service_role_key="",
        ollama_url="http://127.0.0.1:59999",
        java_ai_url="http://127.0.0.1:59998",
        allow_synthetic=True,
        synthetic_min_incidents=24,
        synthetic_seed=42,
    )


def test_synthetic_dataset_is_deterministic_and_marked() -> None:
    settings = demo_settings()
    first = generate_demo_incidents(settings, count=60, spread_days=30)
    second = generate_demo_incidents(settings, count=60, spread_days=30)
    assert len(first) == 60
    assert [item.id for item in first] == [item.id for item in second]
    assert all(item.is_synthetic for item in first)
    assert all(item.point is not None for item in first)
    assert len(synthetic_zones()) == 10
    assert {item.type for item in first} == {"seguridad", "equipo"}


def test_hotspots_with_demo_data() -> None:
    settings = demo_settings()
    incidents = filter_incidents(
        generate_demo_incidents(settings, count=180, spread_days=30),
        days=30,
    )
    hotspots = compute_hotspots(incidents, radius_m=220, min_incidents=3)
    assert incidents
    assert hotspots
    assert hotspots[0].incidentCount >= 1
    assert 0.0 <= hotspots[0].score <= 1.0
    assert hotspots[0].riskLevel in {"low", "medium", "high", "critical"}
    assert hotspots[0].radiusM >= 50
    assert hotspots[0].incidentIds


def test_patterns_compute_buckets_and_text_clusters() -> None:
    settings = demo_settings()
    incidents = filter_incidents(
        generate_demo_incidents(settings, count=200, spread_days=30),
        days=30,
    )
    result = compute_patterns(incidents, days=30)
    assert result.totalIncidents == len(incidents)
    assert len(result.byHour) == 24
    assert len(result.byWeekday) == 7
    assert len(result.byType) == 2
    assert result.byZone
    assert result.patterns
    assert result.source in {"scikit-learn", "rules"}
    assert sum(bucket.count for bucket in result.byHour) == len(incidents)


def test_cluster_reports_groups_similar_reports() -> None:
    settings = demo_settings()
    incidents = filter_incidents(
        generate_demo_incidents(settings, count=180, spread_days=30),
        days=30,
    )
    clusters = cluster_reports(incidents, min_cluster_size=2)
    assert clusters
    assert all(cluster.incidentCount >= 2 for cluster in clusters)
    assert all(cluster.members for cluster in clusters)
    assert clusters[0].score >= clusters[-1].score


def test_rules_classify_detects_priority_and_category() -> None:
    result = classify(
        "seguridad",
        "Persona con arma cerca del acceso",
        "Amenaza a los estudiantes en la entrada principal",
        created_at=datetime(2026, 5, 1, 22, 0, tzinfo=UTC).isoformat(),
    )
    assert result["priority"] == "critical"
    assert result["category"] == "Agresión/Violencia"
    assert result["priorityScore"] >= 0.85
    assert result["reasons"]


def test_assignment_prefers_available_nearby_security_staff() -> None:
    report = AssignmentReport(
        type="seguridad",
        priority="critical",
        title="Intruso en el acceso principal",
        zone="Acceso principal",
        point=GeoPoint(lat=20.5885, lng=-90.0030),
    )
    staff = synthetic_staff()
    suggestions = suggest_staff(report, staff)
    assert suggestions
    assert suggestions[0].role == "seguridad"
    assert suggestions[0].score >= suggestions[-1].score
    assert suggestions[0].reasons


def test_fallback_summary_is_actionable() -> None:
    text, recommendations = fallback_summary(
        "hotspots",
        {"hotspotCount": 2, "highestRisk": "high"},
    )
    assert "2" in text
    assert recommendations


def test_api_endpoints_with_synthetic_fallback() -> None:
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["service"] == "centinela-ai-python"

        classify_response = client.post(
            "/ai/classify",
            json={
                "type": "equipo",
                "title": "Sin internet en el laboratorio",
                "description": "Los equipos no tienen red desde hace 20 minutos.",
            },
        )
        assert classify_response.status_code == 200
        body = classify_response.json()
        assert body["type"] == "equipo"
        assert body["source"] in {"dl4j", "rules"}

        hotspots_response = client.post(
            "/ai/hotspots",
            json={"days": 30, "minIncidents": 3, "organizationId": None},
        )
        assert hotspots_response.status_code == 200
        hotspots_body = hotspots_response.json()
        assert hotspots_body["isSynthetic"] is True
        assert hotspots_body["totalIncidents"] > 0
        assert hotspots_body["hotspots"]

        patterns_response = client.post(
            "/ai/patterns",
            json={"days": 30, "organizationId": None},
        )
        assert patterns_response.status_code == 200
        assert patterns_response.json()["totalIncidents"] > 0

        cluster_response = client.post(
            "/ai/cluster",
            json={"days": 30, "organizationId": None},
        )
        assert cluster_response.status_code == 200
        assert cluster_response.json()["clusters"]

        assign_response = client.post(
            "/ai/assign",
            json={
                "type": "seguridad",
                "title": "Persona sospechosa en el estacionamiento",
                "priority": "high",
                "zone": "Estacionamiento",
                "latitude": 20.5865,
                "longitude": -90.0026,
                "narrative": True,
            },
        )
        assert assign_response.status_code == 200
        assign_body = assign_response.json()
        assert assign_body["suggestions"]
        assert assign_body["narrative"]

        duplicate_response = client.post(
            "/ai/duplicates",
            json={
                "type": "seguridad",
                "title": "Intento de robo en estacionamiento",
                "description": "Una persona revisa vehículos.",
                "latitude": 20.5865,
                "longitude": -90.0026,
                "radiusM": 300,
            },
        )
        assert duplicate_response.status_code == 200
        assert "candidates" in duplicate_response.json()
