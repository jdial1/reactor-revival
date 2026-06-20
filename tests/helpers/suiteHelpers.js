import { expect } from "vitest";
import {
  EP_CHANCE_LOG_BASE,
  PRESTIGE_MULTIPLIER_CAP,
  PRESTIGE_MULTIPLIER_PER_EP,
  toNumber as toNum,
} from "@app/utils.js";
import { runTicks } from "./gameHelpers.js";
import { patchGameState } from "@app/state.js";

export const REACTOR_COPY_PASTE_MODAL_MARKUP = `
      <div id="reactor_copy_paste_modal" class="hidden">
        <div id="reactor_copy_paste_modal_title"></div>
        <textarea id="reactor_copy_paste_text"></textarea>
        <div id="reactor_copy_paste_cost"></div>
        <button id="reactor_copy_paste_close_btn"></button>
        <button id="reactor_copy_paste_confirm_btn"></button>
      </div>
      <button id="reactor_copy_btn"></button>
      <button id="reactor_paste_btn"></button>
    `;

export function removeReactorCopyPasteModalElements(doc = globalThis.document) {
  if (!doc?.body) return;
  [
    "reactor_copy_paste_modal",
    "reactor_copy_btn",
    "reactor_paste_btn",
  ].forEach((id) => doc.getElementById(id)?.remove());
}

export function injectReactorCopyPasteModalMarkup(doc = globalThis.document) {
  if (!doc?.body) return;
  removeReactorCopyPasteModalElements(doc);
  doc.body.insertAdjacentHTML("beforeend", REACTOR_COPY_PASTE_MODAL_MARKUP.trim());
}

export function setupModalEnvironment(doc = globalThis.document) {
  injectReactorCopyPasteModalMarkup(doc);
}

export function getPartByCriteria(partset, criteria = {}) {
  const parts = partset?.partsArray ?? [];
  const tier = criteria.tier ?? criteria.level;
  return (
    parts.find((part) => {
      if (criteria.id !== undefined && part.id !== criteria.id) return false;
      if (criteria.category !== undefined && part.category !== criteria.category) return false;
      if (criteria.type !== undefined && part.type !== criteria.type) return false;
      if (tier !== undefined && part.level !== tier) return false;
      if (criteria.experimental === true && !part.erequires) return false;
      if (criteria.experimental === false && part.erequires) return false;
      if (criteria.requiresEp === true && !part.erequires) return false;
      if (criteria.requiresEp === false && part.erequires) return false;
      if (typeof criteria.predicate === "function" && !criteria.predicate(part)) return false;
      return true;
    }) ?? null
  );
}

export function expectedParticleAcceleratorEpChance(heatContained, epHeat, logBase = EP_CHANCE_LOG_BASE) {
  return (Math.log(heatContained) / Math.log(logBase)) * (heatContained / epHeat);
}

export function expectedPrestigeMultiplierFromTotalEp(epTotal) {
  return 1 + Math.min(toNum(epTotal) * PRESTIGE_MULTIPLIER_PER_EP, PRESTIGE_MULTIPLIER_CAP);
}

export function cappedPrestigeEpContribution(epTotal) {
  return Math.min(toNum(epTotal) * PRESTIGE_MULTIPLIER_PER_EP, PRESTIGE_MULTIPLIER_CAP);
}

export function clearGracePeriod(game) {
  const n = game.grace_period_ticks | 0;
  if (n > 0) {
    runTicks(game, n);
  }
}

export function mockFetchJsonResponse(data, { ok = true } = {}) {
  return {
    ok,
    json: async () => data,
  };
}

export function assertProcessedObjectiveTitleHasIcon(processedTitle, expectedIcon) {
  if (expectedIcon.startsWith("./img/") || expectedIcon.startsWith("img/")) {
    expect(processedTitle).toContain("<img");
    expect(processedTitle).toContain("objective-part-icon");
    expect(processedTitle).toContain(expectedIcon);
  } else {
    expect(processedTitle).toContain(expectedIcon);
  }
}

export function assertGridIndexMatchesTileset(tileset, row, col, expectedIndex) {
  expect(tileset.gridIndex(row, col)).toBe(expectedIndex);
  expect(row * tileset.max_cols + col).toBe(expectedIndex);
}

export function performTestRespec(
  game,
  {
    doctrine = "unified",
    exclusiveUpgradeId = "forceful_fusion",
    bypassTechTree = false,
  } = {}
) {
  game.bypass_tech_tree_restrictions = bypassTechTree;
  game.tech_tree = doctrine;
  const upg = game.upgradeset.getUpgrade(exclusiveUpgradeId);
  upg.setLevel(0);
  upg.updateDisplayCost();
  const cost = toNum(upg.getCost());
  game.current_money = cost;
  patchGameState(game, { current_money: game.current_money });
  game.upgradeset.check_affordability(game);
  const purchased = game.upgradeset.purchaseUpgrade(exclusiveUpgradeId);
  game.current_exotic_particles = game.RESPER_DOCTRINE_EP_COST;
  patchGameState(game, { current_exotic_particles: game.current_exotic_particles });
  const respecOk = game.respecDoctrine();
  return {
    purchased,
    respecOk,
    exclusiveLevelAfter: game.upgradeset.getUpgrade(exclusiveUpgradeId).level,
    techTreeAfter: game.tech_tree,
    epAfter: toNum(game.current_exotic_particles),
  };
}
