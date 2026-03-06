export function renderUserAppHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Mail Cloud App</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
    :root {
      --bg: #f7f0e8;
      --bg-2: #efe1d0;
      --ink: #1f1a17;
      --muted: #6e635b;
      --line: #dccab7;
      --panel: rgba(255, 251, 246, 0.88);
      --brand: #b8572d;
      --brand-2: #174f48;
      --ok: #1f6b46;
      --warn: #9c3d1b;
      --shadow: 0 18px 50px rgba(63, 35, 18, 0.12);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Manrope', sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 15% 10%, rgba(230, 124, 67, 0.22), transparent 25%),
        radial-gradient(circle at 85% 20%, rgba(23, 79, 72, 0.18), transparent 22%),
        linear-gradient(180deg, var(--bg), var(--bg-2));
      min-height: 100vh;
    }
    .shell {
      max-width: 1240px;
      margin: 0 auto;
      padding: 28px 18px 40px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 16px;
      margin-bottom: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid rgba(174, 132, 98, 0.25);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }
    .hero-main {
      padding: 24px;
      position: relative;
      overflow: hidden;
    }
    .hero-main:before {
      content: "";
      position: absolute;
      inset: auto -40px -40px auto;
      width: 180px;
      height: 180px;
      background: linear-gradient(135deg, rgba(184, 87, 45, 0.22), rgba(23, 79, 72, 0.18));
      border-radius: 30px;
      transform: rotate(18deg);
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--brand-2);
      font-weight: 800;
    }
    h1 {
      margin: 10px 0 10px;
      font-size: clamp(34px, 5vw, 52px);
      line-height: 0.96;
      max-width: 10ch;
    }
    .lead {
      max-width: 56ch;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
      margin: 0;
    }
    .hero-side {
      padding: 20px;
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.7);
      border: 1px solid var(--line);
      font-size: 13px;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #96877b;
    }
    .dot.ok { background: var(--ok); }
    .dot.bad { background: var(--warn); }
    .stack {
      display: grid;
      gap: 16px;
    }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: 1.05fr 0.95fr;
    }
    .panel {
      padding: 18px;
    }
    .section-title {
      margin: 0 0 12px;
      font-size: 20px;
      font-weight: 800;
    }
    .hint {
      margin: 0 0 12px;
      font-size: 13px;
      color: var(--muted);
      line-height: 1.5;
    }
    .form-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .form-grid.single { grid-template-columns: 1fr; }
    label {
      display: grid;
      gap: 6px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      font-weight: 700;
    }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 13px;
      background: rgba(255,255,255,0.9);
      color: var(--ink);
      font: inherit;
    }
    textarea {
      min-height: 120px;
      resize: vertical;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    button {
      border: 0;
      border-radius: 12px;
      padding: 11px 14px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: transform 140ms ease, opacity 140ms ease;
    }
    button:hover { transform: translateY(-1px); }
    button.primary { background: var(--brand); color: #fff; }
    button.secondary { background: var(--brand-2); color: #fff; }
    button.ghost { background: #ead8c6; color: #2f2823; }
    .token-box, .log, .json {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      border-radius: 14px;
      padding: 14px;
      background: #161311;
      color: #f7dfcd;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .token-box { min-height: 96px; }
    .log { min-height: 180px; }
    .json { min-height: 240px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 13px;
      background: rgba(255,255,255,0.7);
    }
    .stat .k {
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .stat .v {
      margin-top: 8px;
      font-size: 28px;
      font-weight: 800;
    }
    .mailbox-list {
      display: grid;
      gap: 10px;
    }
    .mailbox {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: rgba(255,255,255,0.76);
      display: grid;
      gap: 8px;
    }
    .mailbox-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .tag {
      border-radius: 999px;
      padding: 4px 8px;
      background: #f3dfcf;
      color: #72381e;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      display: inline-block;
    }
    .mailbox code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
    }
    .message {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: rgba(255,255,255,0.76);
      display: grid;
      gap: 8px;
    }
    .muted { color: var(--muted); }
    @media (max-width: 980px) {
      .hero, .grid { grid-template-columns: 1fr; }
      .form-grid { grid-template-columns: 1fr; }
      .stats { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <article class="card hero-main">
        <div class="eyebrow">User Workspace</div>
        <h1>Claim inboxes. Pull OTPs. Release cleanly.</h1>
        <p class="lead">This is the end-user control surface for Agent Mail Cloud. It drives the live public API only. Login issues a tenant JWT, mailbox actions hit the real lease endpoints, and message reads come from parsed inbound mail.</p>
      </article>
      <article class="card hero-side">
        <div class="status-pill"><span id="api-dot" class="dot"></span><span id="api-status">checking api...</span></div>
        <div class="status-pill"><span id="auth-dot" class="dot"></span><span id="auth-status">not signed in</span></div>
        <div class="status-pill"><span id="mailbox-dot" class="dot"></span><span id="mailbox-status">no active mailbox selected</span></div>
      </article>
    </section>

    <section class="grid">
      <div class="stack">
        <article class="card panel">
          <h2 class="section-title">Connect</h2>
          <p class="hint">Mock SIWE is enough for the current live environment. When strict SIWE is enabled, this screen still works if you paste a real signed SIWE payload manually or the page is upgraded to wallet SDK integration.</p>
          <div class="form-grid">
            <label>API Base
              <input id="apiBase" />
            </label>
            <label>Wallet Address
              <input id="wallet" value="0xabc0000000000000000000000000000000000456" />
            </label>
            <label>Payment Proof
              <input id="paymentProof" value="mock-proof" />
            </label>
            <label>Usage Period
              <input id="usagePeriod" placeholder="2026-03" />
            </label>
          </div>
          <div class="actions">
            <button class="primary" id="loginBtn">Sign In</button>
            <button class="ghost" id="healthBtn">Check API</button>
            <button class="secondary" id="usageBtn">Load Usage</button>
          </div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Mailboxes</h2>
          <p class="hint">Mailbox history is stored in local browser state because the public API does not currently expose a mailbox listing endpoint.</p>
          <div class="form-grid">
            <label>Purpose
              <input id="purpose" value="signup" />
            </label>
            <label>TTL Hours
              <input id="ttlHours" type="number" min="1" max="720" value="1" />
            </label>
          </div>
          <div class="actions">
            <button class="primary" id="allocateBtn">Allocate Mailbox</button>
            <button class="ghost" id="refreshMessagesBtn">Refresh Messages</button>
            <button class="secondary" id="releaseBtn">Release Selected</button>
          </div>
          <div id="mailboxes" class="mailbox-list" style="margin-top:14px"></div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Webhook</h2>
          <p class="hint">Creates a live webhook subscription using the tenant-scoped public API.</p>
          <div class="form-grid single">
            <label>Target URL
              <input id="webhookUrl" placeholder="https://example.com/agent-mail-webhook" />
            </label>
            <label>Secret
              <input id="webhookSecret" placeholder="at least 16 chars" />
            </label>
            <label>Event Type
              <select id="webhookEvent">
                <option value="otp.extracted">otp.extracted</option>
                <option value="mail.received">mail.received</option>
              </select>
            </label>
          </div>
          <div class="actions">
            <button class="primary" id="webhookBtn">Create Webhook</button>
          </div>
        </article>
      </div>

      <div class="stack">
        <article class="card panel">
          <h2 class="section-title">Session</h2>
          <div class="stats">
            <div class="stat"><div class="k">Tenant</div><div class="v" id="tenantStat">-</div></div>
            <div class="stat"><div class="k">Agent</div><div class="v" id="agentStat">-</div></div>
            <div class="stat"><div class="k">Billable</div><div class="v" id="usageStat">-</div></div>
          </div>
          <div class="token-box" id="tokenBox">no token yet</div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Latest Messages</h2>
          <div id="messages"></div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Usage / Invoice Lookup</h2>
          <div class="form-grid">
            <label>Invoice ID
              <input id="invoiceId" placeholder="paste invoice uuid if you have one" />
            </label>
            <label>Action
              <select id="lookupMode">
                <option value="usage">usage summary</option>
                <option value="invoice">invoice detail</option>
              </select>
            </label>
          </div>
          <div class="actions">
            <button class="primary" id="lookupBtn">Run Lookup</button>
          </div>
          <div class="json" id="lookupJson">{}</div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Activity Log</h2>
          <div class="log" id="log"></div>
        </article>
      </div>
    </section>
  </div>
  <script>
    var state = {
      token: "",
      tenantId: "",
      agentId: "",
      did: "",
      selectedMailboxId: "",
      mailboxes: [],
      messages: []
    };

    var els = {
      apiBase: document.getElementById("apiBase"),
      wallet: document.getElementById("wallet"),
      paymentProof: document.getElementById("paymentProof"),
      usagePeriod: document.getElementById("usagePeriod"),
      purpose: document.getElementById("purpose"),
      ttlHours: document.getElementById("ttlHours"),
      webhookUrl: document.getElementById("webhookUrl"),
      webhookSecret: document.getElementById("webhookSecret"),
      webhookEvent: document.getElementById("webhookEvent"),
      invoiceId: document.getElementById("invoiceId"),
      lookupMode: document.getElementById("lookupMode"),
      tokenBox: document.getElementById("tokenBox"),
      lookupJson: document.getElementById("lookupJson"),
      log: document.getElementById("log"),
      messages: document.getElementById("messages"),
      mailboxes: document.getElementById("mailboxes"),
      tenantStat: document.getElementById("tenantStat"),
      agentStat: document.getElementById("agentStat"),
      usageStat: document.getElementById("usageStat"),
      apiDot: document.getElementById("api-dot"),
      apiStatus: document.getElementById("api-status"),
      authDot: document.getElementById("auth-dot"),
      authStatus: document.getElementById("auth-status"),
      mailboxDot: document.getElementById("mailbox-dot"),
      mailboxStatus: document.getElementById("mailbox-status")
    };

    function nowPeriod() {
      var now = new Date();
      return now.getUTCFullYear() + "-" + String(now.getUTCMonth() + 1).padStart(2, "0");
    }

    function apiBase() {
      return els.apiBase.value.trim().replace(/\\/$/, "");
    }

    function storageKey() {
      return "agent-mail-cloud-user-app:" + apiBase() + ":" + (state.tenantId || "guest");
    }

    function saveMailboxState() {
      try {
        localStorage.setItem(storageKey(), JSON.stringify({
          selectedMailboxId: state.selectedMailboxId,
          mailboxes: state.mailboxes
        }));
      } catch (_) {}
    }

    function loadMailboxState() {
      try {
        var raw = localStorage.getItem(storageKey());
        if (!raw) return;
        var parsed = JSON.parse(raw);
        state.selectedMailboxId = parsed.selectedMailboxId || "";
        state.mailboxes = Array.isArray(parsed.mailboxes) ? parsed.mailboxes : [];
      } catch (_) {}
    }

    function addLog(line) {
      els.log.textContent = "[" + new Date().toISOString() + "] " + line + "\\n" + els.log.textContent;
    }

    function setApiStatus(ok, text) {
      els.apiDot.className = ok ? "dot ok" : "dot bad";
      els.apiStatus.textContent = text;
    }

    function setAuthStatus(ok, text) {
      els.authDot.className = ok ? "dot ok" : "dot bad";
      els.authStatus.textContent = text;
    }

    function setMailboxStatus(ok, text) {
      els.mailboxDot.className = ok ? "dot ok" : "dot";
      els.mailboxStatus.textContent = text;
    }

    function authHeaders(withJson) {
      var headers = {};
      if (withJson) headers["content-type"] = "application/json";
      if (state.token) headers.authorization = "Bearer " + state.token;
      return headers;
    }

    async function fetchJson(path, init) {
      var res = await fetch(apiBase() + path, init || {});
      var data = await res.json().catch(function() { return {}; });
      if (!res.ok) {
        throw new Error((data && (data.message || data.error)) || ("HTTP " + res.status));
      }
      return data;
    }

    function renderSession() {
      els.tokenBox.textContent = state.token || "no token yet";
      els.tenantStat.textContent = state.tenantId ? state.tenantId.slice(0, 8) : "-";
      els.agentStat.textContent = state.agentId ? state.agentId.slice(0, 8) : "-";
    }

    function renderMailboxes() {
      if (!state.mailboxes.length) {
        els.mailboxes.innerHTML = '<div class="muted">No locally tracked mailboxes yet.</div>';
        setMailboxStatus(false, "no active mailbox selected");
        return;
      }
      els.mailboxes.innerHTML = state.mailboxes.map(function(item) {
        var selected = item.mailbox_id === state.selectedMailboxId;
        return '<article class="mailbox">' +
          '<div class="mailbox-top">' +
            '<div><div><strong>' + item.address + '</strong></div><div class="muted">lease expires ' + item.lease_expires_at + '</div></div>' +
            '<div><span class="tag">' + (selected ? "selected" : "cached") + '</span></div>' +
          '</div>' +
          '<code>' + item.mailbox_id + '</code>' +
          '<div class="actions">' +
            '<button class="ghost" data-select-mailbox="' + item.mailbox_id + '">Select</button>' +
          '</div>' +
        '</article>';
      }).join("");
      var selected = state.mailboxes.find(function(item) { return item.mailbox_id === state.selectedMailboxId; });
      setMailboxStatus(Boolean(selected), selected ? selected.address : "no active mailbox selected");
    }

    function renderMessages() {
      if (!state.messages.length) {
        els.messages.innerHTML = '<div class="muted">No messages loaded.</div>';
        return;
      }
      els.messages.innerHTML = state.messages.map(function(msg) {
        return '<article class="message">' +
          '<div><strong>' + (msg.subject || "(no subject)") + '</strong></div>' +
          '<div class="muted">from ' + (msg.sender || "-") + ' at ' + (msg.received_at || "-") + '</div>' +
          '<div><span class="tag">OTP ' + (msg.otp_code || "-") + '</span></div>' +
          '<div><a href="' + (msg.verification_link || "#") + '" target="_blank" rel="noreferrer">' + (msg.verification_link || "no verification link") + '</a></div>' +
        '</article>';
      }).join("");
    }

    async function checkHealth() {
      try {
        var data = await fetchJson("/healthz");
        setApiStatus(true, "api " + data.status);
        addLog("healthz ok");
      } catch (err) {
        setApiStatus(false, "api unreachable");
        addLog("healthz failed: " + err.message);
      }
    }

    async function signIn() {
      var wallet = els.wallet.value.trim().toLowerCase();
      if (!wallet) throw new Error("wallet address is required");
      var challenge = await fetchJson("/v1/auth/siwe/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet })
      });
      var verify = await fetchJson("/v1/auth/siwe/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: challenge.message, signature: "0xsignature" })
      });
      state.token = verify.access_token;
      state.tenantId = verify.tenant_id;
      state.agentId = verify.agent_id;
      state.did = verify.did;
      loadMailboxState();
      renderSession();
      renderMailboxes();
      setAuthStatus(true, "signed in as " + wallet.slice(0, 10) + "...");
      addLog("signed in; tenant " + verify.tenant_id);
      return verify;
    }

    async function allocateMailbox() {
      if (!state.agentId) throw new Error("sign in first");
      var result = await fetchJson("/v1/mailboxes/allocate", {
        method: "POST",
        headers: Object.assign(authHeaders(true), { "x-payment-proof": els.paymentProof.value.trim() }),
        body: JSON.stringify({
          agent_id: state.agentId,
          purpose: els.purpose.value.trim() || "signup",
          ttl_hours: Number(els.ttlHours.value || "1")
        })
      });
      state.mailboxes.unshift(result);
      state.selectedMailboxId = result.mailbox_id;
      saveMailboxState();
      renderMailboxes();
      addLog("allocated mailbox " + result.address);
      return result;
    }

    async function releaseMailbox() {
      if (!state.selectedMailboxId) throw new Error("select a mailbox first");
      await fetchJson("/v1/mailboxes/release", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ mailbox_id: state.selectedMailboxId })
      });
      state.mailboxes = state.mailboxes.filter(function(item) { return item.mailbox_id !== state.selectedMailboxId; });
      state.selectedMailboxId = state.mailboxes[0] ? state.mailboxes[0].mailbox_id : "";
      saveMailboxState();
      renderMailboxes();
      state.messages = [];
      renderMessages();
      addLog("released selected mailbox");
    }

    async function refreshMessages() {
      if (!state.selectedMailboxId) throw new Error("select a mailbox first");
      var data = await fetchJson("/v1/messages/latest?mailbox_id=" + encodeURIComponent(state.selectedMailboxId) + "&limit=10", {
        method: "GET",
        headers: Object.assign(authHeaders(false), { "x-payment-proof": els.paymentProof.value.trim() })
      });
      state.messages = Array.isArray(data.messages) ? data.messages : [];
      renderMessages();
      addLog("loaded " + state.messages.length + " messages");
      return data;
    }

    async function createWebhook() {
      if (!state.token) throw new Error("sign in first");
      var payload = {
        event_types: [els.webhookEvent.value],
        target_url: els.webhookUrl.value.trim(),
        secret: els.webhookSecret.value.trim()
      };
      var created = await fetchJson("/v1/webhooks", {
        method: "POST",
        headers: Object.assign(authHeaders(true), { "x-payment-proof": els.paymentProof.value.trim() }),
        body: JSON.stringify(payload)
      });
      els.lookupJson.textContent = JSON.stringify(created, null, 2);
      addLog("created webhook " + created.webhook_id);
    }

    async function loadUsage() {
      if (!state.token) throw new Error("sign in first");
      var period = els.usagePeriod.value.trim() || nowPeriod();
      els.usagePeriod.value = period;
      var usage = await fetchJson("/v1/usage/summary?period=" + encodeURIComponent(period), {
        method: "GET",
        headers: authHeaders(false)
      });
      els.usageStat.textContent = String(usage.billable_units);
      els.lookupJson.textContent = JSON.stringify(usage, null, 2);
      addLog("loaded usage for " + period);
      return usage;
    }

    async function lookupInvoice() {
      if (!state.token) throw new Error("sign in first");
      var invoiceId = els.invoiceId.value.trim();
      if (!invoiceId) throw new Error("invoice id is required");
      var invoice = await fetchJson("/v1/billing/invoices/" + encodeURIComponent(invoiceId), {
        method: "GET",
        headers: authHeaders(false)
      });
      els.lookupJson.textContent = JSON.stringify(invoice, null, 2);
      addLog("loaded invoice " + invoiceId);
      return invoice;
    }

    function wireMailboxSelect() {
      els.mailboxes.addEventListener("click", function(event) {
        var button = event.target.closest("[data-select-mailbox]");
        if (!button) return;
        state.selectedMailboxId = button.getAttribute("data-select-mailbox") || "";
        saveMailboxState();
        renderMailboxes();
      });
    }

    function bindAction(id, fn) {
      document.getElementById(id).addEventListener("click", async function() {
        try {
          await fn();
        } catch (err) {
          addLog(id + " failed: " + err.message);
        }
      });
    }

    els.apiBase.value = window.location.origin;
    els.usagePeriod.value = nowPeriod();
    renderSession();
    renderMailboxes();
    renderMessages();
    wireMailboxSelect();
    bindAction("healthBtn", checkHealth);
    bindAction("loginBtn", signIn);
    bindAction("allocateBtn", allocateMailbox);
    bindAction("releaseBtn", releaseMailbox);
    bindAction("refreshMessagesBtn", refreshMessages);
    bindAction("webhookBtn", createWebhook);
    bindAction("usageBtn", loadUsage);
    bindAction("lookupBtn", function() {
      return els.lookupMode.value === "invoice" ? lookupInvoice() : loadUsage();
    });
    checkHealth();
  </script>
</body>
</html>`;
}
