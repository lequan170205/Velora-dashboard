import test from "node:test";
import assert from "node:assert/strict";
import {
  CallJobStore,
  JobConflict,
  startInput,
} from "./stress/call-media/job-store.mjs";
const requestId = "a622491c-a471-4e78-9a9c-90d4b3ef4e60",
  tick = () => new Promise((r) => setImmediate(r));
test("no arbitrary command, duration or target can enter a run", () => {
  for (const body of [
    { preset: "huge", requestId },
    { preset: "smoke", requestId: "x" },
    { preset: "smoke", requestId, target: "http://foreign.test" },
    { preset: "smoke", requestId, command: "exec" },
  ])
    assert.throws(() => startInput(body));
});
test("double-submit joins the same run; competing starts never execute", async () => {
  let resolve,
    count = 0;
  const store = new CallJobStore(() => {
    count++;
    return new Promise((r) => (resolve = r));
  });
  const a = store.start("admin", { preset: "smoke", requestId });
  assert.equal(store.start("admin", { preset: "smoke", requestId }), a);
  assert.throws(
    () => store.start("other", { preset: "smoke", requestId }),
    JobConflict,
  );
  assert.throws(
    () => store.start("admin", { preset: "demo", requestId }),
    JobConflict,
  );
  await tick();
  assert.equal(count, 1);
  resolve();
  await tick();
  assert.equal(store.state().recent[0].status, "passed");
});
test("stop keeps the slot busy until cleanup finishes and cannot turn into PASS", async () => {
  let finish;
  const store = new CallJobStore(
    (job, signal) =>
      new Promise((r) => {
        finish = r;
        signal.addEventListener("abort", () => {}, { once: true });
      }),
  );
  const j = store.start("admin", { preset: "smoke", requestId });
  await tick();
  store.stop(j.id);
  assert.equal(store.state().busy, true);
  assert.equal(j.status, "stopping");
  assert.throws(
    () => store.start("other", { preset: "demo", requestId }),
    JobConflict,
  );
  finish();
  await tick();
  assert.equal(j.status, "cancelled");
  assert.equal(store.state().busy, false);
});
test("private exceptions are never published to status or history", async () => {
  const store = new CallJobStore(async () => {
    throw new Error("password private-token");
  });
  const j = store.start("admin", { preset: "smoke", requestId });
  await tick();
  assert.equal(j.status, "failed");
  assert.ok(!JSON.stringify(store.state()).includes("private-token"));
});
import { adminAuthorizer } from "./stress/call-media/agent-auth.mjs";
const token = (sub, exp) =>
  "header." +
  Buffer.from(JSON.stringify({ sub, exp })).toString("base64url") +
  ".signature";
test("host companion checks authoritative ADMIN role, bound identity and expiry", async () => {
  for (const user of [
    { id: "a", roles: ["USER"] },
    { id: "b", roles: ["ADMIN"] },
  ]) {
    const authorize = adminAuthorizer("https://velora-app.me", {
      now: () => 1000,
      fetchImpl: async () => ({ ok: true, json: async () => user }),
    });
    await assert.rejects(authorize(token("a", 60)));
  }
  let n = 0;
  const authorize = adminAuthorizer("https://velora-app.me", {
    now: () => 1000,
    fetchImpl: async () => {
      n++;
      return { ok: true, json: async () => ({ id: "a", roles: ["ADMIN"] }) };
    },
  });
  assert.deepEqual(await authorize(token("a", 60)), { id: "a" });
  await authorize(token("a", 60));
  assert.equal(n, 1);
  await assert.rejects(authorize(token("a", 0)));
});

test("failure to save the report cannot produce a passed history entry", async () => {
  const store = new CallJobStore(async () => {}, {
    onFinished: async () => {
      throw new Error("private path");
    },
  });
  const j = store.start("admin", { preset: "smoke", requestId });
  await tick();
  assert.equal(j.status, "failed");
  assert.equal(j.failure, "Result storage unavailable");
  assert.equal(store.state().busy, false);
});
