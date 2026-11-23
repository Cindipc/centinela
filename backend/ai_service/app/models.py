from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

IncidentType = Literal["seguridad", "equipo"]
IncidentPriority = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["pendiente", "en_proceso", "resuelto", "falsa_alarma"]
DuplicateSource = Literal["postgis", "rules", "unavailable"]


class GeoPoint(BaseModel):
    lat: float
    lng: float


class AuthContext(BaseModel):
    user_id: str
    role: str
    organization_id: str | None = None


class AiBaseRequest(BaseModel):
    organizationId: str | None = None

    @field_validator("organizationId")
    @classmethod
    def _trim_org(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class SuggestRequest(AiBaseRequest):
    type: IncidentType
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(default="", max_length=4000)
    zone: str | None = Field(default=None, max_length=160)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class IncidentSuggestion(BaseModel):
    category: str
    priority: IncidentPriority
    summary: str
    possibleCauses: list[str]
    recommendedActions: list[str]
    suggestedZone: str | None
    confidence: float
    source: Literal["ollama", "rules", "unavailable"]


class ImageAnalysisRequest(AiBaseRequest):
    type: IncidentType
    image_base64: str = Field(min_length=16, max_length=12_000_000)
    media_type: str = Field(default="image/jpeg", max_length=32)
    description: str | None = Field(default=None, max_length=4000)


class ImageAnalysis(BaseModel):
    category: str
    priority: IncidentPriority
    observations: list[str]
    safetyConcerns: list[str]
    confidence: float
    source: Literal["ollama", "unavailable"]


class DuplicateRequest(AiBaseRequest):
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(default="", max_length=4000)
    type: IncidentType
    zoneId: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    excludeIncidentId: str | None = None
    radiusM: float | None = Field(default=None, gt=0, le=5000)


class DuplicateCandidate(BaseModel):
    incidentId: str
    code: str
    title: str
    status: IncidentStatus
    zone: str | None
    createdAt: str
    distanceMeters: float | None
    similarity: float


class DuplicateCheck(BaseModel):
    likelyDuplicate: bool
    candidates: list[DuplicateCandidate]
    source: DuplicateSource


class PatternsRequest(AiBaseRequest):
    days: int = Field(default=30, ge=1, le=365)


class EmergingPattern(BaseModel):
    pattern: str
    detail: str
    incidentIds: list[str]
    severity: Literal["informativo", "preventivo", "urgente"]


class IncidentPatterns(BaseModel):
    patterns: list[EmergingPattern]
    summary: str
    totalIncidents: int
    periodDays: int
    source: Literal["scikit-learn", "rules", "insufficient_data"]


class HotspotsRequest(AiBaseRequest):
    days: int = Field(default=30, ge=1, le=365)


class Hotspot(BaseModel):
    clusterId: int
    incidentCount: int
    centerLat: float
    centerLng: float
    firstIncident: str
    lastIncident: str


class GeoAnalysis(BaseModel):
    hotspots: list[Hotspot]
    source: Literal["postgis", "unavailable"]


class StoredIncident(BaseModel):
    id: str
    code: str
    title: str
    description: str | None = None
    type: IncidentType
    priority: IncidentPriority
    status: IncidentStatus
    zone_id: str | None = None
    zone_name: str | None = None
    created_at: str
    point: GeoPoint | None = None


class StoredZone(BaseModel):
    id: str
    name: str
    point: GeoPoint | None = None


class NearbyIncident(BaseModel):
    incident_id: str
    code: str
    title: str
    status: IncidentStatus
    zone_name: str | None
    created_at: str
    distance_m: float


def parse_incident_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
