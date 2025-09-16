# backend/Dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# OS deps (for building wheels etc.)
RUN apt-get update && apt-get install -y --no-install-recommends build-essential bash \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source into image
# (Compose builds this Dockerfile from the backend/ directory as context.)
COPY . /app

# Ensure Alembic env + versions are present where Alembic expects them
# and fail the build if critical revisions are missing.
RUN set -euo pipefail; \
    test -f /app/alembic/env.py; \
    ls -1 /app/alembic/versions | sed -n '1,999p'; \
    test -f /app/alembic/versions/0011_rehash_sha256_passwords.py; \
    test -f /app/alembic/versions/0012_refresh_token_table.py; \
    test -f /app/alembic/versions/0013_reconcile_refresh_tokens.py; \
    test -f /app/alembic/versions/0013_merge_heads.py

# Provide a stable alembic.ini location in the container
COPY alembic.ini /app/alembic.ini

# Entrypoint: wait for DB, run migrations, then start Uvicorn
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
