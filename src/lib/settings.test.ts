import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "./settings";

describe("sanitizeSettings", () => {
  it("fills defaults for an empty input", () => {
    const s = sanitizeSettings({});
    expect(s).toEqual({
      email: "",
      password: "",
      outputDir: "",
      resolution: 2,
      createPdf: true,
      saveCredentials: false,
      saveMetadata: false,
      autoDownload: true,
      defaultTab: "library",
      theme: "dark",
      fontScale: 1,
      openOutputAfterDownload: false,
      showDetailsPanel: true,
    });
  });

  it("keeps valid values", () => {
    const s = sanitizeSettings({
      email: "a@b.c",
      password: "pw",
      outputDir: "C:\\books",
      resolution: 4,
      createPdf: false,
      autoDownload: false,
      defaultTab: "search",
      theme: "light",
      fontScale: 1.25,
      openOutputAfterDownload: true,
    });
    expect(s.email).toBe("a@b.c");
    expect(s.resolution).toBe(4);
    expect(s.createPdf).toBe(false);
    expect(s.autoDownload).toBe(false);
    expect(s.defaultTab).toBe("search");
    expect(s.theme).toBe("light");
    expect(s.fontScale).toBe(1.25);
    expect(s.openOutputAfterDownload).toBe(true);
  });

  it("clamps out-of-range numbers to defaults", () => {
    expect(sanitizeSettings({ resolution: 99 }).resolution).toBe(2);
    expect(sanitizeSettings({ resolution: 0 }).resolution).toBe(2);
    expect(sanitizeSettings({ fontScale: 5 }).fontScale).toBe(1);
    expect(sanitizeSettings({ fontScale: 0.1 }).fontScale).toBe(1);
  });

  it("ignores unknown keys and invalid enum values", () => {
    const s = sanitizeSettings({ theme: "blue", defaultTab: "nope", bogus: 123 });
    expect(s.theme).toBe("dark");
    expect(s.defaultTab).toBe("library");
  });

  it("survives DOM nodes leaking in through event handlers (regression)", () => {
    // simulate a React synthetic event whose target is an SVG element with a
    // circular fiber reference - the exact crash reported on Save
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const fakeEvent = { target: svg } as unknown;
    (svg as unknown as Record<string, unknown>)["__reactFiber$test"] = fakeEvent;

    const s = sanitizeSettings({ email: "a@b.c", password: fakeEvent });
    expect(s.email).toBe("a@b.c");
    expect(s.password).toBe("");
    // the sanitized output must always be JSON-serializable
    expect(() => JSON.stringify(s)).not.toThrow();
  });

  it("treats null input safely", () => {
    expect(() => sanitizeSettings(null)).not.toThrow();
    expect(sanitizeSettings(null).email).toBe("");
  });
});
