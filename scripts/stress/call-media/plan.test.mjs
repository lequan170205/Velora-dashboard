import assert from "node:assert/strict";
import { test } from "node:test";
import { choosePairs, safeFailure } from "./plan.mjs";
test("pairs never share users even across overlapping rooms", () => {
  const config = {
    rooms: [
      { id: "a", participantIds: ["u", "v"] },
      { id: "b", participantIds: ["u", "w"] },
      { id: "c", participantIds: ["x", "y"] },
    ],
  };
  const p = choosePairs(config, 2);
  assert.deepEqual(
    p.map((x) => x.roomId),
    ["a", "c"],
  );
  assert.equal(new Set(p.flatMap((x) => [x.caller, x.callee])).size, 4);
  assert.throws(() => choosePairs(config, 3));
  assert.throws(() => choosePairs(config, 21), /1\.\.20 concurrent/);
  assert.throws(() => choosePairs(config, 0));
});
test("unknown errors never expose credentials or server messages", () => {
  assert.equal(
    safeFailure(new Error("secret token and password")),
    "unexpected failure (details withheld)",
  );
  assert.equal(
    safeFailure(new Error("accept refused with private details")),
    "accept refused",
  );
});
test("twenty disjoint pairs can be chosen from twenty rooms", () => {
  const rooms = Array.from({ length: 20 }, (_, i) => ({
    id: `r${i}`,
    participantIds: [`a${i}`, `b${i}`, `c${i}`],
  }));
  const pairs = choosePairs({ rooms }, 20);
  assert.equal(pairs.length, 20);
  assert.equal(new Set(pairs.flatMap((x) => [x.caller, x.callee])).size, 40);
});
