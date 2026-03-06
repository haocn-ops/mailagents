import { randomBytes } from "node:crypto";

function buildAuthHeader(token, scheme) {
  if (!token) return "";
  if (token.startsWith("Bearer ") || token.startsWith("Token ")) {
    return token;
  }
  return scheme === "RAW" ? token : `Bearer ${token}`;
}

// Transitional adapter: today it targets Mailu's REST API, but its semantic role
// is "internal mail backend adapter" for the self-hosted Mailu fork.
export class MailuInternalAdapter {
  constructor({
    mailboxDomain,
    baseUrl,
    apiToken,
    releaseMode = "disable",
    quotaBytes = 1024 * 1024 * 1024,
    authScheme = "BEARER",
  }) {
    this.mailboxDomain = mailboxDomain;
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.apiToken = apiToken;
    this.releaseMode = releaseMode;
    this.quotaBytes = quotaBytes;
    this.authScheme = authScheme;
  }

  _assertConfigured() {
    if (!this.baseUrl) {
      throw new Error("MAILU_BASE_URL is required when MAIL_PROVIDER=mailu");
    }
    if (!this.apiToken) {
      throw new Error("MAILU_API_TOKEN is required when MAIL_PROVIDER=mailu");
    }
  }

  _headers() {
    return {
      "content-type": "application/json",
      authorization: buildAuthHeader(this.apiToken, this.authScheme),
    };
  }

  _webmailUrl() {
    return `${this.baseUrl}/webmail/`;
  }

  _generatePassword() {
    return randomBytes(18).toString("base64url");
  }

  async _request(method, path, body, expected = [200]) {
    this._assertConfigured();
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: this._headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!expected.includes(response.status)) {
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload.message || JSON.stringify(payload);
      } catch {
        detail = await response.text();
      }
      const err = new Error(`Mailu ${method} ${path} failed with ${response.status}${detail ? `: ${detail}` : ""}`);
      err.status = response.status;
      throw err;
    }

    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async ensureDomain() {
    try {
      await this._request("GET", `/domain/${encodeURIComponent(this.mailboxDomain)}`, null, [200]);
      return;
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    await this._request(
      "POST",
      "/domain",
      {
        name: this.mailboxDomain,
        comment: "Managed by agent-mail-cloud",
        max_users: -1,
        max_aliases: -1,
        max_quota_bytes: this.quotaBytes,
        signup_enabled: false,
      },
      [200],
    );
  }

  async provisionMailbox({ address }) {
    await this.ensureDomain();

    const password = this._generatePassword();
    try {
      await this._request(
        "POST",
        "/user",
        {
          email: address,
          raw_password: password,
          quota_bytes: this.quotaBytes,
          enabled: true,
          enable_imap: true,
          enable_pop: false,
          comment: "Managed by agent-mail-cloud",
        },
        [200],
      );
    } catch (err) {
      if (err.status !== 409) throw err;
      await this._request(
        "PATCH",
        `/user/${encodeURIComponent(address)}`,
        {
          raw_password: password,
          enabled: true,
          enable_imap: true,
          enable_pop: false,
          quota_bytes: this.quotaBytes,
          comment: "Managed by agent-mail-cloud",
        },
        [200],
      );
    }

    return {
      providerRef: JSON.stringify({
        kind: "mailu-user",
        email: address,
      }),
      credentials: {
        login: address,
        password,
        webmailUrl: this._webmailUrl(),
      },
    };
  }

  async issueMailboxCredentials({ address }) {
    await this.ensureDomain();
    const password = this._generatePassword();

    try {
      await this._request(
        "PATCH",
        `/user/${encodeURIComponent(address)}`,
        {
          raw_password: password,
          enabled: true,
          enable_imap: true,
          enable_pop: false,
          quota_bytes: this.quotaBytes,
          comment: "Managed by agent-mail-cloud",
        },
        [200],
      );
    } catch (err) {
      if (err.status !== 404) throw err;
      const provisioned = await this.provisionMailbox({ address });
      return provisioned.credentials;
    }

    return {
      login: address,
      password,
      webmailUrl: this._webmailUrl(),
    };
  }

  async releaseMailbox({ address }) {
    if (this.releaseMode === "delete") {
      try {
        await this._request("DELETE", `/user/${encodeURIComponent(address)}`, null, [200]);
      } catch (err) {
        if (err.status !== 404) throw err;
      }
      return { status: "deleted" };
    }

    await this._request(
      "PATCH",
      `/user/${encodeURIComponent(address)}`,
      {
        enabled: false,
        enable_imap: false,
        enable_pop: false,
        comment: "Released by agent-mail-cloud",
      },
      [200],
    );
    return { status: "disabled" };
  }

  async getMailbox(address) {
    try {
      const payload = await this._request("GET", `/user/${encodeURIComponent(address)}`, null, [200]);
      return {
        found: true,
        address: payload?.email || address,
        enabled: Boolean(payload?.enabled),
        backendStatus: payload?.enabled ? "enabled" : "disabled",
        quotaBytes: payload?.quota_bytes ?? null,
      };
    } catch (err) {
      if (err.status === 404) {
        return {
          found: false,
          address,
          enabled: false,
          backendStatus: "missing",
        };
      }
      throw err;
    }
  }
}
