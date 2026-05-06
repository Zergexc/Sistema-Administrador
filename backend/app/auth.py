from fastapi import Header, HTTPException, status

from .config import settings


def verify_api_key(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    # Local-first: if API_KEY is empty, auth is disabled.
    if not settings.api_key:
        return

    bearer_key = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer_key = authorization[7:].strip()

    provided = x_api_key or bearer_key
    if provided != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key invalida o ausente",
        )
