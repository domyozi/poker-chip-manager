export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseMs?: number } = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseMs = options.baseMs ?? 300;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const jitter = Math.floor(Math.random() * 100);
      const wait = baseMs * (2 ** attempt) + jitter;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastErr;
}
