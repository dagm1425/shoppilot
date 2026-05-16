# ShopPilot AI Service (Phase 4.1 Foundation)

This service provides the FastAPI foundation for the AI assistant.

## Run locally

```bash
cd apps/ai
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.sample .env
# fill required values in .env
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## Endpoints

- `GET /health`
- `POST /ai/chat`
- `GET /v1/health`
- `POST /v1/ai/chat`
