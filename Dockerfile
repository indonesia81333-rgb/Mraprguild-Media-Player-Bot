# syntax=docker/dockerfile:1

# Stage 1: test and build the static web player
FROM python:3.12-slim AS build
WORKDIR /app
COPY bot.py build.py ./
COPY tests ./tests
COPY web ./web
RUN python -m unittest discover -s tests && python build.py

# Stage 2: small runtime image
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=3000
WORKDIR /app
COPY bot.py server.py ./
COPY --from=build /app/dist ./dist
RUN useradd --system --uid 10001 --no-create-home appuser
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % (os.getenv('PORT') or 3000), timeout=4)"]
CMD ["python", "server.py"]
