#!/usr/bin/env bash

set -euo pipefail

DOMAIN="${1:-inbox.mailagents.net}"
MAILU_ROOT="${2:-/mailu}"

LIVE_DIR="/etc/letsencrypt/live/${DOMAIN}"
CERT_SRC="${LIVE_DIR}/fullchain.pem"
KEY_SRC="${LIVE_DIR}/privkey.pem"
CERT_DST="${MAILU_ROOT}/certs/cert.pem"
KEY_DST="${MAILU_ROOT}/certs/key.pem"

if [[ ! -f "$CERT_SRC" || ! -f "$KEY_SRC" ]]; then
  echo "missing letsencrypt certs for ${DOMAIN}" >&2
  exit 1
fi

mkdir -p "${MAILU_ROOT}/certs"
install -m 0644 "$CERT_SRC" "$CERT_DST"
install -m 0600 "$KEY_SRC" "$KEY_DST"

if [[ -f "${MAILU_ROOT}/docker-compose.yml" && -f "${MAILU_ROOT}/mailu.env" ]]; then
  docker compose -f "${MAILU_ROOT}/docker-compose.yml" --env-file "${MAILU_ROOT}/mailu.env" restart front smtp imap >/dev/null
fi

echo "Synced Mailu certs for ${DOMAIN}"
