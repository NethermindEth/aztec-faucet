export class ThrottleError extends Error {
  /** Milliseconds until the next drip is allowed */
  retryAfter: number;

  constructor(asset: string, retryAfter: number) {
    const label = asset === "fee-juice" ? "Fee Juice" : asset.toUpperCase();
    super(`You've already requested ${label} recently. Please try again later.`);
    this.retryAfter = retryAfter;
  }
}

export class Throttle {
  /** key → asset → sorted list of drip timestamps within the window */
  private history = new Map<string, Map<string, number[]>>();

  constructor(
    private intervalMs: number,
    private maxCount: number = 1,
    private timeFn: () => number = Date.now,
  ) {}

  check(key: string, asset: string): void {
    if (this.intervalMs <= 0) return;

    const assetHistory = this.history.get(key);
    if (!assetHistory) return;

    const timestamps = assetHistory.get(asset);
    if (!timestamps || timestamps.length === 0) return;

    const now = this.timeFn();
    const recent = timestamps.filter((t) => now - t < this.intervalMs);

    if (recent.length === 0) {
      // All timestamps expired — clean up to avoid leaking dead keys.
      assetHistory.delete(asset);
      if (assetHistory.size === 0) this.history.delete(key);
      return;
    }

    if (recent.length >= this.maxCount) {
      // Retry after the oldest timestamp in the window expires
      const oldest = Math.min(...recent);
      throw new ThrottleError(asset, this.intervalMs - (now - oldest));
    }
  }

  record(key: string, asset: string): void {
    if (this.intervalMs <= 0) return;

    if (!this.history.has(key)) {
      this.history.set(key, new Map());
    }
    const assetHistory = this.history.get(key)!;
    const now = this.timeFn();
    // Prune expired entries to keep the inner array bounded, then append.
    const pruned = (assetHistory.get(asset) ?? []).filter((t) => now - t < this.intervalMs);
    pruned.push(now);
    assetHistory.set(asset, pruned);
  }

  /**
   * Periodic sweep: remove inner asset entries with no live timestamps,
   * then drop outer keys whose inner Map is empty. Bounds memory growth
   * for keys that drip once and never return.
   */
  pruneStale(): void {
    if (this.intervalMs <= 0) {
      // Rate limiting disabled — nothing to track.
      this.history.clear();
      return;
    }
    const now = this.timeFn();
    for (const [key, assetHistory] of this.history) {
      for (const [asset, timestamps] of assetHistory) {
        const recent = timestamps.filter((t) => now - t < this.intervalMs);
        if (recent.length === 0) {
          assetHistory.delete(asset);
        } else if (recent.length !== timestamps.length) {
          assetHistory.set(asset, recent);
        }
      }
      if (assetHistory.size === 0) {
        this.history.delete(key);
      }
    }
  }

  /** Diagnostic: number of distinct keys currently tracked. */
  size(): number {
    return this.history.size;
  }
}
