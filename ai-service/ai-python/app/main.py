from __future__ import annotations

import difflib
import sys
from contextlib import asynccontextmanager
from typing import Any, Iterable

import httpx
import numpy
import sklearn
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from . import ollama, rules
from .assignment import suggest_staff
from .auth import get_optional_auth_context, repository, resolve_organization
from .config import Settings, get_settings
from .java_client import JavaClient
from .ml import (
    cluster_reports,
    compute_hotspots,
    compute_patterns,
    filter_incidents,
)
from .models import (
    AnalysisFilters,
    AssignRequest,
    AssignmentReport,
    AssignmentResponse,
    AuthContext,
    Classification,
    ClassifyRequest,
    ClusterRequest,
    ClusterResponse,
    DuplicateCandidate,
    DuplicateCheck,
    DuplicateRequest,
    GeoAnalysis,
    GeoPoint,
    Hotspot,
    HotspotsRequest,
    ImageAnalysis,
    ImageAnalysisRequest,
    IncidentPatterns,
    IncidentSuggestion,
    PatternsRequest,
    SummaryRequest,
    SummaryResponse,
    TrainRequest,
    TrainResponse,
    StoredIncident,
    SuggestRequest,
)
from .seed import generate_demo_incidents, synthetic_staff
from .supabase import SupabaseError, SupabaseRepository

VERSION = "1.0.0"
ANALYTICS_ROLES = {"admin", "superadmin"}
ASSIGN_ROLES = {"admin", "superadmin", "seguridad", "ti"}
TRAIN_ROLES = {"admin", "superadmin", "ti"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = httpx.AsyncClient()
    repo: SupabaseRepository | None = None
    if settings.supabase_base_url and settings.service_role_key:
        repo = SupabaseRepository(settings, client)
    app.state.settings = settings
    app.state.client = client
    app.state.repository = repo
    app.state.java = JavaClient(settings, client)
    yield
    await client.aclose()


app = FastAPI(
    title="Centinela AI Service",
    version=VERSION,
    description=(
        "Gateway de IA para Centinela: scikit-learn (hotspots/patrones/clustering), "
        "DL4J (clasificación/priorización) y Ollama (resúmenes)."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


def _client(request: Request) -> httpx.AsyncClient:
    return request.app.state.client


def _java(request: Request) -> JavaClient:
    return request.app.state.java


def _settings() -> Settings:
    return get_settings()


def _ensure_role(context: AuthContext, allowed: set[str], action: str) -> None:
    if context.role not in allowed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"No tienes permiso para {action}.",
        )


async def _load_dataset(
    repo: SupabaseRepository | None,
    settings: Settings,
    organization_id: str,
    days: int,
) -> tuple[list[StoredIncident], str, bool, str | None]:
    incidents: list[StoredIncident] = []
    warning: str | None = None

    if repo is not None and repo.is_configured:
        try:
            incidents = await repo.get_incidents(organization_id, days)
        except SupabaseError as exc:
            warning = str(exc)
            incidents = []

    if len(incidents) >= settings.synthetic_min_incidents or not settings.allow_synthetic:
        return incidents, "supabase", False, warning

    count = max(140, min(320, days * 6))
    spread = min(60, max(days, 3))
    demo = filter_incidents(
        generate_demo_incidents(settings, count=count, spread_days=spread),
        days=days,
    )
    return demo, "synthetic", True, warning


def _filtered(
    incidents: Iterable[StoredIncident],
    filters: AnalysisFilters,
) -> list[StoredIncident]:
    return filter_incidents(
        incidents,
        days=filters.days,
        hour_from=filters.hourFrom,
        hour_to=filters.hourTo,
        incident_type=filters.type,
        priority=filters.priority,
    )


def _patterns_narrative_context(patterns: IncidentPatterns) -> dict[str, Any]:
    return {
        "totalIncidents": patterns.totalIncidents,
        "periodDays": patterns.periodDays,
        "peakHours": patterns.peakHours,
        "topZones": [bucket.zone for bucket in patterns.byZone[:4]],
        "byType": [bucket.model_dump() for bucket in patterns.byType],
        "patterns": [item.model_dump() for item in patterns.patterns[:4]],
    }


def _hotspots_narrative_context(hotspots: list[Hotspot], total: int) -> dict[str, Any]:
    return {
        "totalIncidents": total,
        "hotspotCount": len(hotspots),
        "highestRisk": hotspots[0].riskLevel if hotspots else "low",
        "hotspots": [
            {
                "zone": item.zone,
                "riskLevel": item.riskLevel,
                "incidentCount": item.incidentCount,
                "peakHour": item.peakHour,
                "score": item.score,
                "label": item.label,
            }
            for item in hotspots[:5]
        ],
    }


def _clusters_narrative_context(clusters: list[Any], total: int) -> dict[str, Any]:
    return {
        "totalIncidents": total,
        "clusterCount": len(clusters),
        "clusters": [
            {
                "label": item.label,
                "incidentCount": item.incidentCount,
                "avgPriority": item.avgPriority,
                "topTerms": item.topTerms[:3],
                "score": item.score,
            }
            for item in clusters[:5]
        ],
    }


def _fallback_classification(
    incident_type: Any,
    title: str,
    description: str | None,
    zone: str | None,
    created_at: str | None,
) -> Classification:
    result = rules.classify(incident_type, title, description, zone, created_at)
    return Classification(
        type=result["type"],
        priority=result["priority"],
        priorityScore=result["priorityScore"],
        category=result["category"],
        confidence=result["confidence"],
        probabilities=result["probabilities"],
        source="rules",
        reasons=result["reasons"],
    )


def _java_classification(result: dict[str, Any], fallback: Classification) -> Classification:
    priority = str(result.get("priority") or fallback.priority).lower()
    if priority not in {"low", "medium", "high", "critical"}:
        priority = fallback.priority
    incident_type = str(result.get("type") or fallback.type)
    if incident_type not in {"seguridad", "equipo"}:
        incident_type = fallback.type
    probabilities = result.get("probabilities")
    reasons = result.get("reasons")
    try:
        priority_score = float(result.get("priorityScore") or fallback.priorityScore)
    except (TypeError, ValueError):
        priority_score = fallback.priorityScore
    try:
        confidence = float(result.get("confidence") or fallback.confidence)
    except (TypeError, ValueError):
        confidence = fallback.confidence
    return Classification(
        type=incident_type,  # type: ignore[arg-type]
        priority=priority,  # type: ignore[arg-type]
        priorityScore=max(0.0, min(1.0, priority_score)),
        category=str(result.get("category") or fallback.category)[:120],
        confidence=max(0.0, min(1.0, confidence)),
        probabilities={
            str(key): float(value)
            for key, value in probabilities.items()
            if isinstance(value, (int, float))
        }
        if isinstance(probabilities, dict)
        else fallback.probabilities,
        source="dl4j",
        reasons=[str(item) for item in reasons][:6] if isinstance(reasons, list) else fallback.reasons,
    )


async def _classify(
    body: ClassifyRequest,
    java: JavaClient,
    mode: str = "classify",
) -> Classification:
    incident_type = body.type or rules.infer_type(body.title, body.description)
    fallback = _fallback_classification(
        incident_type,
        body.title,
        body.description,
        body.zone,
        body.createdAt,
    )
    payload = {
        "type": incident_type,
        "title": body.title,
        "description": body.description,
        "zone": body.zone,
        "zoneId": body.zoneId,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "createdAt": body.createdAt,
    }
    result = await (java.prioritize(payload) if mode == "prioritize" else java.classify(payload))
    if not result:
        return fallback
    return _java_classification(result, fallback)


def _text_similarity(left: str, right: str) -> float:
    return round(
        difflib.SequenceMatcher(
            None,
            rules.normalize(left),
            rules.normalize(right),
        ).ratio(),
        3,
    )


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "service": "centinela-ai-python",
        "version": VERSION,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
@app.get("/ai/health")
async def health(
    request: Request,
    settings: Settings = Depends(_settings),
) -> dict[str, Any]:
    client: httpx.AsyncClient = request.app.state.client
    java: JavaClient = request.app.state.java
    repo: SupabaseRepository | None = request.app.state.repository
    java_health = await java.health()
    ollama_health = await ollama.model_status(client, settings)
    java_ok = java_health.get("status") == "ok"
    ollama_ok = ollama_health.get("status") == "ok"
    return {
        "status": "ok" if java_ok and ollama_ok else "degraded",
        "service": "centinela-ai-python",
        "version": VERSION,
        "python": sys.version.split()[0],
        "scikitLearn": sklearn.__version__,
        "numpy": numpy.__version__,
        "authRequired": settings.ai_auth_required,
        "syntheticFallback": settings.allow_synthetic,
        "models": {
            "hotspots": "DBSCAN + haversine (scikit-learn)",
            "patterns": "TF-IDF + KMeans + pandas (scikit-learn)",
            "clustering": "TF-IDF + DBSCAN coseno (scikit-learn)",
            "classification": "DL4J MLP (Java gateway)",
            "narrative": settings.ollama_model,
        },
        "dependencies": {
            "supabase": {
                "configured": bool(repo and repo.is_configured),
                "authRequired": settings.ai_auth_required,
            },
            "java": java_health,
            "ollama": ollama_health,
        },
    }


@app.post("/ai/suggest", response_model=IncidentSuggestion)
async def suggest(
    body: SuggestRequest,
    request: Request,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
    java: JavaClient = Depends(_java),
) -> IncidentSuggestion:
    organization = await resolve_organization(context, repo, settings, body.organizationId)
    del organization

    base = rules.suggest(body.type, body.title, body.description, body.zone)
    classification = await _classify(
        ClassifyRequest(
            type=body.type,
            title=body.title,
            description=body.description,
            zone=body.zone,
            latitude=body.latitude,
            longitude=body.longitude,
        ),
        java,
    )
    base.category = classification.category
    base.priority = classification.priority
    base.confidence = classification.confidence
    if classification.source == "dl4j":
        base.source = "dl4j"
    if body.narrative:
        narrative = await ollama.suggest_narrative(
            request.app.state.client,
            settings,
            body.type,
            body.title,
            body.description,
            classification.category,
            classification.priority,
        )
        if narrative:
            base.summary = narrative
            base.source = "ollama"
    return base


@app.post("/ai/image", response_model=ImageAnalysis)
async def analyze_image(
    body: ImageAnalysisRequest,
    request: Request,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
) -> ImageAnalysis:
    organization = await resolve_organization(context, repo, settings, body.organizationId)
    del organization
    result = await ollama.analyze_image(
        request.app.state.client,
        settings,
        body.image_base64,
        body.media_type,
        body.type,
        body.description,
    )
    if result is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Ollama no está disponible o el modelo de visión no está instalado.",
        )
    return result


@app.post("/ai/duplicates", response_model=DuplicateCheck)
async def duplicates(
    body: DuplicateRequest,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
) -> DuplicateCheck:
    organization = await resolve_organization(context, repo, settings, body.organizationId)
    radius = body.radiusM or settings.duplicate_radius_m
    candidates: list[DuplicateCandidate] = []
    source: str = "rules"

    if repo is not None and repo.is_configured and body.latitude is not None and body.longitude is not None:
        try:
            nearby = await repo.incidents_nearby(
                organization,
                body.latitude,
                body.longitude,
                radius,
            )
            for item in nearby:
                if item.incident_id == body.excludeIncidentId:
                    continue
                similarity = _text_similarity(body.title, item.title)
                candidates.append(
                    DuplicateCandidate(
                        incidentId=item.incident_id,
                        code=item.code,
                        title=item.title,
                        status=item.status,
                        zone=item.zone_name,
                        createdAt=item.created_at,
                        distanceMeters=round(item.distance_m, 1),
                        similarity=similarity,
                    )
                )
            source = "postgis"
        except SupabaseError:
            candidates = []

    if not candidates:
        demo = generate_demo_incidents(settings, count=180, spread_days=60)
        for incident in demo:
            if incident.id == body.excludeIncidentId:
                continue
            if incident.type != body.type:
                continue
            distance = None
            if body.latitude is not None and body.longitude is not None and incident.point:
                from .ml import haversine_m

                distance = haversine_m(
                    body.latitude,
                    body.longitude,
                    incident.point.lat,
                    incident.point.lng,
                )
                if distance > radius * 2.5:
                    continue
            similarity = _text_similarity(
                f"{body.title} {body.description or ''}",
                f"{incident.title} {incident.description or ''}",
            )
            if similarity < 0.3 and (distance is None or distance > radius):
                continue
            candidates.append(
                DuplicateCandidate(
                    incidentId=incident.id,
                    code=incident.code,
                    title=incident.title,
                    status=incident.status,
                    zone=incident.zone_name,
                    createdAt=incident.created_at,
                    distanceMeters=round(distance, 1) if distance is not None else None,
                    similarity=similarity,
                )
            )
        source = "rules"

    candidates.sort(
        key=lambda item: (
            -item.similarity,
            item.distanceMeters if item.distanceMeters is not None else 99999,
        )
    )
    top = candidates[:5]
    likely = bool(top and (top[0].similarity >= 0.55 or (top[0].distanceMeters or 999) <= 60))
    return DuplicateCheck(likelyDuplicate=likely, candidates=top, source=source)  # type: ignore[arg-type]


@app.post("/ai/hotspots", response_model=GeoAnalysis)
async def hotspots(
    body: HotspotsRequest,
    request: Request,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
) -> GeoAnalysis:
    _ensure_role(context, ANALYTICS_ROLES, "ver el análisis geoespacial")
    organization = await resolve_organization(context, repo, settings, body.organizationId)
    incidents, data_source, synthetic, warning = await _load_dataset(
        repo, settings, organization, body.days
    )
    filtered = _filtered(incidents, body)
    if not filtered:
        return GeoAnalysis(
            hotspots=[],
            source="unavailable",
            totalIncidents=0,
            isSynthetic=synthetic,
            narrative=warning,
        )

    result = compute_hotspots(
        filtered,
        radius_m=settings.hotspot_radius_m,
        min_incidents=body.minIncidents,
    )
    narrative = None
    if body.narrative and result:
        summary_result = await ollama.summarize(
            request.app.state.client,
            settings,
            "hotspots",
            "Focos de riesgo en el campus",
            _hotspots_narrative_context(result, len(filtered)),
        )
        narrative = summary_result.summary
    return GeoAnalysis(
        hotspots=result,
        source="synthetic" if synthetic else "scikit-learn",
        totalIncidents=len(filtered),
        isSynthetic=synthetic,
        model="DBSCAN + haversine (scikit-learn)",
        narrative=narrative,
    )


@app.post("/ai/patterns", response_model=IncidentPatterns)
async def patterns(
    body: PatternsRequest,
    request: Request,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
) -> IncidentPatterns:
    _ensure_role(context, ANALYTICS_ROLES, "ver patrones")
    organization = await resolve_organization(context, repo, settings, body.organizationId)
    incidents, _data_source, synthetic, warning = await _load_dataset(
        repo, settings, organization, body.days
    )
    filtered = _filtered(incidents, body)
    result = compute_patterns(filtered, days=body.days)
    result.isSynthetic = synthetic
    if synthetic:
        result.source = "synthetic"
    elif not filtered:
        result.summary = warning or result.summary
    if body.narrative and filtered:
        summary_result = await ollama.summarize(
            request.app.state.client,
            settings,
            "patterns",
            "Patrones de incidencia",
            _patterns_narrative_context(result),
        )
        result.narrative = summary_result.summary
    return result


@app.post("/ai/cluster", response_model=ClusterResponse)
async def cluster(
    body: ClusterRequest,
    request: Request,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
) -> ClusterResponse:
    _ensure_role(context, ANALYTICS_ROLES, "ver agrupaciones de reportes")
    organization = await resolve_organization(context, repo, settings, body.organizationId)
    incidents, _data_source, synthetic, warning = await _load_dataset(
        repo, settings, organization, body.days
    )
    filtered = _filtered(incidents, body)
    if not filtered:
        return ClusterResponse(
            clusters=[],
            totalIncidents=0,
            source="unavailable",
            isSynthetic=synthetic,
            narrative=warning,
        )
    result = cluster_reports(
        filtered,
        min_cluster_size=body.minClusterSize,
    )
    narrative = None
    if body.narrative and result:
        summary_result = await ollama.summarize(
            request.app.state.client,
            settings,
            "patterns",
            "Agrupaciones de reportes similares",
            _clusters_narrative_context(result, len(filtered)),
        )
        narrative = summary_result.summary
    return ClusterResponse(
        clusters=result,
        totalIncidents=len(filtered),
        source="synthetic" if synthetic else "scikit-learn",
        isSynthetic=synthetic,
        narrative=narrative,
    )


@app.post("/ai/classify", response_model=Classification)
async def classify(
    body: ClassifyRequest,
    java: JavaClient = Depends(_java),
) -> Classification:
    return await _classify(body, java, mode="classify")


@app.post("/ai/prioritize", response_model=Classification)
async def prioritize(
    body: ClassifyRequest,
    java: JavaClient = Depends(_java),
) -> Classification:
    return await _classify(body, java, mode="prioritize")


@app.post("/ai/train", response_model=TrainResponse)
async def train(
    body: TrainRequest,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
    java: JavaClient = Depends(_java),
) -> TrainResponse:
    _ensure_role(context, TRAIN_ROLES, "entrenar modelos")
    organization = await resolve_organization(context, repo, settings, body.organizationId)

    if body.incidents:
        samples = [
            item.model_dump() | {"isSynthetic": False}
            for item in body.incidents
        ]
        synthetic = False
    else:
        incidents, _data_source, synthetic, warning = await _load_dataset(
            repo, settings, organization, body.days
        )
        samples = [
            {
                "type": item.type,
                "priority": item.priority,
                "title": item.title,
                "description": item.description,
                "zone": item.zone_name,
                "createdAt": item.created_at,
                "isSynthetic": synthetic,
            }
            for item in filter_incidents(incidents, days=body.days)
        ]

    if not samples:
        return TrainResponse(
            trained=False,
            samples=0,
            source="unavailable",
            detail="No hay datos para entrenar.",
        )

    result = await java.train({"incidents": samples, "days": body.days})
    if not result:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "El servicio Java DL4J no está disponible. Inicia ai-service/ai-java en el puerto 8003.",
        )
    return TrainResponse(
        trained=bool(result.get("trained")),
        samples=int(result.get("samples") or len(samples)),
        typeAccuracy=result.get("typeAccuracy"),
        priorityAccuracy=result.get("priorityAccuracy"),
        source="dl4j",
        detail=str(result.get("detail") or "Modelo entrenado con DL4J."),
    )


@app.post("/ai/assign", response_model=AssignmentResponse)
async def assign(
    body: AssignRequest,
    request: Request,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
) -> AssignmentResponse:
    _ensure_role(context, ASSIGN_ROLES, "asignar reportes")
    organization = await resolve_organization(context, repo, settings, body.organizationId)

    priority = body.priority
    if priority is None:
        priority = rules.classify(
            body.type,
            body.title,
            body.description,
        )["priority"]

    point = None
    if body.latitude is not None and body.longitude is not None:
        point = GeoPoint(lat=body.latitude, lng=body.longitude)
    report = AssignmentReport(
        type=body.type,
        priority=priority,
        title=body.title,
        zone=body.zone,
        point=point,
    )

    staff = body.staff
    source = "fallback"
    if staff is None:
        source = "demo"
        staff = synthetic_staff()
        if repo is not None and repo.is_configured:
            try:
                live_staff = await repo.get_staff(organization)
            except SupabaseError:
                live_staff = []
            if live_staff:
                staff = live_staff
                source = "supabase"

    suggestions = suggest_staff(report, staff)
    narrative = None
    if body.narrative and suggestions:
        payload = [item.model_dump() for item in suggestions]
        narrative = await ollama.assignment_narrative(
            request.app.state.client,
            settings,
            body.title,
            body.type,
            priority,
            payload,
        )
        if not narrative:
            narrative, _recommendations = rules.fallback_summary(
                "assignment",
                {
                    "name": suggestions[0].name,
                    "etaMinutes": suggestions[0].etaMinutes,
                },
            )

    return AssignmentResponse(
        report=report,
        suggestions=suggestions,
        source=source,  # type: ignore[arg-type]
        narrative=narrative,
    )


@app.post("/ai/summary", response_model=SummaryResponse)
async def summary(
    body: SummaryRequest,
    request: Request,
    context: AuthContext = Depends(get_optional_auth_context),
    repo: SupabaseRepository | None = Depends(repository),
    settings: Settings = Depends(_settings),
) -> SummaryResponse:
    organization = await resolve_organization(context, repo, settings, body.organizationId)
    payload = dict(body.context)

    if not payload and body.kind in {"patterns", "hotspots"}:
        incidents, _data_source, _synthetic, _warning = await _load_dataset(
            repo, settings, organization, body.days
        )
        filtered = filter_incidents(incidents, days=body.days)
        if body.kind == "patterns":
            patterns_result = compute_patterns(filtered, days=body.days)
            payload = _patterns_narrative_context(patterns_result)
        else:
            hotspots_result = compute_hotspots(
                filtered,
                radius_m=settings.hotspot_radius_m,
                min_incidents=settings.hotspot_min_incidents,
            )
            payload = _hotspots_narrative_context(hotspots_result, len(filtered))

    return await ollama.summarize(
        request.app.state.client,
        settings,
        body.kind,
        body.title,
        payload,
    )


@app.post("/ai/seed")
async def seed(
    count: int = 140,
    spreadDays: int = 60,
    settings: Settings = Depends(_settings),
) -> dict[str, Any]:
    incidents = generate_demo_incidents(
        settings,
        count=max(1, min(count, 500)),
        spread_days=max(1, min(spreadDays, 365)),
    )
    return {
        "generated": len(incidents),
        "isSynthetic": True,
        "spreadDays": spreadDays,
        "zones": 10,
        "note": (
            "Dataset sintético determinista generado en memoria. "
            "Se usa automáticamente cuando Supabase no está configurado o hay pocos reportes."
        ),
        "firstIncident": incidents[0].created_at if incidents else None,
        "lastIncident": incidents[-1].created_at if incidents else None,
    }
