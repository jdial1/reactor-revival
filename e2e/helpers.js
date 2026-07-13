import { expect } from "@playwright/test";
export { RESOLUTIONS } from "../scripts/ui-screenshot-config.js";

export const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
export const E2E_URL = `${BASE_URL.replace(/\/$/, "")}/?e2e=1`;

const ACHIEVEMENT_IDS = {
  "Closed-Door Research": "ach_closed_door_lab",
  "Nuclear Disarmament": "ach_nuclear_disarmament",
  "Measure Twice": "ach_blueprint_stable",
  "Thermodynamic Equilibrium": "ach_thermo_equilibrium",
  "Unplanned Disassembly": "ach_unplanned_disassembly",
  "Not Great, Not Terrible": "ach_first_meltdown",
};

function log(step, detail) {
  const suffix = detail !== undefined ? ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : "";
  console.log(`[e2e] ${step}${suffix}`);
}

async function dumpVisibleElements(page, context) {
  const snapshot = await page.evaluate((ctx) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const isOnScreen = (el) => {
      if (!el || el.nodeType !== 1) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      if (rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw) return false;
      for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
        const ps = getComputedStyle(node);
        if (ps.display === "none" || ps.visibility === "hidden" || Number(ps.opacity) === 0) return false;
      }
      return true;
    };

    const describe = (el) => {
      const rect = el.getBoundingClientRect();
      const text = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes:
          el.className && typeof el.className === "string"
            ? el.className.split(/\s+/).slice(0, 8).join(" ")
            : null,
        text: text ? text.slice(0, 80) : null,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      };
    };

    const prioritySelectors = [
      "#wrapper",
      "#main",
      "#parts_section",
      "#parts_tab_contents",
      "#build_tab_btn",
      "#main_top_nav",
      "#bottom_nav",
      "#reactor_copy_paste_toggle",
      "#blueprint_planner_stability",
      "#splash-screen",
      "#splash-new-game-btn",
      ".splash-menu-panel",
      "#game-setup-overlay",
      ".reactor-canvas-host canvas",
      "#experimental_upgrades_section",
      "#refund_btn",
      "#meltdown_banner",
      ".prestige-modal-overlay",
      ".achievement-toast__title",
      "[data-page]",
      "#info_power_desktop",
      "#info_power",
      "#ui_views_heat_strip_host",
      ".explosion-emf-overlay",
    ];

    const priorityVisible = [];
    const seen = new Set();
    for (const sel of prioritySelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el) || !isOnScreen(el)) return;
        seen.add(el);
        priorityVisible.push({ selector: sel, ...describe(el) });
      });
    }

    const visibleWithId = [];
    document.querySelectorAll("[id]").forEach((el) => {
      if (!isOnScreen(el) || visibleWithId.length >= 50) return;
      visibleWithId.push(describe(el));
    });

    const visibleButtons = [];
    document.querySelectorAll('button, a[href], [role="button"]').forEach((el) => {
      if (!isOnScreen(el) || visibleButtons.length >= 40) return;
      visibleButtons.push(describe(el));
    });

    return {
      context: ctx,
      viewport: { w: vw, h: vh },
      pageId: window.__reactorAudit?.game?.router?.currentPageId ?? null,
      bodyClasses: document.body.className,
      wrapperClasses: document.getElementById("wrapper")?.className ?? null,
      priorityVisible,
      visibleWithId,
      visibleButtons,
    };
  }, context);

  log("visible-elements-dump", snapshot);
  return snapshot;
}

async function failVisibility(page, label, report, error) {
  if (report) log("visibility-failed", { label, report });
  throw error ?? new Error(`${label} exists in DOM but is not visible on screen: ${JSON.stringify(report)}`);
}

async function inspectVisibility(locator) {
  return locator.first().evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let ancestorHidden = false;
    let hiddenAncestor = null;
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const ps = getComputedStyle(node);
      if (ps.display === "none" || ps.visibility === "hidden" || Number(ps.opacity) === 0) {
        ancestorHidden = true;
        hiddenAncestor = node.id || node.className || node.tagName;
        break;
      }
    }
    const hasSize = rect.width >= 1 && rect.height >= 1;
    const intersectsViewport =
      hasSize && rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
    return {
      tag: el.tagName,
      id: el.id || null,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { w: vw, h: vh },
      hasSize,
      intersectsViewport,
      ancestorHidden,
      hiddenAncestor,
      onScreen:
        hasSize &&
        intersectsViewport &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        !ancestorHidden,
    };
  });
}

export async function expectOneVisibleOnScreen(page, selectors, label, options = {}) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  let lastError;
  for (const selector of list) {
    const loc = page.locator(selector);
    if ((await loc.count()) === 0) continue;
    try {
      await expectVisibleOnScreen(loc, `${label} (${selector})`, options);
      return loc;
    } catch (error) {
      lastError = error;
    }
  }
  if (!lastError) {
    await dumpVisibleElements(page, label);
  }
  throw lastError ?? new Error(`${label}: none visible on screen (${list.join(", ")})`);
}

export async function expectVisibleOnScreen(locator, label, { timeout = 15000, scroll = true } = {}) {
  const page = locator.page();
  const target = locator.first();
  let attached = false;
  try {
    if (scroll) {
      await target.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
    }
    await expect(target, `${label}: attached`).toBeAttached({ timeout });
    attached = true;
    await expect(target, `${label}: visible`).toBeVisible({ timeout });
    await expect(target, `${label}: in viewport`).toBeInViewport({ timeout: Math.min(timeout, 8000) });
    const report = await inspectVisibility(locator);
    if (!report.onScreen) {
      await failVisibility(page, label, report);
    }
    log("visible-on-screen", label);
    return report;
  } catch (error) {
    if (!attached) {
      await dumpVisibleElements(page, label);
    }
    throw error;
  }
}

export async function clickWhenVisible(locator, label, options = {}) {
  await expectVisibleOnScreen(locator, label, options);
  const target = locator.first();
  await expect(target, `${label}: enabled`).toBeEnabled({ timeout: options.timeout ?? 15000 });
  await target.click();
  log("clicked", label);
}

function navButtonForPage(page, pageId) {
  return page.locator(
    `#main_top_nav button[data-page="${pageId}"], footer#bottom_nav button[data-page="${pageId}"]`
  );
}

async function clickVisiblePageNav(page, pageId) {
  const buttons = navButtonForPage(page, pageId);
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await clickWhenVisible(btn, `nav:${pageId}`);
      return;
    }
  }
  throw new Error(`No visible nav button for page "${pageId}"`);
}

export async function dumpDiagnostics(page, label) {
  const snapshot = await page.evaluate((diagLabel) => {
    const game = window.__reactorAudit?.game;
    const ui = window.__reactorAudit?.ui;
    const wrapper = document.getElementById("wrapper");
    const parts = document.getElementById("parts_section");
    const partBtn = document.getElementById("part_btn_uranium1");
    const partsStyle = parts ? getComputedStyle(parts) : null;
    const btnStyle = partBtn ? getComputedStyle(partBtn) : null;
    return {
      label: diagLabel,
      url: location.href,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      pageId: game?.router?.currentPageId ?? null,
      wrapperClasses: wrapper?.className ?? null,
      bodyClasses: document.body.className,
      partsPanel: {
        exists: !!parts,
        display: partsStyle?.display,
        visibility: partsStyle?.visibility,
        collapsed: ui?.uiState?.parts_panel_collapsed,
      },
      uraniumBtn: {
        exists: !!partBtn,
        display: btnStyle?.display,
        visibility: btnStyle?.visibility,
      },
      copyPasteCollapsed: ui?.uiState?.copy_paste_collapsed,
      blueprintActive: ui?.uiState?.copy_paste_display?.blueprintPlannerActive,
      money: game?.state?.current_money?.toString?.() ?? game?.current_money,
      ep: game?.state?.current_exotic_particles?.toString?.() ?? null,
      labLevel: game?.upgradeset?.getUpgrade("laboratory")?.level ?? null,
      blueprintStability: document.getElementById("blueprint_planner_stability")?.textContent ?? null,
    };
  }, label);
  log("diagnostics", snapshot);
  return snapshot;
}

export async function applyBlueprintPlan(page) {
  log("applyBlueprintPlan:start");
  const result = await page.evaluate(async () => {
    const game = window.__reactorAudit?.game;
    if (!game) return { ok: false, reason: "no game" };
    await game.applyBlueprintPlannerLayout?.();
    if (game.engine?.consumeIntentQueueAsync) {
      await game.engine.consumeIntentQueueAsync();
    }
    if (game.blueprintPlanner?.active) game.toggleBlueprintPlanner();
    return {
      ok: !game.blueprintPlanner?.active,
      active: game.blueprintPlanner?.active,
    };
  });
  log("applyBlueprintPlan:result", result);
  return result;
}

export async function refreshBlueprintProjection(page, options = {}) {
  const sample = await page.evaluate(async (opts) => {
    const game = window.__reactorAudit?.game;
    const res = await game?.requestBlueprintProjectionSample?.({
      warmupTicks: opts.warmupTicks ?? 500,
      sampleTicks: opts.sampleTicks ?? 100,
    });
    return res?.projectionPlannerSample ?? null;
  }, options);
  log("refreshBlueprintProjection", sample);
  return sample;
}

export async function clearGameStorage(page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
  });
}

async function dismissBlockingModals(page) {
  for (const id of ["#quick-start-close", "#quick-start-close-2", "#welcome-back-close"]) {
    const locator = page.locator(id);
    if (await locator.isVisible().catch(() => false)) {
      log("dismiss-modal", id);
      await clickWhenVisible(locator, `dismiss modal ${id}`);
      return;
    }
  }
}

async function waitForSplashReady(page) {
  await page.waitForFunction(() => {
    const splash = document.getElementById("splash-screen");
    const btn = document.getElementById("splash-new-game-btn");
    if (!splash || !btn || btn.disabled) return false;
    if (splash.classList.contains("splash-vhold-booting")) return false;
    const panel = splash.querySelector(".splash-menu-panel");
    if (!panel) return false;
    const panelStyle = getComputedStyle(panel);
    if (panelStyle.display === "none" || panelStyle.visibility === "hidden") return false;
    if (Number(panelStyle.opacity) < 0.5) return false;
    const btnStyle = getComputedStyle(btn);
    return btnStyle.display !== "none" && btnStyle.visibility !== "hidden" && Number(btnStyle.opacity) > 0;
  }, { timeout: 15000 });
  log("bootGame:splash-ready");
}

export async function bootGame(page) {
  log("bootGame:start");
  await clearGameStorage(page);
  await page.goto(E2E_URL, { waitUntil: "domcontentloaded" });

  await waitForSplashReady(page);
  await clickWhenVisible(page.locator("#splash-new-game-btn"), "splash new game");

  const setupOverlay = page.locator("#game-setup-overlay:not(.hidden)");
  if (await setupOverlay.isVisible({ timeout: 5000 }).catch(() => false)) {
    log("bootGame:setup-overlay");
    await clickWhenVisible(page.locator("button[data-difficulty='easy']"), "easy difficulty");
    await clickWhenVisible(page.locator(".setup-start-btn:not([disabled])"), "start game");
  }

  await page.waitForFunction(() => {
    const wrapper = document.getElementById("wrapper");
    return wrapper && !wrapper.classList.contains("hidden");
  });

  await page.waitForFunction(() => window.__reactorAudit?.game?.router?.currentPageId != null);

  await dismissBlockingModals(page);
  await expectVisibleOnScreen(page.locator(".reactor-canvas-host canvas").first(), "reactor canvas", {
    timeout: 30000,
  });
  log("bootGame:ready", await page.evaluate(() => window.__reactorAudit?.game?.router?.currentPageId));
}

export async function navigateToPage(page, pageId) {
  log("navigateToPage", pageId);
  const current = await page.evaluate(() => window.__reactorAudit?.game?.router?.currentPageId);
  if (current === pageId) return;

  await clickVisiblePageNav(page, pageId);
  await page.waitForFunction(
    (id) => window.__reactorAudit?.game?.router?.currentPageId === id,
    pageId,
    { timeout: 15000 }
  );
}

export async function ensureReactorPage(page) {
  const pageId = await page.evaluate(() => window.__reactorAudit?.game?.router?.currentPageId);
  if (pageId !== "reactor_section") {
    await navigateToPage(page, "reactor_section");
  }
}

export async function openPartsPanel(page) {
  await ensureReactorPage(page);

  await page.evaluate(() => {
    document.body.classList.add("page-reactor");
    const ui = window.__reactorAudit?.ui;
    if (ui?.uiState) {
      ui.uiState.parts_panel_collapsed = false;
      ui.uiState.copy_paste_collapsed = false;
    }
    ui?.updatePartsPanelBodyClass?.();
  });

  const buildBtn = page.locator("#build_tab_btn");
  const collapsed = await page.evaluate(() => window.__reactorAudit?.ui?.uiState?.parts_panel_collapsed);
  if (collapsed && (await buildBtn.isVisible().catch(() => false))) {
    log("openPartsPanel:toggle-build-tab");
    await clickWhenVisible(buildBtn, "build tab");
  }

  try {
    await expectVisibleOnScreen(page.locator("#parts_section"), "parts panel", { timeout: 10000 });
    await expectVisibleOnScreen(page.locator("#parts_tab_contents"), "parts tab contents", { timeout: 8000 });
  } catch (error) {
    await dumpDiagnostics(page, "openPartsPanel:parts-hidden");
    throw error;
  }
}

export async function ensureBuildUiReady(page) {
  await openPartsPanel(page);
  log("ensureBuildUiReady:ok");
}

export async function ensureReactorToolsExpanded(page) {
  await ensureReactorPage(page);

  await page.evaluate(() => {
    const ui = window.__reactorAudit?.ui;
    if (ui?.uiState) ui.uiState.copy_paste_collapsed = false;
  });

  const toggle = page.locator("#reactor_copy_paste_toggle");
  if (await toggle.isVisible().catch(() => false)) {
    const collapsed = await page.evaluate(() => window.__reactorAudit?.ui?.uiState?.copy_paste_collapsed);
    if (collapsed) {
      await clickWhenVisible(toggle, "reactor tools expand");
    }
  }

  log("ensureReactorToolsExpanded:ok");
}

export async function toggleBlueprintMode(page) {
  await ensureReactorToolsExpanded(page);
  log("toggleBlueprintMode");

  await page.evaluate(() => {
    const game = window.__reactorAudit?.game;
    if (!game?.blueprintPlanner?.active) game.toggleBlueprintPlanner();
  });

  await expect(page.locator("#wrapper")).toHaveClass(/blueprint-planner-active/, { timeout: 5000 });
  await expectVisibleOnScreen(page.locator("#blueprint_planner_stability"), "blueprint stability HUD", {
    timeout: 8000,
  });
}

export async function selectPartsTab(page, tabId) {
  await page.evaluate((tab) => {
    const ui = window.__reactorAudit?.ui;
    if (ui?.uiState) ui.uiState.active_parts_tab = tab;
  }, tabId);
  const tabLabel = tabId === "heat" ? "Heat Management" : "Power Creation";
  const tab = page.locator(`button.parts_tab[aria-label="${tabLabel}"]`);
  if (await tab.isVisible().catch(() => false)) {
    await clickWhenVisible(tab, `parts tab ${tabLabel}`);
  }
}

export async function expandUpgradeHubSection(page, sectionName) {
  const header = page.locator(`h2[data-section-name="${sectionName}"]`);
  const section = page.locator(`.upgrade-hub-collapsible:has(h2[data-section-name="${sectionName}"])`);
  if ((await section.count()) === 0) {
    throw new Error(`Upgrade hub section not found: ${sectionName}`);
  }
  const collapsed = await section.first().evaluate((el) => el.classList.contains("section-collapsed"));
  if (collapsed) {
    await clickWhenVisible(header, `expand hub section ${sectionName}`);
  }
}

function partTabForId(partId) {
  if (/vent|heat_exchanger|heat_inlet|heat_outlet|coolant|plating|valve/.test(partId)) return "heat";
  return "power";
}

export async function unlockPartForPlacement(page, partId) {
  const result = await page.evaluate((id) => {
    const game = window.__reactorAudit?.game;
    const um = game?.unlockManager;
    const part = game?.partset?.getPartById(id);
    if (!part || !um) return { ok: false, reason: "missing game/part/unlockManager" };
    if (um.isPartUnlocked(part) && um.shouldShowPart(part)) {
      return { ok: true, already: true };
    }

    game.placedCounts = game.placedCounts ?? {};
    let current = part;
    const keys = new Set();
    while (current) {
      const prev = um.getPreviousTierSpec(current);
      if (!prev) break;
      keys.add(`${prev.type}:${prev.level}`);
      const prevPart = game.partset.getPartsByType(prev.type).find((p) => p.level === prev.level);
      current = prevPart ?? null;
    }
    for (const key of keys) game.placedCounts[key] = 10;
    game.partset.check_affordability(game);
    game.ui?.refreshPartsPanel?.();
    return {
      ok: um.isPartUnlocked(part) && um.shouldShowPart(part),
      keys: [...keys],
    };
  }, partId);
  log("unlockPartForPlacement", { partId, ...result });
  return result;
}

export async function selectPart(page, partId) {
  await ensureBuildUiReady(page);
  await unlockPartForPlacement(page, partId);
  await selectPartsTab(page, partTabForId(partId));

  const btn = page.locator(`#part_btn_${partId}`);
  if ((await btn.count()) === 0) {
    await page.evaluate(() => window.__reactorAudit?.ui?.refreshPartsPanel?.());
  }
  log("selectPart", { partId, exists: (await btn.count()) > 0 });

  try {
    await btn.scrollIntoViewIfNeeded({ timeout: 8000 });
    await clickWhenVisible(btn, `part button ${partId}`, { timeout: 10000 });
    log("selectPart:clicked-ui", partId);
  } catch (error) {
    await dumpDiagnostics(page, `selectPart:${partId}`);
    throw error;
  }
}

export async function placePartOnGrid(page, partId, row, col) {
  log("placePartOnGrid:start", { partId, row, col });
  await selectPart(page, partId);

  const result = await page.evaluate(
    async ({ id, r, c }) => {
      const game = window.__reactorAudit?.game;
      const ui = window.__reactorAudit?.ui;
      if (!game) throw new Error("Game audit hook missing");

      const part = game.partset.getPartById(id);
      if (!part) return { ok: false, reason: `unknown part ${id}` };

      const tile = game.tileset.getTile(r, c);
      if (!tile) return { ok: false, reason: `missing tile ${r},${c}` };

      if (game.blueprintPlanner?.active) {
        game.setBlueprintPlannerSlot(r, c, id);
        ui?.gridCanvasRenderer?.markTileDirty(r, c);
        return { ok: true, mode: "blueprint", partId: id, row: r, col: c };
      }

      const selected = ui?.stateManager?.getClickedPart?.();
      if (!selected || selected.id !== id) {
        ui?.stateManager?.setClickedPart(part);
      }

      game.state.intent_queue.push({
        action: "PLACE_PART",
        payload: { row: r, col: c, partId: id },
      });

      let placed = [];
      if (game.engine?.consumeIntentQueueAsync) {
        const res = await game.engine.consumeIntentQueueAsync();
        placed = res?.placed ?? [];
      } else {
        const ok = await tile.setPart(part);
        if (ok) placed = [{ row: r, col: c, part }];
      }

      const onTile = placed.some((p) => p.row === r && p.col === c) || !!tile.part;
      return {
        ok: onTile,
        mode: "live",
        partId: tile.part?.id ?? null,
        row: r,
        col: c,
        placedCount: placed.length,
        reason: onTile ? undefined : "placement-rejected",
      };
    },
    { id: partId, r: row, c: col }
  );

  log("placePartOnGrid:result", result);
  if (!result.ok) {
    await dumpDiagnostics(page, `placePartOnGrid:${partId}`);
    throw new Error(`Failed to place ${partId} at ${row},${col}: ${result.reason ?? "unknown"}`);
  }
}

export async function placePartsOnGrid(page, placements) {
  log("placePartsOnGrid:start", placements);
  await ensureReactorPage(page);

  const partIds = [...new Set(placements.map((p) => p.partId))];
  for (let i = 0; i < partIds.length; i++) {
    await unlockPartForPlacement(page, partIds[i]);
  }

  const result = await page.evaluate(async (parts) => {
    const game = window.__reactorAudit?.game;
    if (!game) throw new Error("Game audit hook missing");

    for (let i = 0; i < parts.length; i++) {
      const { partId, row, col } = parts[i];
      const part = game.partset.getPartById(partId);
      const tile = game.tileset.getTile(row, col);
      if (!part) return { ok: false, reason: `unknown part ${partId}` };
      if (!tile) return { ok: false, reason: `missing tile ${row},${col}` };
      game.state.intent_queue.push({
        action: "PLACE_PART",
        payload: { row, col, partId },
      });
    }

    let placed = [];
    if (game.engine?.consumeIntentQueueAsync) {
      const res = await game.engine.consumeIntentQueueAsync();
      placed = res?.placed ?? [];
    }

    const missing = parts.filter(
      ({ partId, row, col }) =>
        !game.tileset.getTile(row, col)?.part || game.tileset.getTile(row, col).part.id !== partId
    );
    return {
      ok: missing.length === 0,
      placedCount: placed.length,
      missing,
    };
  }, placements);

  log("placePartsOnGrid:result", result);
  if (!result.ok) {
    await dumpDiagnostics(page, "placePartsOnGrid");
    throw new Error(`Failed to place parts batch: ${JSON.stringify(result)}`);
  }
}

export async function injectFunds(page, amount = 10_000_000) {
  log("injectFunds", amount);
  await page.evaluate((amt) => {
    const game = window.__reactorAudit?.game;
    if (!game) throw new Error("Game audit hook unavailable — load with ?e2e=1");
    game.addMoney(amt);
    game.reactor?.updateStats?.();
    game.partset?.check_affordability?.(game);
  }, amount);
}

export async function injectExoticParticles(page, amount = 100) {
  log("injectExoticParticles", amount);
  await page.evaluate((amt) => {
    const game = window.__reactorAudit?.game;
    if (!game) throw new Error("Game audit hook unavailable — load with ?e2e=1");
    game.current_exotic_particles = amt;
    game.upgradeset?.check_affordability?.(game);
  }, amount);
}

export async function purchaseUpgrade(page, upgradeId) {
  log("purchaseUpgrade:start", upgradeId);
  const result = await page.evaluate((id) => {
    const game = window.__reactorAudit?.game;
    const upgrade = game?.upgradeset?.getUpgrade(id);
    if (!upgrade) return { ok: false, reason: "upgrade not found" };
    const before = upgrade.level;
    const ok = game.upgradeset.purchaseUpgrade(id);
    game.achievement_manager?.onTickRecorded?.();
    return {
      ok,
      before,
      after: upgrade.level,
      max: upgrade.max_level,
    };
  }, upgradeId);

  log("purchaseUpgrade:result", result);
  if (!result.ok) {
    await dumpDiagnostics(page, `purchaseUpgrade:${upgradeId}`);
  }
  expect(result.ok, `purchaseUpgrade(${upgradeId}) failed: ${JSON.stringify(result)}`).toBe(true);
}

export async function speedUpSimulation(page, loopWaitMs = 100) {
  log("speedUpSimulation", loopWaitMs);
  await page.evaluate((ms) => {
    const game = window.__reactorAudit.game;
    game.loop_wait = ms;
    if (game.paused) game.resume();
  }, loopWaitMs);
}

export async function waitForAchievementUnlock(page, achievementId, { timeout = 120000 } = {}) {
  log("waitForAchievementUnlock", achievementId);
  try {
    await page.waitForFunction(
      (id) => window.__reactorAudit?.game?.achievement_manager?.isUnlocked(id) === true,
      achievementId,
      { timeout }
    );
  } catch (error) {
    await dumpDiagnostics(page, `achievement-unlock:${achievementId}`);
    throw error;
  }
}

export async function expectAchievement(page, achievementTitle, { timeout = 20000 } = {}) {
  const achievementId = ACHIEVEMENT_IDS[achievementTitle];
  log("expectAchievement", { achievementTitle, achievementId });

  if (achievementId) {
    await waitForAchievementUnlock(page, achievementId, { timeout });
  }

  const toast = page.locator(".achievement-toast__title", { hasText: achievementTitle });
  try {
    await expectVisibleOnScreen(toast, `achievement toast ${achievementTitle}`, { timeout: 8000 });
    log("expectAchievement:toast-visible", achievementTitle);
  } catch (error) {
    const unlocked = achievementId
      ? await page.evaluate(
          (id) => window.__reactorAudit?.game?.achievement_manager?.isUnlocked(id),
          achievementId
        )
      : false;
    if (unlocked) {
      log("expectAchievement:unlocked-without-toast", achievementTitle);
      return;
    }
    await dumpDiagnostics(page, `achievement-toast:${achievementTitle}`);
    throw error;
  }
}
