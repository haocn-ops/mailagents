# Mail Auth Setup

This document covers the minimum DNS and provider-side changes required to make outbound delivery from `inbox.mailagents.net` acceptable to Gmail and similar receivers.

Current live host:

- Mail host: `inbox.mailagents.net`
- Mail IP: `149.28.123.3`

## Required changes

### 1. Reverse DNS / PTR

Set the PTR for `149.28.123.3` to:

```text
inbox.mailagents.net
```

Validation:

```bash
dig -x 149.28.123.3 +short
```

Expected result:

```text
inbox.mailagents.net.
```

### 2. SPF

Add this TXT record in Cloudflare:

- Type: `TXT`
- Name: `inbox`
- Content:

```text
v=spf1 mx a:inbox.mailagents.net ~all
```

Validation:

```bash
dig +short txt inbox.mailagents.net
```

Expected result includes:

```text
"v=spf1 mx a:inbox.mailagents.net ~all"
```

### 3. DKIM

Mailu generated this DKIM record for the live domain:

- Type: `TXT`
- Name: `dkim._domainkey.inbox`
- Content:

```text
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApiDY+qgCyrSJSz4/9e1liKC6kqmh6MUgfMDK8viGmQDGNKVE/UiXNdCNHCx8HVrsg+zaJcvAHkrvWXxKhIuc5Jl/LJVu9c+cmm5pQFCdKuDngkculhChP0sVBidMVC9t2T/w2kd97QF+2yR6j7zaECO9/S557IyAxeRLrkm8C+a8XKfNIuQ+NcrtbRxudrTuNtXMTwV351GGnEM+K9ScTR1IZeTI/mCqpTlz+dUZW6IkoP84kxX5U0+ErzOlsyqFkUbLvpe0Q3aeVv6LATx6uv7jTQz1L5whF1tHZSNZdfRvZtd7OBYns64eD9veo9izEDg4/LukmeuItGg2afi2pQIDAQAB
```

Validation:

```bash
dig +short txt dkim._domainkey.inbox.mailagents.net
```

### 4. DMARC

Add this TXT record:

- Type: `TXT`
- Name: `_dmarc.inbox`
- Content:

```text
v=DMARC1; p=reject; rua=mailto:postmaster@inbox.mailagents.net; ruf=mailto:postmaster@inbox.mailagents.net; adkim=s; aspf=s
```

Validation:

```bash
dig +short txt _dmarc.inbox.mailagents.net
```

## Optional but recommended

Mailu also exposes an informational DMARC reporting authorization record:

- Type: `TXT`
- Name: `inbox.mailagents.net._report._dmarc.inbox`
- Content:

```text
v=DMARC1;
```

This is not the primary blocker for Gmail delivery, but keeping Mailu's generated DNS set intact is cleaner.

## Verification flow

After you add the records:

```bash
npm run verify:mail-auth
```

Then retry outbound delivery to Gmail and inspect Mailu SMTP logs if needed.

## Current blockers seen in live delivery

Gmail previously rejected mail with:

- missing or incorrect PTR
- SPF did not pass
- DKIM did not pass

Until PTR, SPF, and DKIM all validate publicly, outbound Gmail delivery should not be treated as production-ready.
