import { fetchApi } from "../../../shared/api/client";
export type CallPreset = "smoke" | "demo";
export type CallStage = {
  calls: number;
  seconds: number;
  passed: boolean;
  packetsMin: number | null;
  packetsMax: number | null;
  reportedLost: number;
  jitterMs: number | null;
  leaveReceipts: number;
  logoutRevoked: number;
};
export type CallSample = {
  at: string;
  rooms: number;
  sockets: number;
  workerCpu: number;
  callMemory: number;
  hostCpu: number;
};
export type CallRun = {
  id: string;
  preset: CallPreset;
  status: "running" | "stopping" | "passed" | "failed" | "cancelled";
  phase: string;
  source: "host-local";
  startedAt: string;
  finishedAt: string | null;
  currentCalls: number;
  progress?: { seconds: number; calls: number; stalled: boolean } | null;
  stages: CallStage[];
  samples: CallSample[];
  failure: string | null;
};
export type CallState = {
  available: true;
  busy: boolean;
  source: "host-local";
  active: CallRun | null;
  recent: CallRun[];
  fixtureParticipants: number;
  fixtureRooms: number;
};
const path = "/monitoring/stress/calls";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid runner response");
  return v as Record<string, unknown>;
}
function number(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
    throw new Error("Invalid runner measurement");
  return v;
}
function text(v: unknown): string {
  if (typeof v !== "string" || v.length > 160)
    throw new Error("Invalid runner response");
  return v;
}
function boolean(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("Invalid runner response");
  return v;
}
function nullable(v: unknown): number | null {
  return v === null ? null : number(v);
}
export function parseRun(value: unknown): CallRun {
  const v = object(value);
  if (
    !uuid.test(text(v.id)) ||
    !["smoke", "demo"].includes(text(v.preset)) ||
    !["running", "stopping", "passed", "failed", "cancelled"].includes(
      text(v.status),
    ) ||
    v.source !== "host-local" ||
    !Array.isArray(v.stages) ||
    v.stages.length > 3 ||
    !Array.isArray(v.samples) ||
    v.samples.length > 241
  )
    throw new Error("Invalid runner response");
  const progress = v.progress == null ? null : object(v.progress);
  return {
    id: text(v.id),
    preset: v.preset as CallPreset,
    status: v.status as CallRun["status"],
    phase: text(v.phase),
    source: "host-local",
    startedAt: text(v.startedAt),
    finishedAt: v.finishedAt === null ? null : text(v.finishedAt),
    currentCalls: number(v.currentCalls),
    failure: v.failure === null ? null : text(v.failure),
    progress: progress
      ? {
          seconds: number(progress.seconds),
          calls: number(progress.calls),
          stalled: boolean(progress.stalled),
        }
      : null,
    stages: v.stages.map((value) => {
      const s = object(value);
      return {
        calls: number(s.calls),
        seconds: number(s.seconds),
        passed: boolean(s.passed),
        packetsMin: nullable(s.packetsMin),
        packetsMax: nullable(s.packetsMax),
        reportedLost: number(s.reportedLost),
        jitterMs: nullable(s.jitterMs),
        leaveReceipts: number(s.leaveReceipts),
        logoutRevoked: number(s.logoutRevoked),
      };
    }),
    samples: v.samples.map((value) => {
      const s = object(value);
      return {
        at: text(s.at),
        rooms: number(s.rooms),
        sockets: number(s.sockets),
        workerCpu: number(s.workerCpu),
        callMemory: number(s.callMemory),
        hostCpu: number(s.hostCpu),
      };
    }),
  };
}
export function parseState(value: unknown): CallState {
  const v = object(value);
  if (
    v.available !== true ||
    v.source !== "host-local" ||
    !Array.isArray(v.recent) ||
    v.recent.length > 5
  )
    throw new Error("Invalid runner response");
  return {
    available: true,
    source: "host-local",
    busy: boolean(v.busy),
    active: v.active === null ? null : parseRun(v.active),
    recent: v.recent.map(parseRun),
    fixtureParticipants: number(v.fixtureParticipants),
    fixtureRooms: number(v.fixtureRooms),
  };
}
async function request(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetchApi(url, {
    ...options,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "A run is already active or still cleaning up. Refresh its status."
        : response.status === 403
          ? "An admin session from the dashboard origin is required."
          : "Call runner is unavailable. Start the server companion and refresh.",
    );
  return response.json();
}
export const getCallState = async () => parseState(await request(path));
export const startCallRun = async (preset: CallPreset, requestId: string) =>
  parseRun(
    await request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preset, requestId }),
    }),
  );
export const stopCallRun = async (id: string) => {
  if (!uuid.test(id)) throw new Error("Invalid run ID");
  return parseRun(await request(`${path}/${id}/stop`, { method: "POST" }));
};
export function callCsv(run: CallRun): string {
  const header =
    "run_id,status,scope,calls,seconds,passed,min_inbound_packets,max_inbound_packets,reported_lost,max_jitter_ms,leave_receipts,logout_revoked";
  return (
    header +
    "\n" +
    run.stages
      .map((s) =>
        [
          run.id,
          run.status,
          run.source,
          s.calls,
          s.seconds,
          s.passed,
          s.packetsMin ?? "",
          s.packetsMax ?? "",
          s.reportedLost,
          s.jitterMs ?? "",
          s.leaveReceipts,
          s.logoutRevoked,
        ].join(","),
      )
      .join("\n") +
    "\n"
  );
}
