# ============================================
# Stage 1 — Install dependencies
# ============================================
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml ./

# Extract dependencies from pyproject.toml and install them
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    python -c "import tomllib, pathlib; \
    deps = tomllib.loads(pathlib.Path('pyproject.toml').read_text())['project']['dependencies']; \
    pathlib.Path('requirements.txt').write_text('\n'.join(deps))" && \
    pip install --no-cache-dir -r requirements.txt

# ============================================
# Stage 2 — Production runtime
# ============================================
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY backend/ ./

# Create log directory
RUN mkdir -p /var/log/senhas && \
    addgroup --system --gid 1001 appuser && \
    adduser --system --uid 1001 --ingroup appuser appuser && \
    chown -R appuser:appuser /var/log/senhas /app

# Copy entrypoint (ensure LF line endings for Linux)
COPY backend/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

USER appuser

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
