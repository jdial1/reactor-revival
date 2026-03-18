import { describe, it, expect, beforeEach, vi } from "vitest";

describe("DOMMapper", () => {
  let domMapperInstance;

  beforeEach(async () => {
    vi.resetModules();
    
    // Mock window and document before importing the module
    global.window = {
      document: {
        querySelector: vi.fn(),
        getElementById: vi.fn(() => null),
        addEventListener: vi.fn(),
        readyState: 'complete'
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { href: '' }
    };
    global.document = global.window.document;

    // Now import the module which will auto-execute init()
    const module = await import("../../public/src/components/ui.js");
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
    await new Promise(resolve => setTimeout(resolve, 0));
    domMapperInstance.getRoot("#splash-container");
    expect(global.window.document.querySelector).toHaveBeenCalledWith("#splash-container");
  });
});
