import { describe, expect, it } from "vitest";
import { parseBookId } from "./utils";

describe("parseBookId", () => {
  it("passes through a raw identifier", () => {
    expect(parseBookId("cannibalsnovelab0000keef")).toBe("cannibalsnovelab0000keef");
  });

  it("extracts the identifier from a /details/ URL", () => {
    expect(parseBookId("https://archive.org/details/ComiqueMagazine1")).toBe("ComiqueMagazine1");
  });

  it("handles URL fragments and query strings", () => {
    expect(parseBookId("https://archive.org/details/ComiqueMagazine1/page/n1/mode/2up")).toBe(
      "ComiqueMagazine1"
    );
    expect(parseBookId("https://archive.org/details/book?id=1")).toBe("book");
  });

  it("falls back to the last path segment for non-archive URLs", () => {
    expect(parseBookId("https://example.com/foo/bar")).toBe("bar");
  });

  it("trims whitespace", () => {
    expect(parseBookId("  cannibalsnovelab0000keef  ")).toBe("cannibalsnovelab0000keef");
  });
});
