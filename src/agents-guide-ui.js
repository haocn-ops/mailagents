export function renderAgentsGuideHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Mail Cloud Agents Guide</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
    :root {
      --bg: #f5f0e8;
      --ink: #201a17;
      --muted: #625952;
      --line: #d9cab9;
      --panel: rgba(255, 251, 246, 0.92);
      --brand: #9b4d2b;
      --brand-deep: #214943;
      --accent: #efe0cf;
      --shadow: 0 22px 60px rgba(58, 34, 17, 0.12);
      --radius: 22px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Space Grotesk', sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 0%, rgba(155, 77, 43, 0.18), transparent 25%),
        radial-gradient(circle at 92% 12%, rgba(33, 73, 67, 0.18), transparent 22%),
        linear-gradient(180deg, #f8f1e7, #efe1d3 55%, #eadbcf);
    }
    .shell {
      max-width: 1120px;
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
      right: -40px;
      top: -30px;
      width: 180px;
      height: 180px;
      background: linear-gradient(135deg, rgba(155, 77, 43, 0.18), rgba(33, 73, 67, 0.2));
      border-radius: 36px;
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
      max-width: 62ch;
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
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
      grid-template-columns: 1.05fr 0.95fr;
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
    .callout {
      border-left: 4px solid var(--brand);
      background: #fbf3eb;
      border-radius: 14px;
      padding: 12px 14px;
      margin-top: 12px;
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
    .footer {
      margin-top: 18px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 920px) {
      .meta-grid, .section-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="eyebrow">Agents Guide</div>
      <h1>Run the full mailbox flow from one guide.</h1>
      <p class="lead">This page packages the agent integration path into one browser view: sign in with SIWE, request payment proofs, allocate inboxes, read parsed mail, reset mailbox credentials, send outbound mail, and release the mailbox when the workflow is done.</p>
      <div class="hero-actions">
        <a class="primary" href="/app">Open User App</a>
        <a class="secondary" href="/admin">Open Admin Dashboard</a>
      </div>
    </section>

    <section class="meta-grid">
      <article class="panel"><div class="k">Auth</div><div class="v">SIWE + JWT</div><p>Challenge first, then verify the wallet signature to obtain a tenant-scoped bearer token.</p></article>
      <article class="panel"><div class="k">Billing</div><div class="v">x-payment-proof</div><p>Protected endpoints require a payment proof. Use <code>mock-proof</code> locally or call <code>/v1/payments/proof</code> in <code>hmac</code> mode.</p></article>
      <article class="panel"><div class="k">Lifecycle</div><div class="v">Allocate -> Read -> Send -> Release</div><p>Mailbox leases stay explicit. Agents should store <code>mailbox_id</code>, credentials, and release resources when the run completes.</p></article>
    </section>

    <section class="section-grid">
      <article class="panel">
        <h2>Quick Start</h2>
        <div class="steps">
          <div class="step">
            <div class="step-num">1</div>
            <h3>Get a SIWE challenge</h3>
            <pre class="code">curl -s http://localhost:3000/v1/auth/siwe/challenge \\
  -H 'content-type: application/json' \\
  -d '{"wallet_address":"0xabc0000000000000000000000000000000000123"}'</pre>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <h3>Verify and store the tenant token</h3>
            <pre class="code">curl -s http://localhost:3000/v1/auth/siwe/verify \\
  -H 'content-type: application/json' \\
  -d '{"message":"&lt;challenge_message&gt;","signature":"&lt;wallet_signature&gt;"}'</pre>
            <p>Store <code>access_token</code> and <code>agent_id</code> from the response.</p>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <h3>Allocate a mailbox</h3>
            <pre class="code">curl -s http://localhost:3000/v1/mailboxes/allocate \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;proof_for_allocate&gt;' \\
  -d '{"agent_id":"&lt;agent_id&gt;","purpose":"agent-workflow","ttl_hours":1}'</pre>
          </div>
          <div class="step">
            <div class="step-num">4</div>
            <h3>Read latest parsed mail</h3>
            <pre class="code">curl -s "http://localhost:3000/v1/messages/latest?mailbox_id=&lt;mailbox_id&gt;&amp;limit=10" \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;proof_for_latest_messages&gt;'</pre>
          </div>
        </div>
      </article>

      <article class="panel">
        <h2>Operational Notes</h2>
        <h3>Reset credentials before outbound sends</h3>
        <pre class="code">curl -s http://localhost:3000/v1/mailboxes/credentials/reset \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -d '{"mailbox_id":"&lt;mailbox_id&gt;"}'</pre>

        <h3>Send mail over the HTTP API</h3>
        <pre class="code">curl -s http://localhost:3000/v1/messages/send \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -H 'x-payment-proof: &lt;proof_for_send&gt;' \\
  -d '{"mailbox_id":"&lt;mailbox_id&gt;","to":"receiver@example.com","subject":"agent send api","text":"hello from agent api","mailbox_password":"&lt;webmail_password&gt;"}'</pre>

        <h3>Release the mailbox</h3>
        <pre class="code">curl -s http://localhost:3000/v1/mailboxes/release \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer &lt;access_token&gt;' \\
  -d '{"mailbox_id":"&lt;mailbox_id&gt;"}'</pre>

        <div class="callout">
          <strong>Recommended fields to persist:</strong>
          <ul>
            <li><code>access_token</code></li>
            <li><code>agent_id</code></li>
            <li><code>mailbox_id</code></li>
            <li><code>address</code></li>
            <li><code>webmail_password</code></li>
          </ul>
        </div>

        <div class="callout">
          <strong>Protected endpoints:</strong>
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
        <h2>Agent Checklist</h2>
        <ol>
          <li>Call <code>/v1/auth/siwe/challenge</code> and <code>/v1/auth/siwe/verify</code> before any tenant action.</li>
          <li>Generate a valid payment proof whenever you touch a protected endpoint.</li>
          <li>Store mailbox credentials separately from the JWT so you can rotate them without reauth.</li>
          <li>Use <code>/app</code> when you want a built-in browser client for the same workflow.</li>
          <li>Use <code>/admin</code> to inspect tenants, mailboxes, webhooks, invoices, risk events, and audit logs.</li>
        </ol>
      </article>
      <article class="panel">
        <h2>Related Paths</h2>
        <ul>
          <li><code>/app</code> for the user workspace UI</li>
          <li><code>/admin</code> for the operations dashboard</li>
          <li><code>/v1/meta/runtime</code> for chain, auth, and mailbox runtime metadata</li>
          <li><code>docs/agent-api-example.md</code> for the matching repository doc</li>
          <li><code>docs/user-guide.md</code> for the broader deployment and integration guide</li>
        </ul>
      </article>
    </section>

    <div class="footer">Agent Mail Cloud guide page for operators and integration agents.</div>
  </div>
</body>
</html>`;
}
