# Mailu Colocated Rewrite

The official Mailu setup output assumes it can bind public `80` and `443` directly on the host.

That does not match the current `mailagents` single-host layout, because:

- host Nginx already serves the control plane on `80`
- HTTPS for hostnames is already handled at the host layer
- we only want Mailu mail protocols on public mail ports

## What This Script Changes

Use:

```bash
bash scripts/patch-mailu-colocated.sh /mailu 149.28.123.3 inbox.mailagents.net https://api.mailagents.net
```

The script rewrites the generated Mailu baseline to:

1. bind Mailu web HTTP to `127.0.0.1:8080`
2. bind Mailu web HTTPS to `127.0.0.1:8443`
3. keep public mail ports on the VPS public IP
4. drop unused public bindings for:
   - `110`
   - `995`
   - `143`
   - `4190`
5. switch `TLS_FLAVOR` to `mail`
6. set reverse-proxy real IP handling

## Why `TLS_FLAVOR=mail`

For the current topology:

- host Nginx serves web HTTPS
- Mailu still needs TLS for mail protocols
- Mailu should not try to own ACME for the API web stack

## What Still Needs To Happen

After rewriting the generated files you still need:

1. host Nginx server block for `inbox.mailagents.net`
2. `docker compose up -d` under `/mailu`
3. Mailu admin bootstrap and user/domain verification
4. later Mailu fork integration with `mailagents` internal endpoints
