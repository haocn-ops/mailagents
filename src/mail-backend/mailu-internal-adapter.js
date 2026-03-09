import { randomBytes } from "node:crypto";
import { buildAuthHeader, requestJson } from "../http-client.js";

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
    smtpHost,
    smtpPort = 587,
    smtpSecure = false,
  }) {
    this.mailboxDomain = mailboxDomain;
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.apiToken = apiToken;
    this.releaseMode = releaseMode;
    this.quotaBytes = quotaBytes;
    this.authScheme = authScheme;
    this.smtpHost = smtpHost || mailboxDomain;
    this.smtpPort = smtpPort;
    this.smtpSecure = smtpSecure;
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
    try {
      return await requestJson(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: this._headers(),
        body,
        expectedStatuses: expected,
      });
    } catch (err) {
      const detail = err.message.replace(`${method} ${this.baseUrl}/api/v1${path} failed`, "").trim();
      const wrapped = new Error(`Mailu ${method} ${path} failed${detail ? ` ${detail}` : ""}`);
      wrapped.status = err.status;
      throw wrapped;
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

  async sendMailboxMessage({ address, password, to, subject, text, html }) {
    let nodemailer;
    try {
      nodemailer = await import("nodemailer");
    } catch {
      throw new Error("SMTP send requires package 'nodemailer'. Run: npm install nodemailer");
    }

    const recipients = Array.isArray(to) ? to : [to];
    const transporter = nodemailer.default.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.smtpSecure,
      auth: {
        user: address,
        pass: password,
      },
    });

    const info = await transporter.sendMail({
      from: address,
      to: recipients.join(", "),
      subject,
      text: text || undefined,
      html: html || undefined,
    });

    return {
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      messageId: info.messageId || null,
      envelope: info.envelope || null,
      response: info.response || null,
    };
  }
}
