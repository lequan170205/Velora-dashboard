// Serialize load generators across dashboard tabs; never queue a second Start.
export async function withStressLock<T>(execute: () => Promise<T>): Promise<T> {
  if (!navigator.locks)
    throw new Error("Use a browser that supports Web Locks for stress tests.");
  return navigator.locks.request(
    "velora-stress-run",
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw new Error("Another dashboard tab is running a stress test.");
      return execute();
    },
  );
}
