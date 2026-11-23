from __future__ import annotations

import math
from collections import Counter
from datetime import UTC, datetime
from typing import Any, Iterable

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN, KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

from .models import (
    ClusterMember,
    GeoPoint,
    Hotspot,
    HourBucket,
    IncidentCluster,
    IncidentPatterns,
    IncidentPriority,
    IncidentType,
    TypeBucket,
    WeekdayBucket,
    ZoneBucket,
    parse_incident_time,
)
from .rules import normalize

EARTH_RADIUS_M = 6_371_000.0
WEEKDAY_LABELS = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")
PRIORITY_NUMERIC = {"low": 0.25, "medium": 0.5, "high": 0.75, "critical": 1.0}

STOPWORDS = (
    "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "en", "por",
    "para", "con", "sin", "que", "se", "al", "del", "lo", "su", "sus", "es", "son",
    "hay", "muy", "mas", "pero", "como", "esta", "este", "fue", "han", "ha", "no",
    "reportan", "reporta", "reporte", "reportes", "cerca", "area", "zona", "edificio",
)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _utc_now() -> datetime:
    return datetime.now(UTC)


def filter_incidents(
    incidents: Iterable[Any],
    days: int = 30,
    hour_from: int | None = None,
    hour_to: int | None = None,
    incident_type: IncidentType | None = None,
    priority: IncidentPriority | None = None,
) -> list[Any]:
    cutoff = _utc_now().timestamp() - days * 86_400
    selected: list[Any] = []
    for incident in incidents:
        try:
            moment = parse_incident_time(incident.created_at)
        except (ValueError, AttributeError):
            continue
        if moment.timestamp() < cutoff:
            continue
        if incident_type and incident.type != incident_type:
            continue
        if priority and incident.priority != priority:
            continue
        if hour_from is not None and hour_to is not None:
            hour = moment.hour
            if hour_from <= hour_to:
                if not (hour_from <= hour <= hour_to):
                    continue
            elif not (hour >= hour_from or hour <= hour_to):
                continue
        selected.append(incident)
    return selected


def _risk_level(score: float) -> str:
    if score >= 0.8:
        return "critical"
    if score >= 0.62:
        return "high"
    if score >= 0.42:
        return "medium"
    return "low"


def _center(points: list[tuple[float, float]]) -> tuple[float, float]:
    return (
        float(np.mean([point[0] for point in points])),
        float(np.mean([point[1] for point in points])),
    )


def _build_hotspot(
    cluster_id: int,
    members: list[Any],
    center: tuple[float, float] | None = None,
) -> Hotspot:
    points = [(item.point.lat, item.point.lng) for item in members if item.point]
    if not points:
        fallback = center or (20.5873, -90.0036)
        points = [fallback]
    center_lat, center_lng = center or _center(points)
    radius = max(
        (haversine_m(center_lat, center_lng, lat, lng) for lat, lng in points),
        default=50.0,
    )
    radius = max(50.0, min(500.0, radius))

    priority_avg = sum(PRIORITY_NUMERIC.get(item.priority, 0.5) for item in members) / len(members)
    count_score = min(1.0, len(members) / max(4, len(members) + 2))
    try:
        newest = max(parse_incident_time(item.created_at) for item in members)
        age_days = max(0.0, (_utc_now() - newest).total_seconds() / 86_400)
    except (ValueError, AttributeError):
        age_days = 30.0
    recency = math.exp(-age_days / 21.0)
    diversity = len({item.type for item in members}) / 2.0
    score = round(0.42 * count_score + 0.30 * priority_avg + 0.18 * recency + 0.10 * diversity, 3)
    if len(members) < 3:
        score = min(score, 0.44)

    zone_counter = Counter(item.zone_name or "Sin zona" for item in members)
    type_counter = Counter(item.type for item in members)
    hour_counter = Counter(
        parse_incident_time(item.created_at).hour
        for item in members
        if item.created_at
    )
    dominant_type: IncidentType = type_counter.most_common(1)[0][0]
    zone_name, _ = zone_counter.most_common(1)[0]
    peak_hour = hour_counter.most_common(1)[0][0] if hour_counter else None
    moments = sorted(item.created_at for item in members)

    label_type = "seguridad" if dominant_type == "seguridad" else "soporte técnico"
    label = f"{zone_name} · {len(members)} reportes de {label_type}"

    return Hotspot(
        clusterId=cluster_id,
        incidentCount=len(members),
        centerLat=round(center_lat, 6),
        centerLng=round(center_lng, 6),
        firstIncident=moments[0],
        lastIncident=moments[-1],
        radiusM=round(radius, 1),
        score=score,
        riskLevel=_risk_level(score),  # type: ignore[arg-type]
        dominantType=dominant_type,
        zone=zone_name,
        peakHour=peak_hour,
        label=label,
        incidentIds=[item.id for item in members],
    )


def compute_hotspots(
    incidents: Iterable[Any],
    radius_m: float = 220.0,
    min_incidents: int = 3,
) -> list[Hotspot]:
    """DBSCAN geoespacial con distancia haversine y fallback KMeans."""
    with_points = [item for item in incidents if item.point]
    if not with_points:
        return []

    if len(with_points) == 1:
        return [_build_hotspot(0, with_points)]

    coords = np.radians(
        np.array([[item.point.lat, item.point.lng] for item in with_points], dtype=float)
    )
    min_samples = max(1, min(min_incidents, len(with_points)))
    labels: np.ndarray
    try:
        dbscan = DBSCAN(
            eps=radius_m / EARTH_RADIUS_M,
            min_samples=min_samples,
            metric="haversine",
        )
        labels = dbscan.fit_predict(coords)
    except Exception:
        labels = np.full(len(with_points), -1, dtype=int)

    unique = {label for label in labels if label >= 0}
    if not unique:
        cluster_count = max(1, min(len(with_points) // max(3, min_incidents), 5))
        cluster_count = min(cluster_count, len(with_points))
        if cluster_count <= 1:
            labels = np.zeros(len(with_points), dtype=int)
        else:
            labels = KMeans(n_clusters=cluster_count, n_init=10, random_state=42).fit_predict(coords)

    groups: dict[int, list[Any]] = {}
    for label, incident in zip(labels.tolist(), with_points, strict=False):
        groups.setdefault(int(label), []).append(incident)

    hotspots = [_build_hotspot(index, members) for index, members in enumerate(groups.values())]
    hotspots.sort(key=lambda item: (item.score, item.incidentCount), reverse=True)
    for index, hotspot in enumerate(hotspots):
        hotspot.clusterId = index
    return hotspots


def _severity(avg_priority: float, count: int) -> str:
    if avg_priority >= 0.8 or count >= 6:
        return "urgente"
    if avg_priority >= 0.55 or count >= 3:
        return "preventivo"
    return "informativo"


def _top_terms(documents: list[str], limit: int = 4) -> list[str]:
    if not documents:
        return []
    try:
        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=1,
            max_features=400,
            stop_words=list(STOPWORDS),
            sublinear_tf=True,
        )
        matrix = vectorizer.fit_transform(documents)
        names = vectorizer.get_feature_names_out()
        scores = np.asarray(matrix.sum(axis=0)).ravel()
        indexes = scores.argsort()[::-1][:limit]
        return [names[index] for index in indexes if scores[index] > 0]
    except ValueError:
        return []


def compute_patterns(incidents: Iterable[Any], days: int = 30) -> IncidentPatterns:
    items = list(incidents)
    if not items:
        return IncidentPatterns(
            patterns=[],
            summary="No hay reportes suficientes en el periodo seleccionado.",
            totalIncidents=0,
            periodDays=days,
            source="insufficient_data",
        )

    rows: list[dict[str, Any]] = []
    for incident in items:
        try:
            moment = parse_incident_time(incident.created_at)
        except (ValueError, AttributeError):
            continue
        rows.append(
            {
                "id": incident.id,
                "hour": moment.hour,
                "weekday": moment.weekday(),
                "type": incident.type,
                "priority": incident.priority,
                "zone": incident.zone_name or "Sin zona",
                "title": incident.title,
                "text": normalize(f"{incident.title} {incident.description or ''}"),
            }
        )

    frame = pd.DataFrame(rows)
    if frame.empty:
        return IncidentPatterns(
            patterns=[],
            summary="No se pudieron interpretar las fechas de los reportes.",
            totalIncidents=0,
            periodDays=days,
            source="insufficient_data",
        )

    hour_counts = frame["hour"].value_counts().to_dict()
    by_hour = [HourBucket(hour=hour, count=int(hour_counts.get(hour, 0))) for hour in range(24)]

    weekday_counts = frame["weekday"].value_counts().to_dict()
    by_weekday = [
        WeekdayBucket(weekday=index, label=label, count=int(weekday_counts.get(index, 0)))
        for index, label in enumerate(WEEKDAY_LABELS)
    ]

    type_counts = frame["type"].value_counts().to_dict()
    by_type = [
        TypeBucket(type=incident_type, count=int(type_counts.get(incident_type, 0)))
        for incident_type in ("seguridad", "equipo")
    ]

    zone_stats = (
        frame.groupby("zone")
        .agg(count=("id", "count"), dominant=("type", lambda values: values.value_counts().index[0]))
        .reset_index()
        .sort_values("count", ascending=False)
        .head(10)
    )
    by_zone = [
        ZoneBucket(
            zone=str(row.zone),
            count=int(row.count),
            dominantType=row.dominant,  # type: ignore[arg-type]
        )
        for row in zone_stats.itertuples(index=False)
    ]

    peak_hours = [
        int(hour)
        for hour, count in sorted(hour_counts.items(), key=lambda pair: pair[1], reverse=True)[:3]
        if count > 0
    ]
    top_zones = [bucket.zone for bucket in by_zone[:3]]

    patterns: list[Any] = []
    used_scikit = False
    if len(frame) >= 8:
        documents = frame["text"].tolist()
        try:
            vectorizer = TfidfVectorizer(
                ngram_range=(1, 2),
                min_df=1,
                max_features=600,
                stop_words=list(STOPWORDS),
                sublinear_tf=True,
            )
            matrix = vectorizer.fit_transform(documents)
            cluster_count = min(3, max(1, len(frame) // 6))
            kmeans = KMeans(n_clusters=cluster_count, n_init=10, random_state=42)
            labels = kmeans.fit_predict(matrix)
            names = vectorizer.get_feature_names_out()
            used_scikit = True
            for cluster_id in range(cluster_count):
                indexes = np.where(labels == cluster_id)[0]
                if len(indexes) < 2:
                    continue
                center = kmeans.cluster_centers_[cluster_id]
                terms = [names[index] for index in center.argsort()[::-1][:4]]
                members = frame.iloc[indexes]
                avg_priority = float(
                    members["priority"].map(PRIORITY_NUMERIC).fillna(0.5).mean()
                )
                top_zone = members["zone"].value_counts().index[0]
                patterns.append(
                    {
                        "pattern": " · ".join(term.title() for term in terms[:3]),
                        "detail": (
                            f"{len(indexes)} reportes similares en {top_zone}, "
                            f"prioridad promedio {avg_priority:.2f}."
                        ),
                        "incidentIds": members["id"].tolist(),
                        "severity": _severity(avg_priority, len(indexes)),
                    }
                )
        except ValueError:
            used_scikit = False

    if not patterns:
        top_zone = top_zones[0] if top_zones else "el campus"
        top_hour = peak_hours[0] if peak_hours else None
        dominant_type = by_type[0].type if by_type[0].count >= by_type[1].count else by_type[1].type
        patterns.append(
            {
                "pattern": f"Concentración en {top_zone}",
                "detail": (
                    f"{type_counts.get(dominant_type, 0)} reportes de {dominant_type}"
                    + (f" con mayor actividad alrededor de las {top_hour}:00." if top_hour is not None else ".")
                ),
                "incidentIds": frame.sort_values("hour")["id"].tolist()[:20],
                "severity": "preventivo",
            }
        )

    top_type = max(by_type, key=lambda bucket: bucket.count)
    summary_text = (
        f"Se analizaron {len(frame)} reportes en {days} días. "
        f"El tipo dominante es {top_type.type} ({top_type.count}). "
        + (f"Mayor actividad a las {', '.join(str(hour) + ':00' for hour in peak_hours)}. " if peak_hours else "")
        + (f"Zonas con más reportes: {', '.join(top_zones)}." if top_zones else "")
    )

    return IncidentPatterns(
        patterns=patterns[:6],
        summary=summary_text.strip(),
        totalIncidents=len(frame),
        periodDays=days,
        source="scikit-learn" if used_scikit else "rules",
        byHour=by_hour,
        byWeekday=by_weekday,
        byType=by_type,
        byZone=by_zone,
        peakHours=peak_hours,
    )


def _avg_priority_label(members: list[Any]) -> IncidentPriority:
    average = sum(PRIORITY_NUMERIC.get(item.priority, 0.5) for item in members) / len(members)
    if average >= 0.8:
        return "critical"
    if average >= 0.6:
        return "high"
    if average >= 0.4:
        return "medium"
    return "low"


def _cluster_member(item: Any) -> ClusterMember:
    return ClusterMember(
        id=item.id,
        code=item.code,
        title=item.title,
        type=item.type,
        priority=item.priority,
        status=item.status,
        zone=item.zone_name,
        createdAt=item.created_at,
        point=item.point,
    )


def _build_text_cluster(
    key: tuple[str | None, str | None, IncidentType],
    members: list[Any],
    index: int,
) -> IncidentCluster:
    zone_id, zone_name, incident_type = key
    points = [(item.point.lat, item.point.lng) for item in members if item.point]
    center = _center(points) if points else None
    radius = (
        max(
            (haversine_m(center[0], center[1], lat, lng) for lat, lng in points),
            default=50.0,
        )
        if center
        else 0.0
    )
    documents = [normalize(f"{item.title} {item.description or ''}") for item in members]
    top_terms = _top_terms(documents)
    priority_avg = sum(PRIORITY_NUMERIC.get(item.priority, 0.5) for item in members) / len(members)
    try:
        newest = max(parse_incident_time(item.created_at) for item in members)
        age_days = max(0.0, (_utc_now() - newest).total_seconds() / 86_400)
    except (ValueError, AttributeError):
        age_days = 30.0
    recency = math.exp(-age_days / 21.0)
    score = round(
        0.5 * min(1.0, len(members) / 6) + 0.3 * priority_avg + 0.2 * recency,
        3,
    )
    sorted_members = sorted(members, key=lambda item: item.created_at)
    label_zone = zone_name or "Sin zona"
    label_type = "Seguridad" if incident_type == "seguridad" else "Soporte técnico"
    terms_label = ", ".join(term.title() for term in top_terms[:2]) or label_type
    return IncidentCluster(
        id=f"cluster-{index}-{zone_id or 'sin-zona'}-{incident_type}",
        label=f"{label_zone} · {terms_label}",
        zone=zone_name,
        zoneId=zone_id,
        type=incident_type,
        incidentCount=len(members),
        center=GeoPoint(lat=round(center[0], 6), lng=round(center[1], 6)) if center else None,
        radiusM=round(min(500.0, max(50.0, radius)) if points else 0.0, 1),
        avgPriority=_avg_priority_label(members),
        score=score,
        topTerms=top_terms,
        firstIncident=sorted_members[0].created_at,
        lastIncident=sorted_members[-1].created_at,
        members=[_cluster_member(item) for item in sorted_members],
    )


def cluster_reports(
    incidents: Iterable[Any],
    min_cluster_size: int = 2,
    limit: int = 12,
) -> list[IncidentCluster]:
    """Agrupa reportes por zona/tipo y refina con DBSCAN sobre TF-IDF (coseno)."""
    groups: dict[tuple[str | None, str | None, IncidentType], list[Any]] = {}
    for incident in incidents:
        key = (incident.zone_id, incident.zone_name, incident.type)
        groups.setdefault(key, []).append(incident)

    clusters: list[IncidentCluster] = []
    index = 0
    for key, members in groups.items():
        if len(members) < min_cluster_size:
            continue
        subgroups: list[list[Any]] = []
        if len(members) >= 4:
            documents = [normalize(f"{item.title} {item.description or ''}") for item in members]
            try:
                vectorizer = TfidfVectorizer(
                    ngram_range=(1, 2),
                    min_df=1,
                    max_features=400,
                    stop_words=list(STOPWORDS),
                    sublinear_tf=True,
                )
                matrix = vectorizer.fit_transform(documents)
                labels = DBSCAN(
                    eps=0.5,
                    min_samples=2,
                    metric="cosine",
                    algorithm="brute",
                ).fit_predict(matrix)
                split: dict[int, list[Any]] = {}
                for label, item in zip(labels.tolist(), members, strict=False):
                    split.setdefault(int(label), []).append(item)
                noisy = split.pop(-1, [])
                groups_found = list(split.values())
                if groups_found and noisy:
                    for item in noisy:
                        groups_found[0].append(item)
                subgroups = groups_found or [members]
            except ValueError:
                subgroups = [members]
        else:
            subgroups = [members]

        for subgroup in subgroups:
            if len(subgroup) < min_cluster_size:
                continue
            clusters.append(_build_text_cluster(key, subgroup, index))
            index += 1

    clusters.sort(key=lambda item: (item.score, item.incidentCount), reverse=True)
    return clusters[:limit]


def analysis_meta(incidents: Iterable[Any]) -> dict[str, Any]:
    items = list(incidents)
    return {
        "total": len(items),
        "peakHours": [
            hour
            for hour, _count in Counter(
                parse_incident_time(item.created_at).hour
                for item in items
                if item.created_at
            ).most_common(3)
        ],
        "topZones": [
            zone for zone, _count in Counter(item.zone_name or "Sin zona" for item in items).most_common(3)
        ],
        "types": Counter(item.type for item in items),
    }
