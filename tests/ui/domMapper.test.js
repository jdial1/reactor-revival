import { describe, it, expect, beforeEach, vi } from "vitest";

describe("DOMMapper", () => {
  let domMapperInstance;

  beforeEach(async () => {
    vi.resetModules();
    
    // Mock window and document before importing the module
    global.window = {
      document: {
        querySelector: vi.fn(),
        addEventListener: vi.fn(),
        // FIX: Change 'loading' to 'complete' to prevent init() from waiting forever for an event that won't fire
        readyState: 'complete'
      },
      location: { href: '' }
    };
    global.document = global.window.document;

    // Now import the module which will auto-execute init()
    const module = await import("../../public/src/components/domMapper.js");
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
    // Wait for microtasks to clear so init() promise has a chance to run
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(global.window.document.querySelector).toHaveBeenCalled();
  });
});
