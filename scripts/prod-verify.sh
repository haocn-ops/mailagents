#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-https://api.mailagents.net}"
ADMIN_API_TOKEN="${ADMIN_API_TOKEN:-}"
WALLET_ADDRESS="${WALLET_ADDRESS:-0xabc0000000000000000000000000000000000123}"
PAYMENT_MODE="${PAYMENT_MODE:-hmac}"
PAYMENT_PROOF="${PAYMENT_PROOF:-}"

if [ -z "$ADMIN_API_TOKEN" ]; then
  echo "ADMIN_API_TOKEN is required" >&2
  exit 1
fi

echo "[prod-verify] health"
curl -fsS "$API_BASE_URL/healthz" >/dev/null

echo "[prod-verify] admin auth required"
admin_code="$(curl -s -o /tmp/mailagents-admin-denied.json -w '%{http_code}' "$API_BASE_URL/v1/admin/overview/metrics")"
if [ "$admin_code" != "401" ]; then
  echo "expected 401 without admin token, got $admin_code" >&2
  exit 1
fi

echo "[prod-verify] admin auth works"
curl -fsS "$API_BASE_URL/v1/admin/overview/metrics" \
  -H "authorization: Bearer $ADMIN_API_TOKEN" >/dev/null

echo "[prod-verify] create challenge"
challenge_json="$(curl -fsS "$API_BASE_URL/v1/auth/siwe/challenge" \
  -H 'content-type: application/json' \
  -d "{\"wallet_address\":\"$WALLET_ADDRESS\"}")"

challenge_message="$(printf '%s' "$challenge_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.message || '');});")"
if [ -z "$challenge_message" ]; then
  echo "challenge message missing" >&2
  exit 1
fi

echo "[prod-verify] warning: verify/allocate not executed automatically"
echo "Provide a real SIWE signature and payment proof to extend this script for full production flow."
echo "[prod-verify] success"
