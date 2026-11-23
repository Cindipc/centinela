from __future__ import annotations

from typing import Any

import httpx

from .config import Settings


class JavaClient:
    """Proxy hacia el microservicio Java DL4J (clasificación/priorización)."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self.settings = settings
        self.client = client

    @property
    def base_url(self) -> str:
        return self.settings.java_ai_url.rstrip("/")

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.base_url:
            return None
        try:
            response = await self.client.post(
                f"{self.base_url}{path}",
                json=payload,
                timeout=self.settings.java_timeout_seconds,
            )
        except (httpx.HTTPError, OSError):
            return None
        if response.status_code >= 400:
            return None
        try:
            body = response.json()
        except ValueError:
            return None
        return body if isinstance(body, dict) else None

    async def health(self) -> dict[str, Any]:
        if not self.base_url:
            return {"status": "unavailable", "url": ""}
        try:
            response = await self.client.get(f"{self.base_url}/health", timeout=3.0)
        except (httpx.HTTPError, OSError):
            return {"status": "unavailable", "url": self.base_url}
        if response.status_code >= 400:
            return {"status": "unavailable", "url": self.base_url, "code": response.status_code}
        try:
            payload = response.json()
        except ValueError:
            return {"status": "invalid", "url": self.base_url}
        return payload if isinstance(payload, dict) else {"status": "invalid", "url": self.base_url}

    async def classify(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        return await self._post("/ai/classify", payload)

    async def prioritize(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        return await self._post("/ai/prioritize", payload)

    async def train(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        timeout = max(self.settings.java_timeout_seconds, 60.0)
        if not self.base_url:
            return None
        try:
            response = await self.client.post(
                f"{self.base_url}/ai/train",
                json=payload,
                timeout=timeout,
            )
        except (httpx.HTTPError, OSError):
            return None
        if response.status_code >= 400:
            return None
        try:
            body = response.json()
        except ValueError:
            return None
        return body if isinstance(body, dict) else None
