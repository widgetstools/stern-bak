import { describe, expect, it } from "vitest";
import { loadConfig, parseLiveMode } from "./config.js";

describe("parseLiveMode", () => {
  it("defaults to legacy", () => {
    const config = loadConfig();
    expect(parseLiveMode(config, undefined)).toBe("legacy");
  });

  it("accepts sparse and sparse-erratic", () => {
    const config = loadConfig();
    expect(parseLiveMode(config, "sparse")).toBe("sparse");
    expect(parseLiveMode(config, "sparse-erratic")).toBe("sparse");
    expect(parseLiveMode(config, "legacy")).toBe("legacy");
  });
});
