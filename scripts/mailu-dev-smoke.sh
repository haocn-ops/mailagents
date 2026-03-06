#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
MAILU_BASE_URL="${MAILU_BASE_URL:-http://localhost:3001}"
MAILU_API_TOKEN="${MAILU_API_TOKEN:-change-me}"
WALLET_ADDRESS="${WALLET_ADDRESS:-0xabc0000000000000000000000000000000000123}"

echo "[mailu-smoke] health check"
curl -fsS "$API_BASE_URL/healthz" >/dev/null
curl -fsS "$MAILU_BASE_URL/healthz" >/dev/null

echo "[mailu-smoke] create challenge"
challenge_json="$(curl -fsS "$API_BASE_URL/v1/auth/siwe/challenge" \
  -H 'content-type: application/json' \
  -d "{\"wallet_address\":\"$WALLET_ADDRESS\"}")"

challenge_message="$(printf '%s' "$challenge_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.message);});")"

echo "[mailu-smoke] verify siwe"
verify_json="$(curl -fsS "$API_BASE_URL/v1/auth/siwe/verify" \
  -H 'content-type: application/json' \
  -d "{\"message\":\"${challenge_message//$'\n'/\\n}\",\"signature\":\"0xdev\"}")"

auth_token="$(printf '%s' "$verify_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.access_token);});")"
agent_id="$(printf '%s' "$verify_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.agent_id);});")"

echo "[mailu-smoke] allocate mailbox via mail backend"
allocate_json="$(curl -fsS "$API_BASE_URL/v1/mailboxes/allocate" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $auth_token" \
  -H 'x-payment-proof: mock-proof' \
  -d "{\"agent_id\":\"$agent_id\",\"purpose\":\"mailu-smoke\",\"ttl_hours\":1}")"

mailbox_id="$(printf '%s' "$allocate_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.mailbox_id);});")"
mailbox_address="$(printf '%s' "$allocate_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.address);});")"

echo "[mailu-smoke] simulate inbound from mailu-dev"
curl -fsS "$MAILU_BASE_URL/_dev/inbound" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $MAILU_API_TOKEN" \
  -d "{\"address\":\"$mailbox_address\",\"sender\":\"notify@example.com\",\"sender_domain\":\"example.com\",\"subject\":\"Your verification code\",\"text_excerpt\":\"Use verification code: 482913\",\"html_body\":\"<p>Use verification code: <b>482913</b></p><a href=\\\"https://example.com/verify?token=abc\\\">Verify</a>\"}" >/dev/null

echo "[mailu-smoke] verify latest message"
latest_json="$(curl -fsS "$API_BASE_URL/v1/messages/latest?mailbox_id=$mailbox_id&limit=1" \
  -H "authorization: Bearer $auth_token" \
  -H 'x-payment-proof: mock-proof')"

otp_code="$(printf '%s' "$latest_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.messages[0].otp_code || '');});")"
verify_link="$(printf '%s' "$latest_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.messages[0].verification_link || '');});")"

if [ "$otp_code" != "482913" ]; then
  echo "[mailu-smoke] expected otp_code=482913, got $otp_code" >&2
  exit 1
fi

if [ "$verify_link" != "https://example.com/verify?token=abc" ]; then
  echo "[mailu-smoke] expected verification_link, got $verify_link" >&2
  exit 1
fi

echo "[mailu-smoke] success"
echo "  mailbox_id=$mailbox_id"
echo "  mailbox_address=$mailbox_address"
