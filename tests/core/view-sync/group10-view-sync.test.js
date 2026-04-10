import { describe, it, expect, beforeEach, vi, setupGameWithDOM, toNum } from "../../helpers/setup.js";
import { PartButton } from "@app/components/button-factory.js";
import { render } from "lit-html";
import * as stateModule from "@app/state.js";
import { ReactiveLitComponent } from "@app/components/reactive-lit-component.js";

describe("Group 10: State-to-DOM Synchronization", () => {
  let game;
  let document;
  let ui;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    document = setup.document;
    ui = game.ui;
    await game.router.loadPage("reactor_section");
  });

  it("locks heat visual threshold classes", () => {
    const reactorBg = document.getElementById("reactor_background");

    game.reactor.max_heat = 1000;
    game.reactor.current_heat = 850;
    ui.stateManager.setVar("current_heat", 850);
    ui.heatVisualsUI.updateHeatVisuals();
    expect(reactorBg.classList.contains("heat-warning")).toBe(true);
    expect(reactorBg.classList.contains("heat-critical")).toBe(false);

    game.reactor.current_heat = 1400;
    ui.stateManager.setVar("current_heat", 1400);
    ui.heatVisualsUI.updateHeatVisuals();
    expect(reactorBg.classList.contains("heat-critical")).toBe(true);
  });

  it("locks rolling-number snap to target", () => {
    const moneyDisplay = ui.displayValues.money;
    moneyDisplay.current = 0;
    moneyDisplay.target = 1000;

    ui.coreLoopUI.updateRollingNumbers(16.667);
    expect(toNum(moneyDisplay.current)).toBe(1000);

    moneyDisplay.current = 999.95;
    moneyDisplay.target = 1000;
    ui.coreLoopUI.updateRollingNumbers(16.667);
    expect(toNum(moneyDisplay.current)).toBe(1000);
  });

  it("locks immediate unaffordable class and disabled attribute for purchase controls", () => {
    const part = game.partset.getPartById("uranium1");
    const cost = toNum(part.cost);

    const mount = document.createElement("div");

    game.current_money = cost;
    ui.stateManager.setVar("current_money", cost);
    game.partset.check_affordability(game);
    render(PartButton(part, () => {}), mount);
    let buyButton = mount.querySelector("button");
    expect(part.affordable).toBe(true);
    expect(buyButton.disabled).toBe(false);

    game.current_money = 0;
    ui.stateManager.setVar("current_money", 0);
    game.partset.check_affordability(game);
    render(PartButton(part, () => {}), mount);
    buyButton = mount.querySelector("button");
    expect(part.affordable).toBe(false);
    expect(buyButton.classList.contains("unaffordable")).toBe(true);
    expect(buyButton.disabled).toBe(true);
  });

  it("unmount removes all subscribeKey listeners for keyed reactive component", () => {
    const state = stateModule.createUIState();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const unsubA = vi.fn();
    const unsubB = vi.fn();
    const subscribeKeySpy = vi
      .spyOn(stateModule, "subscribeKey")
      .mockReturnValueOnce(unsubA)
      .mockReturnValueOnce(unsubB);
    const component = new ReactiveLitComponent(
      state,
      ["active_page", "audio_muted"],
      () => null,
      container
    );

    component.mount();
    component.unmount();

    expect(subscribeKeySpy).toHaveBeenCalledTimes(2);
    expect(unsubA).toHaveBeenCalledTimes(1);
    expect(unsubB).toHaveBeenCalledTimes(1);
    expect(component._unsubs).toEqual([]);
  });

  it("unmount cancels pending animation frame for mountMulti subscriptions", () => {
    const prevGlobalVitest = globalThis.__VITEST__;
    const prevWindowVitest = window.__VITEST__;
    globalThis.__VITEST__ = false;
    window.__VITEST__ = false;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const state = stateModule.createUIState();
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame");
    const cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame");
    let scheduleRender;
    const unsub = vi.fn();
    const subscribeKeySpy = vi.spyOn(stateModule, "subscribeKey").mockImplementation((_state, _key, cb) => {
      scheduleRender = cb;
      return unsub;
    });
    const stop = ReactiveLitComponent.mountMulti(
      [{ state, keys: "active_page" }],
      () => null,
      container
    );

    scheduleRender();
    stop();

    expect(rafSpy).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalled();
    expect(subscribeKeySpy).toHaveBeenCalledTimes(1);
    expect(unsub).toHaveBeenCalledTimes(1);
    globalThis.__VITEST__ = prevGlobalVitest;
    window.__VITEST__ = prevWindowVitest;
  });
});
