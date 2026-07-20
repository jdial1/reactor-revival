import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, cleanupGame } from "../helpers/setup.js";
import { numFormat } from "@app/core/numbers.js";
import { render } from "lit-html";
import {
  StartButton,
  PartButton,
  UpgradeCard,
  BuyButton,
  TooltipCloseButton
} from "@app/components/upgrades/button-factory.js";
import { partIconPath } from "@app/components/tooltip-stats.js";
import { formatUpgradeDisplayCost } from "@app/components/upgrades/upgrade-display.js";

describe("UI Component Creation and State", () => {
  const itWithDOM = it.skip;
  let game, document, window;

  function renderToDiv(template) {
    const div = document.createElement("div");
    render(template, div);
    return div.firstElementChild;
  }

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    document = setup.document;
    window = setup.window;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Splash Button Creation", () => {
    itWithDOM("should create a functional 'New Game' button", () => {
      const onClick = vi.fn();
      const btn = renderToDiv(StartButton(false, onClick));
      btn.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("In-Game UI Button Creation", () => {
    itWithDOM("should create a part button with correct image, price, and affordable state", () => {
      const part = game.partset.getPartById("uranium1");
      game.current_money = part.cost;
      game.partset.check_affordability(game);

      let btn = renderToDiv(PartButton(part, () => {}));
      expect(btn.title).toBe(part.title);
      expect(btn.getAttribute("aria-label")).toContain(part.title);
      expect(btn.getAttribute("aria-label")).toContain(part.cost.toString());
      expect(btn.querySelector(".image").style.backgroundImage).toContain(partIconPath(part));
      expect(btn.querySelector(".part-price").textContent).toContain(numFormat(part.cost));
      expect(btn.classList.contains("unaffordable")).toBe(false);
      expect(btn.disabled).toBe(false);

      game.current_money = part.cost - 1;
      game.partset.check_affordability(game);

      btn = renderToDiv(PartButton(part, () => {}));
      expect(btn.classList.contains("unaffordable")).toBe(true);
      expect(btn.disabled).toBe(true);
    });

    itWithDOM("should create an upgrade card with level and cost", () => {
      const upgrade = game.upgradeset.getUpgrade("chronometer");
      upgrade.setLevel(2);

      const card = renderToDiv(UpgradeCard(upgrade, null, () => {}));
      expect(card.dataset.id).toBe(upgrade.id);
      expect(card.querySelector(".image").style.backgroundImage).toContain(upgrade.upgrade.icon);
      expect(card.querySelector(".cost-display").textContent).toBe(formatUpgradeDisplayCost(upgrade));
      expect(card.querySelector(".level-text").textContent).toBe("Level 2/32");
      expect(card.querySelector(".upgrade-title").textContent).toBe(upgrade.title);
    });

    it("should create a buy button that reflects cost and affordability", () => {
      const upgrade = game.upgradeset.getUpgrade("improved_piping");
      upgrade.affordable = true;
      let buyBtn = renderToDiv(BuyButton(upgrade, () => { }));
      expect(buyBtn.disabled).toBe(false);
      expect(buyBtn.querySelector(".cost-text").textContent).toBe(formatUpgradeDisplayCost(upgrade));

      upgrade.affordable = false;
      buyBtn = renderToDiv(BuyButton(upgrade, () => { }));
      expect(buyBtn.disabled).toBe(true);
    });

    itWithDOM("should create a functional tooltip close button", () => {
      const onClick = vi.fn();
      const closeBtn = renderToDiv(TooltipCloseButton(onClick));
      closeBtn.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
