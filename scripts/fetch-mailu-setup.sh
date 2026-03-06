#!/usr/bin/env bash

set -euo pipefail

INPUT="${1:-}"
TARGET_DIR="${2:-/mailu}"
VERSION="${MAILU_SETUP_VERSION:-2024.06}"

if [[ -z "$INPUT" ]]; then
  echo "usage: $0 <setup-url-or-id> [target-dir]" >&2
  exit 1
fi

extract_id() {
  local value="$1"

  if [[ "$value" =~ ^https://setup\.mailu\.io/[^/]+/setup/([^/?#]+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  echo "$value"
}

SETUP_ID="$(extract_id "$INPUT")"
BASE_URL="https://setup.mailu.io/${VERSION}/file/${SETUP_ID}"

mkdir -p "$TARGET_DIR"

echo "Fetching Mailu setup ${SETUP_ID} into ${TARGET_DIR}"
curl -fsSL "${BASE_URL}/docker-compose.yml" -o "${TARGET_DIR}/docker-compose.yml"
curl -fsSL "${BASE_URL}/mailu.env" -o "${TARGET_DIR}/mailu.env"

echo "OK   ${TARGET_DIR}/docker-compose.yml"
echo "OK   ${TARGET_DIR}/mailu.env"
