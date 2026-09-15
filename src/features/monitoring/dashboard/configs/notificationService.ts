import {
  badgeForThreshold,
  formatBytes,
  formatBytesAxis,
  formatCpu,
  formatRate,
  formatSeconds,
  toneForThreshold,
  type Tone,
} from "../../formatters";
import type { InfraViewConfig, StatCardGroupVm, StatCardVm } from "../types";

const DELIVERY_WINDOW = "rolling 5 min";

const formatNotificationRate = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0/s";
  if (value < 0.01) return "<0.01/s";
  return formatRate(value);
};

const formatSchedulerAge = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
};

export const notificationServiceConfig: InfraViewConfig = {
  id: "notification-service",
  errorTitle: "Notification-service metrics are temporarily unavailable.",
  errorMessage: "Unable to load notification-service metrics",
  toolbar: {
    eyebrow: "Notification service · APNs and delivery",
    title: "Notification service performance",
    titleId: "notification-service-observability-title",
    description:
      "Runtime health and durable delivery signals for push notifications: APNs attempts, transport failures, database reachability, and retry scheduler freshness.",
    rangeLabel: "Notification service history range",
    placement: "top",
  },
  health: (overview) => {
    const notification = overview?.notification;
    const serviceUp = notification?.up ?? null;
    const databaseUp = notification?.databaseUp ?? null;
    const schedulerAge =
      notification?.retrySchedulerCompletionAgeSeconds ?? null;
    const transportFailureRate =
      notification?.apnsTransportFailuresPerSecond ?? null;

    const tone: Tone =
      serviceUp !== true
        ? serviceUp === false
          ? "bad"
          : "neutral"
        : databaseUp === false || (schedulerAge !== null && schedulerAge > 60)
          ? "bad"
          : (transportFailureRate ?? 0) > 0 ||
              (schedulerAge !== null && schedulerAge > 15)
            ? "warn"
            : "good";

    const title =
      serviceUp === false
        ? "Notification service is offline"
        : serviceUp === null
          ? "Notification-service status is unavailable"
          : databaseUp === false
            ? "Notification database connection is unavailable"
            : schedulerAge !== null && schedulerAge > 60
              ? "Notification retry scheduler is stalled"
              : (transportFailureRate ?? 0) > 0
                ? "APNs transport failures need attention"
                : tone === "warn"
                  ? "Notification delivery is online, but worth watching"
                  : "Notification delivery is healthy";

    const detail =
      serviceUp === true
        ? "APNs rates are rolling five-minute averages. The retry scheduler normally completes a database query every few seconds."
        : "Prometheus must be able to scrape notification-service before delivery health can be trusted.";

    return { tone, label: "Quick read", title, detail };
  },
  topNote: {
    title: "How delivery is measured",
    lines: [
      "APNs traffic: rolling 5 min",
      "Database and scheduler freshness: live",
      "Process CPU and memory: notification-service only",
    ],
  },
  cardGroups: ({ overview, hasData }) => {
    const notification = overview?.notification;
    const serviceUp = notification?.up ?? null;
    const databaseUp = notification?.databaseUp ?? null;
    const schedulerAge =
      notification?.retrySchedulerCompletionAgeSeconds ?? null;
    const apnsRate = notification?.apnsRequestsPerSecond ?? null;
    const transportFailureRate =
      notification?.apnsTransportFailuresPerSecond ?? null;
    const eventLoopP99 = notification?.eventLoopP99Seconds ?? null;

    const runtimeCards: readonly StatCardVm[] = [
      {
        label: "Service status",
        value:
          serviceUp === true ? "Online" : serviceUp === false ? "Offline" : "—",
        detail: hasData ? "Prometheus scrape" : "Waiting for data",
        helper: "Can Prometheus scrape notification-service?",
        badge:
          serviceUp === true
            ? "Reachable"
            : serviceUp === false
              ? "Unreachable"
              : "Waiting",
        tone:
          serviceUp === true ? "good" : serviceUp === false ? "bad" : "neutral",
      },
      {
        label: "Database connection",
        value:
          databaseUp === true
            ? "Available"
            : databaseUp === false
              ? "Unavailable"
              : "—",
        detail: hasData ? "Retry scheduler signal" : "Waiting for data",
        helper:
          "Can the durable notification retry scheduler reach its database?",
        badge:
          databaseUp === true
            ? "Connected"
            : databaseUp === false
              ? "Outage"
              : "Waiting",
        tone:
          databaseUp === true
            ? "good"
            : databaseUp === false
              ? "bad"
              : "neutral",
      },
      {
        label: "Scheduler freshness",
        value: formatSchedulerAge(schedulerAge ?? Number.NaN),
        detail:
          schedulerAge === null
            ? "Waiting for data"
            : "Since last completed DB query",
        helper:
          "Age of the last retry scheduler run that completed its database query. Above 60 seconds is critical.",
        badge:
          schedulerAge === null
            ? "Waiting"
            : schedulerAge <= 15
              ? "Fresh"
              : schedulerAge <= 60
                ? "Watch"
                : "Stalled",
        tone: toneForThreshold(schedulerAge, 15, 60),
      },
    ];

    const deliveryCards: readonly StatCardVm[] = [
      {
        label: "APNs delivery attempts",
        value: formatNotificationRate(apnsRate ?? Number.NaN),
        detail:
          apnsRate === null
            ? "Waiting for data"
            : apnsRate === 0
              ? `No deliveries · ${DELIVERY_WINDOW}`
              : `${DELIVERY_WINDOW} average`,
        helper:
          "VoIP push attempts sent to APNs, including successful and unsuccessful responses.",
        badge: !hasData
          ? "Waiting"
          : apnsRate === null
            ? "Unavailable"
            : apnsRate === 0
              ? "Idle"
              : "Active",
        tone: "neutral",
      },
      {
        label: "APNs transport failures",
        value: formatNotificationRate(transportFailureRate ?? Number.NaN),
        detail:
          transportFailureRate === null
            ? "Waiting for data"
            : transportFailureRate === 0
              ? `None · ${DELIVERY_WINDOW}`
              : `${DELIVERY_WINDOW} average`,
        helper:
          "APNs connection timeouts or transport errors. HTTP delivery responses are tracked separately and do not count here.",
        badge:
          transportFailureRate === null
            ? "Waiting"
            : transportFailureRate === 0
              ? "None"
              : "Investigate",
        tone:
          transportFailureRate === null || transportFailureRate === 0
            ? "neutral"
            : "warn",
      },
    ];

    const processCards: readonly StatCardVm[] = [
      {
        label: "Process memory",
        value: formatBytes(notification?.residentMemoryBytes ?? Number.NaN),
        detail: hasData ? "Notification-service only" : "Waiting for data",
        helper:
          "Resident memory used by the notification-service process only.",
        badge: hasData ? "Service only" : "Waiting",
        tone: "neutral",
      },
      {
        label: "Process CPU",
        value: formatCpu(notification?.cpuUsageRatio ?? Number.NaN),
        detail: hasData ? "Whole-host share" : "Waiting for data",
        helper:
          "Share of total host CPU capacity used by notification-service.",
        badge: badgeForThreshold(notification?.cpuUsageRatio ?? null, 0.7, 0.9),
        tone: toneForThreshold(notification?.cpuUsageRatio ?? null, 0.7, 0.9),
      },
      {
        label: "Event-loop p99",
        value: formatSeconds(eventLoopP99 ?? Number.NaN),
        detail: hasData ? "Node.js responsiveness" : "Waiting for data",
        helper:
          "Delay before notification-service can react to queued work. Lower is better.",
        badge:
          eventLoopP99 === null
            ? "Waiting"
            : eventLoopP99 < 0.1
              ? "Responsive"
              : eventLoopP99 < 0.25
                ? "Watch"
                : "Delayed",
        tone: toneForThreshold(eventLoopP99, 0.1, 0.25),
      },
    ];

    return [
      {
        id: "runtime",
        heading: "Runtime",
        hint: "Live",
        gridClassName: "sm:grid-cols-3",
        cards: runtimeCards,
      },
      {
        id: "delivery",
        heading: "APNs delivery",
        hint: DELIVERY_WINDOW,
        gridClassName: "sm:grid-cols-2",
        cards: deliveryCards,
      },
      {
        id: "process",
        heading: "Process",
        hint: "Live",
        gridClassName: "sm:grid-cols-3",
        cards: processCards,
      },
    ];
  },
  historyHeading: {
    title: "History",
    hint: "APNs rates are rolling 5-minute averages",
  },
  series: [
    {
      metric: "notification_apns_request_rate",
      title: "APNs delivery attempts / second",
      question: "How much VoIP push traffic is being sent?",
      description:
        "All APNs VoIP delivery attempts, including successful responses and failures.",
      formatter: formatNotificationRate,
      axisFormatter: formatNotificationRate,
      accentToken: "indigo",
      emptyTitle: "No APNs delivery traffic yet",
      emptyDescription:
        "This is normal until an iOS VoIP notification is sent.",
      emptyStateKind: "no-traffic",
    },
    {
      metric: "notification_apns_transport_failure_rate",
      title: "APNs transport failures / second",
      question: "Are connections to APNs timing out or failing?",
      description:
        "Only connection timeouts and transport errors are included. Two failures in five minutes produce a dashboard alert.",
      formatter: formatNotificationRate,
      axisFormatter: formatNotificationRate,
      accentToken: "amber",
      emptyTitle: "No APNs transport failures",
      emptyDescription:
        "No APNs timeout or transport-failure history is available in this range.",
      emptyStateKind: "no-traffic",
    },
    {
      metric: "notification_retry_scheduler_completion_age_seconds",
      title: "Retry scheduler freshness",
      question:
        "Is the durable retry scheduler still completing database work?",
      description:
        "Seconds since the last retry scheduler run that completed its database query. Above 60 seconds is critical.",
      formatter: formatSchedulerAge,
      axisFormatter: formatSchedulerAge,
      accentToken: "blue",
      emptyTitle: "No scheduler freshness history yet",
      emptyDescription:
        "Prometheus will populate this shortly after notification-service is scraped.",
    },
    {
      metric: "notification_event_loop_p99",
      title: "Notification service event-loop p99",
      question: "Can the delivery process react quickly?",
      description:
        "p99 Node.js event-loop delay for notification-service. Sustained delay can postpone retries or delivery work.",
      formatter: formatSeconds,
      axisFormatter: formatSeconds,
      accentToken: "teal",
      emptyTitle: "No event-loop history yet",
      emptyDescription:
        "Event-loop samples appear after Prometheus collects notification-service metrics.",
    },
    {
      metric: "notification_cpu",
      title: "Notification service CPU",
      question: "How busy is the notification process?",
      description:
        "Share of total host CPU capacity used by notification-service.",
      formatter: formatCpu,
      axisFormatter: formatCpu,
      accentToken: "indigo",
      emptyTitle: "No notification CPU history yet",
      emptyDescription:
        "Prometheus will populate this chart after collecting notification-service samples.",
    },
    {
      metric: "notification_memory",
      title: "Notification service memory",
      question: "Is notification-service memory growing over time?",
      description: "Resident memory used by notification-service only.",
      formatter: formatBytes,
      axisFormatter: formatBytesAxis,
      accentToken: "blue",
      emptyTitle: "No notification memory history yet",
      emptyDescription:
        "Memory history appears after Prometheus has scraped notification-service for a short time.",
    },
  ],
  currentValues: (overview) => {
    const notification = overview?.notification;
    return {
      notification_apns_request_rate: {
        value: notification?.apnsRequestsPerSecond,
      },
      notification_apns_transport_failure_rate: {
        value: notification?.apnsTransportFailuresPerSecond,
      },
      notification_retry_scheduler_completion_age_seconds: {
        value: notification?.retrySchedulerCompletionAgeSeconds,
      },
      notification_event_loop_p99: { value: notification?.eventLoopP99Seconds },
      notification_cpu: { value: notification?.cpuUsageRatio },
      notification_memory: { value: notification?.residentMemoryBytes },
    };
  },
  technicalDetails: (overview) => {
    const notification = overview?.notification;
    return {
      summary: "Technical details for notification-service",
      rows: [
        {
          label: "Database signal",
          value:
            notification?.databaseUp === true
              ? "Available"
              : notification?.databaseUp === false
                ? "Unavailable"
                : "—",
        },
        {
          label: "Scheduler freshness",
          value: formatSchedulerAge(
            notification?.retrySchedulerCompletionAgeSeconds ?? Number.NaN,
          ),
        },
        {
          label: "APNs transport failures",
          value: formatNotificationRate(
            notification?.apnsTransportFailuresPerSecond ?? Number.NaN,
          ),
        },
      ],
      note: "A push delivery failure remains in the durable outbox for retry. This view does not expose device tokens, call IDs, or payload data.",
    };
  },
};
