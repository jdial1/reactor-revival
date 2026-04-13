import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, vi } from "../../helpers/setup.js";
import { formatNumber, StorageUtils } from "@app/utils.js";
import { preferences } from "@app/state.js";
import { createTutorialManager } from "@app/components/ui-tooltips-tutorial.js";

describe("Group 15: Accessibility and Dynamic Preferences", () => {
  let game;
  let document;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    document = setup.document;
  });

  afterEach(() => {
    document.documentElement.style.removeProperty("--prefers-reduced-motion");
    document.getElementById("tutorial-overlay")?.remove();
    document.getElementById("tutorial-callout")?.remove();
    document.body.classList.remove("tutorial-claim-step");
    StorageUtils.remove("reactorTutorialStep");
    StorageUtils.remove("reactorTutorialCompleted");
    vi.restoreAllMocks();
  });

  it("maps reduced motion preference to root CSS custom property", () => {
    preferences.reducedMotion = true;
    document.documentElement.style.setProperty(
      "--prefers-reduced-motion",
      preferences.reducedMotion ? "reduce" : "no-preference"
    );
    expect(document.documentElement.style.getPropertyValue("--prefers-reduced-motion").trim()).toBe("reduce");
    preferences.reducedMotion = false;
    document.documentElement.style.setProperty(
      "--prefers-reduced-motion",
      preferences.reducedMotion ? "reduce" : "no-preference"
    );
    expect(document.documentElement.style.getPropertyValue("--prefers-reduced-motion").trim()).toBe("no-preference");
  });

  it("keeps objectives toast aria-expanded aligned with rendered state", async () => {
    await game.router.loadPage("reactor_section");
    const base = {
      sandbox: false,
      title: "1: Test objective",
      claimText: "Claim",
      reward: null,
      progressPercent: 0,
      isComplete: false,
      isActive: true,
      hasProgressBar: false,
      hidden: false,
    };
    game.ui.objectiveController._render({ ...base, isExpanded: true });
    let toastBtn = document.getElementById("objectives_toast_btn");
    expect(toastBtn?.getAttribute("aria-expanded")).toBe("true");
    game.ui.objectiveController._render({ ...base, isExpanded: false });
    toastBtn = document.getElementById("objectives_toast_btn");
    expect(toastBtn?.getAttribute("aria-expanded")).toBe("false");
  });

  it("formats scientific numbers without NaN for large magnitudes", () => {
    const s = formatNumber(1500000, { style: "scientific", places: 2 });
    expect(s).toBe("1.50e+6");
    const huge = formatNumber(Number.MAX_VALUE, { style: "scientific", places: 2 });
    expect(huge).not.toContain("NaN");
  });

  describe("Tutorial runtime", () => {
    it("positions spotlight border from getBoundingClientRect math", () => {
      const game = {
        ui: {
          getTutorialTarget: () => null,
        },
      };
      const tm = createTutorialManager(game);
      tm.steps = [{ key: "spot", message: "m", completion: () => false, onEnter: () => {} }];
      tm.createOverlay();
      tm.updateSpotlight({ top: 10, left: 20, width: 100, height: 40, right: 120, bottom: 50 });
      const border = tm.overlay.querySelector(".tutorial-focus-border");
      expect(border.style.top).toBe("2px");
      expect(border.style.left).toBe("12px");
      expect(border.style.width).toBe("116px");
      expect(border.style.height).toBe("56px");
    });

    it("registers and removes resize and scroll listeners around a spotlight step", () => {
      const target = document.createElement("div");
      document.body.appendChild(target);
      target.getBoundingClientRect = () => ({
        top: 4,
        left: 4,
        width: 20,
        height: 20,
        right: 24,
        bottom: 24,
      });
      const game = { ui: { getTutorialTarget: (key) => (key === "spot" ? target : null) } };
      const tm = createTutorialManager(game);
      tm.steps = [{ key: "spot", message: "m", completion: () => false, onEnter: () => {} }];
      const addSpy = vi.spyOn(window, "addEventListener");
      const removeSpy = vi.spyOn(window, "removeEventListener");
      tm.showStep(0);
      expect(addSpy.mock.calls.some((c) => c[0] === "resize")).toBe(true);
      expect(addSpy.mock.calls.some((c) => c[0] === "scroll")).toBe(true);
      tm.hideSpotlight();
      expect(removeSpy.mock.calls.some((c) => c[0] === "resize")).toBe(true);
      expect(removeSpy.mock.calls.some((c) => c[0] === "scroll")).toBe(true);
    });

    it("advances when the target element is missing so the tutorial does not stall", () => {
      const target = document.createElement("div");
      document.body.appendChild(target);
      target.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        width: 8,
        height: 8,
        right: 8,
        bottom: 8,
      });
      const game = { ui: { getTutorialTarget: (key) => (key === "b" ? target : null) } };
      const tm = createTutorialManager(game);
      tm.steps = [
        { key: "a", message: "m", completion: () => false, onEnter: () => {} },
        { key: "b", message: "m2", completion: () => false, onEnter: () => {} },
      ];
      const spy = vi.spyOn(tm, "showStep");
      tm.showStep(0);
      expect(tm.currentStep).toBe(1);
      expect(spy).toHaveBeenCalledWith(1);
    });

    it("complete tears down overlay nodes and clears persisted step", async () => {
      StorageUtils.set("reactorTutorialStep", 0);
      const target = document.createElement("div");
      document.body.appendChild(target);
      target.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        width: 10,
        height: 10,
        right: 10,
        bottom: 10,
      });
      const game = { ui: { getTutorialTarget: () => target }, off: () => {}, on: () => {} };
      const tm = createTutorialManager(game);
      tm.steps = [{ key: "x", message: "m", completion: () => false, onEnter: () => {} }];
      tm.showStep(0);
      await tm.complete();
      expect(document.getElementById("tutorial-overlay")).toBeNull();
      expect(StorageUtils.get("reactorTutorialStep")).toBeNull();
    });
  });

  it("toggles research section header aria-expanded on collapse", async () => {
    await game.router.loadPage("experimental_upgrades_section");
    game.ui.pageInitUI.setupResearchCollapsibleSections();
    const header = document.querySelector("#experimental_upgrades_section .research-section-header");
    const article = header?.closest(".research-collapsible");
    expect(header).toBeTruthy();
    expect(article).toBeTruthy();
    article.classList.add("section-collapsed");
    header.setAttribute("aria-expanded", "false");
    header.click();
    expect(header.getAttribute("aria-expanded")).toBe("true");
    header.click();
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });
});
