FROM python:3.12-slim
WORKDIR /app
COPY --chown=10001:10001 server.py ./
COPY --chown=10001:10001 n5 ./n5
COPY --chown=10001:10001 static ./static
COPY --chown=10001:10001 data ./data
RUN mkdir /app/storage && chown 10001:10001 /app/storage
USER 10001:10001
ENV N5_VOCABULARY=/app/storage/vocabulary.json HOST=0.0.0.0 PORT=8080 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=2)" || exit 1
CMD ["python", "server.py"]
