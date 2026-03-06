# Mailu Setup Download

Mailu's official setup flow generates a `docker-compose.yml` and a `mailu.env` file through the Mailu setup utility.

This repository includes a helper so that once a setup link or setup id exists, the files can be fetched directly onto the target host.

## 1. Generate a Mailu setup

Use the official Mailu setup utility:

- [https://setup.mailu.io/2024.06/](https://setup.mailu.io/2024.06/)

Use the current baseline assumptions unless you intentionally want a different topology:

- Mailu version: `2024.06`
- deployment type: Docker Compose
- main mail domain: `inbox.mailagents.net`
- primary public hostname: `inbox.mailagents.net`
- reverse proxy mode: external reverse proxy on the host
- no ClamAV on the current small VPS

## 2. Download the generated files

Once the setup utility gives you a generated link such as:

```text
https://setup.mailu.io/2024.06/setup/<setup-id>
```

download it with:

```bash
bash scripts/fetch-mailu-setup.sh https://setup.mailu.io/2024.06/setup/<setup-id> /mailu
```

You can also pass just the setup id:

```bash
bash scripts/fetch-mailu-setup.sh <setup-id> /mailu
```

This writes:

- `/mailu/docker-compose.yml`
- `/mailu/mailu.env`

## 3. Review before start

Before starting Mailu, review:

1. `HOSTNAMES`
2. `DOMAIN`
3. `PORTS`
4. `TLS_FLAVOR`
5. `INITIAL_ADMIN_*`
6. image version and registry

## 4. Why This Helper Exists

The Mailu setup utility is authoritative for generating the baseline compose files. This repository intentionally does not hardcode a guessed Mailu production compose file because that would drift from the official generator and make upgrades harder.
