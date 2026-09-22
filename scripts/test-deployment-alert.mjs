import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/features/monitoring/deploymentAlertDetails.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { deploymentAlertDetails } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

test("deployment alert exposes the failing service and remediation", () => {
  assert.deepEqual(
    deploymentAlertDetails({
      annotations: { action: "Inspect notification-service logs." },
      description: "Fallback description",
      labels: {
        status: "health-check",
        failed_service: "notification-service",
        reason: "notification-service exited with code 1.",
        target_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        deployed_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    }),
    {
      status: "health-check",
      reason: "notification-service exited with code 1.",
      action: "Inspect notification-service logs.",
      failedService: "notification-service",
      targetSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      deployedSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  );
});

test("deployment alert falls back safely when optional labels are absent", () => {
  const details = deploymentAlertDetails({
    annotations: {},
    description: "Controller stopped.",
    labels: { failed_service: "none" },
  });

  assert.equal(details.reason, "Controller stopped.");
  assert.equal(details.failedService, null);
  assert.equal(details.action, null);
});
