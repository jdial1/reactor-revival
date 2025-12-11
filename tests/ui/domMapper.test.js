import { describe, it, expect, beforeEach, vi } from "vitest";

describe("DOMMapper", () => {
  let domMapperInstance;

  beforeEach(async () => {
    vi.resetModules();
    global.window = {
      document: {
        querySelector: vi.fn(),
        addEventListener: vi.fn(),
        readyState: 'loading'
      },
      location: { href: '' }
    };
    global.document = global.window.document;
    
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
});
