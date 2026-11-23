from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .models import (
    DuplicateCandidate,
    EmergingPattern,
    IncidentPatterns,
    StoredIncident,
    parse_incident_time,
)
from .rules import normalize

STOPWORDS = {
    "para",
    "pero",
    "como",
    "este",
    "esta",
    "esto",
    "esos",
    "esas",
    "desde",
    "hasta",
    "entre",
    "sobre",
    "cuando",
    "donde",
    "porque",
    "tambien",
    "muy",
    "mas",
    "los",
    "las",
    "del",
    "que",
    "con",
    "por",
    "una",
    "unos",
    "unas",
    "sus",
    "fue",
    "han",
    "hay",
    "sin",
    "esa",
    "ese",
    "esa",
    "the",
    "and",
}


def _document(incident: StoredIncident) -> str:
    return normalize(f"{incident.title} {incident.description or ''}")


def _text_similarity(query: str, candidates: list[StoredIncident]) -> list[float]:
    documents = [normalize(query)] + [_document(item) for item in candidates]
    if not any(text.strip() for text in documents):
        return [0.0 for _ in candidates]
    try:
        matrix = TfidfVectorizer(
            analyzer="word",
            ngram_range=(1, 2),
            strip_accents="unicode",
            sublinear_tf=True,
        ).fit_transform(documents)
    except ValueError:
        return [0.0 for _ in candidates]
    scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()
    return [float(score) for score in scores]


def rank_duplicates(
    title: str,
    description: str,
    incident_type: str,
    candidates: list[StoredIncident],
    distances: dict[str, float] | None = None,
    zone_id: str | None = None,
    limit: int = 5,
) -> list[DuplicateCandidate]:
    filtered = [
        item
        for item in candidates
        if item.type == incident_type and item.status not in ("resuelto", "falsa_alarma")
    ]
    if not filtered:
        return []

    scores = _text_similarity(f"{title} {description}", filtered)
    results: list[DuplicateCandidate] = []
    for item, text_score in zip(filtered, scores, strict=False):
        distance = distances.get(item.id) if distances else None
        same_zone = bool(zone_id and item.zone_id == zone_id)
        recent = False
        try:
            recent = parse_incident_time(item.created_at) >= datetime.now(timezone.utc) - timedelta(hours=48)
        except (ValueError, TypeError):
            recent = False

        likely = (
            text_score >= 0.58
            or (same_zone and recent and text_score >= 0.34)
            or (distance is not None and distance <= 40 and recent and text_score >= 0.25)
        )
        if not likely:
            continue

        combined = min(1.0, text_score + (0.08 if same_zone else 0.0) + (0.07 if distance is not None and distance <= 40 else 0.0))
        results.append(
            DuplicateCandidate(
                incidentId=item.id,
                code=item.code,
                title=item.title,
                status=item.status,
                zone=item.zone_name,
                createdAt=item.created_at,
                distanceMeters=round(distance, 1) if distance is not None else None,
                similarity=round(combined, 3),
            )
        )

    results.sort(key=lambda item: (-item.similarity, item.distanceMeters or 99999))
    return results[:limit]


def _top_terms(vectorizer: TfidfVectorizer, centroid: np.ndarray, top_n: int = 5) -> list[str]:
    names = vectorizer.get_feature_names_out()
    indices = np.argsort(centroid)[::-1]
    terms: list[str] = []
    for index in indices:
        term = str(names[index]).strip()
        if len(term) < 4 or term in STOPWORDS:
            continue
        terms.append(term)
        if len(terms) >= top_n:
            break
    return terms


def compute_patterns(incidents: list[StoredIncident], days: int) -> IncidentPatterns:
    if len(incidents) < 8:
        return IncidentPatterns(
            patterns=[],
            summary=(
                f"Hay {len(incidents)} incidencias en {days} días. "
                "Se necesitan al menos 8 para calcular patrones con scikit-learn."
            ),
            totalIncidents=len(incidents),
            periodDays=days,
            source="insufficient_data",
        )

    documents = [_document(item) or "sin descripcion" for item in incidents]
    vectorizer = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        strip_accents="unicode",
        min_df=1,
        sublinear_tf=True,
    )
    matrix = vectorizer.fit_transform(documents)
    cluster_count = min(3, max(2, len(incidents) // 4), len(incidents))
    model = KMeans(n_clusters=cluster_count, random_state=42, n_init=10)
    labels = model.fit_predict(matrix)

    patterns: list[EmergingPattern] = []
    for cluster_id in range(cluster_count):
        members = [item for item, label in zip(incidents, labels, strict=False) if label == cluster_id]
        if not members:
            continue
        terms = _top_terms(vectorizer, model.cluster_centers_[cluster_id])
        zones = Counter(item.zone_name for item in members if item.zone_name)
        dominant_zone = zones.most_common(1)[0][0] if zones else "sin zona"
        critical = any(item.priority == "critical" for item in members)
        severity = "urgente" if critical or len(members) >= 4 else ("preventivo" if len(members) >= 2 else "informativo")
        label = ", ".join(terms[:3]) or "incidencias similares"
        examples = "; ".join(item.title for item in members[:3])
        patterns.append(
            EmergingPattern(
                pattern=f"{dominant_zone}: {label}",
                detail=(
                    f"{len(members)} incidencia(s) agrupadas en {dominant_zone}. "
                    f"Ejemplos: {examples}."
                ),
                incidentIds=[item.id for item in members],
                severity=severity,
            )
        )

    # Refuerzo por ráfaga de zona en los últimos 7 días.
    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=min(days, 7))
    recent = [
        item
        for item in incidents
        if _is_after(item.created_at, recent_cutoff)
    ]
    by_zone = Counter(item.zone_name for item in recent if item.zone_name)
    for zone, count in by_zone.most_common(2):
        if count < 3:
            continue
        ids = [item.id for item in recent if item.zone_name == zone]
        if any(set(ids).issubset(set(pattern.incidentIds)) for pattern in patterns):
            continue
        patterns.append(
            EmergingPattern(
                pattern=f"Ráfaga reciente en {zone}",
                detail=f"{count} incidencias en los últimos 7 días en {zone}.",
                incidentIds=ids,
                severity="urgente" if count >= 5 else "preventivo",
            )
        )

    patterns.sort(key=lambda item: (item.severity != "urgente", item.severity != "preventivo", -len(item.incidentIds)))
    urgent = sum(1 for item in patterns if item.severity == "urgente")
    summary = (
        f"Se analizaron {len(incidents)} incidencias de los últimos {days} días "
        f"y se detectaron {len(patterns)} patrón(es); {urgent} requieren atención urgente."
    )
    return IncidentPatterns(
        patterns=patterns[:8],
        summary=summary,
        totalIncidents=len(incidents),
        periodDays=days,
        source="scikit-learn",
    )


def _is_after(value: str, cutoff: datetime) -> bool:
    try:
        return parse_incident_time(value) >= cutoff
    except (ValueError, TypeError):
        return False
