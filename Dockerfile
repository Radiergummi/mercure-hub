#syntax=docker/dockerfile:1.7
FROM denoland/deno:1.46.2
WORKDIR /app
USER deno

COPY --link --chown=1993:1993 ./deno.jsonc ./deno.lock ./
RUN DENO_FUTURE=1 deno install
COPY --link --chown=1993:1993 . .

ENTRYPOINT ["deno", "run", "--allow-read", "--allow-net", "--allow-env", "--cached-only", "mod.ts"]
CMD ["serve"]

EXPOSE 8000/tcp
HEALTHCHECK \
    --interval=30s \
    --timeout=30s \
    --start-period=5s \
    --retries=3 \
    CMD ["curl", "-f", "http://localhost:8000/healthz"]
