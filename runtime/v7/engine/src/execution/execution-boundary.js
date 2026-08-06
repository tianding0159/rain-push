const SAFE_DEFAULT_ACTIONS = new Set([
  "preview_message",
  "preview_post",
  "preview_stream_line",
  "request_platform_moderation",
  "request_delete_public_item",
  "request_schedule",
  "request_delivery"
]);

export class ExecutionBoundary {
  constructor(options = {}) {
    this.dryRun = options.dryRun ?? true;
    this.allowedActions = new Set(options.allowedActions ?? SAFE_DEFAULT_ACTIONS);
    this.handlers = options.handlers ?? {};
  }

  async request(request) {
    const base = {
      requestId: request.requestId,
      action: request.action,
      target: request.target ?? null,
      confirmed: request.confirmed === true
    };

    if (!this.allowedActions.has(request.action)) {
      return { ...base, status: "blocked", reason: "action_not_allowlisted" };
    }

    if (this.dryRun) {
      return { ...base, status: "not_executed", reason: "dry_run" };
    }

    if (request.confirmed !== true) {
      return { ...base, status: "not_executed", reason: "confirmation_required" };
    }

    const handler = this.handlers[request.action];
    if (typeof handler !== "function") {
      return { ...base, status: "not_executed", reason: "handler_unavailable" };
    }

    try {
      const result = await handler(request);
      return { ...base, status: "executed", result };
    } catch (error) {
      return {
        ...base,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
