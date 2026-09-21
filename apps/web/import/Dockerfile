# Import worker: ffmpeg, yt-dlp, Transkun on CPU. Built by Railway with the
# repository root as context, see railway.json next to this file. Build it
# locally with --platform linux/amd64: ncls (a transkun dependency) has no
# aarch64 wheel and would have to compile.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
COPY apps/web/import/pyproject.toml apps/web/import/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/web/import/worker.py ./
ENV PORT=8000
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uv", "run", "--no-sync", "worker.py"]
