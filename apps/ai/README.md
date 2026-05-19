# ShopPilot AI Service (Phase 4.2 Retrieval)

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

## Rebuild the product vector index

```bash
cd apps/ai
python -m app.cli rebuild-index
```

This command reads product rows from PostgreSQL, builds embeddings, and refreshes the local Chroma collection.

## Use Gemini for embeddings

Phase A uses the official Google GenAI SDK (`google-genai`) for embeddings.

Install/update dependencies:

```bash
cd apps/ai
source .venv/bin/activate
pip install -r requirements.txt
```

Add these env vars in `apps/ai/.env`:

```bash
EMBEDDING_PROVIDER=gemini
EMBEDDING_API_KEY=your-gemini-api-key
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_BASE_URL=https://generativelanguage.googleapis.com/v1beta

# optional Gemini alias fallbacks:
# GEMINI_API_KEY=your-gemini-api-key
# GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
# GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

Embedding defaults:
- provider: `gemini`
- model: `gemini-embedding-001`
- base URL: `https://generativelanguage.googleapis.com/v1beta`

## Phase 4.3 synthesis note

In Phase 4.3, the graph keeps retrieval/tool orchestration deterministic and adds
an LLM synthesis step only at final response generation:

- retrieval and product ranking remain tool-driven
- synthesis rewrites user-facing `assistantMessage` and `followUpPrompts`
- synthesis failure falls back to deterministic graph messaging
- synthesis provider migration is intentionally deferred to a separate Phase B change
