from __future__ import annotations

import json
import logging

import httpx

from .config import Settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres un asistente de clasificación de incidencias universitarias en México.
Devuelve SOLO un objeto JSON válido, sin markdown, con esta forma exacta:
{
  "category": "categoría breve",
  "priority": "low|medium|high|critical",
  "summary": "resumen neutral de una oración",
  "possibleCauses": ["causa probable 1", "causa probable 2"],
  "recommendedActions": ["acción segura 1", "acción segura 2"],
  "suggestedZone": "zona o null",
  "confidence": 0.0
}
Reglas:
- No inventes hechos ni nombres.
- No cierres, resuelvas ni modifiques la incidencia.
- No des instrucciones peligrosas.
- Si hay riesgo para personas, usa priority critical y recomienda llamar a emergencias.
- No incluyas datos personales.
- Responde en español.
"""


def _extract_json(content: str) -> dict | None:
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        payload = json.loads(text)
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            payload = json.loads(text[start : end + 1])
            return payload if isinstance(payload, dict) else None
        except json.JSONDecodeError:
            return None


IMAGE_PROMPT = """Analiza únicamente lo visible en la imagen de una incidencia universitaria.
Devuelve SOLO JSON válido con esta forma:
{
  "category": "categoría breve",
  "priority": "low|medium|high|critical",
  "observations": ["observación objetiva 1", "observación objetiva 2"],
  "safetyConcerns": ["riesgo visible 1"],
  "confidence": 0.0
}
Reglas:
- No identifiques personas ni inferas atributos personales.
- No inventes lo que no se ve.
- Si hay riesgo inmediato para personas, usa priority critical.
- No cierres ni modifiques la incidencia.
- Responde en español.
"""


async def analyze_image_with_ollama(
    settings: Settings,
    client: httpx.AsyncClient,
    *,
    incident_type: str,
    description: str | None,
    image_base64: str,
) -> dict | None:
    if not settings.ollama_url or not settings.ollama_vision_model:
        return None
    cleaned = image_base64.strip()
    if "," in cleaned and cleaned.lower().startswith("data:"):
        cleaned = cleaned.split(",", 1)[1]
    prompt = (
        f"Tipo declarado: {incident_type}\n"
        f"Descripción del reportante: {description or 'sin descripción'}"
    )
    try:
        response = await client.post(
            f"{settings.ollama_url.rstrip('/')}/api/chat",
            json={
                "model": settings.ollama_vision_model,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.1, "num_predict": 350},
                "messages": [
                    {"role": "system", "content": IMAGE_PROMPT},
                    {"role": "user", "content": prompt, "images": [cleaned]},
                ],
            },
            timeout=settings.ollama_timeout_seconds,
        )
        response.raise_for_status()
        body = response.json()
        message = body.get("message") or {}
        content = message.get("content")
        if not isinstance(content, str):
            return None
        payload = _extract_json(content)
        if payload is None:
            logger.warning("Ollama visión devolvió contenido que no es JSON válido")
        return payload
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Ollama visión no disponible: %s", exc)
        return None


async def suggest_with_ollama(
    settings: Settings,
    client: httpx.AsyncClient,
    *,
    incident_type: str,
    title: str,
    description: str,
    zone: str | None,
) -> dict | None:
    if not settings.ollama_url or not settings.ollama_model:
        return None
    prompt = (
        f"Tipo de incidencia: {incident_type}\n"
        f"Zona: {zone or 'no indicada'}\n"
        f"Título: {title}\n"
        f"Descripción: {description or 'sin descripción'}"
    )
    try:
        response = await client.post(
            f"{settings.ollama_url.rstrip('/')}/api/chat",
            json={
                "model": settings.ollama_model,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.1, "num_predict": 350},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=settings.ollama_timeout_seconds,
        )
        response.raise_for_status()
        body = response.json()
        message = body.get("message") or {}
        content = message.get("content")
        if not isinstance(content, str):
            return None
        payload = _extract_json(content)
        if payload is None:
            logger.warning("Ollama devolvió contenido que no es JSON válido")
        return payload
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Ollama no disponible: %s", exc)
        return None
