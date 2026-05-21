FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

FROM base AS deps

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY apps/ai/requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip && pip install --no-cache-dir -r /tmp/requirements.txt

FROM base AS runtime

ENV PATH="/opt/venv/bin:$PATH"
ENV PORT=8000

COPY --from=deps /opt/venv /opt/venv
COPY apps/ai /app

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
