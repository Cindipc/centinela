from __future__ import annotations

from functools import lru_cache

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from jwt import PyJWKClient

from .config import Settings, get_settings
from .models import AuthContext
from .supabase import SupabaseError, SupabaseRepository


@lru_cache
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_keys=True)


def _decode_token(token: str, settings: Settings) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido.") from exc

    algorithm = str(header.get("alg") or "")
    audience = settings.supabase_jwt_audience or None
    issuer = settings.resolved_issuer or None

    if algorithm == "HS256":
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Falta SUPABASE_JWT_SECRET para validar tokens HS256.",
            )
        key = settings.supabase_jwt_secret
    else:
        jwks_url = settings.resolved_jwks_url
        if not jwks_url:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Falta SUPABASE_URL/SUPABASE_JWKS_URL para validar tokens.",
            )
        try:
            signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(token)
        except jwt.PyJWKClientError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No se pudo validar la firma.") from exc
        key = signing_key.key
        algorithm = signing_key.algorithm_name

    try:
        return jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tu sesión expiró.") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado.") from exc


def repository(request: Request) -> SupabaseRepository | None:
    return getattr(request.app.state, "repository", None)


async def get_auth_context(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
    repo: SupabaseRepository | None = Depends(repository),
) -> AuthContext:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de Supabase.")
    if repo is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Servicio de IA sin Supabase configurado para validar usuarios.",
        )
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token vacío.")

    claims = _decode_token(token, settings)
    user_id = str(claims.get("sub") or "")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "El token no contiene usuario.")

    try:
        profile = await repo.get_profile(user_id)
    except SupabaseError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    if profile is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tu usuario no tiene perfil en Centinela.")
    return profile


async def get_optional_auth_context(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
    repo: SupabaseRepository | None = Depends(repository),
) -> AuthContext:
    """Modo local: sin token usa un contexto de demostración.

    Con AI_AUTH_REQUIRED=true el token vuelve a ser obligatorio.
    """
    if authorization and authorization.lower().startswith("bearer "):
        return await get_auth_context(authorization, settings, repo)
    if settings.ai_auth_required:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de Supabase.")
    return AuthContext(
        user_id="local-demo",
        role="admin",
        organization_id=settings.demo_organization_id,
    )


async def resolve_organization(
    context: AuthContext,
    repo: SupabaseRepository | None,
    settings: Settings,
    requested: str | None = None,
) -> str:
    if context.role == "superadmin":
        organization = requested
        if not organization and repo is not None and repo.is_configured:
            organization = await repo.get_default_organization()
        organization = organization or settings.demo_organization_id
    else:
        organization = context.organization_id
        if not organization:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Tu usuario no tiene organización asignada.",
            )
        if requested and requested != organization:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "No puedes consultar otra organización.",
            )

    if not organization:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta la organización.")

    if context.user_id != "local-demo" and repo is not None and repo.is_configured:
        try:
            license_usage = await repo.get_license_usage(organization)
        except SupabaseError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
        if license_usage:
            license_status = str(
                license_usage.get("status") or license_usage.get("license_status") or "active"
            ).lower()
            if license_status in {"suspended", "expired", "canceled", "cancelled"}:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "La licencia de la organización no está activa.",
                )

    return organization
