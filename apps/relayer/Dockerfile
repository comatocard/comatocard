# Relayer image. Build from the repository root:
#   docker build -f apps/relayer/Dockerfile -t comatocard-relayer .
FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
# Scripts are skipped: the root prepare step installs git hooks, which a build has no use for.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@comatocard/relayer..." \
  && pnpm --filter "@comatocard/relayer..." run build \
  && pnpm --filter @comatocard/relayer deploy --prod /out

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /out .
USER node
ENV PORT=4100
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
