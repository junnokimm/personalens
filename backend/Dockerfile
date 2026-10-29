# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:0.11.32 AS uv
FROM python:3.12-slim-bookworm AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

FROM python:3.12-slim-bookworm
ENV PATH="/app/backend/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/backend
RUN groupadd --gid 10001 persona && useradd --uid 10001 --gid persona --no-create-home persona
COPY --from=build /app/backend/.venv /app/backend/.venv
COPY backend/app ./app
COPY backend/alembic.ini ./alembic.ini
COPY backend/migrations ./migrations
# persona_data.py resolves this relative to the repository layout.
COPY src/data/personaSchema.json /app/src/data/personaSchema.json
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
