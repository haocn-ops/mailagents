export function renderAdminDashboardHtml() {
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
    .dot.ok { background: var(--ok); } .dot.bad { background: var(--warn); }
    .toolbar { margin-bottom: 16px; display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font: inherit; color: var(--ink); background: #fff; }
    button.cta { border: 0; border-radius: 10px; background: var(--brand); color: #fff; padding: 10px 14px; font: inherit; cursor: pointer; }
    button.cta.alt { background: #2e4b45; }
    .grid { display: grid; gap: 14px; } .metrics { grid-template-columns: repeat(6, minmax(120px, 1fr)); }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); padding: 14px; animation: enter 280ms ease; }
    .metric .k { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric .v { margin-top: 8px; font-size: 26px; font-weight: 700; }
    .metric .d { margin-top: 4px; font-size: 12px; color: var(--muted); }
    .panel { display: none; gap: 14px; } .panel.active { display: grid; }
    .two { grid-template-columns: 1.2fr 1fr; }
    .chart { height: 180px; display: grid; gap: 8px; align-content: end; grid-template-columns: repeat(12, 1fr); }
    .bar { border-radius: 8px 8px 4px 4px; background: linear-gradient(180deg, #2fa695, #0f7165); min-height: 8px; transition: transform 180ms ease; }
    .bar:hover { transform: translateY(-2px); }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
    table { width: 100%; border-collapse: collapse; min-width: 900px; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #edf2f0; text-align: left; white-space: nowrap; }
    th { position: sticky; top: 0; background: #f8fbfa; font-weight: 600; color: #2d3e3a; }
    .tag { border-radius: 999px; padding: 4px 9px; font-size: 11px; font-family: 'IBM Plex Mono', monospace; display: inline-block; background: #eef3f1; }
    .tag.ok { background: var(--ok-soft); color: #194e2e; } .tag.warn { background: var(--warn-soft); color: #8a2f18; } .tag.brand { background: var(--brand-soft); color: #075b53; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .mini { border: 1px solid var(--line); background: #fff; color: #2f423d; border-radius: 8px; padding: 5px 8px; cursor: pointer; font-size: 12px; }
    .log { font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: #101917; color: #c8f8ec; border-radius: 12px; padding: 12px; min-height: 120px; white-space: pre-wrap; overflow: auto; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; } .full { grid-column: 1 / -1; }
    @keyframes enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } .sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line);} .metrics { grid-template-columns: repeat(2, minmax(120px, 1fr)); } .two { grid-template-columns: 1fr; } .toolbar { grid-template-columns: 1fr; }}
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">Agent Mail Cloud</div>
      <div class="sub">Admin Dashboard · V1</div>
      <div class="nav" id="nav"></div>
    </aside>
    <main class="main">
      <section class="topbar">
        <div>
          <h1 class="title">Operations Control Plane</h1>
          <p class="caption">Monitor tenants, mailboxes, parsing, webhooks, billing and risk in one place.</p>
        </div>
        <div class="status"><span id="api-dot" class="dot"></span><span id="api-status">checking API...</span></div>
      </section>
      <section class="toolbar">
        <input id="apiBase" value="${defaultApiBase}" />
        <button class="cta" id="ping">Ping API</button>
        <button class="cta alt" id="run-flow">Run Auth + Allocate</button>
      </section>
      <section class="grid metrics" id="metrics"></section>
      <section class="panel active" data-panel="Overview">
        <div class="grid two">
          <article class="card"><h3>Mail Traffic (last 12h)</h3><div class="chart" id="mail-chart"></div></article>
          <article class="card"><h3>Endpoint Mix</h3><div class="chart" id="api-chart"></div></article>
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
          <h3>Policy & Access Settings</h3>
          <div class="form-grid">
            <div><label>Role</label><select><option>Owner</option><option>Admin</option><option>Operator</option><option>Viewer</option></select></div>
            <div><label>Tenant QPS Limit</label><input value="120" /></div>
            <div><label>Agent allocate/hour</label><input value="60" /></div>
            <div><label>Denylist Domains</label><input value="tempmail.xyz, badmail.cc" /></div>
            <div class="full"><label>Webhook Retry Policy</label><textarea rows="4">Exponential backoff, max 8 retries, DLQ enabled.</textarea></div>
            <div class="full"><button class="cta">Save Settings</button></div>
          </div>
        </article>
      </section>
    </main>
  </div>
  <script>
    var navItems = ["Overview","Tenants","Mailboxes","Messages","Webhooks","Billing","Risk","Audit","Settings"];
    var metrics = [["Active Tenants","186","+6.2% / 24h"],["Active Leases","742","p95 allocate 1.3s"],["Mail Received","18.4k","1h: 1.1k"],["OTP Success","98.7%","target >95%"],["Webhook Success","99.2%","after retries"],["402→Paid","96.1%","conversion stable"]];
    var tenants = [["tnt-01f3","Acme Agent Lab","active","did:pkh:eip155:8453:0x12..af",14,96,"1240.50","2026-03-05T13:10Z"],["tnt-02a1","NovaOps","active","did:pkh:eip155:8453:0x88..c1",8,57,"842.20","2026-03-05T12:42Z"],["tnt-08aa","Dex Insight","suspended","did:pkh:eip155:8453:0x44..ff",3,12,"92.30","2026-03-04T23:15Z"]];
    var mailboxes = [["mbx-782","agent-1@pool.mailcloud.local","alias","leased","tnt-01f3","agt-a1","2026-03-05T15:00Z"],["mbx-613","agent-2@pool.mailcloud.local","alias","available","tnt-01f3","-","-"],["mbx-012","agent-3@pool.mailcloud.local","real","frozen","tnt-08aa","agt-z9","2026-03-05T09:30Z"]];
    var messages = [["msg-9a1","mbx-782","example.com","Verify your account","2026-03-05T13:08Z","parsed",true],["msg-2d4","mbx-012","riskmail.cc","Your OTP","2026-03-05T09:15Z","failed",false],["msg-7c2","mbx-782","vendor.io","Confirm sign-in","2026-03-05T12:59Z","parsed",true]];
    var webhooks = [["wh-100","tnt-01f3","https://ops.acme.ai/hook","otp.extracted","active","2026-03-05T13:09Z",200],["wh-201","tnt-02a1","https://novaops.io/cb","mail.received","paused","2026-03-05T11:02Z",503]];
    var billing = [["inv-883","tnt-01f3","2026-03","1240.50","issued","0x9ab...ee1"],["inv-901","tnt-02a1","2026-03","842.20","paid","0x1bc...2af"],["inv-701","tnt-08aa","2026-03","92.30","draft","-"]];
    var risk = [["2026-03-05T13:00Z","tnt-08aa","denylist.hit","tempmail.xyz","high"],["2026-03-05T12:10Z","tnt-02a1","rate.limit","allocate/hour > 60","medium"],["2026-03-04T23:12Z","tnt-08aa","webhook.fail.burst","12 failures / 5m","high"]];
    var audit = [["2026-03-05T13:11Z","did:pkh...af","mailbox.freeze","mailbox","mbx-012","ok"],["2026-03-05T12:50Z","did:pkh...c1","webhook.replay","webhook","wh-201","ok"],["2026-03-05T12:25Z","did:pkh...ff","tenant.disable","tenant","tnt-08aa","ok"]];
    var nav = document.getElementById('nav');
    var metricsEl = document.getElementById('metrics');
    var logEl = document.getElementById('live-log');
    var apiBaseEl = document.getElementById('apiBase');
    var apiDot = document.getElementById('api-dot');
    var apiStatus = document.getElementById('api-status');

    function addLog(line){ logEl.textContent = '[' + new Date().toISOString() + '] ' + line + '\n' + logEl.textContent; }
    function mkTag(value){ var lower = String(value).toLowerCase(); var cls = (lower.indexOf('active')>-1||lower.indexOf('ok')>-1||lower.indexOf('paid')>-1||lower==='true') ? 'ok' : (lower.indexOf('high')>-1||lower.indexOf('fail')>-1||lower.indexOf('suspend')>-1||lower.indexOf('frozen')>-1||lower.indexOf('503')>-1 ? 'warn':'brand'); return '<span class="tag '+cls+'">'+value+'</span>'; }

    function renderTable(targetId, headers, rows, actionLabels){
      var host = document.getElementById(targetId);
      var headerHtml = headers.map(function(h){ return '<th>'+h+'</th>'; }).join('');
      var rowHtml = rows.map(function(r){
        var tds = r.map(function(v){
          var asString = String(v);
          var statusKeys = ['active','suspended','leased','available','frozen','parsed','failed','paid','draft','issued','high','medium','ok','true','false'];
          return statusKeys.indexOf(asString.toLowerCase())>-1 ? '<td>'+mkTag(asString)+'</td>' : '<td>'+asString+'</td>';
        }).join('');
        var actions = actionLabels.length ? '<td><div class="actions">'+actionLabels.map(function(a){ return '<button class="mini" data-action="'+a+'">'+a+'</button>'; }).join('')+'</div></td>' : '';
        return '<tr>'+tds+actions+'</tr>';
      }).join('');
      host.innerHTML = '<table><thead><tr>'+headerHtml+(actionLabels.length?'<th>actions</th>':'')+'</tr></thead><tbody>'+rowHtml+'</tbody></table>';
    }

    metrics.forEach(function(m){
      var card = document.createElement('article');
      card.className = 'card metric';
      card.innerHTML = '<div class="k">'+m[0]+'</div><div class="v">'+m[1]+'</div><div class="d">'+m[2]+'</div>';
      metricsEl.appendChild(card);
    });

    navItems.forEach(function(name, i){
      var btn = document.createElement('button');
      btn.textContent = name;
      if(i===0){ btn.classList.add('active'); }
      btn.onclick = function(){
        document.querySelectorAll('.nav button').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
        var panel = document.querySelector('[data-panel="'+name+'"]');
        if(panel){ panel.classList.add('active'); }
      };
      nav.appendChild(btn);
    });

    function drawBars(id, values){
      var el = document.getElementById(id);
      values.forEach(function(v){
        var b = document.createElement('div');
        b.className = 'bar';
        b.style.height = String(Math.max(8, v)) + '%';
        el.appendChild(b);
      });
    }

    drawBars('mail-chart',[28,36,31,44,42,61,58,73,65,70,82,76]);
    drawBars('api-chart',[22,34,41,39,52,49,63,60,66,59,72,68]);

    renderTable('tbl-tenants',['tenant_id','name','status','primary_did','active_agents','active_mailboxes','monthly_usage','updated_at'],tenants,['View','Disable','Reset Token']);
    renderTable('tbl-mailboxes',['mailbox_id','address','type','status','tenant_id','agent_id','lease_expires_at'],mailboxes,['Freeze','Release','History']);
    renderTable('tbl-messages',['message_id','mailbox_id','sender_domain','subject','received_at','parsed_status','otp_extracted'],messages,['Reparse','Block Domain','Replay Webhook']);
    renderTable('tbl-webhooks',['webhook_id','tenant_id','target_url','event_types','status','last_delivery_at','last_status_code'],webhooks,['Replay','Rotate Secret','Pause']);
    renderTable('tbl-billing',['invoice_id','tenant_id','period','amount_usdc','status','settlement_tx_hash'],billing,['Issue','Mark Paid','Export CSV']);
    renderTable('tbl-risk',['time','tenant_id','event','detail','severity'],risk,['Observe','Block Domain','Tune Policy']);
    renderTable('tbl-audit',['timestamp','actor_did','action','resource_type','resource_id','result'],audit,['Export JSON']);

    document.querySelectorAll('.mini').forEach(function(btn){ btn.addEventListener('click', function(){ addLog('action:' + btn.dataset.action + ' triggered'); }); });

    async function ping(){
      var base = apiBaseEl.value.trim().replace(/\/$/, '');
      try {
        var res = await fetch(base + '/healthz');
        if(!res.ok){ throw new Error('HTTP ' + res.status); }
        var body = await res.json();
        apiDot.className = 'dot ok';
        apiStatus.textContent = 'API ' + body.status;
        addLog('healthz ok @ ' + base);
      } catch(err){
        apiDot.className = 'dot bad';
        apiStatus.textContent = 'API unreachable';
        addLog('healthz failed: ' + err.message);
      }
    }

    async function runFlow(){
      var base = apiBaseEl.value.trim().replace(/\/$/, '');
      try {
        var wallet = '0xabc0000000000000000000000000000000000666';
        var ch = await fetch(base + '/v1/auth/siwe/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet_address: wallet }) }).then(function(r){ return r.json(); });
        var vr = await fetch(base + '/v1/auth/siwe/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: ch.message, signature: '0xdev' }) }).then(function(r){ return r.json(); });
        var alloc = await fetch(base + '/v1/mailboxes/allocate', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + vr.access_token, 'x-payment-proof': 'mock-proof' },
          body: JSON.stringify({ agent_id: vr.agent_id, purpose: 'admin-flow', ttl_hours: 1 }),
        }).then(function(r){ return r.json(); });
        addLog('flow ok tenant=' + vr.tenant_id + ' mailbox=' + alloc.mailbox_id);
      } catch(err){
        addLog('flow failed: ' + err.message);
      }
    }

    document.getElementById('ping').addEventListener('click', ping);
    document.getElementById('run-flow').addEventListener('click', runFlow);
    addLog('dashboard ready');
    ping();
  </script>
</body>
</html>`;
}
