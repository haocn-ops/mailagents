#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
WALLET_ADDRESS="${WALLET_ADDRESS:-0xabc0000000000000000000000000000000000123}"

echo "[smoke] health check"
curl -fsS "$API_BASE_URL/healthz" >/dev/null

echo "[smoke] create challenge"
challenge_json="$(curl -fsS "$API_BASE_URL/v1/auth/siwe/challenge" \
  -H 'content-type: application/json' \
  -d "{\"wallet_address\":\"$WALLET_ADDRESS\"}")"

challenge_message="$(printf '%s' "$challenge_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j.message)process.exit(2);process.stdout.write(j.message);});")"

echo "[smoke] verify siwe"
verify_json="$(curl -fsS "$API_BASE_URL/v1/auth/siwe/verify" \
  -H 'content-type: application/json' \
  -d "{\"message\":\"${challenge_message//$'\n'/\\n}\",\"signature\":\"0xdev\"}")"

auth_token="$(printf '%s' "$verify_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j.access_token)process.exit(2);process.stdout.write(j.access_token);});")"
agent_id="$(printf '%s' "$verify_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j.agent_id)process.exit(2);process.stdout.write(j.agent_id);});")"

echo "[smoke] allocate mailbox"
allocate_json="$(curl -fsS "$API_BASE_URL/v1/mailboxes/allocate" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $auth_token" \
  -H 'x-payment-proof: mock-proof' \
  -d "{\"agent_id\":\"$agent_id\",\"purpose\":\"smoke\",\"ttl_hours\":1}")"

mailbox_id="$(printf '%s' "$allocate_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j.mailbox_id)process.exit(2);process.stdout.write(j.mailbox_id);});")"

echo "[smoke] query messages"
curl -fsS "$API_BASE_URL/v1/messages/latest?mailbox_id=$mailbox_id&limit=1" \
  -H "authorization: Bearer $auth_token" \
  -H 'x-payment-proof: mock-proof' >/dev/null

echo "[smoke] success"
echo "  mailbox_id=$mailbox_id"
