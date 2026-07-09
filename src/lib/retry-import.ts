// Retry a dynamic import() a few times before giving up. Chunk fetches can fail
// transiently: a flaky server, a network blip, or a tab left open across a deploy
// that swapped the chunk hashes. A short backoff recovers the transient case
// without forcing a page reload; a persistent failure still rejects so the
// caller can fall back to reloading.
export async function retryImport<T>(
  load: () => Promise<T>,
  retries = 3,
  baseDelayMs = 400,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await load();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}
