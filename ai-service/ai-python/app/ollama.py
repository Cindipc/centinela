from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import Settings
from .models import IncidentPriority, IncidentType, ImageAnalysis, SummaryResponse
from .rules import fallback_summary


def _strip_json(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


def _parse_json(value: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(_strip_json(value))
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


async def model_status(client: httpx.AsyncClient, settings: Settings) -> dict[str, Any]:
    try:
        response = await client.get(f"{settings.ollama_url.rstrip('/')}/api/tags", timeout=3.0)
        if response.status_code >= 400:
            return {"status": "unavailable", "models": [], "model": settings.ollama_model}
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return {"status": "unavailable", "models": [], "model": settings.ollama_model}

    models = [str(item.get("name") or item.get("model") or "") for item in payload.get("models", [])]
    configured = settings.ollama_model
    installed = any(
        name == configured or name.startswith(f"{configured}:") or configured.startswith(f"{name}:")
        for name in models
    )
    return {
        "status": "ok" if installed else "model_missing",
        "models": models,
        "model": configured,
        "configuredModelInstalled": installed,
        "url": settings.ollama_url,
    }


async def generate_json(
    client: httpx.AsyncClient,
    settings: Settings,
    system: str,
    prompt: str,
    timeout: float | None = None,
) -> dict[str, Any] | None:
    try:
        response = await client.post(
            f"{settings.ollama_url.rstrip('/')}/api/generate",
            json={
                "model": settings.ollama_model,
                "system": system,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2, "num_predict": 450},
            },
            timeout=timeout or settings.ollama_timeout_seconds,
        )
    except (httpx.HTTPError, OSError):
        return None
    if response.status_code >= 400:
        return None
    try:
        body = response.json()
    except ValueError:
        return None
    return _parse_json(str(body.get("response") or ""))


async def summarize(
    client: httpx.AsyncClient,
    settings: Settings,
    kind: str,
    title: str | None,
    context: dict[str, Any],
) -> SummaryResponse:
    fallback_text, fallback_recommendations = fallback_summary(kind, context)
    payload = json.dumps(context, ensure_ascii=False, default=str)[:12_000]
    system = (
        "Eres Centinela IA, analista de seguridad y soporte de una universidad. "
        "Respondes en español claro, breve y accionable. No inventes datos que no estén en el contexto. "
        "Devuelve SOLO JSON con las claves summary (string) y recommendations (array de strings)."
    )
    prompt = (
        f"Tipo de análisis: {kind}. Título: {title or 'Análisis del campus'}.\n"
        f"Contexto JSON:\n{payload}\n"
        "Genera un resumen de 2 a 4 oraciones y hasta 4 recomendaciones concretas."
    )
    result = await generate_json(client, settings, system, prompt)
    if not result:
        return SummaryResponse(summary=fallback_text, recommendations=fallback_recommendations, source="fallback")
    summary_text = str(result.get("summary") or fallback_text).strip()
    raw_recommendations = result.get("recommendations")
    recommendations = (
        [str(item).strip() for item in raw_recommendations if str(item).strip()][:5]
        if isinstance(raw_recommendations, list)
        else fallback_recommendations
    )
    return SummaryResponse(
        summary=summary_text[:1200],
        recommendations=recommendations or fallback_recommendations,
        source="ollama",
    )


async def assignment_narrative(
    client: httpx.AsyncClient,
    settings: Settings,
    title: str,
    incident_type: IncidentType,
    priority: IncidentPriority,
    suggestions: list[dict[str, Any]],
) -> str | None:
    if not suggestions:
        return None
    best = suggestions[0]
    context = {
        "reporte": title,
        "tipo": incident_type,
        "prioridad": priority,
        "sugerido": best.get("name"),
        "distancia_m": best.get("distanceMeters"),
        "carga": best.get("activeLoad"),
        "motivos": best.get("reasons"),
    }
    result = await generate_json(
        client,
        settings,
        "Eres un despachador de seguridad. Explica en una sola oración por qué asignar el reporte "
        "al colaborador sugerido. Devuelve JSON {narrative: string}. No inventes datos.",
        json.dumps(context, ensure_ascii=False),
        timeout=min(settings.ollama_timeout_seconds, 12.0),
    )
    if not result:
        return None
    narrative = str(result.get("narrative") or "").strip()
    return narrative[:400] or None


async def suggest_narrative(
    client: httpx.AsyncClient,
    settings: Settings,
    incident_type: IncidentType,
    title: str,
    description: str | None,
    category: str,
    priority: IncidentPriority,
) -> str | None:
    result = await generate_json(
        client,
        settings,
        "Eres Centinela IA. Resume en 2 oraciones el reporte y su atención recomendada, "
        "sin inventar datos. Devuelve JSON {summary: string}.",
        json.dumps(
            {
                "tipo": incident_type,
                "titulo": title,
                "descripcion": description,
                "categoria": category,
                "prioridad": priority,
            },
            ensure_ascii=False,
        ),
        timeout=min(settings.ollama_timeout_seconds, 12.0),
    )
    if not result:
        return None
    summary_text = str(result.get("summary") or "").strip()
    return summary_text[:600] or None


async def analyze_image(
    client: httpx.AsyncClient,
    settings: Settings,
    image_base64: str,
    media_type: str,
    incident_type: IncidentType,
    description: str | None,
) -> ImageAnalysis | None:
    model = settings.ollama_vision_model or settings.ollama_model
    prompt = (
        "Analiza la imagen de un reporte universitario. No identifiques personas. "
        "Devuelve SOLO JSON con category (string), priority (low|medium|high|critical), "
        "observations (array de strings), safetyConcerns (array de strings) y confidence (0 a 1). "
        f"Tipo declarado: {incident_type}. Descripción: {description or 'sin descripción'}."
    )
    try:
        response = await client.post(
            f"{settings.ollama_url.rstrip('/')}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "images": [image_base64],
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.1, "num_predict": 350},
            },
            timeout=settings.ollama_timeout_seconds,
        )
    except (httpx.HTTPError, OSError):
        return None
    if response.status_code >= 400:
        return None
    try:
        body = response.json()
    except ValueError:
        return None
    result = _parse_json(str(body.get("response") or ""))
    if not result:
        return None
    priority = str(result.get("priority") or "medium").lower()
    if priority not in {"low", "medium", "high", "critical"}:
        priority = "medium"
    observations = result.get("observations")
    safety = result.get("safetyConcerns")
    try:
        confidence = float(result.get("confidence") or 0.5)
    except (TypeError, ValueError):
        confidence = 0.5
    return ImageAnalysis(
        category=str(result.get("category") or "Otro")[:120],
        priority=priority,  # type: ignore[arg-type]
        observations=[str(item) for item in observations][:6] if isinstance(observations, list) else [],
        safetyConcerns=[str(item) for item in safety][:6] if isinstance(safety, list) else [],
        confidence=max(0.0, min(1.0, confidence)),
        source="ollama",
    )
