import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";
const source = (
  await readFile(
    new URL("../src/features/stress-test/calls/api.ts", import.meta.url),
    "utf8",
  )
).replace(
  /import \{ fetchApi \}[^\n]+/,
  "const fetchApi = globalThis.__callFetch",
);
const {
  parseRun,
  parseState,
  callCsv,
  callStageResult,
  startCallRun,
  stopCallRun,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    ).toString("base64")
);
const run = {
  id: "a622491c-a471-4e78-9a9c-90d4b3ef4e60",
  preset: "smoke",
  status: "passed",
  source: "host-local",
  phase: "finished",
  currentCalls: 1,
  startedAt: "2026-10-13T00:00:00Z",
  finishedAt: "2026-10-13T00:01:00Z",
  failure: null,
  stages: [
    {
      calls: 1,
      seconds: 20,
      passed: true,
      packetsMin: 1000,
      packetsMax: 1001,
      reportedLost: 0,
      jitterMs: 2,
      leaveReceipts: 1,
      logoutRevoked: 2,
    },
  ],
  samples: [],
};
test("public result drops unknown fields and exports bounded measurements only", () => {
  const parsed = parseRun({ ...run, password: "private", token: "private" });
  assert.ok(!JSON.stringify(parsed).includes("private"));
  assert.match(callCsv(parsed), /host-local,1,20,true,1000,1001,0,2,1,2/);
});
test("rejects malformed measurements and unbounded payloads", () => {
  for (const value of [
    { ...run, samples: Array(242).fill({}) },
    { ...run, source: "public" },
    { ...run, stages: [{ ...run.stages[0], jitterMs: NaN }] },
  ])
    assert.throws(() => parseRun(value));
  assert.throws(() =>
    parseState({
      available: true,
      source: "host-local",
      busy: "yes",
      active: null,
      recent: [],
      fixtureParticipants: 10,
      fixtureRooms: 5,
    }),
  );
});
test("stop cannot inject a route", async () => {
  await assert.rejects(stopCallRun("../../admin"));
});

test("keeps finite RTC reported loss counters without inventing a zero floor", () => {
  assert.equal(
    parseRun({ ...run, stages: [{ ...run.stages[0], reportedLost: -1 }] })
      .stages[0].reportedLost,
    -1,
  );
});

test("a stage awaiting cleanup is pending, while terminal failures remain failures", () => {
  const stage = { ...run.stages[0], passed: false };
  assert.deepEqual(
    callStageResult({ ...run, status: "running", phase: "cleanup" }, stage),
    { label: "Verifying cleanup", tone: "info" },
  );
  assert.deepEqual(callStageResult({ ...run, status: "failed" }, stage), {
    label: "Failed / incomplete",
    tone: "bad",
  });
});

test("Stop distinguishes unfinished stages from stages already verified", () => {
  const stage = { ...run.stages[0], passed: false };
  assert.deepEqual(callStageResult({ ...run, status: "stopping" }, stage), {
    label: "Stopping",
    tone: "warn",
  });
  assert.deepEqual(callStageResult({ ...run, status: "cancelled" }, stage), {
    label: "Cancelled",
    tone: "warn",
  });
  assert.deepEqual(
    callStageResult({ ...run, status: "cancelled" }, run.stages[0]),
    { label: "Passed", tone: "good" },
  );
});
