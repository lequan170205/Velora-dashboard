import { useState } from "react";
import {
  BellRing,
  CheckCircle2,
  CircleOff,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import type {
  MonitoringAlert,
  MonitoringAlertSeverity,
  MonitoringAlertState,
} from "../../alertsApi";
import {
  alertServiceForRouting,
  metricViewForAlert,
  type AlertMetricView,
} from "../../alertRouting";
import { deploymentAlertDetails } from "../../deploymentAlertDetails";
import { useAlertsQuery } from "../../hooks/useAlertsQuery";
import {
  Button,
  CountTileSkeleton,
  EmptyState,
  RowCardsSkeleton,
} from "@/shared/components/ui";
import { cn } from "@/shared/lib/cn";

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatActiveFor = (value: string | null) => {
  if (!value) return "Start time unavailable";
  const startedAt = Date.parse(value);
  if (!Number.isFinite(startedAt)) return "Start time unavailable";

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - startedAt) / 1000),
  );
  if (elapsedSeconds < 60) return `Active for ${elapsedSeconds}s`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `Active for ${elapsedMinutes}m`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24)
    return `Active for ${elapsedHours}h ${elapsedMinutes % 60}m`;
  return `Active for ${Math.floor(elapsedHours / 24)}d ${elapsedHours % 24}h`;
};

const alertKey = (alert: MonitoringAlert) => {
  const labelKey = Object.entries(alert.labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
  return `${alert.name}:${alert.activeAt ?? "unknown"}:${labelKey}`;
};

const SEVERITY_TONE: Record<MonitoringAlertSeverity, string> = {
  critical: "bg-bad-soft text-bad",
  warning: "bg-warn-soft text-warn",
  info: "bg-blue-soft text-blue",
};

const STATE_TONE: Record<MonitoringAlertState, string> = {
  firing: "bg-bad text-white",
  pending: "bg-warn-soft text-warn",
};

type FilterValues<T extends string> = "all" | T;

function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: FilterValues<T>;
  options: readonly { value: FilterValues<T>; label: string }[];
  onChange: (value: FilterValues<T>) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </span>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 rounded-full border px-3 text-xs font-medium transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              active
                ? "border-transparent bg-brand-soft text-ink"
                : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* Counts read as one inline rail inside a single panel — value carries tone
   only when the count is non-zero, so a healthy board stays visually quiet. */
function CountRail({
  counts,
}: {
  counts: { total: number | null; firing: number | null; critical: number | null; pending: number | null } | null;
}) {
  const items = [
    { label: "active", value: counts?.total ?? null, tone: "" },
    { label: "firing", value: counts?.firing ?? null, tone: counts?.firing ? "text-bad" : "" },
    { label: "critical", value: counts?.critical ?? null, tone: counts?.critical ? "text-bad" : "" },
    { label: "pending", value: counts?.pending ?? null, tone: counts?.pending ? "text-warn" : "" },
  ];

  return (
    <div
      className="grid grid-cols-2 divide-line rounded-card border border-line bg-panel sm:grid-cols-4 sm:divide-x"
      aria-label="Active alert counts"
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5 px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
            {item.label}
          </span>
          <span
            className={cn(
              "font-mono text-xl font-semibold leading-none tabular-nums text-ink",
              item.tone,
            )}
          >
            {item.value ?? "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

type AlertsViewProps = {
  onNavigate?: (view: AlertMetricView) => void;
  onOpenLogs?: (service: string) => void;
};

export function AlertsView({ onNavigate, onOpenLogs }: AlertsViewProps) {
  const {
    response,
    alerts,
    counts,
    error,
    initialLoading,
    refreshing,
    hasUsableData,
    isStale,
    refreshNow,
  } = useAlertsQuery();

  const [stateFilter, setStateFilter] =
    useState<FilterValues<MonitoringAlertState>>("all");
  const [severityFilter, setSeverityFilter] =
    useState<FilterValues<MonitoringAlertSeverity>>("all");

  const visibleAlerts = alerts.filter(
    (alert) =>
      (stateFilter === "all" || alert.state === stateFilter) &&
      (severityFilter === "all" || alert.severity === severityFilter),
  );

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="alerts-view-title"
      aria-busy={initialLoading}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="sr-only" id="alerts-view-title">
          Active alerts
        </h2>
        <p className="text-xs text-ink-3">
          Live Prometheus rule state · resolved alerts disappear
        </p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs lowercase tabular-nums text-ink-3">
            {response?.generatedAt
              ? `${isStale ? "stale · " : ""}updated ${formatTimestamp(response.generatedAt)} · auto 15s`
              : error
                ? "unavailable"
                : "waiting for Prometheus"}
          </span>
          <button
            type="button"
            onClick={refreshNow}
            disabled={refreshing}
            aria-busy={refreshing}
            aria-label="Refresh alerts"
            title="Refresh alerts"
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-control border border-line bg-raised text-ink-2",
              "transition-colors duration-150 hover:border-line-strong hover:bg-inset hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <RefreshCw size={14} aria-hidden="true" className={refreshing ? "animate-spin" : undefined} />
          </button>
        </div>
      </div>

      {error && (
        <div
          role={isStale ? "status" : "alert"}
          className={cn(
            "flex items-start gap-2.5 rounded-card border px-4 py-3 text-[13px]",
            isStale
              ? "border-warn-soft bg-warn-soft/50"
              : "border-bad-soft bg-bad-soft/50",
          )}
        >
          <TriangleAlert
            size={16}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-warn"
          />
          <p className="leading-relaxed text-ink">
            <strong className="font-semibold">
              {isStale
                ? "Refresh failed. Showing previously loaded alert state."
                : "Alert state is temporarily unavailable."}
            </strong>{" "}
            {error}
          </p>
        </div>
      )}

      {initialLoading ? (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label="Loading active alert counts"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <CountTileSkeleton key={index} />
          ))}
        </div>
      ) : (
        <CountRail counts={counts} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <FilterChips
          label="State"
          value={stateFilter}
          onChange={setStateFilter}
          options={[
            { value: "all", label: "All" },
            { value: "firing", label: "Firing" },
            { value: "pending", label: "Pending" },
          ]}
        />
        <FilterChips
          label="Severity"
          value={severityFilter}
          onChange={setSeverityFilter}
          options={[
            { value: "all", label: "All" },
            { value: "critical", label: "Critical" },
            { value: "warning", label: "Warning" },
            { value: "info", label: "Info" },
          ]}
        />
      </div>

      {initialLoading ? (
        <RowCardsSkeleton cards={4} />
      ) : !hasUsableData && error ? (
        <EmptyState
          icon={CircleOff}
          role="alert"
          title="Alert state is temporarily unavailable."
          description="Try refreshing after monitoring-service or Prometheus is reachable again."
        />
      ) : hasUsableData && isStale && alerts.length === 0 ? (
        <EmptyState
          icon={CircleOff}
          title="Last successful check had no active alerts."
          description="Current alert state may be outdated. Refresh to check again."
        />
      ) : hasUsableData && alerts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No active alerts"
          description="No rule is currently pending or firing. This view is live state, not alert history."
        />
      ) : visibleAlerts.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="No alerts match these filters"
          description={`${alerts.length} alert${alerts.length === 1 ? "" : "s"} are hidden by the current state or severity filters.`}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visibleAlerts.map((alert) => {
            const routingService = alertServiceForRouting(alert);
            const metricView = metricViewForAlert(alert);
            const severityTone = SEVERITY_TONE[alert.severity];
            const isDeploymentAlert = routingService === "deployment";
            const {
              status: deploymentStatus,
              reason: failureReason,
              action: suggestedFix,
              failedService,
              targetSha,
              deployedSha,
            } = deploymentAlertDetails(alert);
            const logService = failedService || routingService;
            const canOpenLogs = onOpenLogs && logService !== "deployment";

            return (
              <article
                key={alertKey(alert)}
                className="flex flex-col gap-2 rounded-card border border-line bg-panel px-4 py-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        severityTone,
                      )}
                    >
                      {alert.severity}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        STATE_TONE[alert.state],
                      )}
                    >
                      {alert.state}
                    </span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-3">
                      {alert.service === "unknown"
                        ? routingService
                        : alert.service}
                    </span>
                    {isDeploymentAlert && deploymentStatus && (
                      <span className="rounded-full border border-bad-soft bg-bad-soft/50 px-2 py-0.5 font-mono text-[11px] text-bad">
                        {deploymentStatus}
                      </span>
                    )}
                    {isDeploymentAlert && failedService && (
                      <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink">
                        failed: {failedService}
                      </span>
                    )}
                  </div>
                  <time
                    className="font-mono text-xs tabular-nums text-ink-3"
                    dateTime={alert.activeAt ?? undefined}
                    title={
                      alert.activeAt
                        ? formatTimestamp(alert.activeAt)
                        : undefined
                    }
                  >
                    {formatActiveFor(alert.activeAt)}
                  </time>
                </div>

                <h3 className="text-sm font-semibold leading-snug text-ink">
                  {alert.summary}
                </h3>
                {isDeploymentAlert ? (
                  <div
                    role={alert.state === "firing" ? "alert" : undefined}
                    className="grid gap-2.5 rounded-control border border-bad-soft bg-bad-soft/30 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-bad">
                        Failure reason
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]">
                        {failureReason}
                      </p>
                    </div>
                    {suggestedFix && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                          Recommended action
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]">
                          {suggestedFix}
                        </p>
                      </div>
                    )}
                    {(targetSha || deployedSha) && (
                      <dl className="grid gap-1 border-t border-bad-soft pt-2 text-xs sm:grid-cols-2">
                        {targetSha && (
                          <div className="flex items-center justify-between gap-3 sm:justify-start">
                            <dt className="text-ink-3">Target</dt>
                            <dd
                              className="font-mono text-ink"
                              title={targetSha}
                            >
                              {targetSha.slice(0, 12)}
                            </dd>
                          </div>
                        )}
                        {deployedSha && (
                          <div className="flex items-center justify-between gap-3 sm:justify-start">
                            <dt className="text-ink-3">Last healthy</dt>
                            <dd
                              className="font-mono text-ink"
                              title={deployedSha}
                            >
                              {deployedSha.slice(0, 12)}
                            </dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                ) : alert.description ? (
                  <p className="text-[13px] leading-relaxed text-ink-2">
                    {alert.description}
                  </p>
                ) : null}
                {!isDeploymentAlert && suggestedFix && (
                  <p className="min-w-0 rounded-control bg-raised/60 px-3 py-2 text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
                    <span className="font-semibold text-ink">Suggested fix: </span>
                    {suggestedFix}
                  </p>
                )}

                <details className="group">
                  <summary className="flex w-fit list-none cursor-pointer select-none items-center gap-1 text-xs font-medium text-ink-3 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                    Rule details
                  </summary>
                  <dl className="mt-2 grid gap-x-6 gap-y-1.5 rounded-control bg-raised/60 px-3 py-2 text-xs sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-3">Rule</dt>
                      <dd className="font-mono text-ink">{alert.name}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-3">Current value</dt>
                      <dd className="font-mono tabular-nums text-ink">
                        {alert.value === null
                          ? "Unavailable"
                          : alert.value.toPrecision(4)}
                      </dd>
                    </div>
                    {targetSha && (
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <dt className="shrink-0 text-ink-3">Promoted commit</dt>
                        <dd className="min-w-0 text-right font-mono text-ink [overflow-wrap:anywhere]">
                          {targetSha}
                        </dd>
                      </div>
                    )}
                    {deployedSha && (
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <dt className="shrink-0 text-ink-3">Last healthy release</dt>
                        <dd className="min-w-0 text-right font-mono text-ink [overflow-wrap:anywhere]">
                          {deployedSha}
                        </dd>
                      </div>
                    )}
                  </dl>
                </details>

                {((onNavigate && metricView) || canOpenLogs) && (
                  <div className="flex items-center gap-2">
                    {onNavigate && metricView && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onNavigate(metricView)}
                      >
                        View metrics
                      </Button>
                    )}
                    {canOpenLogs && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenLogs(logService)}
                      >
                        View logs
                      </Button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-3">
        Prometheus rule evaluation only — Alertmanager is not deployed yet, so
        there are no silences, grouping, or external notifications.
      </p>
    </section>
  );
}
