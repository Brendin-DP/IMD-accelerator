/**
 * Share one in-flight promise between concurrent callers with the same key.
 *
 * "Find or create" flows (participant assessments, response sessions) run in
 * effects; React runs effects twice in development, and two quick visits can
 * overlap in production. Both callers look, find nothing, and both insert —
 * leaving duplicate rows. Wrapping the create in `once()` makes the second
 * caller wait for and reuse the first caller's result.
 */
const inflight = new Map<string, Promise<unknown>>();

export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => {
    // Keep the result briefly so a second, slightly later caller still reuses it.
    setTimeout(() => inflight.delete(key), 2000);
  });
  inflight.set(key, promise);
  return promise;
}
