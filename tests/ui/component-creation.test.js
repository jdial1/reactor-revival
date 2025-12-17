import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, cleanupGame } from "../helpers/setup.js";
import {
    createNewGameButton,
    createLoadGameButton,
    createLoadGameUploadRow,
    createPartButton,
    createUpgradeButton,
    createBuyButton,
    createTooltipCloseButton
} from "../../public/src/components/buttonFactory.js";

describe("UI Component Creation and State", () => {
    let game, document, window;

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
        it("should create a functional 'New Game' button", () => {
            const onClick = vi.fn();
            const btn = createNewGameButton(onClick);
            btn.click();
            expect(onClick).toHaveBeenCalledTimes(1);
        });

        it("should create a 'Load Game' button with correct data and cloud sync status", () => {
            const saveData = { current_money: 123456 };
            const playedTime = "1h 23m 45s";

            // Test without cloud sync
            let btn = createLoadGameButton(saveData, playedTime, false, () => { });
            // Expect formatted value e.g. $123.46K
            expect(btn.querySelector(".money").textContent).toContain("123.46K");
            expect(btn.querySelector(".played-time").innerHTML).toBe(playedTime);
            expect(btn.querySelector(".synced-label").style.display).toBe("none");

            // Test with cloud sync
            btn = createLoadGameButton(saveData, playedTime, true, () => { });
            expect(btn.querySelector(".synced-label").style.display).not.toBe("none");
        });

        it("should create a load/upload button row correctly", () => {
            const saveData = { current_money: 789 };
            const playedTime = "10m 5s";

            const row = createLoadGameUploadRow(saveData, playedTime, false, () => { }, () => { });
            expect(row.querySelector("#splash-load-game-btn")).not.toBeNull();
            expect(row.querySelector("#splash-upload-option-btn")).not.toBeNull();
            expect(row.querySelector(".money").textContent).toContain("789");
        });
    });

    describe("In-Game UI Button Creation", () => {
        it("should create a part button with correct image, price, and affordable state", () => {
            // Test affordable part
            const part = game.partset.getPartById("uranium1");
            game.current_money = part.cost;
            game.partset.check_affordability(game);

            let btn = createPartButton(part);
            expect(btn.title).toBe(part.title);
            expect(btn.getAttribute("aria-label")).toContain(part.title);
            expect(btn.getAttribute("aria-label")).toContain(part.cost.toString());
            expect(btn.querySelector(".image").style.getPropertyValue("--bg-image")).toContain(part.getImagePath());
            expect(btn.querySelector(".part-price").textContent).toBe(part.cost.toString());
            expect(btn.classList.contains("unaffordable")).toBe(false);
            expect(btn.disabled).toBe(false);

            // Test unaffordable part
            game.current_money = part.cost - 1;
            game.partset.check_affordability(game);

            btn = createPartButton(part);
            expect(btn.classList.contains("unaffordable")).toBe(true);
            expect(btn.disabled).toBe(true);
        });

        it("should create an upgrade card with level and cost", () => {
            const upgrade = game.upgradeset.getUpgrade("chronometer");
            upgrade.setLevel(2);

            const card = createUpgradeButton({
                id: upgrade.id,
                title: upgrade.title,
                description: upgrade.description,
                image: upgrade.upgrade.icon,
                cost: upgrade.display_cost,
                level: upgrade.level,
                max_level: upgrade.max_level
            });

            expect(card.dataset.id).toBe(upgrade.id);
            expect(card.querySelector(".image").style.backgroundImage).toContain(upgrade.upgrade.icon);
            expect(card.querySelector(".cost-display").textContent).toBe(upgrade.display_cost);
            expect(card.querySelector(".level-text").textContent).toBe("Level 2/32");
            expect(card.querySelector(".upgrade-title").textContent).toBe(upgrade.title);
        });

        it("should create a buy button that reflects cost and affordability", () => {
            const upgrade = game.upgradeset.getUpgrade("improved_piping");

            // Affordable
            upgrade.affordable = true;
            let buyBtn = createBuyButton(upgrade, () => { });
            expect(buyBtn.disabled).toBe(false);
            expect(buyBtn.querySelector(".cost-text").textContent).toBe(upgrade.current_cost.toString());

            // Unaffordable
            upgrade.affordable = false;
            buyBtn = createBuyButton(upgrade, () => { });
            expect(buyBtn.disabled).toBe(true);
        });

        it("should create a functional tooltip close button", () => {
            const onClick = vi.fn();
            const closeBtn = createTooltipCloseButton(onClick);
            closeBtn.click();
            expect(onClick).toHaveBeenCalledTimes(1);
        });
    });
}); 