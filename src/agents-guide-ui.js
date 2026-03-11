export function renderAgentsGuideHtml({ demoInboxAddress = "" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Mail Cloud Production Guide</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
    :root {
      --bg: #f4efe7;
      --ink: #1f1a17;
      --muted: #645950;
      --line: #dbcdbc;
      --panel: rgba(255, 251, 246, 0.92);
      --brand: #9a4d2b;
      --brand-deep: #1f4a44;
      --accent: #efe2d1;
      --ok: #225f3b;
      --warn: #9d4020;
      --shadow: 0 22px 60px rgba(58, 34, 17, 0.12);
      --radius: 22px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Space Grotesk', sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 10% 0%, rgba(154, 77, 43, 0.18), transparent 25%),
        radial-gradient(circle at 90% 10%, rgba(31, 74, 68, 0.18), transparent 22%),
        linear-gradient(180deg, #f8f2e9, #efe1d1 56%, #eadbcd);
    }
    .shell {
      max-width: 1160px;
      margin: 0 auto;
      padding: 28px 18px 56px;
    }
    .hero, .panel {
      background: var(--panel);
      border: 1px solid rgba(154, 123, 96, 0.28);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }
    .hero {
      padding: 28px;
      margin-bottom: 18px;
      position: relative;
      overflow: hidden;
    }
    .hero:after {
      content: "";
      position: absolute;
      right: -42px;
      top: -30px;
      width: 190px;
      height: 190px;
      background: linear-gradient(135deg, rgba(154, 77, 43, 0.2), rgba(31, 74, 68, 0.2));
      border-radius: 40px;
      transform: rotate(18deg);
    }
    .eyebrow {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--brand-deep);
      font-weight: 700;
    }
    h1 {
      margin: 12px 0 10px;
      font-size: clamp(36px, 6vw, 64px);
      line-height: 0.94;
      max-width: 12ch;
    }
    .lead {
      margin: 0;
      max-width: 66ch;
      color: var(--muted);
      line-height: 1.65;
      font-size: 15px;
    }
    .hero-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    .hero-actions a {
      text-decoration: none;
      border-radius: 999px;
      padding: 10px 14px;
      font-weight: 700;
    }
    .hero-actions a.primary {
      background: var(--brand);
      color: #fff;
    }
    .hero-actions a.secondary {
      background: var(--accent);
      color: var(--ink);
    }
    .meta-grid, .section-grid {
      display: grid;
      gap: 16px;
    }
    .meta-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 18px;
    }
    .panel {
      padding: 18px;
    }
    .k {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .v {
      margin-top: 8px;
      font-size: 24px;
      font-weight: 700;
    }
    .section-grid {
      grid-template-columns: 1.1fr 0.9fr;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 24px;
    }
    h3 {
      margin: 16px 0 8px;
      font-size: 17px;
    }
    p, li {
      color: var(--muted);
      line-height: 1.65;
      font-size: 14px;
    }
    ul, ol {
      margin: 10px 0 0;
      padding-left: 20px;
    }
    code, pre {
      font-family: 'IBM Plex Mono', monospace;
    }
    .code {
      background: #171310;
      color: #f8dfce;
      border-radius: 16px;
      padding: 14px;
      overflow: auto;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .steps {
      display: grid;
      gap: 12px;
    }
    .step {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      background: rgba(255,255,255,0.72);
    }
    .step-num {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--brand-deep);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .callout {
      border-left: 4px solid var(--brand);
      background: #fbf3eb;
      border-radius: 14px;
      padding: 12px 14px;
      margin-top: 12px;
    }
    .callout.ok { border-left-color: var(--ok); }
    .callout.warn { border-left-color: var(--warn); }
    .footer {
      margin-top: 18px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 980px) {
      .meta-grid, .section-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="eyebrow">Production Agents Guide</div>
      <h1>Operate the live mail system, not the test scaffold.</h1>
      <p class="lead">This guide is the production operating contract for agents. Use the live endpoints, assume strict wallet authentication, request short-lived HMAC payment proofs before protected calls, and always release mailboxes when the workflow is complete.</p>
      <div class="hero-actions">
        <a class="primary" href="https://api.mailagents.net/app">Open User App</a>
        <a class="secondary" href="https://api.mailagents.net/admin">Open Admin Dashboard</a>
        <a class="secondary" href="https://inbox.mailagents.net/webmail/" target="_blank" rel="noreferrer">Open Webmail</a>
      </div>
    </section>

    <section class="meta-grid">
      <article class="panel"><div class="k">API Base</div><div class="v">api.mailagents.net</div><p>All production API calls should target <code>https://api.mailagents.net</code>.</p></article>
      <article class="panel"><div class="k">Auth Mode</div><div class="v">SIWE strict</div><p>Agents must sign the SIWE challenge with a real wallet. Do not assume mock signatures work in production.</p></article>
      <article class="panel"><div class="k">Payment Mode</div><div class="v">HMAC proof</div><p>Protected mailbox and message endpoints require a short-lived payment proof issued by the backend.</p></article>
      <article class="panel"><div class="k">Mail Domain</div><div class="v">inbox.mailagents.net</div><p>Allocated mailboxes, Webmail login, and SMTP/IMAP credentials are issued against the live mail domain.</p></article>
      <article class="panel"><div class="k">Demo Inbox</div><div class="v">${demoInboxAddress || "Not configured"}</div><p>${demoInboxAddress ? "Send a test email to see the auto-reply demo." : "Set DEMO_INBOX_ADDRESS in the API runtime to show the live demo address."}</p></article>
    </section>

    <section class="section-grid">
      <article class="panel">
        <h2>Direct Production Flow</h2>
        <div class="steps">
          <div class="step">
            <div class="step-num">0</div>
            <h3>Set the live base URL</h3>
            <pre class="code">export API_BASE="https://api.mailagents.net"</pre>
          </div>
          <div class="step">
            <div class="step-num">1</div>
            <h3>Request a SIWE challenge</h3>
            <pre class="code">curl -s "$API_BASE/v2/auth/siwe/challenge" \\
  -H 'content-type: application/json' \\
  -d '{"wallet_address":"0xYOUR_WALLET"}'</pre>
            <p>Sign the returned <code>message</code> using the live wallet on the configured chain.</p>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <h3>Verify the signature and store the session</h3>
            <pre class="code">curl -s "$API_BASE/v2/auth/siwe/verify" \\
  -H 'content-type: application/json' \\
  -d '{"message":"&lt;challenge_message&gt;","signature":"&lt;wallet_signature&gt;"}'</pre>
            <p>Persist <code>access_token</code>, <code>agent_id</code>, <code>tenant_id</code>, and <code>did</code>.</p>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <h3>Ask the backend for a payment proof</h3>
            <pre class="code">curl -s "$API_BASE/v1/payments/proof" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -d '{"method":"POST","path":"/v1/mailboxes/allocate"}'</pre>
            <p>Use the returned <code>x_payment_proof</code> value exactly as the <code>x-payment-proof</code> header.</p>
          </div>
          <div class="step">
            <div class="step-num">4</div>
            <h3>Allocate a mailbox</h3>
            <pre class="code">curl -s "$API_BASE/v1/mailboxes/allocate" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;x_payment_proof&gt;' \\
  -d '{"agent_id":"&lt;agent_id&gt;","purpose":"signup","ttl_hours":1}'</pre>
            <p>Persist <code>mailbox_id</code>, <code>address</code>, <code>expires_at</code>, and any issued login details.</p>
          </div>
        </div>
      </article>

      <article class="panel">
        <h2>Execution Rules</h2>
        <div class="callout ok">
          <strong>Use the live UI when possible.</strong>
          <p>For browser-based operation, open <code>https://api.mailagents.net/app</code>. It already handles runtime detection, wallet connect, mailbox selection, webhook setup, usage lookup, and send-mail flow.</p>
        </div>
        <div class="callout warn">
          <strong>Do not use mock assumptions.</strong>
          <p>Production is currently running with strict SIWE and HMAC billing proofs. Local shortcuts such as <code>mock-proof</code> or fake signatures are not valid on the live deployment.</p>
        </div>
        <div class="callout">
          <strong>Persist these fields per run.</strong>
          <ul>
            <li><code>access_token</code></li>
            <li><code>agent_id</code></li>
            <li><code>tenant_id</code></li>
            <li><code>mailbox_id</code></li>
            <li><code>address</code></li>
            <li><code>webmail_password</code></li>
          </ul>
        </div>
        <div class="callout">
          <strong>Protected endpoints.</strong>
          <ul>
            <li><code>POST /v1/mailboxes/allocate</code></li>
            <li><code>GET /v1/messages/latest</code></li>
            <li><code>POST /v1/messages/send</code></li>
            <li><code>POST /v1/webhooks</code></li>
          </ul>
        </div>
      </article>
    </section>

    <section class="section-grid" style="margin-top: 16px;">
      <article class="panel">
        <h2>Fast Path (V1 Auth + V2 Leases)</h2>
        <p>Use V1 SIWE auth to obtain a JWT, then allocate and operate mailboxes through the V2 lease endpoints.</p>
        <div class="steps">
          <div class="step">
            <div class="step-num">1</div>
            <h3>Authenticate via SIWE (V1)</h3>
            <pre class="code">curl -s "$API_BASE/v2/auth/siwe/challenge" \\
  -H 'content-type: application/json' \\
  -d '{"wallet_address":"0xYOUR_WALLET"}'

curl -s "$API_BASE/v2/auth/siwe/verify" \\
  -H 'content-type: application/json' \\
  -d '{"message":"&lt;challenge_message&gt;","signature":"&lt;wallet_signature&gt;"}'</pre>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <h3>Allocate a lease (V2)</h3>
            <pre class="code">curl -s "$API_BASE/v2/mailboxes/leases" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;x_payment_proof&gt;' \\
  -d '{"agent_id":"&lt;agent_id&gt;","purpose":"signup","ttl_hours":1}'</pre>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <h3>Read and send (V2)</h3>
            <pre class="code">curl -s "$API_BASE/v2/messages?mailbox_id=&lt;mailbox_id&gt;&amp;limit=1" \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;x_payment_proof&gt;'

curl -s "$API_BASE/v2/messages/send" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;x_payment_proof&gt;' \\
  -d '{"mailbox_id":"&lt;mailbox_id&gt;","mailbox_password":"&lt;mailbox_password&gt;","to":["receiver@example.com"],"subject":"hello","text":"mail body"}'</pre>
          </div>
          <div class="step">
            <div class="step-num">4</div>
            <h3>Release the lease (V2)</h3>
            <pre class="code">curl -s "$API_BASE/v2/mailboxes/leases/&lt;lease_id&gt;/release" \\
  -H 'authorization: Bearer &lt;access_token&gt;'</pre>
          </div>
        </div>
        <div class="callout">
          <strong>Need the full flow?</strong>
          <p>See <code>docs/quickstart.md</code> in the repo for a step-by-step walkthrough.</p>
        </div>
      </article>

      <article class="panel">
        <h2>Non-Wallet Onboarding (Planned)</h2>
        <p>To reduce friction for non-web3 teams, we are preparing a temporary API-key based onboarding path.</p>
        <div class="callout ok">
          <strong>Option A: Magic Link</strong>
          <p>Issue a short-lived login link and create a tenant without requiring wallet signing.</p>
        </div>
        <div class="callout ok">
          <strong>Option B: Temporary API Key</strong>
          <p>Issue a 30-minute API key that only allows lease creation and message read/send.</p>
        </div>
        <div class="callout warn">
          <strong>Status</strong>
          <p>Planned experiment for onboarding. Use SIWE until this path is live.</p>
        </div>
      </article>
    </section>

    <section class="section-grid" style="margin-top: 16px;">
      <article class="panel">
        <h2>Read, Send, Release</h2>
        <h3>Fetch latest messages</h3>
        <pre class="code">curl -s "$API_BASE/v1/payments/proof" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -d '{"method":"GET","path":"/v1/messages/latest"}'</pre>
        <pre class="code">curl -s "$API_BASE/v1/messages/latest?mailbox_id=&lt;mailbox_id&gt;&amp;limit=10" \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;latest_messages_proof&gt;'</pre>

        <h3>Rotate credentials only if the user wants a new password</h3>
        <p>If the allocate response already returned <code>webmail_password</code>, agents can send mail with that password directly. Use reset only for explicit rotation or password recovery.</p>
        <pre class="code">curl -s "$API_BASE/v1/mailboxes/credentials/reset" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -d '{"mailbox_id":"&lt;mailbox_id&gt;"}'</pre>

        <h3>Send mail through the live HTTP API</h3>
        <pre class="code">curl -s "$API_BASE/v1/payments/proof" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -d '{"method":"POST","path":"/v1/messages/send"}'</pre>
        <pre class="code">curl -s "$API_BASE/v1/messages/send" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;send_proof&gt;' \\
  -d '{"mailbox_id":"&lt;mailbox_id&gt;","to":"receiver@example.com","subject":"agent send api","text":"hello from production agent","mailbox_password":"&lt;webmail_password&gt;"}'</pre>

        <h3>Release the mailbox when done</h3>
        <pre class="code">curl -s "$API_BASE/v1/mailboxes/release" \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -d '{"mailbox_id":"&lt;mailbox_id&gt;"}'</pre>
      </article>

      <article class="panel">
        <h2>Agent Operating Checklist</h2>
        <ol>
          <li>Start with <code>/v1/meta/runtime</code> or the live UI to confirm current chain and auth mode.</li>
          <li>Use a real browser wallet for SIWE signing. Keep chain alignment with the runtime metadata.</li>
          <li>Request a fresh payment proof immediately before each protected call; proofs are short-lived.</li>
          <li>Read from <code>/v1/messages/latest</code> for parsed OTP and verification-link workflows.</li>
          <li>Issue or reset mailbox credentials before using Webmail, SMTP, or the send API.</li>
          <li>Create webhooks through <code>POST /v1/webhooks</code> when downstream automation needs push delivery.</li>
          <li>Open <code>/admin</code> when you need operator visibility into tenants, webhooks, invoices, risk events, or audit logs.</li>
          <li>Release the mailbox after the run so the lease does not remain occupied unnecessarily.</li>
        </ol>

        <h3>Production Endpoints</h3>
        <ul>
          <li><code>https://api.mailagents.net/app</code></li>
          <li><code>https://api.mailagents.net/admin</code></li>
          <li><code>https://api.mailagents.net/v1/meta/runtime</code></li>
          <li><code>https://inbox.mailagents.net/webmail/</code></li>
        </ul>

        <h3>What this page is for</h3>
        <p>This page is the production instruction surface for agents. If an agent follows the steps on this page, it should be able to authenticate, allocate a mailbox, read OTP mail, send mail, and close the lease against the live deployment.</p>
      </article>
    </section>

    <div class="footer">Live guide for operating Agent Mail Cloud in production.</div>
  </div>
</body>
</html>`;
}
