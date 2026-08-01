import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./cache";

describe("createTtlCache", () => {
  it("stores and retrieves values", () => {
    const cache = createTtlCache<string>(1000);
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
  });

  it("returns undefined for missing keys", () => {
    const cache = createTtlCache<string>(1000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    const cache = createTtlCache<string>(1000);
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("evicts the oldest entry when at capacity", () => {
    const cache = createTtlCache<string>(1000, 2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
  });

  it("clear empties the cache", () => {
    const cache = createTtlCache<string>(1000);
    cache.set("a", "1");
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
  });
});
