import { randomUUID } from "node:crypto";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class JobConflict extends Error {}
export function startInput(body) {
  if (
    !body ||
    Object.keys(body).sort().join(",") !== "preset,requestId" ||
    !["smoke", "demo"].includes(body.preset) ||
    !UUID.test(body.requestId)
  )
    throw new Error("Invalid test preset");
  return body;
}
export class CallJobStore {
  constructor(
    execute,
    { now = () => new Date().toISOString(), onFinished = async () => {} } = {},
  ) {
    this.execute = execute;
    this.now = now;
    this.onFinished = onFinished;
    this.active = null;
    this.recent = [];
    this.keys = new Map();
  }
  start(actor, body) {
    const input = startInput(body),
      key = actor + ":" + input.requestId,
      previous = this.keys.get(key);
    if (previous) {
      if (previous.preset !== input.preset)
        throw new JobConflict("Request identity changed");
      return previous;
    }
    if (this.active) throw new JobConflict("A run is active");
    const job = {
      id: randomUUID(),
      preset: input.preset,
      status: "running",
      phase: "preflight",
      source: "host-local",
      startedAt: this.now(),
      finishedAt: null,
      currentCalls: 0,
      stages: [],
      samples: [],
      failure: null,
    };
    const abort = new AbortController();
    this.active = { job, abort };
    this.keys.set(key, job);
    Promise.resolve()
      .then(() =>
        this.execute(job, abort.signal, (patch) => Object.assign(job, patch)),
      )
      .then(() => {
        job.status = abort.signal.aborted ? "cancelled" : "passed";
      })
      .catch(() => {
        job.status = abort.signal.aborted ? "cancelled" : "failed";
        job.failure ??= "Test or cleanup did not complete";
      })
      .finally(async () => {
        job.phase = "finished";
        job.finishedAt = this.now();
        try {
          await this.onFinished(job);
        } catch {
          job.status = "failed";
          job.failure = "Result storage unavailable";
        }
        this.recent = [job, ...this.recent].slice(0, 5);
        this.active = null;
        for (const [k, v] of this.keys)
          if (!this.recent.includes(v)) this.keys.delete(k);
      });
    return job;
  }
  stop(id) {
    if (this.active?.job.id !== id)
      throw new JobConflict("No matching active run");
    this.active.job.status = "stopping";
    this.active.job.phase = "cleanup";
    this.active.abort.abort();
    return this.active.job;
  }
  state() {
    return {
      available: true,
      busy: Boolean(this.active),
      source: "host-local",
      active: this.active?.job ?? null,
      recent: this.recent,
    };
  }
}
