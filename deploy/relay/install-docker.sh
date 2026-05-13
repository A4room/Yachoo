#!/bin/sh
set -eu

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  systemctl enable --now docker >/dev/null 2>&1 || true
  exit 0
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-plugin
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y docker docker-compose-plugin
elif command -v yum >/dev/null 2>&1; then
  yum install -y docker
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
else
  echo "Unsupported Linux distro: install Docker and Docker Compose manually." >&2
  exit 1
fi

systemctl enable --now docker
docker compose version
