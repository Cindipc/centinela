from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .config import Settings
from .models import (
    AuthContext,
    GeoPoint,
    Hotspot,
    NearbyIncident,
    StoredIncident,
    StoredZone,
)


class SupabaseError(RuntimeError):
    pass


def _parse_point(value: Any) -> GeoPoint | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.startswith("{"):
            try:
                return _parse_point(json.loads(text))
            except json.JSONDecodeError:
                return None
        if len(text) >= 18 and all(ch in "0123456789abcdefABCDEF" for ch in text):
            return _parse_ewkb_point(text)
        return None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return _safe_point(value[0], value[1])
    if isinstance(value, dict):
        coordinates = value.get("coordinates")
        if isinstance(coordinates, (list, tuple)) and len(coordinates) >= 2:
            return _safe_point(coordinates[0], coordinates[1])
    return None


def _safe_point(lng: Any, lat: Any) -> GeoPoint | None:
    try:
        longitude = float(lng)
        latitude = float(lat)
    except (TypeError, ValueError):
        return None
    if abs(latitude) > 90 or abs(longitude) > 180:
        return None
    return GeoPoint(lat=latitude, lng=longitude)


def _parse_ewkb_point(hex_value: str) -> GeoPoint | None:
    try:
        raw = bytes.fromhex(hex_value)
    except ValueError:
        return None
    if len(raw) < 21:
        return None
    little = raw[0] == 1
    order = "little" if little else "big"
    try:
        wkb_type = int.from_bytes(raw[1:5], order)
        offset = 5
        has_srid = bool(wkb_type & 0x20000000)
        if has_srid:
            offset += 4
        if len(raw) < offset + 16:
            return None
        longitude = int.from_bytes(raw[offset : offset + 8], order, signed=True) / 1e7
        latitude = int.from_bytes(raw[offset + 8 : offset + 16], order, signed=True) / 1e7
    except (ValueError, OverflowError):
        return None
    return _safe_point(longitude, latitude)


class SupabaseRepository:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise SupabaseError(
                "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno del servicio de IA."
            )
        self.settings = settings
        self.client = client
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def _get(self, table: str, params: list[tuple[str, str]]) -> list[dict[str, Any]]:
        response = await self.client.get(
            f"{self.settings.rest_url}/{table}",
            params=params,
            headers=self.headers,
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Supabase {table}: {response.status_code} {response.text[:300]}")
        payload = response.json()
        return payload if isinstance(payload, list) else [payload]

    async def _rpc(self, function: str, payload: dict[str, Any]) -> Any:
        response = await self.client.post(
            f"{self.settings.rest_url}/rpc/{function}",
            json=payload,
            headers=self.headers,
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Supabase RPC {function}: {response.status_code} {response.text[:300]}")
        if not response.content:
            return None
        return response.json()

    async def get_profile(self, user_id: str) -> AuthContext | None:
        rows = await self._get(
            "profiles",
            [
                ("select", "id,role,organization_id"),
                ("id", f"eq.{user_id}"),
                ("limit", "1"),
            ],
        )
        if not rows:
            return None
        row = rows[0]
        if not row.get("id"):
            return None
        return AuthContext(
            user_id=str(row["id"]),
            role=str(row.get("role") or "usuario"),
            organization_id=row.get("organization_id"),
        )

    async def get_organization(self, organization_id: str) -> dict[str, Any] | None:
        rows = await self._get(
            "organizations",
            [
                ("select", "id,name,status,center_lat,center_lng"),
                ("id", f"eq.{organization_id}"),
                ("limit", "1"),
            ],
        )
        return rows[0] if rows else None

    async def get_license_usage(self, organization_id: str) -> dict[str, Any] | None:
        result = await self._rpc("license_usage", {"p_org": organization_id})
        return result if isinstance(result, dict) else None

    async def get_incidents(
        self,
        organization_id: str,
        days: int,
        limit: int | None = None,
    ) -> list[StoredIncident]:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        rows = await self._get(
            "incidents",
            [
                (
                    "select",
                    "id,code,title,description,type,priority,status,zone_id,"
                    "created_at,location,zones(name)",
                ),
                ("organization_id", f"eq.{organization_id}"),
                ("created_at", f"gte.{since}"),
                ("order", "created_at.desc"),
                ("limit", str(limit or self.settings.max_incidents)),
            ],
        )
        incidents: list[StoredIncident] = []
        for row in rows:
            zone = row.get("zones") or {}
            incidents.append(
                StoredIncident(
                    id=str(row["id"]),
                    code=str(row.get("code") or ""),
                    title=str(row.get("title") or ""),
                    description=row.get("description"),
                    type=row.get("type") or "seguridad",
                    priority=row.get("priority") or "medium",
                    status=row.get("status") or "pendiente",
                    zone_id=row.get("zone_id"),
                    zone_name=zone.get("name") if isinstance(zone, dict) else None,
                    created_at=str(row.get("created_at") or ""),
                    point=_parse_point(row.get("location")),
                )
            )
        return incidents

    async def get_zones(self, organization_id: str) -> list[StoredZone]:
        rows = await self._get(
            "zones",
            [
                ("select", "id,name,location"),
                ("organization_id", f"eq.{organization_id}"),
                ("order", "name"),
            ],
        )
        return [
            StoredZone(
                id=str(row["id"]),
                name=str(row.get("name") or ""),
                point=_parse_point(row.get("location")),
            )
            for row in rows
        ]

    async def incidents_nearby(
        self,
        organization_id: str,
        latitude: float,
        longitude: float,
        radius_m: float,
    ) -> list[NearbyIncident]:
        result = await self._rpc(
            "incidents_nearby",
            {
                "p_org": organization_id,
                "p_lat": latitude,
                "p_lng": longitude,
                "p_radius_m": radius_m,
                "p_limit": 40,
            },
        )
        if not isinstance(result, list):
            return []
        return [
            NearbyIncident(
                incident_id=str(row["id"]),
                code=str(row.get("code") or ""),
                title=str(row.get("title") or ""),
                status=row.get("status") or "pendiente",
                zone_name=row.get("zone_name"),
                created_at=str(row.get("created_at") or ""),
                distance_m=float(row.get("distance_m") or 0),
            )
            for row in result
        ]

    async def incident_hotspots(
        self,
        organization_id: str,
        radius_m: float,
        min_incidents: int,
        days: int,
    ) -> list[Hotspot]:
        result = await self._rpc(
            "incident_hotspots",
            {
                "p_org": organization_id,
                "p_radius_m": radius_m,
                "p_min_points": min_incidents,
                "p_days": days,
            },
        )
        if not isinstance(result, list):
            return []
        return [
            Hotspot(
                clusterId=int(row["cluster_id"]),
                incidentCount=int(row["incident_count"]),
                centerLat=float(row["center_lat"]),
                centerLng=float(row["center_lng"]),
                firstIncident=str(row["first_incident"]),
                lastIncident=str(row["last_incident"]),
            )
            for row in result
        ]
