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
    .actions a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      padding: 11px 14px;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      transition: transform 140ms ease, opacity 140ms ease;
    }
    .actions a:hover { transform: translateY(-1px); }
    .actions a.secondary { background: var(--brand-2); color: #fff; }
    .actions a.ghost { background: #ead8c6; color: #2f2823; }
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
    .guide {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 13px;
      background: rgba(255,255,255,0.66);
      line-height: 1.55;
      color: var(--muted);
      font-size: 14px;
    }
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
    .wallet-note {
      font-size: 12px;
      color: var(--muted);
      margin-top: 8px;
    }
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
        <p class="hint" style="margin: 0">Use this panel for mailbox allocation and OTP extraction. Open Webmail when you need a full inbox UI for reading and sending mail.</p>
        <div class="actions" style="margin-top: 0">
          <a class="secondary" href="https://inbox.mailagents.net/webmail/" target="_blank" rel="noreferrer">Open Webmail</a>
          <a class="ghost" href="https://inbox.mailagents.net/" target="_blank" rel="noreferrer">Mail Login</a>
        </div>
      </article>
    </section>

    <section class="grid">
      <div class="stack">
        <article class="card panel">
          <h2 class="section-title">Connect</h2>
          <p class="hint" id="connectHint">Loading runtime authentication mode...</p>
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
            <button class="ghost" id="walletBtn">Connect MetaMask</button>
            <button class="ghost" id="healthBtn">Check API</button>
            <button class="secondary" id="usageBtn">Load Usage</button>
          </div>
          <div class="wallet-note" id="walletNote">MetaMask status not checked yet.</div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Mailboxes</h2>
          <p class="hint">Mailbox state is loaded from the live tenant API. The page only keeps the currently selected mailbox id in local browser state.</p>
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
            <button class="ghost" id="refreshWebhooksBtn">Refresh Webhooks</button>
          </div>
          <div id="webhooks" class="mailbox-list" style="margin-top:14px"></div>
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
          <div class="json" id="messageJson" style="margin-top:12px">{}</div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Usage / Invoices</h2>
          <div class="form-grid">
            <label>Action
              <select id="lookupMode">
                <option value="usage">usage summary</option>
                <option value="invoices">invoice list</option>
              </select>
            </label>
            <label>Invoice ID
              <input id="invoiceId" placeholder="optional manual invoice lookup" />
            </label>
          </div>
          <div class="actions">
            <button class="primary" id="lookupBtn">Run Lookup</button>
            <button class="ghost" id="refreshInvoicesBtn">Refresh Invoices</button>
          </div>
          <div id="invoices" class="mailbox-list" style="margin-top:14px"></div>
          <div class="json" id="lookupJson">{}</div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Activity Log</h2>
          <div class="log" id="log"></div>
        </article>

        <article class="card panel">
          <h2 class="section-title">Send Test Guide</h2>
          <div class="guide" id="sendGuide">Loading runtime mailbox and auth details...</div>
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
      mailboxCredentials: {},
      messages: [],
      webhooks: [],
      invoices: [],
      walletConnected: false,
      runtimeMeta: null,
      chainHex: "",
      walletProvider: ""
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
      messageJson: document.getElementById("messageJson"),
      log: document.getElementById("log"),
      messages: document.getElementById("messages"),
      mailboxes: document.getElementById("mailboxes"),
      webhooks: document.getElementById("webhooks"),
      invoices: document.getElementById("invoices"),
      tenantStat: document.getElementById("tenantStat"),
      agentStat: document.getElementById("agentStat"),
      usageStat: document.getElementById("usageStat"),
      apiDot: document.getElementById("api-dot"),
      apiStatus: document.getElementById("api-status"),
      authDot: document.getElementById("auth-dot"),
      authStatus: document.getElementById("auth-status"),
      mailboxDot: document.getElementById("mailbox-dot"),
      mailboxStatus: document.getElementById("mailbox-status"),
      walletNote: document.getElementById("walletNote")
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
          mailboxCredentials: state.mailboxCredentials
        }));
      } catch (_) {}
    }

    function loadMailboxState() {
      try {
        var raw = localStorage.getItem(storageKey());
        if (!raw) return;
        var parsed = JSON.parse(raw);
        state.selectedMailboxId = parsed.selectedMailboxId || "";
        state.mailboxCredentials = parsed.mailboxCredentials && typeof parsed.mailboxCredentials === "object" ? parsed.mailboxCredentials : {};
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

    function runtimeMeta() {
      return state.runtimeMeta || {
        siwe_mode: "mock",
        payment_mode: "mock",
        auth: { browser_wallet_required: false },
        mailbox_domain: "",
        webmail_url: "",
        base_chain_id: 84532,
        chain_name: "Base Sepolia",
        chain_hex: "0x14a34",
        chain_rpc_urls: ["https://sepolia.base.org"],
        chain_explorer_urls: ["https://sepolia.basescan.org"],
      };
    }

    function expectedChainHex() {
      return String(runtimeMeta().chain_hex || ("0x" + Number(runtimeMeta().base_chain_id || 84532).toString(16)));
    }

    function chainLabel() {
      return String(runtimeMeta().chain_name || ("chain " + String(runtimeMeta().base_chain_id || "")));
    }

    function addChainParams() {
      var rpcUrls = Array.isArray(runtimeMeta().chain_rpc_urls) ? runtimeMeta().chain_rpc_urls.filter(Boolean) : [];
      if (!rpcUrls.length) return null;
      return {
        chainId: expectedChainHex(),
        chainName: chainLabel(),
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: rpcUrls,
        blockExplorerUrls: Array.isArray(runtimeMeta().chain_explorer_urls) ? runtimeMeta().chain_explorer_urls.filter(Boolean) : [],
      };
    }

    async function fetchJson(path, init) {
      var res = await fetch(apiBase() + path, init || {});
      var data = await res.json().catch(function() { return {}; });
      if (!res.ok) {
        throw new Error((data && (data.message || data.error)) || ("HTTP " + res.status));
      }
      return data;
    }

    async function paymentHeaders(method, path, withJson) {
      if (runtimeMeta().payment_mode !== "hmac") {
        var mockHeaders = {};
        if (withJson) mockHeaders["content-type"] = "application/json";
        mockHeaders["x-payment-proof"] = els.paymentProof.value.trim() || "mock-proof";
        return mockHeaders;
      }

      var proof = await fetchJson("/v1/payments/proof", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ method: method, path: path })
      });

      var headers = {};
      if (withJson) headers["content-type"] = "application/json";
      headers["x-payment-proof"] = proof.x_payment_proof;
      return headers;
    }

    function metamaskProvider() {
      if (typeof window === "undefined") return null;
      if (!window.ethereum || typeof window.ethereum.request !== "function") return null;
      if (window.ethereum.isMetaMask) return window.ethereum;
      if (Array.isArray(window.ethereum.providers)) {
        var provider = window.ethereum.providers.find(function(item) { return item && item.isMetaMask; });
        if (provider) return provider;
      }
      return null;
    }

    function hasBrowserWallet() {
      return !!metamaskProvider();
    }

    function setWalletNote(text) {
      if (els.walletNote) els.walletNote.textContent = text;
    }

    async function detectWalletChain(provider) {
      state.chainHex = await provider.request({ method: "eth_chainId" });
      return state.chainHex;
    }

    async function ensureMetaMaskNetwork(provider) {
      var target = expectedChainHex();
      var current = await detectWalletChain(provider);
      if (current === target) {
        setWalletNote("MetaMask connected on " + chainLabel() + " (" + current + ").");
        return current;
      }
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: target }],
        });
        state.chainHex = target;
        setWalletNote("MetaMask switched to " + chainLabel() + " (" + target + ").");
        addLog("metamask switched to " + target);
        return target;
      } catch (err) {
        if (err && err.code === 4902) {
          var params = addChainParams();
          if (!params) {
            throw new Error("MetaMask does not know " + chainLabel() + ". Add the network in MetaMask, then retry.");
          }
          try {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [params],
            });
            state.chainHex = target;
            setWalletNote("MetaMask added and switched to " + chainLabel() + " (" + target + ").");
            addLog("metamask added network " + target);
            return target;
          } catch (addErr) {
            throw new Error("MetaMask could not add " + chainLabel() + ": " + (addErr && addErr.message ? addErr.message : String(addErr)));
          }
        }
        throw new Error("MetaMask network switch failed: " + (err && err.message ? err.message : String(err)));
      }
    }

    function wireMetaMaskEvents(provider) {
      if (!provider || typeof provider.on !== "function") return;
      provider.removeListener && provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener && provider.removeListener("chainChanged", handleChainChanged);
      provider.on("accountsChanged", handleAccountsChanged);
      provider.on("chainChanged", handleChainChanged);
    }

    function handleAccountsChanged(accounts) {
      var wallet = Array.isArray(accounts) && accounts[0] ? String(accounts[0]).toLowerCase() : "";
      if (!wallet) {
        state.walletConnected = false;
        state.walletProvider = "";
        setWalletNote("MetaMask disconnected.");
        setAuthStatus(false, "wallet disconnected");
        return;
      }
      state.walletConnected = true;
      state.walletProvider = "metamask";
      els.wallet.value = wallet;
      setWalletNote("MetaMask account changed to " + wallet.slice(0, 10) + "... on " + (state.chainHex || "unknown chain") + ".");
      addLog("metamask account changed " + wallet);
    }

    function handleChainChanged(chainId) {
      state.chainHex = String(chainId || "");
      setWalletNote("MetaMask chain changed to " + state.chainHex + ". Expected " + expectedChainHex() + ".");
      addLog("metamask chain changed " + state.chainHex);
    }

    async function connectBrowserWallet() {
      var provider = metamaskProvider();
      if (!provider) throw new Error("MetaMask not available");
      setWalletNote("Connecting MetaMask...");
      await ensureMetaMaskNetwork(provider);
      var accounts = await provider.request({ method: "eth_requestAccounts" });
      var wallet = Array.isArray(accounts) && accounts[0] ? String(accounts[0]).toLowerCase() : "";
      if (!wallet) throw new Error("wallet account not returned");
      state.walletConnected = true;
      state.walletProvider = "metamask";
      els.wallet.value = wallet;
      wireMetaMaskEvents(provider);
      setWalletNote("MetaMask connected: " + wallet.slice(0, 10) + "... on " + (state.chainHex || expectedChainHex()) + ".");
      addLog("metamask connected " + wallet);
      return wallet;
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
        var creds = state.mailboxCredentials[item.mailbox_id] || null;
        return '<article class="mailbox">' +
          '<div class="mailbox-top">' +
            '<div><div><strong>' + item.address + '</strong></div><div class="muted">lease expires ' + item.lease_expires_at + '</div></div>' +
            '<div><span class="tag">' + (selected ? "selected" : "cached") + '</span></div>' +
          '</div>' +
          '<code>' + item.mailbox_id + '</code>' +
          (creds ? '<div class="muted">webmail login <code>' + creds.login + '</code></div><div class="muted">webmail password <code>' + creds.password + '</code></div>' : '') +
          '<div class="actions">' +
            '<button class="ghost" data-select-mailbox="' + item.mailbox_id + '">Select</button>' +
            '<button class="secondary" data-reset-webmail="' + item.mailbox_id + '">Issue Webmail Password</button>' +
            ((creds && creds.webmail_url) ? '<a class="ghost" href="' + creds.webmail_url + '" target="_blank" rel="noreferrer">Open Webmail</a>' : '') +
          '</div>' +
        '</article>';
      }).join("");
      var selected = state.mailboxes.find(function(item) { return item.mailbox_id === state.selectedMailboxId; });
      setMailboxStatus(Boolean(selected), selected ? selected.address : "no active mailbox selected");
    }

    function renderMessages() {
      if (!state.messages.length) {
        els.messages.innerHTML = '<div class="muted">No messages loaded.</div>';
        els.messageJson.textContent = "{}";
        return;
      }
      els.messages.innerHTML = state.messages.map(function(msg) {
        return '<article class="message">' +
          '<div><strong>' + (msg.subject || "(no subject)") + '</strong></div>' +
          '<div class="muted">from ' + (msg.sender || "-") + ' at ' + (msg.received_at || "-") + '</div>' +
          '<div><span class="tag">OTP ' + (msg.otp_code || "-") + '</span></div>' +
          '<div><a href="' + (msg.verification_link || "#") + '" target="_blank" rel="noreferrer">' + (msg.verification_link || "no verification link") + '</a></div>' +
          '<div class="actions"><button class="ghost" data-message-id="' + msg.message_id + '">Open Detail</button></div>' +
        '</article>';
      }).join("");
    }

    function renderWebhooks() {
      if (!state.webhooks.length) {
        els.webhooks.innerHTML = '<div class="muted">No webhooks configured.</div>';
        return;
      }
      els.webhooks.innerHTML = state.webhooks.map(function(item) {
        return '<article class="mailbox">' +
          '<div class="mailbox-top">' +
            '<div><div><strong>' + item.target_url + '</strong></div><div class="muted">' + item.event_types.join(", ") + '</div></div>' +
            '<div><span class="tag">' + item.status + '</span></div>' +
          '</div>' +
          '<div class="muted">last delivery ' + (item.last_delivery_at || "-") + ' / status ' + (item.last_status_code || "-") + '</div>' +
        '</article>';
      }).join("");
    }

    function renderInvoices() {
      if (!state.invoices.length) {
        els.invoices.innerHTML = '<div class="muted">No invoices returned for this tenant.</div>';
        return;
      }
      els.invoices.innerHTML = state.invoices.map(function(item) {
        return '<article class="mailbox">' +
          '<div class="mailbox-top">' +
            '<div><div><strong>' + item.period + '</strong></div><div class="muted">amount ' + item.amount_usdc + ' USDC</div></div>' +
            '<div><span class="tag">' + item.status + '</span></div>' +
          '</div>' +
          '<code>' + item.invoice_id + '</code>' +
          '<div class="actions"><button class="ghost" data-invoice-id="' + item.invoice_id + '">Open Detail</button></div>' +
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

    async function loadRuntimeMeta() {
      try {
        state.runtimeMeta = await fetchJson("/v1/meta/runtime", { method: "GET" });
        var connectHint = document.getElementById("connectHint");
        var sendGuide = document.getElementById("sendGuide");
        if (connectHint) {
          connectHint.textContent =
            runtimeMeta().siwe_mode === "strict"
              ? "Strict SIWE is enabled. MetaMask must connect, switch to " + chainLabel() + ", and sign the challenge. Mock fallback is disabled."
              : "Mock SIWE is enabled on this environment. MetaMask signing is attempted first, then the page may fall back to the mock signature path.";
        }
        if (sendGuide) {
          sendGuide.textContent =
            "Mailbox domain: " + (runtimeMeta().mailbox_domain || "-") +
            " | Auth: " + runtimeMeta().siwe_mode +
            " | Payment: " + runtimeMeta().payment_mode +
            ". Allocate a mailbox, issue a webmail password, open Webmail, then send a message to or from Gmail for an end-to-end test.";
        }
        setWalletNote("Expected wallet network: " + chainLabel() + " (" + expectedChainHex() + ").");
        addLog("loaded runtime meta: siwe=" + runtimeMeta().siwe_mode + ", payment=" + runtimeMeta().payment_mode);
      } catch (err) {
        addLog("runtime meta failed: " + err.message);
      }
    }

    async function signIn() {
      var wallet = els.wallet.value.trim().toLowerCase();
      var signature = "0xsignature";
      if (hasBrowserWallet()) {
        try {
          wallet = await connectBrowserWallet();
        } catch (err) {
          if (runtimeMeta().siwe_mode === "strict") {
            throw new Error("MetaMask connection failed in strict SIWE mode: " + err.message);
          }
          addLog("metamask connect skipped: " + err.message);
        }
      }
      if (!wallet) throw new Error("wallet address is required");
      var challenge = await fetchJson("/v1/auth/siwe/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet })
      });
      if (hasBrowserWallet()) {
        try {
          signature = await metamaskProvider().request({
            method: "personal_sign",
            params: [challenge.message, wallet]
          });
          addLog("signed SIWE challenge with MetaMask");
        } catch (err) {
          if (runtimeMeta().siwe_mode === "strict") {
            throw new Error("MetaMask signing failed in strict SIWE mode: " + err.message);
          }
          addLog("MetaMask signing failed, using fallback signature: " + err.message);
        }
      } else if (runtimeMeta().siwe_mode === "strict") {
        throw new Error("MetaMask is required in strict SIWE mode");
      }
      var verify = await fetchJson("/v1/auth/siwe/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: challenge.message, signature: signature })
      });
      state.token = verify.access_token;
      state.tenantId = verify.tenant_id;
      state.agentId = verify.agent_id;
      state.did = verify.did;
      loadMailboxState();
      await refreshMailboxes();
      await refreshWebhooks();
      await refreshInvoices();
      renderSession();
      setAuthStatus(true, "signed in as " + wallet.slice(0, 10) + "...");
      addLog("signed in; tenant " + verify.tenant_id);
      return verify;
    }

    async function refreshMailboxes() {
      if (!state.token) throw new Error("sign in first");
      var data = await fetchJson("/v1/mailboxes", {
        method: "GET",
        headers: authHeaders(false)
      });
      state.mailboxes = Array.isArray(data.items) ? data.items : [];
      if (!state.mailboxes.some(function(item) { return item.mailbox_id === state.selectedMailboxId; })) {
        state.selectedMailboxId = state.mailboxes[0] ? state.mailboxes[0].mailbox_id : "";
      }
      saveMailboxState();
      renderMailboxes();
      addLog("loaded " + state.mailboxes.length + " mailboxes");
      return data;
    }

    async function allocateMailbox() {
      if (!state.agentId) throw new Error("sign in first");
      var payHeaders = await paymentHeaders("POST", "/v1/mailboxes/allocate", true);
      var result = await fetchJson("/v1/mailboxes/allocate", {
        method: "POST",
        headers: Object.assign(authHeaders(false), payHeaders),
        body: JSON.stringify({
          agent_id: state.agentId,
          purpose: els.purpose.value.trim() || "signup",
          ttl_hours: Number(els.ttlHours.value || "1")
        })
      });
      state.selectedMailboxId = result.mailbox_id;
      if (result.webmail_login && result.webmail_password) {
        state.mailboxCredentials[result.mailbox_id] = {
          login: result.webmail_login,
          password: result.webmail_password,
          webmail_url: result.webmail_url || ""
        };
      }
      await refreshMailboxes();
      saveMailboxState();
      addLog("allocated mailbox " + result.address);
      return result;
    }

    async function releaseMailbox() {
      if (!state.selectedMailboxId) throw new Error("select a mailbox first");
      var releasedMailboxId = state.selectedMailboxId;
      await fetchJson("/v1/mailboxes/release", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ mailbox_id: releasedMailboxId })
      });
      await refreshMailboxes();
      state.messages = [];
      renderMessages();
      delete state.mailboxCredentials[releasedMailboxId];
      saveMailboxState();
      addLog("released selected mailbox");
    }

    async function issueWebmailPassword(mailboxId) {
      if (!state.token) throw new Error("sign in first");
      var result = await fetchJson("/v1/mailboxes/credentials/reset", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ mailbox_id: mailboxId || state.selectedMailboxId })
      });
      state.mailboxCredentials[result.mailbox_id] = {
        login: result.webmail_login,
        password: result.webmail_password,
        webmail_url: result.webmail_url || ""
      };
      saveMailboxState();
      renderMailboxes();
      addLog("issued webmail password for " + result.address);
      return result;
    }

    async function refreshMessages() {
      if (!state.selectedMailboxId) throw new Error("select a mailbox first");
      var payHeaders = await paymentHeaders("GET", "/v1/messages/latest", false);
      var data = await fetchJson("/v1/messages/latest?mailbox_id=" + encodeURIComponent(state.selectedMailboxId) + "&limit=10", {
        method: "GET",
        headers: Object.assign(authHeaders(false), payHeaders)
      });
      state.messages = Array.isArray(data.messages) ? data.messages : [];
      renderMessages();
      if (state.messages[0]) {
        await openMessageDetail(state.messages[0].message_id);
      }
      addLog("loaded " + state.messages.length + " messages");
      return data;
    }

    async function openMessageDetail(messageId) {
      if (!state.token) throw new Error("sign in first");
      var detail = await fetchJson("/v1/messages/" + encodeURIComponent(messageId), {
        method: "GET",
        headers: authHeaders(false)
      });
      els.messageJson.textContent = JSON.stringify(detail, null, 2);
      addLog("loaded message detail " + messageId);
      return detail;
    }

    async function createWebhook() {
      if (!state.token) throw new Error("sign in first");
      var payHeaders = await paymentHeaders("POST", "/v1/webhooks", true);
      var payload = {
        event_types: [els.webhookEvent.value],
        target_url: els.webhookUrl.value.trim(),
        secret: els.webhookSecret.value.trim()
      };
      var created = await fetchJson("/v1/webhooks", {
        method: "POST",
        headers: Object.assign(authHeaders(false), payHeaders),
        body: JSON.stringify(payload)
      });
      await refreshWebhooks();
      els.lookupJson.textContent = JSON.stringify(created, null, 2);
      addLog("created webhook " + created.webhook_id);
    }

    async function refreshWebhooks() {
      if (!state.token) throw new Error("sign in first");
      var data = await fetchJson("/v1/webhooks", {
        method: "GET",
        headers: authHeaders(false)
      });
      state.webhooks = Array.isArray(data.items) ? data.items : [];
      renderWebhooks();
      addLog("loaded " + state.webhooks.length + " webhooks");
      return data;
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

    async function refreshInvoices() {
      if (!state.token) throw new Error("sign in first");
      var period = els.usagePeriod.value.trim() || nowPeriod();
      var data = await fetchJson("/v1/billing/invoices?period=" + encodeURIComponent(period), {
        method: "GET",
        headers: authHeaders(false)
      });
      state.invoices = Array.isArray(data.items) ? data.items : [];
      renderInvoices();
      addLog("loaded " + state.invoices.length + " invoices");
      return data;
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
        if (button) {
          state.selectedMailboxId = button.getAttribute("data-select-mailbox") || "";
          saveMailboxState();
          renderMailboxes();
          return;
        }
        button = event.target.closest("[data-reset-webmail]");
        if (!button) return;
        issueWebmailPassword(button.getAttribute("data-reset-webmail") || "").catch(function(err) {
          addLog("issue webmail password failed: " + err.message);
        });
      });
    }

    function wireMessageSelect() {
      els.messages.addEventListener("click", function(event) {
        var button = event.target.closest("[data-message-id]");
        if (!button) return;
        openMessageDetail(button.getAttribute("data-message-id")).catch(function(err) {
          addLog("message detail failed: " + err.message);
        });
      });
    }

    function wireInvoiceSelect() {
      els.invoices.addEventListener("click", function(event) {
        var button = event.target.closest("[data-invoice-id]");
        if (!button) return;
        els.invoiceId.value = button.getAttribute("data-invoice-id") || "";
        lookupInvoice().catch(function(err) {
          addLog("invoice detail failed: " + err.message);
        });
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

    async function bootstrapMetaMask() {
      var provider = metamaskProvider();
      if (!provider) {
        setWalletNote("MetaMask not detected in this browser.");
        return;
      }
      state.walletProvider = "metamask";
      wireMetaMaskEvents(provider);
      try {
        state.chainHex = await detectWalletChain(provider);
        var accounts = await provider.request({ method: "eth_accounts" });
        if (Array.isArray(accounts) && accounts[0]) {
          state.walletConnected = true;
          els.wallet.value = String(accounts[0]).toLowerCase();
          setWalletNote("MetaMask detected. Account " + els.wallet.value.slice(0, 10) + "... on " + state.chainHex + ".");
        } else {
          setWalletNote("MetaMask detected. Connect it and switch to " + chainLabel() + " (" + expectedChainHex() + ").");
        }
      } catch (err) {
        setWalletNote("MetaMask detected but unavailable: " + err.message);
      }
    }

    els.apiBase.value = window.location.origin;
    els.usagePeriod.value = nowPeriod();
    renderSession();
    renderMailboxes();
    renderMessages();
    renderWebhooks();
    renderInvoices();
    wireMailboxSelect();
    wireMessageSelect();
    wireInvoiceSelect();
    bindAction("healthBtn", checkHealth);
    bindAction("loginBtn", signIn);
    bindAction("walletBtn", connectBrowserWallet);
    bindAction("allocateBtn", allocateMailbox);
    bindAction("releaseBtn", releaseMailbox);
    bindAction("refreshMessagesBtn", async function() {
      await refreshMailboxes();
      await refreshMessages();
    });
    bindAction("webhookBtn", createWebhook);
    bindAction("refreshWebhooksBtn", refreshWebhooks);
    bindAction("usageBtn", loadUsage);
    bindAction("refreshInvoicesBtn", refreshInvoices);
    bindAction("lookupBtn", function() {
      return els.lookupMode.value === "invoices" ? refreshInvoices() : loadUsage();
    });
    loadRuntimeMeta();
    bootstrapMetaMask();
    checkHealth();
  </script>
</body>
</html>`;
}
