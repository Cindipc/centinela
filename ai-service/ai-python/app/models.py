from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

IncidentType = Literal["seguridad", "equipo"]
IncidentPriority = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["pendiente", "en_proceso", "resuelto", "falsa_alarma"]
RiskLevel = Literal["low", "medium", "high", "critical"]
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
    narrative: bool = False


class IncidentSuggestion(BaseModel):
    category: str
    priority: IncidentPriority
    summary: str
    possibleCauses: list[str]
    recommendedActions: list[str]
    suggestedZone: str | None
    confidence: float
    source: Literal["ollama", "dl4j", "rules", "unavailable"]


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


class AnalysisFilters(AiBaseRequest):
    days: int = Field(default=30, ge=1, le=365)
    hourFrom: int | None = Field(default=None, ge=0, le=23)
    hourTo: int | None = Field(default=None, ge=0, le=23)
    type: IncidentType | None = None
    priority: IncidentPriority | None = None
    narrative: bool = False


class PatternsRequest(AnalysisFilters):
    pass


class EmergingPattern(BaseModel):
    pattern: str
    detail: str
    incidentIds: list[str]
    severity: Literal["informativo", "preventivo", "urgente"]


class HourBucket(BaseModel):
    hour: int
    count: int


class WeekdayBucket(BaseModel):
    weekday: int
    label: str
    count: int


class TypeBucket(BaseModel):
    type: IncidentType
    count: int


class ZoneBucket(BaseModel):
    zone: str
    zoneId: str | None = None
    count: int
    dominantType: IncidentType


class IncidentPatterns(BaseModel):
    patterns: list[EmergingPattern]
    summary: str
    totalIncidents: int
    periodDays: int
    source: Literal["scikit-learn", "rules", "insufficient_data", "synthetic"]
    byHour: list[HourBucket] = Field(default_factory=list)
    byWeekday: list[WeekdayBucket] = Field(default_factory=list)
    byType: list[TypeBucket] = Field(default_factory=list)
    byZone: list[ZoneBucket] = Field(default_factory=list)
    peakHours: list[int] = Field(default_factory=list)
    isSynthetic: bool = False
    narrative: str | None = None


class HotspotsRequest(AnalysisFilters):
    minIncidents: int = Field(default=3, ge=1, le=20)


class Hotspot(BaseModel):
    clusterId: int
    incidentCount: int
    centerLat: float
    centerLng: float
    firstIncident: str
    lastIncident: str
    radiusM: float = 100.0
    score: float = 0.0
    riskLevel: RiskLevel = "medium"
    dominantType: IncidentType = "seguridad"
    zone: str | None = None
    peakHour: int | None = None
    label: str = ""
    incidentIds: list[str] = Field(default_factory=list)


class GeoAnalysis(BaseModel):
    hotspots: list[Hotspot]
    source: Literal["scikit-learn", "postgis", "synthetic", "unavailable"]
    totalIncidents: int = 0
    isSynthetic: bool = False
    model: str = "dbscan"
    narrative: str | None = None


class ClusterRequest(AnalysisFilters):
    minClusterSize: int = Field(default=2, ge=2, le=20)


class ClusterMember(BaseModel):
    id: str
    code: str
    title: str
    type: IncidentType
    priority: IncidentPriority
    status: IncidentStatus
    zone: str | None
    createdAt: str
    point: GeoPoint | None = None


class IncidentCluster(BaseModel):
    id: str
    label: str
    zone: str | None
    zoneId: str | None
    type: IncidentType
    incidentCount: int
    center: GeoPoint | None
    radiusM: float
    avgPriority: IncidentPriority
    score: float
    topTerms: list[str]
    firstIncident: str
    lastIncident: str
    members: list[ClusterMember]


class ClusterResponse(BaseModel):
    clusters: list[IncidentCluster]
    totalIncidents: int
    source: Literal["scikit-learn", "synthetic", "unavailable"]
    isSynthetic: bool = False
    narrative: str | None = None


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
    is_synthetic: bool = False


class StoredZone(BaseModel):
    id: str
    name: str
    point: GeoPoint | None = None


class StaffInput(BaseModel):
    id: str
    name: str
    role: Literal["seguridad", "ti"]
    zone: str | None = None
    zoneId: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    activeLoad: int = Field(default=0, ge=0)
    available: bool = True


class StaffSuggestion(BaseModel):
    id: str
    name: str
    role: Literal["seguridad", "ti"]
    zone: str | None
    point: GeoPoint | None
    distanceMeters: float | None
    activeLoad: int
    score: float
    etaMinutes: float | None
    reasons: list[str]


class ClassifyRequest(AiBaseRequest):
    id: str | None = None
    type: IncidentType | None = None
    title: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    zone: str | None = Field(default=None, max_length=160)
    zoneId: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    createdAt: str | None = None


class Classification(BaseModel):
    type: IncidentType
    priority: IncidentPriority
    priorityScore: float = 0.0
    category: str = "Otro"
    confidence: float = 0.5
    probabilities: dict[str, float] = Field(default_factory=dict)
    source: Literal["dl4j", "rules", "fallback"] = "fallback"
    reasons: list[str] = Field(default_factory=list)


class PrioritizeRequest(ClassifyRequest):
    pass


class TrainingIncident(BaseModel):
    type: IncidentType
    priority: IncidentPriority
    title: str = Field(min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    zone: str | None = None
    createdAt: str | None = None


class TrainRequest(AiBaseRequest):
    days: int = Field(default=90, ge=1, le=365)
    incidents: list[TrainingIncident] | None = None


class TrainResponse(BaseModel):
    trained: bool
    samples: int
    typeAccuracy: float | None = None
    priorityAccuracy: float | None = None
    source: Literal["dl4j", "synthetic", "unavailable"]
    detail: str | None = None


class AssignRequest(AiBaseRequest):
    title: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    type: IncidentType
    priority: IncidentPriority | None = None
    zone: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    staff: list[StaffInput] | None = None
    narrative: bool = True


class AssignmentReport(BaseModel):
    type: IncidentType
    priority: IncidentPriority
    title: str
    zone: str | None
    point: GeoPoint | None


class AssignmentResponse(BaseModel):
    report: AssignmentReport
    suggestions: list[StaffSuggestion]
    source: Literal["supabase", "demo", "fallback"]
    narrative: str | None = None


class SummaryRequest(AiBaseRequest):
    kind: Literal["patterns", "hotspots", "assignment", "general"] = "general"
    title: str | None = Field(default=None, max_length=180)
    context: dict[str, Any] = Field(default_factory=dict)
    days: int = Field(default=30, ge=1, le=365)


class SummaryResponse(BaseModel):
    summary: str
    recommendations: list[str]
    source: Literal["ollama", "fallback"]


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
