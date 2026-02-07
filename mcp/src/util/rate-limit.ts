export class RateLimiter {
  private nextAllowedAt = 0;

  constructor(private readonly minIntervalMs = 200) {}

  async take(): Promise<void> {
    const now = Date.now();
    if (now < this.nextAllowedAt) {
      await new Promise((resolve) => setTimeout(resolve, this.nextAllowedAt - now));
    }
    this.nextAllowedAt = Date.now() + this.minIntervalMs;
  }
}
