import { renderAdminDashboardHtml } from "./admin-ui.js";
import { renderAgentsGuideHtml } from "./agents-guide-ui.js";
import { renderUserAppHtml } from "./user-ui.js";

function htmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function createPublicRouteHandler({
  runtimeConfig,
  jsonResponse,
  getOverageChargeUsdc,
  getAgentAllocateHourlyLimit,
}) {
  return async function handlePublicRoute({ method, path, requestId }) {
    if (method === "GET" && path === "/healthz") {
      return jsonResponse(200, { status: "ok", service: "agent-mail-cloud" }, requestId);
    }

    if (method === "GET" && path === "/v1/meta/runtime") {
      return jsonResponse(
        200,
        {
          siwe_mode: runtimeConfig.siweMode,
          payment_mode: runtimeConfig.paymentMode,
          base_chain_id: runtimeConfig.baseChainId,
          chain_name: runtimeConfig.chainName,
          chain_hex: `0x${Number(runtimeConfig.baseChainId || 0).toString(16)}`,
          chain_rpc_urls: runtimeConfig.chainRpcUrls,
          chain_explorer_urls: runtimeConfig.chainExplorerUrls,
          mailbox_domain: runtimeConfig.mailboxDomain,
          overage_charge_usdc: getOverageChargeUsdc(),
          agent_allocate_hourly_limit: getAgentAllocateHourlyLimit(),
          webmail_url: runtimeConfig.mailuBaseUrl ? `${runtimeConfig.mailuBaseUrl.replace(/\/$/, "")}/webmail/` : null,
          auth: {
            browser_wallet_required: runtimeConfig.siweMode === "strict",
          },
        },
        requestId,
      );
    }

    if (method === "GET" && (path === "/admin" || path === "/admin/")) {
      return htmlResponse(
        renderAdminDashboardHtml({ adminTokenRequired: Boolean(runtimeConfig.adminApiToken) }),
      );
    }

    if (method === "GET" && (path === "/app" || path === "/app/")) {
      return htmlResponse(renderUserAppHtml());
    }

    if (method === "GET" && (path === "/agents-guide" || path === "/agents-guide/")) {
      return htmlResponse(renderAgentsGuideHtml());
    }

    return null;
  };
}
