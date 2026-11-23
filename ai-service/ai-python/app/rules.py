from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Any

from .models import IncidentPriority, IncidentSuggestion, IncidentType

CATEGORY_KEYWORDS: dict[IncidentType, list[tuple[str, tuple[str, ...]]]] = {
    "seguridad": [
        (
            "Robo/Hurto",
            ("robo", "robaron", "hurto", "sustraj", "cartera", "celular", "mochila", "pertenencias"),
        ),
        (
            "Agresión/Violencia",
            ("agresion", "agredio", "golpe", "pelea", "violencia", "amenaza", "arma", "empujo"),
        ),
        (
            "Acceso no autorizado",
            ("intruso", "acceso no autorizado", "persona ajena", "porton", "cerco", "ingreso indebido"),
        ),
        (
            "Emergencia médica",
            ("medic", "desmay", "herid", "sangr", "ambulancia", "crisis", "convuls", "dolor"),
        ),
        (
            "Incendio",
            ("incendio", "fuego", "humo", "quem", "flama"),
        ),
        (
            "Vehículo",
            ("vehiculo", "auto", "coche", "moto", "estacionamiento", "bicicleta"),
        ),
        (
            "Vigilancia",
            ("camara", "alarma", "sensor", "monitoreo", "vigilancia", "panic"),
        ),
        (
            "Daño/Vandalismo",
            ("vandal", "rayon", "romp", "dano", "destroz", "grafiti"),
        ),
    ],
    "equipo": [
        (
            "Red/Conectividad",
            ("internet", "wifi", "red", "conexion", "router", "switch", "cable", "fibra", "dns"),
        ),
        (
            "Energía",
            ("luz", "electric", "energia", "apagon", "bateria", "ups", "corto", "contacto"),
        ),
        (
            "Hardware",
            ("computadora", "laptop", "pc", "monitor", "teclado", "mouse", "proyector", "impresora"),
        ),
        (
            "Software",
            ("sistema", "aplicacion", "software", "login", "contrasena", "error", "actualizacion"),
        ),
        (
            "Infraestructura/Clima",
            ("aire", "clima", "ventilador", "fuga", "agua", "techo", "puerta", "silla", "mobiliario"),
        ),
        (
            "Acceso/Credenciales",
            ("credencial", "cuenta", "permiso", "acceso", "contrasena", "usuario"),
        ),
    ],
}

PRIORITY_KEYWORDS: dict[IncidentPriority, tuple[str, ...]] = {
    "critical": (
        "arma",
        "herido",
        "sangrando",
        "incendio",
        "fuego",
        "explosion",
        "secuestro",
        "desmayo",
        "convulsion",
        "emergencia medica",
        "amenaza de muerte",
        "cable expuesto",
        "inundacion",
        "persona atrapada",
    ),
    "high": (
        "robo",
        "agresion",
        "amenaza",
        "intruso",
        "apagon",
        "falla total",
        "sin internet",
        "caida de red",
        "fuga",
        "humo",
        "accidente",
        "vandalismo",
        "panico",
        "urgente",
    ),
    "low": (
        "leve",
        "revisar",
        "consulta",
        "lento",
        "duda",
        "solicitud",
        "mantenimiento",
        "actualizacion",
        "programado",
    ),
}

ACTIONS_BY_CATEGORY: dict[str, list[str]] = {
    "Robo/Hurto": [
        "Resguardar a la persona afectada y no confrontar al sospechoso.",
        "Revisar cámaras y registrar descripción, hora y ruta de salida.",
        "Dar aviso a seguridad y levantar el reporte formal.",
    ],
    "Agresión/Violencia": [
        "Separar a las personas involucradas y pedir apoyo adicional.",
        "Priorizar atención médica si hay heridos.",
        "Documentar testigos y resguardar evidencia.",
    ],
    "Acceso no autorizado": [
        "Verificar identidad y motivo de ingreso.",
        "Acompañar fuera del campus si no cuenta con autorización.",
        "Revisar el punto de acceso y reforzar vigilancia.",
    ],
    "Emergencia médica": [
        "Activar protocolo médico y llamar a emergencias si es necesario.",
        "No mover a la persona salvo riesgo inminente.",
        "Despejar el área y acompañar hasta recibir atención.",
    ],
    "Incendio": [
        "Activar alarma y evacuar el área de inmediato.",
        "Usar extintor solo si es seguro y el fuego es incipiente.",
        "Llamar a bomberos y no reingresar hasta autorización.",
    ],
    "Vehículo": [
        "Identificar placas, modelo y ubicación exacta.",
        "Revisar acceso vehicular y cámaras cercanas.",
        "Notificar a seguridad para resguardo del vehículo.",
    ],
    "Vigilancia": [
        "Verificar estado de cámara, alarma o sensor afectado.",
        "Revisar grabaciones del periodo relevante.",
        "Programar mantenimiento con el área de TI.",
    ],
    "Daño/Vandalismo": [
        "Documentar daños con fotografías y ubicación.",
        "Resguardar el área para evitar nuevos daños.",
        "Revisar cámaras y notificar a administración.",
    ],
    "Red/Conectividad": [
        "Revisar switch, router y cableado del segmento afectado.",
        "Confirmar si el fallo es local o general.",
        "Registrar incidencia y restaurar servicio por prioridad.",
    ],
    "Energía": [
        "Verificar tablero, UPS y contactos del área.",
        "Aislar el circuito si hay riesgo eléctrico.",
        "Solicitar apoyo de mantenimiento especializado.",
    ],
    "Hardware": [
        "Confirmar número de inventario y estado del equipo.",
        "Probar fuente de poder y conexiones básicas.",
        "Programar reemplazo o reparación con TI.",
    ],
    "Software": [
        "Reproducir el error y registrar mensaje exacto.",
        "Revisar permisos y versión del sistema.",
        "Escalar a soporte de la plataforma si persiste.",
    ],
    "Infraestructura/Clima": [
        "Delimitar el área y evitar el uso del espacio.",
        "Revisar el origen de la fuga o daño.",
        "Programar reparación y avisar a administración.",
    ],
    "Acceso/Credenciales": [
        "Validar identidad del solicitante.",
        "Restablecer acceso con el procedimiento institucional.",
        "Registrar el cambio y recomendar contraseña segura.",
    ],
}

CAUSES_BY_CATEGORY: dict[str, list[str]] = {
    "Robo/Hurto": ["Objeto de valor a la vista", "Punto con poca vigilancia", "Distracción de la víctima"],
    "Agresión/Violencia": ["Conflicto interpersonal previo", "Consumo de sustancias", "Falta de supervisión"],
    "Acceso no autorizado": ["Control de acceso débil", "Puerta o cerco vulnerable", "Horario sin vigilancia"],
    "Emergencia médica": ["Condición de salud previa", "Golpe de calor o deshidratación", "Accidente físico"],
    "Incendio": ["Falla eléctrica", "Material inflamable mal resguardado", "Uso indebido de equipo"],
    "Vehículo": ["Estacionamiento sin control", "Intento de robo", "Accidente o mala maniobra"],
    "Vigilancia": ["Equipo desconectado", "Falla de red", "Mantenimiento vencido"],
    "Daño/Vandalismo": ["Falta de supervisión", "Acceso nocturno", "Conflicto entre estudiantes"],
    "Red/Conectividad": ["Falla del proveedor", "Cableado dañado", "Saturación del enlace"],
    "Energía": ["Sobrecarga eléctrica", "Apagón del sector", "UPS o batería agotada"],
    "Hardware": ["Uso intensivo", "Falla de componentes", "Mantenimiento pendiente"],
    "Software": ["Actualización defectuosa", "Permisos incorrectos", "Error de configuración"],
    "Infraestructura/Clima": ["Filtración", "Falta de mantenimiento", "Clima extremo"],
    "Acceso/Credenciales": ["Contraseña olvidada", "Cuenta bloqueada", "Solicitud de nuevo usuario"],
}


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.lower()
    return re.sub(r"\s+", " ", text).strip()


def infer_type(title: str, description: str | None = None) -> IncidentType:
    normalized = normalize(f"{title} {description or ''}")
    security_hits = sum(
        1
        for _category, keywords in CATEGORY_KEYWORDS["seguridad"]
        for keyword in keywords
        if keyword in normalized
    )
    equipment_hits = sum(
        1
        for _category, keywords in CATEGORY_KEYWORDS["equipo"]
        for keyword in keywords
        if keyword in normalized
    )
    return "equipo" if equipment_hits > security_hits else "seguridad"


def detect_category(incident_type: IncidentType, text: str) -> tuple[str, int]:
    normalized = normalize(text)
    best_category = "Incidente de seguridad" if incident_type == "seguridad" else "Soporte técnico"
    best_hits = 0
    for category, keywords in CATEGORY_KEYWORDS[incident_type]:
        hits = sum(1 for keyword in keywords if keyword in normalized)
        if hits > best_hits:
            best_category = category
            best_hits = hits
    return best_category, best_hits


def _parse_hour(created_at: str | None) -> int | None:
    if not created_at:
        return None
    try:
        return datetime.fromisoformat(created_at.replace("Z", "+00:00")).hour
    except ValueError:
        return None


def priority_score(
    incident_type: IncidentType,
    title: str,
    description: str | None = None,
    created_at: str | None = None,
) -> tuple[float, list[str]]:
    text = normalize(f"{title} {description or ''}")
    score = 0.5 if incident_type == "seguridad" else 0.35
    reasons: list[str] = []

    critical_hits = [word for word in PRIORITY_KEYWORDS["critical"] if word in text]
    high_hits = [word for word in PRIORITY_KEYWORDS["high"] if word in text]
    low_hits = [word for word in PRIORITY_KEYWORDS["low"] if word in text]

    if critical_hits:
        score = max(score, 0.88)
        reasons.append(f"Contiene señal crítica: {critical_hits[0]}")
    if high_hits:
        score = max(score, 0.7)
        reasons.append(f"Contiene señal de alta prioridad: {high_hits[0]}")
    if low_hits and not critical_hits and not high_hits:
        score -= 0.12
        reasons.append(f"Contiene señal de baja urgencia: {low_hits[0]}")

    hour = _parse_hour(created_at)
    if hour is not None:
        if incident_type == "seguridad" and (hour >= 20 or hour <= 5):
            score += 0.08
            reasons.append("Ocurrió en horario nocturno")
        elif incident_type == "equipo" and 7 <= hour <= 18:
            score += 0.05
            reasons.append("Afecta la operación en horario académico")

    if "panico" in text or "boton de panico" in text:
        score = max(score, 0.95)
        reasons.append("Activación del botón de pánico")

    if len(text) < 20:
        score -= 0.05

    return max(0.0, min(1.0, score)), reasons


def priority_from_score(score: float) -> IncidentPriority:
    if score >= 0.85:
        return "critical"
    if score >= 0.65:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


def classify(
    incident_type: IncidentType,
    title: str,
    description: str | None = None,
    zone: str | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    category, hits = detect_category(incident_type, f"{title} {description or ''}")
    score, reasons = priority_score(incident_type, title, description, created_at)
    label = priority_from_score(score)
    confidence = min(0.9, 0.42 + hits * 0.14 + (0.06 if description else 0.0))
    return {
        "type": incident_type,
        "priority": label,
        "priorityScore": round(score, 3),
        "category": category,
        "confidence": round(confidence, 3),
        "probabilities": {label: round(confidence, 3)},
        "source": "rules",
        "reasons": reasons or ["Clasificación base por palabras clave"],
        "suggestedZone": zone,
    }


def suggest(
    incident_type: IncidentType,
    title: str,
    description: str | None = None,
    zone: str | None = None,
    created_at: str | None = None,
) -> IncidentSuggestion:
    result = classify(incident_type, title, description, zone, created_at)
    category = result["category"]
    priority = result["priority"]
    summary_text = (
        f"Reporte de {incident_type} clasificado como {category} con prioridad {priority}. "
        f"{title.strip()}"
    )
    return IncidentSuggestion(
        category=category,
        priority=priority,
        summary=summary_text[:500],
        possibleCauses=CAUSES_BY_CATEGORY.get(category, ["Causa por confirmar en campo"]),
        recommendedActions=ACTIONS_BY_CATEGORY.get(category, ["Atender el reporte y documentar hallazgos"]),
        suggestedZone=zone,
        confidence=float(result["confidence"]),
        source="rules",
    )


def assignment_reasons_names(priority: IncidentPriority) -> str:
    return {
        "critical": "crítica",
        "high": "alta",
        "medium": "media",
        "low": "baja",
    }[priority]


def fallback_summary(kind: str, context: dict[str, Any]) -> tuple[str, list[str]]:
    if kind == "patterns":
        total = context.get("totalIncidents", 0)
        peak = context.get("peakHours") or []
        zones = context.get("topZones") or []
        summary_text = (
            f"Se analizaron {total} reportes. "
            + (f"Las horas con más incidencias son {', '.join(str(h) + ':00' for h in peak[:3])}. " if peak else "")
            + (f"Las zonas con mayor actividad son {', '.join(zones[:3])}." if zones else "")
        )
        recommendations = [
            "Reforzar vigilancia en las zonas y horarios con mayor concentración.",
            "Revisar los reportes recurrentes para detectar causas raíz.",
            "Programar mantenimiento preventivo donde se repite la misma falla.",
        ]
        return summary_text.strip(), recommendations
    if kind == "hotspots":
        count = context.get("hotspotCount", 0)
        risk = context.get("highestRisk", "medium")
        return (
            f"El análisis geoespacial detectó {count} focos de riesgo. "
            f"El foco principal tiene nivel {risk}.",
            [
                "Priorizar rondines en los focos de mayor nivel.",
                "Verificar cámaras y alumbrado en las zonas detectadas.",
                "Actualizar el análisis después de cada jornada.",
            ],
        )
    if kind == "assignment":
        name = context.get("name") or "sin asignar"
        eta = context.get("etaMinutes")
        return (
            f"Se recomienda asignar el reporte a {name}"
            + (f" con un tiempo estimado de {round(float(eta))} minutos." if eta else "."),
            ["Confirmar disponibilidad por radio.", "Notificar al responsable y registrar la asignación."],
        )
    return (
        "Centinela IA analiza reportes de seguridad y soporte para priorizar la atención.",
        ["Mantener los reportes actualizados.", "Revisar el panel de análisis cada jornada."],
    )
