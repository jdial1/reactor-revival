import { describe, it, expect, beforeAll, vi } from "vitest";

describe("DOMMapper", () => {
  let domMapperInstance;

  beforeAll(async () => {
    const module = await import("@app/components/ui.js");
    domMapperInstance = module.default;
  });

  it("should be defined", () => {
    expect(domMapperInstance).toBeDefined();
  });

  it("should have init method", () => {
    expect(domMapperInstance).not.toBeNull();
    expect(typeof domMapperInstance.init).toBe("function");
  });

  it("should initialize and query static elements", async () => {
    const querySpy = vi.spyOn(document, "querySelector");
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      domMapperInstance.getRoot("#splash-container");
      expect(querySpy).toHaveBeenCalledWith("#splash-container");
    } finally {
      querySpy.mockRestore();
    }
  });
});
