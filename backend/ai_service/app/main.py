from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_auth_context, repository
from .config import Settings, get_settings
from .ml import compute_patterns, rank_duplicates
from .models import (
    AuthContext,
    DuplicateCheck,
    DuplicateRequest,
    GeoAnalysis,
    HotspotsRequest,
    ImageAnalysis,
    ImageAnalysisRequest,
    IncidentPatterns,
    IncidentSuggestion,
    PatternsRequest,
    SuggestRequest,
)
from .ollama import analyze_image_with_ollama, suggest_with_ollama
from .rules import merge_ollama_suggestion, rule_suggestion
from .supabase import SupabaseError, SupabaseRepository

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    timeout = httpx.Timeout(20.0, connect=6.0)
    client = httpx.AsyncClient(timeout=timeout)
    app.state.http = client
    try:
        app.state.repository = SupabaseRepository(settings, client)
    except SupabaseError as exc:
        logger.warning("Servicio de IA sin Supabase configurado: %s", exc)
        app.state.repository = None
    yield
    await client.aclose()


app = FastAPI(
    title="Centinela AI Service",
    version="1.0.0",
    description="Clasificación, duplicados, patrones y hotspots por universidad.",
    lifespan=lifespan,
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
async def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
        "supabase_configured": bool(settings.supabase_url and settings.supabase_service_role_key),
        "jwt_configured": bool(settings.supabase_jwt_secret or settings.resolved_jwks_url),
        "ollama_configured": bool(settings.ollama_url and settings.ollama_model),
        "ollama_vision_configured": bool(
            settings.ollama_url and settings.ollama_vision_model
        ),
    }


async def resolve_organization(
    requested: str | None,
    auth: AuthContext,
    repo: SupabaseRepository,
) -> str:
    if auth.role == "superadmin":
        if not requested:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "El superadmin debe indicar organizationId para analizar una universidad.",
            )
        organization_id = requested
    else:
        if not auth.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tu usuario no tiene universidad asignada.")
        if requested and requested != auth.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes analizar otra universidad.")
        organization_id = auth.organization_id

    try:
        organization = await repo.get_organization(organization_id)
        if organization is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "La universidad no existe.")
        if organization.get("status") != "activa":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "La universidad está suspendida.")
        usage = await repo.get_license_usage(organization_id)
    except SupabaseError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    if not usage or usage.get("status") != "activa":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "La licencia de la universidad no está activa.")
    return organization_id


@app.post("/ai/suggest", response_model=IncidentSuggestion)
async def suggest_incident(
    body: SuggestRequest,
    request: Request,
    auth: AuthContext = Depends(get_auth_context),
    repo: SupabaseRepository = Depends(repository),
) -> IncidentSuggestion:
    await resolve_organization(body.organizationId, auth, repo)
    fallback = rule_suggestion(body.type, body.title, body.description, body.zone)
    payload = await suggest_with_ollama(
        get_settings(),
        request.app.state.http,
        incident_type=body.type,
        title=body.title,
        description=body.description,
        zone=body.zone,
    )
    if payload:
        return merge_ollama_suggestion(fallback, payload)
    return fallback


@app.post("/ai/image", response_model=ImageAnalysis)
async def analyze_image(
    body: ImageAnalysisRequest,
    request: Request,
    auth: AuthContext = Depends(get_auth_context),
    repo: SupabaseRepository = Depends(repository),
) -> ImageAnalysis:
    await resolve_organization(body.organizationId, auth, repo)
    fallback = rule_suggestion(body.type, "Foto de incidencia", body.description or "", None)
    payload = await analyze_image_with_ollama(
        get_settings(),
        request.app.state.http,
        incident_type=body.type,
        description=body.description,
        image_base64=body.image_base64,
    )
    if not payload:
        return ImageAnalysis(
            category=fallback.category,
            priority=fallback.priority,
            observations=[],
            safetyConcerns=[],
            confidence=0.0,
            source="unavailable",
        )

    def string_list(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()][:6]

    priority = payload.get("priority")
    if priority not in ("low", "medium", "high", "critical"):
        priority = fallback.priority
    try:
        confidence = float(payload.get("confidence", 0.6))
    except (TypeError, ValueError):
        confidence = 0.6
    confidence = min(0.95, max(0.2, confidence))
    category = str(payload.get("category") or fallback.category).strip()[:80]

    return ImageAnalysis(
        category=category or fallback.category,
        priority=priority,
        observations=string_list(payload.get("observations")),
        safetyConcerns=string_list(payload.get("safetyConcerns")),
        confidence=confidence,
        source="ollama",
    )


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    import math

    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    value = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(value))


@app.post("/ai/duplicates", response_model=DuplicateCheck)
async def check_duplicates(
    body: DuplicateRequest,
    auth: AuthContext = Depends(get_auth_context),
    repo: SupabaseRepository = Depends(repository),
) -> DuplicateCheck:
    organization_id = await resolve_organization(body.organizationId, auth, repo)
    settings = get_settings()

    try:
        incidents = await repo.get_incidents(organization_id, days=30)
    except SupabaseError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    incidents = [item for item in incidents if item.id != body.excludeIncidentId]
    distances: dict[str, float] = {}
    source = "rules"
    has_point = body.latitude is not None and body.longitude is not None

    if has_point:
        try:
            nearby = await repo.incidents_nearby(
                organization_id,
                body.latitude or 0,
                body.longitude or 0,
                body.radiusM or settings.duplicate_radius_m,
            )
            distances = {item.incident_id: item.distance_m for item in nearby}
            source = "postgis"
        except SupabaseError as exc:
            logger.warning("PostGIS no disponible para duplicados: %s", exc)

    if body.zoneId or distances:
        candidates = [
            item
            for item in incidents
            if item.zone_id == body.zoneId or item.id in distances
        ]
    elif has_point and source == "postgis":
        candidates = []
    else:
        candidates = incidents

    # Si PostGIS no respondió y hay coordenadas, calculamos distancia en Python.
    if has_point and source != "postgis":
        distances = {
            item.id: _haversine_m(
                body.latitude or 0,
                body.longitude or 0,
                item.point.lat,
                item.point.lng,
            )
            for item in incidents
            if item.point is not None
        }
        candidates = incidents

    ranked = rank_duplicates(
        body.title,
        body.description,
        body.type,
        candidates,
        distances=distances or None,
        zone_id=body.zoneId,
    )
    return DuplicateCheck(
        likelyDuplicate=bool(ranked),
        candidates=ranked,
        source=source,  # type: ignore[arg-type]
    )


@app.post("/ai/patterns", response_model=IncidentPatterns)
async def incident_patterns(
    body: PatternsRequest,
    auth: AuthContext = Depends(get_auth_context),
    repo: SupabaseRepository = Depends(repository),
) -> IncidentPatterns:
    organization_id = await resolve_organization(body.organizationId, auth, repo)
    try:
        incidents = await repo.get_incidents(organization_id, days=body.days)
    except SupabaseError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    try:
        return compute_patterns(incidents, body.days)
    except Exception as exc:  # noqa: BLE001 - se degrada a un resumen seguro
        logger.exception("No se pudieron calcular patrones: %s", exc)
        return IncidentPatterns(
            patterns=[],
            summary="No se pudieron calcular patrones en este momento.",
            totalIncidents=len(incidents),
            periodDays=body.days,
            source="rules",
        )


@app.post("/ai/hotspots", response_model=GeoAnalysis)
async def incident_hotspots(
    body: HotspotsRequest,
    auth: AuthContext = Depends(get_auth_context),
    repo: SupabaseRepository = Depends(repository),
) -> GeoAnalysis:
    organization_id = await resolve_organization(body.organizationId, auth, repo)
    settings = get_settings()
    try:
        hotspots = await repo.incident_hotspots(
            organization_id,
            settings.hotspot_radius_m,
            settings.hotspot_min_incidents,
            body.days,
        )
        return GeoAnalysis(hotspots=hotspots, source="postgis")
    except SupabaseError as exc:
        logger.warning("PostGIS no disponible para hotspots: %s", exc)
        return GeoAnalysis(hotspots=[], source="unavailable")
