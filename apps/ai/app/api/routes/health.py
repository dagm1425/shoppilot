from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas import HealthResponse

router = APIRouter(tags=['health'])


@router.get('/health', response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse(status='ok', service='shoppilot-ai', timestamp=datetime.now(timezone.utc))
