# Mailu Certificate Renewal

When Mailu runs with `TLS_FLAVOR=mail`, it reads certificate files from:

- `/mailu/certs/cert.pem`
- `/mailu/certs/key.pem`

That means a successful Let's Encrypt renewal on the host is not enough by itself. The renewed certs must also be copied into `/mailu/certs`, then the relevant Mailu containers must be restarted.

## Manual Sync

```bash
bash scripts/sync-mailu-certs.sh inbox.mailagents.net /mailu
```

## Certbot Deploy Hook

Install a deploy hook on the host:

```bash
cp scripts/sync-mailu-certs.sh /usr/local/bin/sync-mailu-certs.sh
chmod +x /usr/local/bin/sync-mailu-certs.sh
cat >/etc/letsencrypt/renewal-hooks/deploy/mailu-cert-sync <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
/usr/local/bin/sync-mailu-certs.sh inbox.mailagents.net /mailu
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/mailu-cert-sync
```

## Why This Exists

Without this sync step:

1. host Nginx may use the renewed certificate
2. Mailu mail protocols may continue serving the old certificate
3. IMAPS / SMTPS / Submission TLS will eventually fail validation
