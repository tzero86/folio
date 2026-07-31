export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 200): TtlCache<T> {
  const map = new Map<string, { value: T; ts: number }>();

  return {
    get(key: string): T | undefined {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (Date.now() - entry.ts > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      if (map.size >= maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, { value, ts: Date.now() });
    },
    clear(): void {
      map.clear();
    },
  };
}
