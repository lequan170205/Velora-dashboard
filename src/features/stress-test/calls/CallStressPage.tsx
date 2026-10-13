import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play, RefreshCw, Square } from "lucide-react";
import { Button } from "../../../shared/components/ui/button";
import { Card, CardContent } from "../../../shared/components/ui/card";
import { Badge } from "../../../shared/components/ui/badge";
import { Label } from "../../../shared/components/ui/label";
import { NativeSelect } from "../../../shared/components/ui/input";
import { useOverviewQuery } from "../../monitoring/hooks/useOverviewQuery";
import { formatBytes, formatPercent } from "../../monitoring/formatters";
import {
  callCsv,
  callStageResult,
  getCallState,
  startCallRun,
  stopCallRun,
  type CallPreset,
  type CallRun,
} from "./api";
import { HistoryChart } from "../../monitoring/dashboard/components/HistoryChart";
import { withStressLock } from "../run-lock";
const queryKey = ["call-stress-status"];
function download(run: CallRun, format: "json" | "csv") {
  const url = URL.createObjectURL(
    new Blob(
      [format === "json" ? JSON.stringify(run, null, 2) : callCsv(run)],
      { type: format === "json" ? "application/json" : "text/csv" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `velora-call-${run.id}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const phases: Record<string, string> = {
  preflight: "Checking fixture and server",
  prepare: "Preparing isolated browser",
  setup: "Connecting calls",
  measuring: "Measuring inbound audio",
  cleanup: "Leaving calls and signing out",
  finished: "Finished",
};
export function CallStressPage() {
  const [preset, setPreset] = useState<CallPreset>("smoke");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CallRun | null>(null);
  const submitting = useRef(false);
  const client = useQueryClient();
  const status = useQuery({
    queryKey,
    queryFn: getCallState,
    refetchInterval: 5000,
    retry: false,
  });
  const monitoring = useOverviewQuery("Unable to load call observation");
  const active = status.data?.active;
  const run = active ?? selected ?? status.data?.recent[0] ?? null;
  const busy = pending || Boolean(status.data?.busy);
  async function mutate(action: "start" | "stop") {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result =
        action === "start"
          ? await withStressLock(() =>
              startCallRun(preset, crypto.randomUUID()),
            )
          : active
            ? await stopCallRun(active.id)
            : null;
      if (result) setSelected(result);
      await client.invalidateQueries({ queryKey });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request failed. Refresh the runner status.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
      void client.invalidateQueries({ queryKey });
    }
  }
  // Prefer refreshed terminal state over the snapshot returned by Start.
  const display =
    run && (status.data?.recent.find((r) => r.id === run.id) ?? run);
  const observed = monitoring.data;
  const sample = display?.samples.at(-1);
  const metrics = [
    ["SFU rooms", observed?.call.mediaRooms ?? null, "Active routers"],
    [
      "Call sockets",
      observed?.call.socketConnections ?? null,
      "Two endpoints per call",
    ],
    [
      "Worker CPU",
      observed?.call.mediaWorkerCpuRatio == null
        ? null
        : formatPercent(observed.call.mediaWorkerCpuRatio),
      "Rate over 1 minute, one CPU core",
    ],
    [
      "Call memory",
      observed?.call.residentMemoryBytes == null
        ? null
        : formatBytes(observed.call.residentMemoryBytes),
      "Node RSS, excludes SFU worker",
    ],
    [
      "Host CPU",
      observed?.host.cpuUsageRatio == null
        ? null
        : formatPercent(observed.host.cpuUsageRatio),
      "Monitored Docker host/VM, all cores",
    ],
  ];
  return (
    <section className="space-y-5" aria-labelledby="call-stress-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-3">
            Demo tools / Call media
          </p>
          <h1 id="call-stress-title" className="mt-1 text-2xl font-semibold">
            Call stress test
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-2">
            Synthetic voice through real Call Service and mediasoup SFU. Start,
            observe and export a bounded run from this dashboard.
          </p>
        </div>
        <Badge
          tone={
            display?.status === "passed"
              ? "good"
              : display?.status === "failed"
                ? "bad"
                : busy
                  ? "info"
                  : "neutral"
          }
        >
          {status.isError
            ? "Runner unavailable"
            : status.isPending
              ? "Checking runner"
              : (active?.status ?? display?.status ?? "Ready")}
        </Badge>
      </div>
      <div className="rounded-card border border-line bg-raised p-4 text-sm text-ink-2">
        <strong className="text-ink">Host-local media.</strong> Clients run on
        the Docker host with a private ICE candidate override. This measures SFU
        voice handling; public UDP/TURN, native call UI, push delivery and video
        are separate tests.
      </div>
      {(error || status.isError) && (
        <p
          role="alert"
          className="rounded-card border border-bad/30 bg-bad-soft p-4 text-sm text-bad"
        >
          {error ??
            (status.error instanceof Error
              ? status.error.message
              : "Runner status unavailable")}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-5">
            <div>
              <h2 className="font-semibold">Run configuration</h2>
              <p className="mt-1 text-sm text-ink-2">
                Dedicated test groups, two participants per call. One server run
                at a time.
              </p>
            </div>
            <div>
              <Label htmlFor="call-preset">Preset</Label>
              <NativeSelect
                id="call-preset"
                value={preset}
                disabled={busy}
                onChange={(e) => setPreset(e.target.value as CallPreset)}
              >
                <option value="smoke">Smoke: 1 call, 20 seconds</option>
                <option value="demo">Ramp: 1 → 3 → 5 calls</option>
              </NativeSelect>
            </div>
            <div className="rounded-control border border-line bg-raised p-3 text-sm">
              <p className="font-medium">
                {preset === "smoke"
                  ? "2 endpoints, 20s of media"
                  : "2 → 6 → 10 endpoints, 80s of media"}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Setup and cleanup add time. First run also downloads an isolated
                test browser.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="h-11 flex-1"
                disabled={busy || !status.data || status.isError}
                onClick={() => void mutate("start")}
              >
                <Play size={16} aria-hidden="true" />
                Start test
              </Button>
              <Button
                variant="danger"
                className="h-11"
                disabled={!active || pending || active.status === "stopping"}
                onClick={() => void mutate("stop")}
              >
                <Square size={16} aria-hidden="true" />
                Stop
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={status.isFetching}
              onClick={() => void status.refetch()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Refresh runner
            </Button>
            <p className="text-xs leading-relaxed text-ink-3">
              The server run continues if you leave this page. Stop waits for
              call cleanup. Your dashboard session refreshes automatically;
              fixture passwords stay on the companion in memory.
            </p>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
            {metrics.map(([label, value, detail]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className="text-sm text-ink-2">{label}</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                    {monitoring.isError ? "—" : (value ?? "—")}
                  </p>
                  <p className="mt-2 text-xs text-ink-3">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">Run progress</h2>
                <p className="text-xs text-ink-3">
                  {observed && !monitoring.isError
                    ? `Metrics ${new Date(observed.generatedAt).toLocaleTimeString()}`
                    : "Metrics unavailable"}
                </p>
              </div>
              <p
                role="status"
                aria-live="polite"
                className="mt-3 text-sm text-ink-2"
              >
                {display
                  ? `${phases[display.phase] ?? display.phase}${display.currentCalls ? ` · ${display.currentCalls} call(s)` : ""}${display.progress ? ` · ${display.progress.seconds}s measured` : ""}`
                  : "Start with a smoke test."}
              </p>
              {display?.failure && (
                <p role="alert" className="mt-3 text-sm text-bad">
                  {display.failure}
                </p>
              )}
              {display?.progress?.stalled && (
                <p className="mt-2 text-sm text-warn">
                  Inbound media stopped growing. This stage cannot pass.
                </p>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink-3">
                      {[
                        "Calls",
                        "Media time",
                        "Inbound packets",
                        "Reported loss",
                        "Max jitter",
                        "Leave / logout",
                        "Result",
                      ].map((t) => (
                        <th key={t} className="pb-3 pr-3 font-medium">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(preset === "demo" || display?.preset === "demo"
                      ? [1, 3, 5]
                      : [1]
                    ).map((calls) => {
                      const s = display?.stages.find((s) => s.calls === calls);
                      const result =
                        display && s ? callStageResult(display, s) : null;
                      return (
                        <tr
                          key={calls}
                          className="border-b border-line last:border-0"
                        >
                          <th className="py-3 font-medium">{calls}</th>
                          <td>{s?.seconds ?? (calls === 1 ? 20 : 30)}s</td>
                          <td className="font-mono">
                            {s?.packetsMin == null
                              ? "—"
                              : `${s.packetsMin}–${s.packetsMax}`}
                          </td>
                          <td>{s?.reportedLost ?? "—"}</td>
                          <td>
                            {s?.jitterMs == null
                              ? "—"
                              : `${s.jitterMs.toFixed(1)} ms`}
                          </td>
                          <td>
                            {s
                              ? `${s.leaveReceipts}/${calls} · ${s.logoutRevoked}/${calls * 2}`
                              : "—"}
                          </td>
                          <td>
                            {result ? (
                              <Badge tone={result.tone}>{result.label}</Badge>
                            ) : active?.currentCalls === calls ? (
                              "Running"
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-ink-3">
                Packets show the range across receiving endpoints. Every 5s
                sample must grow. Loss and jitter are browser RTC measurements,
                not a perceptual audio score.
              </p>
              {display && (
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!display.finishedAt}
                    onClick={() => download(display, "json")}
                  >
                    <Download size={14} aria-hidden="true" />
                    JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!display.finishedAt}
                    onClick={() => download(display, "csv")}
                  >
                    <Download size={14} aria-hidden="true" />
                    CSV
                  </Button>
                </div>
              )}
              {sample && (
                <p className="mt-3 text-xs text-ink-3">
                  Last saved resource sample:{" "}
                  {new Date(sample.at).toLocaleTimeString()} ·{" "}
                  {display?.samples.length} samples included in JSON.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          {
            key: "rooms" as const,
            title: "SFU rooms during run",
            question: "Did concurrent calls reach the intended stage?",
            description:
              "Gauge sampled every 5s; setup and cleanup are included.",
            format: (value: number) => String(Math.round(value)),
            token: "blue" as const,
          },
          {
            key: "workerCpu" as const,
            title: "SFU worker CPU during run",
            question: "How did media load affect the worker?",
            description:
              "Rate over 1 minute, one CPU core; the load generator shares this host.",
            format: formatPercent,
            token: "teal" as const,
          },
        ].map((chart) => (
          <HistoryChart
            key={chart.key}
            metric={chart.key}
            title={chart.title}
            question={chart.question}
            description={chart.description}
            points={(display?.samples ?? []).map((s) => ({
              timestamp: Date.parse(s.at),
              value: s[chart.key],
            }))}
            valueFormatter={chart.format}
            axisFormatter={chart.format}
            accentToken={chart.token}
            emptyTitle="No saved samples yet"
            emptyDescription="Samples start when the test browser is ready."
            now={Date.now()}
          />
        ))}
      </div>
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Saved server runs</h2>
            <span className="text-xs text-ink-3">
              Last 5 during companion lifetime
            </span>
          </div>
          {!status.data?.recent.length ? (
            <p className="mt-3 text-sm text-ink-2">
              Completed and failed runs appear here.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {status.data.recent.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {r.preset} · {new Date(r.startedAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {r.status} · {r.stages.filter((s) => s.passed).length}/
                      {r.preset === "demo" ? 3 : 1} stages passed
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(active)}
                    onClick={() => setSelected(r)}
                  >
                    View result
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
