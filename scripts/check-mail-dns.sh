#!/usr/bin/env bash

set -euo pipefail

DOMAIN="${1:-mailagents.net}"
EXPECTED_IP="${2:-}"
API_HOST="api.${DOMAIN}"
MAIL_HOST="inbox.${DOMAIN}"

if ! command -v dig >/dev/null 2>&1; then
  echo "dig is required" >&2
  exit 1
fi

check_a_record() {
  local host="$1"
  local expected="$2"
  local result

  result="$(dig +short A "$host" | tail -n 1)"

  if [[ -z "$result" ]]; then
    echo "FAIL A $host missing"
    return 1
  fi

  if [[ -n "$expected" && "$result" != "$expected" ]]; then
    echo "WARN A $host resolved to $result expected $expected"
    return 0
  fi

  echo "OK   A $host -> $result"
}

check_mx_record() {
  local host="$1"
  local result

  result="$(dig +short MX "$host" | tr '\n' ';' | sed 's/;$//')"

  if [[ -z "$result" ]]; then
    echo "FAIL MX $host missing"
    return 1
  fi

  echo "OK   MX $host -> $result"
}

check_a_record "$API_HOST" ""
check_a_record "$MAIL_HOST" "$EXPECTED_IP"
check_mx_record "$MAIL_HOST"
