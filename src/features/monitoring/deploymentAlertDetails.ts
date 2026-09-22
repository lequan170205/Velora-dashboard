import type { MonitoringAlert } from "./alertsApi";

const valueOrNull = (value: string | undefined) => value?.trim() || null;

export const deploymentAlertDetails = (
  alert: Pick<MonitoringAlert, "annotations" | "description" | "labels">,
) => {
  const failedService = valueOrNull(alert.labels.failed_service);

  return {
    status: valueOrNull(alert.labels.status),
    reason:
      valueOrNull(alert.annotations.reason) ||
      valueOrNull(alert.labels.reason) ||
      valueOrNull(alert.description) ||
      "The deploy failed without a diagnostic reason.",
    action:
      valueOrNull(alert.annotations.action) ||
      valueOrNull(alert.labels.action),
    failedService:
      failedService && failedService !== "none" ? failedService : null,
    targetSha: valueOrNull(alert.labels.target_sha),
    deployedSha: valueOrNull(alert.labels.deployed_sha),
  };
};
