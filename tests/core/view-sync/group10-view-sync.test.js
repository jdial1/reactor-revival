import { describe, it, expect, beforeEach, vi, setupGameWithDOM, toNum } from "../../helpers/setup.js";
import { patchGameState } from "@app/state.js";
import { PartButton } from "@app/components/upgrades/button-factory.js";
import { render } from "lit-html";
import * as stateModule from "@app/store.js";
import { buildShellClassMap, modalUi } from "@app/store.js";
import * as simUtils from "@app/simUtils.js";
import { bindLitRenderKeyed, bindLitRenderMulti } from "@app/dom/lit-reactive.js";

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
    ui.uiState.heat_critical = false;
    if (game.coreBridge?.session?.grid) game.coreBridge.session.grid.maxHeat = 1000;
    game.reactor.max_heat = 1000;
    game.coreBridge.setReactorHeat(850);
    game.coreBridge.projectLiveState?.();
    let shell = buildShellClassMap(ui.uiState, modalUi, { hasSession: true, game });
    expect(shell["heat-warning"]).toBe(true);
    expect(shell["heat-critical"]).toBe(false);

    game.coreBridge.setReactorHeat(1400);
    game.coreBridge.projectLiveState?.();
    shell = buildShellClassMap(ui.uiState, modalUi, { hasSession: true, game });
    expect(shell["heat-critical"]).toBe(true);
  });

  it("locks HUD refresh to session snapshot rev", () => {
    const before = ui.uiState.snapshot_rev | 0;
    game.coreBridge?.projectLiveState?.();
    expect(ui.uiState.snapshot_rev).toBeGreaterThan(before);
    expect(game.coreBridge?.getSnapshot?.()).toBeTruthy();
  });

  it("locks immediate unaffordable class and disabled attribute for purchase controls", () => {
    const part = game.partset.getPartById("uranium1");
    const cost = toNum(part.cost);

    const mount = document.createElement("div");

    game.current_money = cost;
    patchGameState(game, { current_money: cost });
    game.partset.check_affordability(game);
    render(PartButton(part, () => {}, { game }), mount);
    let buyButton = mount.querySelector("button");
    expect(part.affordable).toBe(true);
    expect(buyButton.disabled).toBe(false);

    game.current_money = 0;
    patchGameState(game, { current_money: 0 });
    game.partset.check_affordability(game);
    render(PartButton(part, () => {}, { game }), mount);
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
    const unmount = bindLitRenderKeyed(
      state,
      ["active_page", "audio_muted"],
      () => null,
      container
    );

    unmount();

    expect(subscribeKeySpy).toHaveBeenCalledTimes(2);
    expect(unsubA).toHaveBeenCalledTimes(1);
    expect(unsubB).toHaveBeenCalledTimes(1);
    subscribeKeySpy.mockRestore();
  });

  it("unmount cancels pending animation frame for mountMulti subscriptions", () => {
    const isTestEnvSpy = vi.spyOn(simUtils, "isTestEnv").mockReturnValue(false);
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
    const stop = bindLitRenderMulti(
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
    isTestEnvSpy.mockRestore();
    subscribeKeySpy.mockRestore();
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });
});
