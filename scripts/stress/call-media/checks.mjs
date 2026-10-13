export const failureMessages = new Set([
  "Fixture not ready",
  "Pipeline not settled",
  "Deployment changed",
  "Browser preparation failed",
  "Media failed",
  "Cleanup incomplete",
  "Stopped by operator",
  "Metrics unavailable",
  "Runtime audit unavailable",
  "Fixture state audit unavailable",
  "Pipeline metrics unavailable",
  "Resource metrics unavailable",
  "Push token audit unavailable",
  "LAN address unavailable",
  "Session audit unavailable",
]);

export async function checked(message, action) {
  if (!failureMessages.has(message)) throw new Error("Invalid check label");
  try {
    return await action();
  } catch {
    // Audit exceptions can contain database URLs, credentials or private paths.
    throw new Error(message);
  }
}
