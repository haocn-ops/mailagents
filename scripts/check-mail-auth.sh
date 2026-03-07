#!/usr/bin/env bash

set -euo pipefail

DOMAIN="${1:-inbox.mailagents.net}"
IP="${2:-149.28.123.3}"
DKIM_HOST="${3:-dkim._domainkey.${DOMAIN}}"

echo "Checking PTR for ${IP}"
PTR="$(dig -x "${IP}" +short | tr -d '\r')"
if [[ "${PTR}" == "${DOMAIN}." ]]; then
  echo "OK   PTR ${IP} -> ${PTR}"
else
  echo "FAIL PTR ${IP} -> ${PTR:-<empty>} (expected ${DOMAIN}.)"
fi

echo
echo "Checking SPF for ${DOMAIN}"
SPF="$(dig +short txt "${DOMAIN}" | tr -d '\r')"
if [[ "${SPF}" == *"v=spf1"* ]]; then
  echo "OK   SPF ${DOMAIN} -> ${SPF}"
else
  echo "FAIL SPF ${DOMAIN} missing"
fi

echo
echo "Checking DKIM for ${DKIM_HOST}"
DKIM="$(dig +short txt "${DKIM_HOST}" | tr -d '\r')"
if [[ "${DKIM}" == *"v=DKIM1"* ]]; then
  echo "OK   DKIM ${DKIM_HOST} present"
else
  echo "FAIL DKIM ${DKIM_HOST} missing"
fi

echo
echo "Checking DMARC for _dmarc.${DOMAIN}"
DMARC="$(dig +short txt "_dmarc.${DOMAIN}" | tr -d '\r')"
if [[ "${DMARC}" == *"v=DMARC1"* ]]; then
  echo "OK   DMARC _dmarc.${DOMAIN} -> ${DMARC}"
else
  echo "FAIL DMARC _dmarc.${DOMAIN} missing"
fi
