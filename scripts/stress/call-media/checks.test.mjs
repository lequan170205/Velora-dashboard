import test from "node:test";
import assert from "node:assert/strict";
import { checked } from "./checks.mjs";

test("an audit failure identifies its step without publishing private details", async () => {
  for (const message of [
    "Fixture state audit unavailable",
    "Push token audit unavailable",
    "Pipeline metrics unavailable",
    "Resource metrics unavailable",
    "Runtime audit unavailable",
    "LAN address unavailable",
    "Session audit unavailable",
  ]) {
    await assert.rejects(
      checked(message, async () => {
        throw new Error("postgres://private-password@example/private-path");
      }),
      (error) => error.message === message && error.cause === undefined,
    );
  }
});

test("successful audits keep their result and execute once", async () => {
  const result = { active: 0 };
  let attempts = 0;
  assert.equal(
    await checked("Push token audit unavailable", async () => {
      attempts++;
      return result;
    }),
    result,
  );
  assert.equal(attempts, 1);
});

test("arbitrary labels cannot become public failures", async () => {
  let called = false;
  await assert.rejects(
    checked("private-password", async () => (called = true)),
    /Invalid check label/,
  );
  assert.equal(called, false);
});
