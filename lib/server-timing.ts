// Per-request, opt-in diagnostics. Durations only; no IDs or team contents.
export class ServerTiming {
  private start = performance.now();
  private values: Record<string, number> = {};
  constructor(private enabled = false) {}
  mark(name: string) {
    if (this.enabled) this.values[name] = performance.now() - this.start;
  }
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.values[name] = (this.values[name] || 0) + performance.now() - start;
    }
  }
  header() {
    return Object.entries(this.values)
      .map(([name, value]) => name + ';dur=' + value.toFixed(2))
      .join(', ');
  }
}
