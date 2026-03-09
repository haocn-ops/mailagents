function toV2Message(message) {
  const parsedStatus = message.parsed_status || (message.otp_code || message.verification_link ? "parsed" : "pending");
  return {
    message_id: message.message_id,
    mailbox_id: message.mailbox_id,
    sender: message.sender,
    sender_domain: message.sender_domain,
    subject: message.subject,
    raw_ref: message.raw_ref || null,
    received_at: message.received_at,
    otp_code: message.otp_code || null,
    verification_link: message.verification_link || null,
    parsed_status: parsedStatus,
  };
}

export function createV2MessageRouteHandler({
  store,
  mailBackend,
  requireAuth,
  evaluateAccess,
  jsonResponse,
  readJsonBody,
  getOverageChargeUsdc,
}) {
  return async function handleV2MessageRoute({ method, path, request, requestId, requestUrl }) {
    if (!path.startsWith("/v2/messages") && !path.startsWith("/v2/send-attempts")) return null;

    if (method === "GET" && path === "/v2/messages") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await evaluateAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v1/messages/latest",
      });
      if (!access.ok) return access.response;

      const mailboxId = requestUrl.searchParams.get("mailbox_id");
      const since = requestUrl.searchParams.get("since");
      const limitRaw = requestUrl.searchParams.get("limit");
      const limit = limitRaw ? Number(limitRaw) : 20;
      if (!mailboxId) {
        return jsonResponse(400, { error: "bad_request", message: "mailbox_id is required" }, requestId);
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return jsonResponse(400, { error: "bad_request", message: "limit must be 1..100" }, requestId);
      }

      const messages = await store.getLatestMessages({
        tenantId: auth.payload.tenant_id,
        mailboxId,
        since,
        limit,
      });
      if (messages === null) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "GET /v1/messages/latest",
        quantity: 1,
        requestId,
      });
      if (access.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "GET /v1/messages/latest",
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }

      return jsonResponse(200, { items: messages.map(toV2Message) }, requestId);
    }

    if (method === "POST" && path === "/v2/messages/send") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const access = await evaluateAccess({
        request,
        requestId,
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/messages/send",
      });
      if (!access.ok) return access.response;

      const body = await readJsonBody(request);
      const mailboxId = String(body.mailbox_id || "").trim();
      const recipients = Array.isArray(body.to)
        ? body.to.map((item) => String(item || "").trim()).filter(Boolean)
        : String(body.to || "").trim()
          ? [String(body.to || "").trim()]
          : [];
      const subject = String(body.subject || "").trim();
      const text = String(body.text || "");
      const html = String(body.html || "");
      const mailboxPassword = String(body.mailbox_password || "").trim();

      if (!mailboxId || !recipients.length || !subject || !mailboxPassword || (!text && !html)) {
        return jsonResponse(
          400,
          { error: "bad_request", message: "mailbox_id, to, subject, mailbox_password, and text or html are required" },
          requestId,
        );
      }

      const mailbox = await store.getTenantMailbox(auth.payload.tenant_id, mailboxId);
      if (!mailbox) {
        return jsonResponse(404, { error: "not_found", message: "Mailbox not found" }, requestId);
      }

      const attempt = await store.createSendAttempt({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        mailboxId,
        to: recipients,
        subject,
        text,
        html,
        requestId,
      });

      let delivery;
      try {
        delivery = await mailBackend.sendMailboxMessage({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          mailboxId,
          address: mailbox.address,
          password: mailboxPassword,
          to: recipients,
          subject,
          text,
          html,
        });
        await store.completeSendAttempt(attempt.send_attempt_id, delivery, { requestId });
      } catch (err) {
        await store.failSendAttempt(attempt.send_attempt_id, err.message || "Mail backend send failed", { requestId });
        return jsonResponse(
          502,
          {
            error: "mail_backend_error",
            message: err.message || "Mail backend send failed",
            send_attempt_id: attempt.send_attempt_id,
          },
          requestId,
        );
      }

      await store.recordUsage({
        tenantId: auth.payload.tenant_id,
        agentId: auth.payload.agent_id,
        endpoint: "POST /v2/messages/send",
        quantity: 1,
        requestId,
      });
      if (access.requiresCharge) {
        await store.recordOverageCharge({
          tenantId: auth.payload.tenant_id,
          agentId: auth.payload.agent_id,
          endpoint: "POST /v2/messages/send",
          reasons: access.reasons,
          amountUsdc: getOverageChargeUsdc(),
          requestId,
        });
      }

      const completedAttempt = await store.getTenantSendAttempt(auth.payload.tenant_id, attempt.send_attempt_id);
      return jsonResponse(
        202,
        {
          send_attempt_id: completedAttempt?.send_attempt_id || attempt.send_attempt_id,
          submission_status: completedAttempt?.submission_status || "accepted",
          accepted: completedAttempt?.accepted || [],
          rejected: completedAttempt?.rejected || [],
          message_id: completedAttempt?.message_id || null,
          response: completedAttempt?.response || null,
        },
        requestId,
      );
    }

    if (method === "GET" && path === "/v2/send-attempts") {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;
      const items = await store.listTenantSendAttempts(auth.payload.tenant_id);
      return jsonResponse(200, { items }, requestId);
    }

    if (method === "GET" && path.startsWith("/v2/send-attempts/")) {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const sendAttemptId = path.replace("/v2/send-attempts/", "").trim();
      if (!sendAttemptId) {
        return jsonResponse(400, { error: "bad_request", message: "send_attempt_id is required" }, requestId);
      }

      const sendAttempt = await store.getTenantSendAttempt(auth.payload.tenant_id, sendAttemptId);
      if (!sendAttempt) {
        return jsonResponse(404, { error: "not_found", message: "Send attempt not found" }, requestId);
      }
      return jsonResponse(200, sendAttempt, requestId);
    }

    if (method === "GET" && path.startsWith("/v2/messages/")) {
      const auth = await requireAuth(request, requestId);
      if (!auth.ok) return auth.response;

      const messageId = path.replace("/v2/messages/", "").trim();
      if (!messageId) {
        return jsonResponse(400, { error: "bad_request", message: "message_id is required" }, requestId);
      }

      const message = await store.getTenantMessageDetail(auth.payload.tenant_id, messageId);
      if (!message) {
        return jsonResponse(404, { error: "not_found", message: "Message not found" }, requestId);
      }
      return jsonResponse(200, toV2Message(message), requestId);
    }

    return null;
  };
}
