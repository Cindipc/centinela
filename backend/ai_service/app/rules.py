from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from .models import IncidentPriority, IncidentSuggestion, IncidentType

SECURITY_CATEGORIES: list[tuple[str, tuple[str, ...]]] = [
    ("Emergencia", ("incendio", "explosion", "herido", "sangre", "disparo", "arma", "secuestro", "ataque")),
    ("Robo", ("robo", "hurto", "asalto", "sustraccion", "robaron", "robar")),
    ("Agresión", ("agresion", "golpe", "pelea", "violencia", "amenaza", "acoso", "agredio")),
    ("Acceso no autorizado", ("intruso", "intrusion", "acceso no autorizado", "persona sospechosa", "sospechoso")),
    ("Vandalismo", ("vandalismo", "graffiti", "dano", "destruccion", "rompieron")),
    ("Drogas", ("droga", "narcotico", "marihuana", "cocaína", "cocaina")),
]

EQUIPMENT_CATEGORIES: list[tuple[str, tuple[str, ...]]] = [
    ("Red/Conectividad", ("wifi", "internet", "red", "conexion", "conectividad", "servidor", "switch", "router")),
    ("Energía", ("energia", "electricidad", "corto circuito", "apagon", "luz", "bombilla", "poste", "cable")),
    ("Hardware", ("computadora", "laptop", "proyector", "pantalla", "impresora", "teclado", "raton", "equipo", "cpu")),
    ("Software", ("software", "sistema", "programa", "aplicacion", "plataforma", "error", "contrasena", "clave")),
    ("Climatización", ("aire acondicionado", "clima", "ventilador", "calefaccion", "fuga")),
]

CRITICAL_TERMS = (
    "incendio",
    "explosion",
    "herido",
    "sangre",
    "disparo",
    "arma",
    "secuestro",
    "ataque",
    "emergencia",
    "fuego",
    "persona atrapada",
)
HIGH_TERMS = (
    "robo",
    "asalto",
    "agresion",
    "amenaza",
    "violencia",
    "accidente",
    "caida",
    "inundacion",
    "humo",
    "corto circuito",
    "intruso",
)
LOW_TERMS = ("ruido", "basura", "limpieza", "lento", "demora", "polvo", "suciedad")


def normalize(text: str | None) -> str:
    value = unicodedata.normalize("NFKD", text or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", value.lower()).strip()


def _contains_any(text: str, terms: Iterable[str]) -> bool:
    for term in terms:
        if re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text):
            return True
    return False


def infer_category(incident_type: IncidentType, title: str, description: str) -> str:
    text = normalize(f"{title} {description}")
    catalog = SECURITY_CATEGORIES if incident_type == "seguridad" else EQUIPMENT_CATEGORIES
    for category, terms in catalog:
        if _contains_any(text, terms):
            return category
    return "Otro"


def infer_priority(title: str, description: str) -> IncidentPriority:
    text = normalize(f"{title} {description}")
    if _contains_any(text, CRITICAL_TERMS):
        return "critical"
    if _contains_any(text, HIGH_TERMS):
        return "high"
    if _contains_any(text, LOW_TERMS):
        return "low"
    return "medium"


def rule_suggestion(
    incident_type: IncidentType,
    title: str,
    description: str,
    zone: str | None,
) -> IncidentSuggestion:
    category = infer_category(incident_type, title, description)
    priority = infer_priority(title, description)
    clean_title = title.strip().rstrip(".")
    summary = f"{clean_title}. Clasificación preliminar: {category.lower()}."

    if incident_type == "seguridad":
        causes = [
            "Presencia de personas ajenas al área o falta de control de acceso.",
            "Iluminación insuficiente o puntos ciegos en la zona.",
        ]
        actions = [
            "Notifica al personal de seguridad y comparte la ubicación exacta.",
            "No confrontes a nadie si hay riesgo; prioriza tu integridad.",
        ]
        if priority == "critical":
            actions.insert(0, "Llama al 911 y activa el protocolo de emergencia de la universidad.")
    else:
        causes = [
            "Falla del equipo, cableado o configuración del servicio.",
            "Uso incorrecto o falta de mantenimiento preventivo.",
        ]
        actions = [
            "Registra el número de serie o identificación del equipo si está disponible.",
            "Notifica al área de TI y evita manipular componentes energizados.",
        ]
        if priority in ("critical", "high"):
            actions.insert(0, "Aísla el equipo o zona si representa un riesgo y avisa de inmediato a TI.")

    if zone:
        causes.append(f"El reporte ocurre en {zone}; revisa condiciones específicas de esa ubicación.")

    return IncidentSuggestion(
        category=category,
        priority=priority,
        summary=summary,
        possibleCauses=causes,
        recommendedActions=actions,
        suggestedZone=zone,
        confidence=0.55,
        source="rules",
    )


def merge_ollama_suggestion(
    fallback: IncidentSuggestion,
    payload: dict,
) -> IncidentSuggestion:
    """Acepta solo campos válidos de Ollama; nunca deja que cambie el flujo."""
    priority = payload.get("priority")
    if priority not in ("low", "medium", "high", "critical"):
        priority = fallback.priority

    def string_list(value: object, default: list[str]) -> list[str]:
        if not isinstance(value, list):
            return default
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return cleaned[:6] or default

    category = str(payload.get("category") or fallback.category).strip()[:80] or fallback.category
    summary = str(payload.get("summary") or fallback.summary).strip()[:600] or fallback.summary
    suggested_zone = payload.get("suggestedZone", fallback.suggestedZone)
    if suggested_zone is not None:
        suggested_zone = str(suggested_zone).strip()[:160] or None

    try:
        confidence = float(payload.get("confidence", 0.7))
    except (TypeError, ValueError):
        confidence = 0.7
    confidence = min(0.95, max(0.3, confidence))

    return IncidentSuggestion(
        category=category,
        priority=priority,
        summary=summary,
        possibleCauses=string_list(payload.get("possibleCauses"), fallback.possibleCauses),
        recommendedActions=string_list(payload.get("recommendedActions"), fallback.recommendedActions),
        suggestedZone=suggested_zone,
        confidence=confidence,
        source="ollama",
    )
