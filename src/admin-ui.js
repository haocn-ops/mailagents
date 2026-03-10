export function renderAdminDashboardHtml({ adminTokenRequired = false } = {}) {
  const defaultApiBase = "https://mailagents-api.izhenghaocn.workers.dev";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Mail Cloud Admin</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
    :root {
      --bg: #f3f5f4; --panel: #fff; --ink: #1d2624; --muted: #5e6a66; --line: #d7dfdc;
      --brand: #056e64; --brand-soft: #d6efec; --warn: #b54a2e; --warn-soft: #ffe7df;
      --ok: #1f6d3d; --ok-soft: #d8f6e3; --hero-a: #e6f2ef; --hero-b: #fef3e8;
      --shadow: 0 14px 35px rgba(5, 36, 34, 0.08); --radius: 16px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Space Grotesk', sans-serif; background: radial-gradient(circle at 5% 0%, #cfe9e4 0, transparent 35%), radial-gradient(circle at 95% 10%, #ffe8d6 0, transparent 30%), var(--bg); color: var(--ink); min-height: 100vh; }
    .layout { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
    .sidebar { border-right: 1px solid var(--line); background: linear-gradient(180deg, #f7fbf9 0%, #eef4f2 100%); padding: 22px; position: sticky; top: 0; height: 100vh; overflow: auto; }
    .logo { font-size: 20px; font-weight: 700; margin-bottom: 18px; }
    .sub { font-size: 12px; color: var(--muted); margin-bottom: 16px; }
    .nav { display: grid; gap: 8px; }
    .nav button { text-align: left; border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; font-size: 14px; cursor: pointer; transition: all 180ms ease; }
    .nav button.active { background: var(--brand); border-color: var(--brand); color: #fff; transform: translateX(2px); }
    .main { padding: 20px; }
    .topbar { background: linear-gradient(120deg, var(--hero-a), var(--hero-b)); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; margin-bottom: 16px; }
    .title { font-size: 24px; font-weight: 700; margin: 0; }
    .caption { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    .status { display: flex; gap: 8px; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: rgba(255,255,255,0.8); border: 1px dashed #aac9c1; border-radius: 999px; padding: 8px 12px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #999; }
    .dot.ok { background: var(--ok); }
    .dot.bad { background: var(--warn); }
    .toolbar { margin-bottom: 16px; display: grid; grid-template-columns: 1.1fr 1.4fr auto auto auto; gap: 10px; align-items: center; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font: inherit; color: var(--ink); background: #fff; }
    button.cta { border: 0; border-radius: 10px; background: var(--brand); color: #fff; padding: 10px 14px; font: inherit; cursor: pointer; }
    button.cta.alt { background: #2e4b45; }
    button.cta.ghost { background: #dce9e6; color: #17312d; }
    .grid { display: grid; gap: 14px; }
    .metrics { grid-template-columns: repeat(6, minmax(120px, 1fr)); }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); padding: 14px; animation: enter 280ms ease; }
    .metric .k { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric .v { margin-top: 8px; font-size: 26px; font-weight: 700; }
    .metric .d { margin-top: 4px; font-size: 12px; color: var(--muted); }
    .panel { display: none; gap: 14px; }
    .panel.active { display: grid; }
    .two { grid-template-columns: 1.2fr 1fr; }
    .chart { height: 180px; display: grid; gap: 8px; align-content: end; grid-template-columns: repeat(12, 1fr); }
    .bar { border-radius: 8px 8px 4px 4px; background: linear-gradient(180deg, #2fa695, #0f7165); min-height: 8px; transition: transform 180ms ease; }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
    table { width: 100%; border-collapse: collapse; min-width: 900px; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #edf2f0; text-align: left; white-space: nowrap; }
    th { position: sticky; top: 0; background: #f8fbfa; font-weight: 600; color: #2d3e3a; }
    .tag { border-radius: 999px; padding: 4px 9px; font-size: 11px; font-family: 'IBM Plex Mono', monospace; display: inline-block; background: #eef3f1; }
    .tag.ok { background: var(--ok-soft); color: #194e2e; }
    .tag.warn { background: var(--warn-soft); color: #8a2f18; }
    .tag.brand { background: var(--brand-soft); color: #075b53; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .mini { border: 1px solid var(--line); background: #fff; color: #2f423d; border-radius: 8px; padding: 5px 8px; cursor: pointer; font-size: 12px; }
    .hint { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .log { font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: #101917; color: #c8f8ec; border-radius: 12px; padding: 12px; min-height: 140px; white-space: pre-wrap; overflow: auto; }
    .settings-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .empty { color: var(--muted); font-size: 13px; padding: 14px; }
    @keyframes enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 1100px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
      .metrics { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .two, .toolbar, .settings-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">Agent Mail Cloud</div>
      <div class="sub">Admin Dashboard · Live API</div>
      <div class="nav" id="nav"></div>
    </aside>
    <main class="main">
      <section class="topbar">
        <div>
          <h1 class="title">Operations Control Plane</h1>
          <p class="caption">Backed by the real Admin API defined in docs/openapi-admin.yaml.</p>
        </div>
        <div class="status"><span id="api-dot" class="dot"></span><span id="api-status">checking API...</span></div>
      </section>
      <section class="toolbar">
        <input id="apiBase" value="${defaultApiBase}" />
        <input id="token" placeholder="${adminTokenRequired ? "Admin API token" : "Bearer token (auto-login works in mock SIWE mode)"}" />
        <button class="cta ghost" id="login">${adminTokenRequired ? "Use Admin Token" : "Admin Login"}</button>
        <button class="cta" id="refresh">Refresh</button>
        <button class="cta alt" id="run-flow">Run Auth + Allocate</button>
      </section>
      <section class="grid metrics" id="metrics"></section>
      <section class="panel active" data-panel="Overview">
        <div class="grid two">
          <article class="card"><h3>Inbound Mail Timeline</h3><div class="chart" id="mail-chart"></div></article>
          <article class="card"><h3>System State</h3><div class="log" id="state-log"></div></article>
        </div>
        <article class="card"><h3>Live Event Log</h3><div class="log" id="live-log"></div></article>
      </section>
      <section class="panel" data-panel="Tenants"><article class="card table-wrap" id="tbl-tenants"></article></section>
      <section class="panel" data-panel="Mailboxes"><article class="card table-wrap" id="tbl-mailboxes"></article></section>
      <section class="panel" data-panel="Messages"><article class="card table-wrap" id="tbl-messages"></article></section>
      <section class="panel" data-panel="Webhooks"><article class="card table-wrap" id="tbl-webhooks"></article></section>
      <section class="panel" data-panel="Billing"><article class="card table-wrap" id="tbl-billing"></article></section>
      <section class="panel" data-panel="Risk"><article class="card table-wrap" id="tbl-risk"></article></section>
      <section class="panel" data-panel="Audit"><article class="card table-wrap" id="tbl-audit"></article></section>
      <section class="panel" data-panel="Settings">
        <article class="card">
          <h3>Tenant Limits</h3>
          <p class="hint">Edit tenant status and rate limits via <code>/v1/admin/tenants/{tenant_id}</code>.</p>
          <div class="settings-grid">
            <input id="tenant-id" placeholder="tenant_id" />
            <select id="tenant-status">
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="archived">archived</option>
            </select>
            <input id="tenant-qps" type="number" min="1" step="1" placeholder="tenant QPS" />
          </div>
          <div class="settings-grid" style="margin-top:10px">
            <input id="tenant-mailbox-limit" type="number" min="1" step="1" placeholder="mailbox limit" />
            <input id="tenant-overage" type="number" min="0" step="0.000001" placeholder="overage charge usdc" />
            <input id="tenant-allocate-hourly-limit" type="number" min="0" step="1" placeholder="agent allocate hourly limit" />
          </div>
          <div style="margin-top:10px; display:flex; gap:10px">
            <button class="cta ghost" id="load-tenant">Load Tenant</button>
            <button class="cta" id="save-tenant">Save Tenant Limits</button>
            <button class="cta alt" id="save-runtime-limits">Save Runtime Limits</button>
          </div>
        </article>
        <article class="card">
          <h3>Active Runtime Limits</h3>
          <p class="hint">Current process-level limits; payment bypass uses these values.</p>
          <div class="log" id="limits-log"></div>
        </article>
        <article class="card">
          <h3>Risk Policy Writer</h3>
          <p class="hint">Writes directly to <code>/v1/admin/risk/policies</code>.</p>
          <div class="settings-grid">
            <select id="policy-type">
              <option value="domain_denylist">domain_denylist</option>
              <option value="tenant_rate_limit">tenant_rate_limit</option>
              <option value="tenant_watch">tenant_watch</option>
            </select>
            <input id="policy-value" placeholder="value" />
            <select id="policy-action">
              <option value="add">add</option>
              <option value="update">update</option>
              <option value="remove">remove</option>
            </select>
          </div>
          <div style="margin-top:10px"><button class="cta" id="save-policy">Save Policy</button></div>
        </article>
      </section>
    </main>
  </div>
  <script>
    var navItems = ["Overview", "Tenants", "Mailboxes", "Messages", "Webhooks", "Billing", "Risk", "Audit", "Settings"];
    var metricDefs = [
      ["active_tenants_24h", "Active Tenants"],
      ["active_mailbox_leases", "Active Leases"],
      ["inbound_messages_24h", "Inbound 24h"],
      ["otp_extract_success_rate", "OTP Success"],
      ["webhook_success_rate", "Webhook Success"],
      ["payment_conversion_rate", "Payment Conversion"]
    ];
    var nav = document.getElementById("nav");
    var metricsEl = document.getElementById("metrics");
    var logEl = document.getElementById("live-log");
    var stateLogEl = document.getElementById("state-log");
    var limitsLogEl = document.getElementById("limits-log");
    var apiBaseEl = document.getElementById("apiBase");
    var tokenEl = document.getElementById("token");
    var apiDot = document.getElementById("api-dot");
    var apiStatus = document.getElementById("api-status");
    var adminTokenRequired = ${adminTokenRequired ? "true" : "false"};

    function addLog(line) {
      logEl.textContent = "[" + new Date().toISOString() + "] " + line + "\\n" + logEl.textContent;
    }

    function setState(text) {
      stateLogEl.textContent = text;
    }

    function setLimitsState(text) {
      limitsLogEl.textContent = text;
    }

    function mkTag(value) {
      var lower = String(value).toLowerCase();
      var cls = (lower.indexOf("active") > -1 || lower.indexOf("ok") > -1 || lower.indexOf("paid") > -1 || lower.indexOf("success") > -1 || lower === "true") ? "ok" : (lower.indexOf("high") > -1 || lower.indexOf("fail") > -1 || lower.indexOf("suspend") > -1 || lower.indexOf("frozen") > -1 || lower.indexOf("critical") > -1 ? "warn" : "brand");
      return '<span class="tag ' + cls + '">' + value + "</span>";
    }

    function formatValue(value) {
      if (value === null || value === undefined || value === "") return "-";
      if (typeof value === "boolean") return mkTag(String(value));
      var asString = String(value);
      var statusKeys = ["active", "suspended", "archived", "leased", "available", "frozen", "retired", "parsed", "failed", "pending", "paid", "draft", "issued", "void", "high", "medium", "low", "critical", "success", "failed", "true", "false"];
      if (statusKeys.indexOf(asString.toLowerCase()) > -1) return mkTag(asString);
      return asString;
    }

    function renderMetrics(metrics) {
      metricsEl.innerHTML = "";
      metricDefs.forEach(function(def) {
        var value = metrics[def[0]];
        var suffix = def[0].indexOf("rate") > -1 ? "%" : "";
        var card = document.createElement("article");
        card.className = "card metric";
        card.innerHTML = '<div class="k">' + def[1] + '</div><div class="v">' + (value == null ? "-" : value + suffix) + '</div><div class="d">live from admin API</div>';
        metricsEl.appendChild(card);
      });
    }

    function renderTable(targetId, headers, rows, actions) {
      var host = document.getElementById(targetId);
      if (!rows.length) {
        host.innerHTML = '<div class="empty">No records yet.</div>';
        return;
      }
      var headerHtml = headers.map(function(h) { return "<th>" + h.label + "</th>"; }).join("");
      var rowHtml = rows.map(function(row) {
        var cols = headers.map(function(h) { return "<td>" + formatValue(row[h.key]) + "</td>"; }).join("");
        var actionHtml = "";
        if (actions && actions.length) {
          actionHtml = '<td><div class="actions">' + actions.map(function(action) {
            return '<button class="mini" data-action="' + action.name + '" data-id="' + row[action.idKey] + '">' + action.label + "</button>";
          }).join("") + "</div></td>";
        }
        return "<tr>" + cols + actionHtml + "</tr>";
      }).join("");
      host.innerHTML = "<table><thead><tr>" + headerHtml + (actions && actions.length ? "<th>actions</th>" : "") + "</tr></thead><tbody>" + rowHtml + "</tbody></table>";
    }

    function drawBars(values) {
      var chart = document.getElementById("mail-chart");
      chart.innerHTML = "";
      values.slice(-12).forEach(function(point) {
        var bar = document.createElement("div");
        bar.className = "bar";
        bar.style.height = String(Math.max(8, Number(point.value || 0) * 12)) + "%";
        bar.title = point.ts + " => " + point.value;
        chart.appendChild(bar);
      });
    }

    function baseUrl() {
      return apiBaseEl.value.trim().replace(/\\/$/, "");
    }

    function authHeaders() {
      var headers = { "content-type": "application/json" };
      if (tokenEl.value.trim()) headers.authorization = "Bearer " + tokenEl.value.trim();
      return headers;
    }

    async function fetchJson(path, options) {
      var res = await fetch(baseUrl() + path, options || {});
      var body = await res.json().catch(function() { return {}; });
      if (!res.ok) {
        throw new Error((body && body.message) || ("HTTP " + res.status));
      }
      return body;
    }

    function formatCooldown(item) {
      if (!item || !item.created_at) return "n/a";
      if (item.primary_did) return "n/a";
      var createdAt = new Date(item.created_at).getTime();
      if (!Number.isFinite(createdAt)) return "n/a";
      var remainingMs = (24 * 60 * 60 * 1000) - (Date.now() - createdAt);
      if (remainingMs <= 0) return "expired";
      var remainingMins = Math.ceil(remainingMs / 60000);
      var hours = Math.floor(remainingMins / 60);
      var mins = remainingMins % 60;
      return (hours ? hours + "h " : "") + mins + "m";
    }

    function decorateTenants(items) {
      return (items || []).map(function(item) {
        var bound = Boolean(item.primary_did);
        return Object.assign({}, item, {
          wallet_bound: bound ? "yes" : "no",
          cooldown_remaining: formatCooldown(item),
        });
      });
    }

    async function ping() {
      try {
        var body = await fetchJson("/healthz");
        apiDot.className = "dot ok";
        apiStatus.textContent = "API " + body.status;
        addLog("healthz ok @ " + baseUrl());
      } catch (err) {
        apiDot.className = "dot bad";
        apiStatus.textContent = "API unreachable";
        addLog("healthz failed: " + err.message);
      }
    }

    async function adminLogin() {
      if (adminTokenRequired) {
        if (!tokenEl.value.trim()) throw new Error("admin token required");
        addLog("admin token configured");
        return { mode: "admin-token" };
      }
      var wallet = "0xabc0000000000000000000000000000000000666";
      var challenge = await fetchJson("/v1/auth/siwe/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet })
      });
      var verify = await fetchJson("/v1/auth/siwe/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: challenge.message, signature: "0xdev" })
      });
      tokenEl.value = verify.access_token;
      addLog("admin token issued for tenant=" + verify.tenant_id);
      return verify;
    }

    async function ensureToken() {
      if (tokenEl.value.trim()) return;
      if (adminTokenRequired) throw new Error("admin token required");
      await adminLogin();
    }

    async function runFlow() {
      try {
        var verify = await adminLogin();
        var alloc = await fetchJson("/v1/mailboxes/allocate", {
          method: "POST",
          headers: Object.assign({}, authHeaders(), { "x-payment-proof": "mock-proof" }),
          body: JSON.stringify({ agent_id: verify.agent_id, purpose: "admin-flow", ttl_hours: 1 })
        });
        addLog("flow ok tenant=" + verify.tenant_id + " mailbox=" + alloc.mailbox_id);
        await refreshDashboard();
      } catch (err) {
        addLog("flow failed: " + err.message);
      }
    }

    async function loadOverview() {
      var runtime = await fetchJson("/v1/meta/runtime", { headers: authHeaders() });
      var metrics = await fetchJson("/v1/admin/overview/metrics", { headers: authHeaders() });
      var timeseries = await fetchJson("/v1/admin/overview/timeseries?bucket=hour", { headers: authHeaders() });
      renderMetrics(metrics);
      drawBars(timeseries.points || []);
      document.getElementById("tenant-overage").value = String(runtime.overage_charge_usdc == null ? "" : runtime.overage_charge_usdc);
      document.getElementById("tenant-allocate-hourly-limit").value = String(runtime.agent_allocate_hourly_limit == null ? "" : runtime.agent_allocate_hourly_limit);
      setLimitsState(
        "overage_charge_usdc=" + String(runtime.overage_charge_usdc) + "\\n" +
        "agent_allocate_hourly_limit=" + String(runtime.agent_allocate_hourly_limit) + "\\n" +
        "payment_mode=" + String(runtime.payment_mode) + "\\n" +
        "mailbox_domain=" + String(runtime.mailbox_domain)
      );
      setState(
        "api_base=" + baseUrl() + "\\n" +
        "token_present=" + String(Boolean(tokenEl.value.trim())) + "\\n" +
        "points=" + String((timeseries.points || []).length) + "\\n" +
        "last_refresh=" + new Date().toISOString()
      );
    }

    async function loadTables() {
      var tenants = await fetchJson("/v1/admin/tenants?page=1&page_size=50", { headers: authHeaders() });
      var tenantItems = decorateTenants(tenants.items);
      renderTable("tbl-tenants", [
        { key: "tenant_id", label: "tenant_id" },
        { key: "name", label: "name" },
        { key: "status", label: "status" },
        { key: "qps", label: "qps" },
        { key: "mailbox_limit", label: "mailbox_limit" },
        { key: "wallet_bound", label: "wallet_bound" },
        { key: "cooldown_remaining", label: "cooldown_remaining" },
        { key: "primary_did", label: "primary_did" },
        { key: "active_agents", label: "active_agents" },
        { key: "active_mailboxes", label: "active_mailboxes" },
        { key: "monthly_usage", label: "monthly_usage" },
        { key: "created_at", label: "created_at" },
        { key: "updated_at", label: "updated_at" }
      ], tenantItems, [
        { name: "tenant.edit", label: "Edit Limits", idKey: "tenant_id" },
        { name: "tenant.disable", label: "Suspend", idKey: "tenant_id" }
      ]);

      var mailboxes = await fetchJson("/v1/admin/mailboxes?page=1&page_size=50", { headers: authHeaders() });
      renderTable("tbl-mailboxes", [
        { key: "mailbox_id", label: "mailbox_id" },
        { key: "address", label: "address" },
        { key: "type", label: "type" },
        { key: "status", label: "status" },
        { key: "tenant_id", label: "tenant_id" },
        { key: "agent_id", label: "agent_id" },
        { key: "lease_expires_at", label: "lease_expires_at" }
      ], mailboxes.items || [], [
        { name: "mailbox.freeze", label: "Freeze", idKey: "mailbox_id" },
        { name: "mailbox.release", label: "Release", idKey: "mailbox_id" }
      ]);

      var messages = await fetchJson("/v1/admin/messages?page=1&page_size=50", { headers: authHeaders() });
      renderTable("tbl-messages", [
        { key: "message_id", label: "message_id" },
        { key: "mailbox_id", label: "mailbox_id" },
        { key: "sender_domain", label: "sender_domain" },
        { key: "subject", label: "subject" },
        { key: "received_at", label: "received_at" },
        { key: "parsed_status", label: "parsed_status" },
        { key: "otp_extracted", label: "otp_extracted" }
      ], messages.items || [], [
        { name: "message.reparse", label: "Reparse", idKey: "message_id" },
        { name: "message.replay", label: "Replay Webhook", idKey: "message_id" }
      ]);

      var webhooks = await fetchJson("/v1/admin/webhooks?page=1&page_size=50", { headers: authHeaders() });
      renderTable("tbl-webhooks", [
        { key: "webhook_id", label: "webhook_id" },
        { key: "tenant_id", label: "tenant_id" },
        { key: "target_url", label: "target_url" },
        { key: "event_types", label: "event_types" },
        { key: "status", label: "status" },
        { key: "last_delivery_at", label: "last_delivery_at" },
        { key: "last_status_code", label: "last_status_code" }
      ], (webhooks.items || []).map(function(item) {
        item.event_types = Array.isArray(item.event_types) ? item.event_types.join(", ") : item.event_types;
        return item;
      }), [
        { name: "webhook.replay", label: "Replay", idKey: "webhook_id" },
        { name: "webhook.rotate", label: "Rotate Secret", idKey: "webhook_id" }
      ]);

      var invoices = await fetchJson("/v1/admin/invoices?page=1&page_size=50", { headers: authHeaders() });
      renderTable("tbl-billing", [
        { key: "invoice_id", label: "invoice_id" },
        { key: "tenant_id", label: "tenant_id" },
        { key: "period", label: "period" },
        { key: "amount_usdc", label: "amount_usdc" },
        { key: "status", label: "status" },
        { key: "settlement_tx_hash", label: "settlement_tx_hash" }
      ], invoices.items || [], [
        { name: "invoice.issue", label: "Issue", idKey: "invoice_id" }
      ]);

      var risk = await fetchJson("/v1/admin/risk/events?page=1&page_size=50", { headers: authHeaders() });
      renderTable("tbl-risk", [
        { key: "event_id", label: "event_id" },
        { key: "tenant_id", label: "tenant_id" },
        { key: "severity", label: "severity" },
        { key: "type", label: "type" },
        { key: "detail", label: "detail" },
        { key: "occurred_at", label: "occurred_at" }
      ], risk.items || []);

      var audit = await fetchJson("/v1/admin/audit/logs?page=1&page_size=50", { headers: authHeaders() });
      renderTable("tbl-audit", [
        { key: "log_id", label: "log_id" },
        { key: "timestamp", label: "timestamp" },
        { key: "tenant_id", label: "tenant_id" },
        { key: "actor_did", label: "actor_did" },
        { key: "action", label: "action" },
        { key: "resource_type", label: "resource_type" },
        { key: "resource_id", label: "resource_id" },
        { key: "result", label: "result" }
      ], audit.items || []);
    }

    async function handleTableAction(evt) {
      var button = evt.target.closest(".mini");
      if (!button) return;
      try {
        await ensureToken();
        var id = button.dataset.id;
        var action = button.dataset.action;
        if (action === "tenant.disable") {
          await fetchJson("/v1/admin/tenants/" + id, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ status: "suspended" })
          });
        } else if (action === "tenant.edit") {
          await loadTenantSettings(id);
        } else if (action === "mailbox.freeze") {
          await fetchJson("/v1/admin/mailboxes/" + id + "/freeze", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ reason: "dashboard freeze" })
          });
        } else if (action === "mailbox.release") {
          await fetchJson("/v1/admin/mailboxes/" + id + "/release", {
            method: "POST",
            headers: authHeaders(),
            body: "{}"
          });
        } else if (action === "message.reparse") {
          await fetchJson("/v1/admin/messages/" + id + "/reparse", {
            method: "POST",
            headers: authHeaders(),
            body: "{}"
          });
        } else if (action === "message.replay") {
          await fetchJson("/v1/admin/messages/" + id + "/replay-webhook", {
            method: "POST",
            headers: authHeaders(),
            body: "{}"
          });
        } else if (action === "webhook.replay") {
          var now = new Date();
          var from = new Date(now.getTime() - 3600 * 1000).toISOString();
          await fetchJson("/v1/admin/webhooks/" + id + "/replay", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ from: from, to: now.toISOString() })
          });
        } else if (action === "webhook.rotate") {
          var rotated = await fetchJson("/v1/admin/webhooks/" + id + "/rotate-secret", {
            method: "POST",
            headers: authHeaders(),
            body: "{}"
          });
          addLog("webhook secret rotated: " + rotated.secret);
        } else if (action === "invoice.issue") {
          await fetchJson("/v1/admin/invoices/" + id + "/issue", {
            method: "POST",
            headers: authHeaders(),
            body: "{}"
          });
        }
        addLog("action ok: " + action + " id=" + id);
        if (action !== "tenant.edit") await refreshDashboard();
      } catch (err) {
        addLog("action failed: " + err.message);
      }
    }

    async function loadTenantSettings(id) {
      try {
        await ensureToken();
        var tenantId = id || document.getElementById("tenant-id").value.trim();
        if (!tenantId) throw new Error("tenant_id is required");
        var tenant = await fetchJson("/v1/admin/tenants/" + tenantId, { headers: authHeaders() });
        document.getElementById("tenant-id").value = tenant.tenant_id;
        document.getElementById("tenant-status").value = tenant.status || "active";
        document.getElementById("tenant-qps").value = tenant.quotas && tenant.quotas.qps != null ? tenant.quotas.qps : "";
        document.getElementById("tenant-mailbox-limit").value = tenant.quotas && tenant.quotas.mailbox_limit != null ? tenant.quotas.mailbox_limit : "";
        addLog(
          "tenant loaded: " +
          tenant.tenant_id +
          " wallet_bound=" +
          String(Boolean(tenant.primary_did)) +
          " cooldown_remaining=" +
          formatCooldown(tenant),
        );
        document.querySelectorAll(".nav button").forEach(function(item) { item.classList.remove("active"); });
        document.querySelectorAll(".panel").forEach(function(item) { item.classList.remove("active"); });
        var settingsBtn = Array.from(document.querySelectorAll(".nav button")).find(function(item) { return item.textContent === "Settings"; });
        if (settingsBtn) settingsBtn.classList.add("active");
        var settingsPanel = document.querySelector('[data-panel="Settings"]');
        if (settingsPanel) settingsPanel.classList.add("active");
      } catch (err) {
        addLog("load tenant failed: " + err.message);
      }
    }

    async function saveTenantSettings() {
      try {
        await ensureToken();
        var tenantId = document.getElementById("tenant-id").value.trim();
        if (!tenantId) throw new Error("tenant_id is required");
        var qpsValue = document.getElementById("tenant-qps").value.trim();
        var mailboxLimitValue = document.getElementById("tenant-mailbox-limit").value.trim();
        var payload = {
          status: document.getElementById("tenant-status").value
        };
        if (qpsValue || mailboxLimitValue) {
          payload.quotas = {};
          if (qpsValue) payload.quotas.qps = Number(qpsValue);
          if (mailboxLimitValue) payload.quotas.mailbox_limit = Number(mailboxLimitValue);
        }
        await fetchJson("/v1/admin/tenants/" + tenantId, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });
        addLog("tenant limits saved: " + tenantId);
        await refreshDashboard();
      } catch (err) {
        addLog("save tenant failed: " + err.message);
      }
    }

    async function saveRuntimeLimits() {
      try {
        await ensureToken();
        var overageValue = document.getElementById("tenant-overage").value.trim();
        var allocateHourlyValue = document.getElementById("tenant-allocate-hourly-limit").value.trim();
        var payload = {};
        if (overageValue) payload.overage_charge_usdc = Number(overageValue);
        if (allocateHourlyValue) payload.agent_allocate_hourly_limit = Number(allocateHourlyValue);
        if (!Object.keys(payload).length) throw new Error("at least one runtime limit is required");
        var updated = await fetchJson("/v1/admin/settings/limits", {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });
        document.getElementById("tenant-overage").value = String(updated.overage_charge_usdc);
        document.getElementById("tenant-allocate-hourly-limit").value = String(updated.agent_allocate_hourly_limit);
        addLog("runtime limits saved");
        await refreshDashboard();
      } catch (err) {
        addLog("save runtime limits failed: " + err.message);
      }
    }

    async function savePolicy() {
      try {
        await ensureToken();
        await fetchJson("/v1/admin/risk/policies", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            policy_type: document.getElementById("policy-type").value,
            value: document.getElementById("policy-value").value,
            action: document.getElementById("policy-action").value
          })
        });
        addLog("risk policy updated");
        await refreshDashboard();
      } catch (err) {
        addLog("policy update failed: " + err.message);
      }
    }

    async function refreshDashboard() {
      try {
        await ping();
        await ensureToken();
        await loadOverview();
        await loadTables();
        addLog("dashboard refreshed");
      } catch (err) {
        addLog("refresh failed: " + err.message);
      }
    }

    navItems.forEach(function(name, index) {
      var btn = document.createElement("button");
      btn.textContent = name;
      if (index === 0) btn.classList.add("active");
      btn.onclick = function() {
        document.querySelectorAll(".nav button").forEach(function(item) { item.classList.remove("active"); });
        document.querySelectorAll(".panel").forEach(function(item) { item.classList.remove("active"); });
        btn.classList.add("active");
        var panel = document.querySelector('[data-panel="' + name + '"]');
        if (panel) panel.classList.add("active");
      };
      nav.appendChild(btn);
    });

    document.body.addEventListener("click", handleTableAction);
    document.getElementById("login").addEventListener("click", function() {
      adminLogin().then(refreshDashboard).catch(function(err) { addLog("login failed: " + err.message); });
    });
    document.getElementById("refresh").addEventListener("click", refreshDashboard);
    document.getElementById("run-flow").addEventListener("click", runFlow);
    document.getElementById("save-policy").addEventListener("click", savePolicy);
    document.getElementById("load-tenant").addEventListener("click", function() { loadTenantSettings(); });
    document.getElementById("save-tenant").addEventListener("click", saveTenantSettings);
    document.getElementById("save-runtime-limits").addEventListener("click", saveRuntimeLimits);

    addLog("dashboard ready");
    if (!adminTokenRequired) refreshDashboard();
  </script>
</body>
</html>`;
}
