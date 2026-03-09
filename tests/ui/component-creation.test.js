import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, cleanupGame } from "../helpers/setup.js";
import { numFormat } from "../../public/src/utils/util.js";
import { render } from "lit-html";
import {
  StartButton,
  LoadGameButton,
  LoadGameUploadRow,
  PartButton,
  UpgradeCard,
  BuyButton,
  TooltipCloseButton
} from "../../public/src/components/buttonFactory.js";

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

    itWithDOM("should create a 'Load Game' button with correct data and cloud sync status", () => {
      const saveData = { current_money: 123456 };
      const playedTime = "1h 23m 45s";

      let btn = renderToDiv(LoadGameButton(saveData, playedTime, false, () => { }));
      expect(btn.querySelector(".money").textContent).toContain("123.46K");
      expect(btn.querySelector(".played-time").textContent.trim()).toBe(playedTime);
      expect(btn.querySelector(".synced-label").style.display).toBe("none");

      btn = renderToDiv(LoadGameButton(saveData, playedTime, true, () => { }));
      expect(btn.querySelector(".synced-label").style.display).not.toBe("none");
    });

    itWithDOM("should create a load/upload button row correctly", () => {
      const saveData = { current_money: 789 };
      const playedTime = "10m 5s";

      const row = renderToDiv(LoadGameUploadRow(saveData, playedTime, false, () => { }, () => { }));
      expect(row.querySelector("#splash-load-game-btn")).not.toBeNull();
      expect(row.querySelector("#splash-upload-option-btn")).not.toBeNull();
      expect(row.querySelector(".money").textContent).toContain("789");
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
      expect(btn.querySelector(".image").style.backgroundImage).toContain(part.getImagePath());
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
      expect(card.querySelector(".cost-display").textContent).toBe(upgrade.display_cost);
      expect(card.querySelector(".level-text").textContent).toBe("Level 2/32");
      expect(card.querySelector(".upgrade-title").textContent).toBe(upgrade.title);
    });

    it("should create a buy button that reflects cost and affordability", () => {
      const upgrade = game.upgradeset.getUpgrade("improved_piping");
      upgrade.updateDisplayCost();

      upgrade.affordable = true;
      let buyBtn = renderToDiv(BuyButton(upgrade, () => { }));
      expect(buyBtn.disabled).toBe(false);
      expect(buyBtn.querySelector(".cost-text").textContent).toBe(upgrade.display_cost);

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
