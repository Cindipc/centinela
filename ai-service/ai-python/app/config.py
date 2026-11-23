from __future__ import annotations

from functools import lru_cache
from urllib.parse import urlsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración del servicio de IA. Todo secreto vive solo en el servidor."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    # Compatibilidad con la clave nueva del proyecto raíz (.env).
    supabase_secret_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwks_url: str = ""
    supabase_jwt_issuer: str = ""
    supabase_jwt_audience: str = "authenticated"
    database_url: str = ""

    ai_auth_required: bool = False
    allow_synthetic: bool = True
    synthetic_min_incidents: int = 24
    synthetic_seed: int = 42
    demo_organization_id: str = "00000000-0000-4000-d000-000000000001"

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:0.5b"
    ollama_vision_model: str = ""
    ollama_timeout_seconds: float = 20.0

    java_ai_url: str = "http://127.0.0.1:8003"
    java_timeout_seconds: float = 10.0

    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )
    max_incidents: int = 1000
    duplicate_radius_m: float = 120.0
    hotspot_radius_m: float = 220.0
    hotspot_min_incidents: int = 3
    ai_host: str = "127.0.0.1"
    ai_port: int = 8001
    ai_reload: bool = False

    @property
    def service_role_key(self) -> str:
        return self.supabase_service_role_key or self.supabase_secret_key

    @property
    def supabase_base_url(self) -> str:
        if self.supabase_url:
            return self.supabase_url.rstrip("/")
        reference = self.supabase_jwks_url or self.supabase_jwt_issuer
        if not reference:
            return ""
        parts = urlsplit(reference)
        return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else ""

    @property
    def rest_url(self) -> str:
        return f"{self.supabase_base_url}/rest/v1"

    @property
    def resolved_jwks_url(self) -> str:
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        if not self.supabase_base_url:
            return ""
        return f"{self.supabase_base_url}/auth/v1/.well-known/jwks.json"

    @property
    def resolved_issuer(self) -> str:
        if self.supabase_jwt_issuer:
            return self.supabase_jwt_issuer
        if not self.supabase_base_url:
            return ""
        return f"{self.supabase_base_url}/auth/v1"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
