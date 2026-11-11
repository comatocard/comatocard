# Indexer image. Build from the repository root:
#   docker build -f apps/indexer/Dockerfile -t comatocard-indexer .
FROM rust:1.96.0-slim-bookworm AS build
WORKDIR /repo
COPY . .
RUN cargo build --profile server --locked -p comatocard-indexer

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/target/server/comatocard-indexer /usr/local/bin/comatocard-indexer
USER nobody
ENV PORT=4000
EXPOSE 4000
CMD ["comatocard-indexer"]
