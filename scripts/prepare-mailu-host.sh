#!/usr/bin/env bash

set -euo pipefail

MAILU_ROOT="${MAILU_ROOT:-/mailu}"
MAILU_DIRS=(
  "$MAILU_ROOT"
  "$MAILU_ROOT/data"
  "$MAILU_ROOT/dkim"
  "$MAILU_ROOT/mail"
  "$MAILU_ROOT/overrides"
  "$MAILU_ROOT/certs"
  "$MAILU_ROOT/config"
)

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "MISSING command: $name" >&2
    exit 1
  fi
}

port_summary() {
  local port="$1"
  echo "PORT $port"
  ss -ltnp "( sport = :$port )" || true
  echo
}

require_cmd docker
require_cmd docker
require_cmd ss
require_cmd df
require_cmd mkdir

echo "== docker =="
docker --version
docker compose version
echo

echo "== create directories =="
for path in "${MAILU_DIRS[@]}"; do
  mkdir -p "$path"
  chmod 750 "$path"
  echo "OK   $path"
done
echo

echo "== disk =="
df -h "$MAILU_ROOT"
echo

echo "== ports =="
for port in 25 80 443 465 587 993; do
  port_summary "$port"
done

echo "== notes =="
echo "- 80/443 may be owned by host Nginx if you plan to reverse proxy Mailu web UI."
echo "- 25/465/587/993 should be free for Mailu before final cutover."
echo "- place the future Mailu compose files under $MAILU_ROOT/config or $MAILU_ROOT."
