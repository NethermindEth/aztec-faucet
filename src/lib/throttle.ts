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
    const assetHistory = this.history.get(key);
    if (!assetHistory) return;

    const timestamps = assetHistory.get(asset);
    if (!timestamps || timestamps.length === 0) return;

    const now = this.timeFn();
    const recent = timestamps.filter((t) => now - t < this.intervalMs);

    if (recent.length >= this.maxCount) {
      // Retry after the oldest timestamp in the window expires
      const oldest = Math.min(...recent);
      throw new ThrottleError(asset, this.intervalMs - (now - oldest));
    }
  }

  record(key: string, asset: string): void {
    if (!this.history.has(key)) {
      this.history.set(key, new Map());
    }
    const assetHistory = this.history.get(key)!;
    if (!assetHistory.has(asset)) {
      assetHistory.set(asset, []);
    }
    const now = this.timeFn();
    // Prune expired entries to keep memory bounded, then append
    const pruned = assetHistory.get(asset)!.filter((t) => now - t < this.intervalMs);
    pruned.push(now);
    assetHistory.set(asset, pruned);
  }
}
