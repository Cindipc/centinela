from __future__ import annotations

from app.rules import infer_category, infer_priority, merge_ollama_suggestion, rule_suggestion


def test_infer_security_category() -> None:
    assert infer_category("seguridad", "Robo en el estacionamiento", "") == "Robo"


def test_infer_equipment_category() -> None:
    assert infer_category("equipo", "No hay WiFi en el laboratorio", "") == "Red/Conectividad"


def test_priority_critical_beats_high() -> None:
    assert infer_priority("Persona herida", "Hay un arma y sangre") == "critical"


def test_rule_suggestion_never_closes_incident() -> None:
    suggestion = rule_suggestion("seguridad", "Intruso en el campus", "Persona sospechosa", "Acceso Norte")
    assert suggestion.source == "rules"
    assert suggestion.priority == "high"
    assert any("seguridad" in action.lower() for action in suggestion.recommendedActions)
    assert all("cerrar" not in action.lower() for action in suggestion.recommendedActions)


def test_merge_ollama_validates_priority() -> None:
    fallback = rule_suggestion("equipo", "Proyector sin imagen", "", None)
    merged = merge_ollama_suggestion(
        fallback,
        {
            "category": "Hardware",
            "priority": "inventada",
            "summary": "El proyector no muestra imagen.",
            "possibleCauses": ["Cable suelto"],
            "recommendedActions": ["Revisar conexión"],
            "suggestedZone": None,
            "confidence": 4,
        },
    )
    assert merged.source == "ollama"
    assert merged.priority == fallback.priority
    assert merged.confidence == 0.95
