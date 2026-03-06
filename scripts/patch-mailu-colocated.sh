#!/usr/bin/env bash

set -euo pipefail

TARGET_DIR="${1:-/mailu}"
PUBLIC_IP="${2:-}"
MAIL_HOSTNAME="${3:-inbox.mailagents.net}"
WEBSITE_URL="${4:-https://api.mailagents.net}"

COMPOSE_FILE="${TARGET_DIR}/docker-compose.yml"
ENV_FILE="${TARGET_DIR}/mailu.env"

if [[ -z "$PUBLIC_IP" ]]; then
  echo "usage: $0 <target-dir> <public-ip> [mail-hostname] [website-url]" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
  echo "mailu files missing under ${TARGET_DIR}" >&2
  exit 1
fi

cp "$COMPOSE_FILE" "${COMPOSE_FILE}.bak"
cp "$ENV_FILE" "${ENV_FILE}.bak"

# Frontend web ports must not conflict with the host Nginx already serving the API.
perl -0pi -e "s#${PUBLIC_IP}:80:80#127.0.0.1:8080:80#g; s#${PUBLIC_IP}:443:443#127.0.0.1:8443:443#g; s#\\n\\s+- \"${PUBLIC_IP}:110:110\"##g; s#\\n\\s+- \"${PUBLIC_IP}:995:995\"##g; s#\\n\\s+- \"${PUBLIC_IP}:143:143\"##g; s#\\n\\s+- \"${PUBLIC_IP}:4190:4190\"##g" "$COMPOSE_FILE"

# Align Mailu with the colocated host reverse proxy model.
perl -0pi -e "s#^TLS_FLAVOR=.*#TLS_FLAVOR=mail#m; s#^WEBSITE=.*#WEBSITE=${WEBSITE_URL//\//\\/}#m; s#^HOSTNAMES=.*#HOSTNAMES=${MAIL_HOSTNAME}#m; s#^REAL_IP_HEADER=.*#REAL_IP_HEADER=X-Forwarded-For#m; s#^REAL_IP_FROM=.*#REAL_IP_FROM=127.0.0.1#m" "$ENV_FILE"

echo "Patched ${COMPOSE_FILE}"
echo "Patched ${ENV_FILE}"
echo
echo "Front web ports:"
grep -n '127.0.0.1:8080:80\|127.0.0.1:8443:443' "$COMPOSE_FILE"
echo
echo "Mail env:"
grep -n '^HOSTNAMES=\|^TLS_FLAVOR=\|^WEBSITE=\|^REAL_IP_HEADER=\|^REAL_IP_FROM=' "$ENV_FILE"
