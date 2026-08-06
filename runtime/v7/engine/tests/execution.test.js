import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionBoundary } from "../src/index.js";

test("dry-run execution boundary never executes an allowed action", async () => {
  const boundary = new ExecutionBoundary({ dryRun: true });
  const result = await boundary.request({
    requestId: "request-1",
    action: "request_platform_moderation",
    target: "example-post",
    confirmed: true
  });

  assert.equal(result.status, "not_executed");
  assert.equal(result.reason, "dry_run");
});

test("unknown external action is blocked", async () => {
  const boundary = new ExecutionBoundary({ dryRun: false });
  const result = await boundary.request({
    requestId: "request-2",
    action: "delete_everything",
    confirmed: true
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "action_not_allowlisted");
});
