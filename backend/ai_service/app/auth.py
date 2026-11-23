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


def repository(request: Request) -> SupabaseRepository:
    repo = getattr(request.app.state, "repository", None)
    if repo is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Servicio de IA sin configurar.")
    return repo


async def get_auth_context(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
    repo: SupabaseRepository = Depends(repository),
) -> AuthContext:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de Supabase.")
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
