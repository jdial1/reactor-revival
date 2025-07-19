import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupGameWithDOM } from "../helpers/setup.js";
import { createFactionCard } from "../../components/faction-card.js";
import { createNewGameButton, createLoadGameButton, createUploadToCloudButton, createLoadFromCloudButton, createGoogleSignInButton, createGoogleSignOutButton, createLoadGameUploadRow } from "../../components/splash-buttons.js";
import { createTooltipCloseButton, createUpgradeButton, createPartButton, createBuyButton } from "../../components/ui-buttons.js";
import faction_data from "../../data/faction_data.js";

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

    describe("Faction Card Creation", () => {
        it("should create a faction card with the correct name, flag, and traits", () => {
            const atomFaction = faction_data.find(f => f.id === "ATOM");
            const card = createFactionCard(atomFaction);

            expect(card).not.toBeNull();
            expect(card.querySelector(".faction-name").textContent).toBe(atomFaction.name);
            expect(card.querySelector(".flag").textContent).toBe(atomFaction.flag);

            const features = card.querySelectorAll(".feature-box");
            const penalties = card.querySelectorAll(".penalty-box");

            const expectedFeatures = atomFaction.traits.filter(t => t.type === "feature").length;
            const expectedPenalties = atomFaction.traits.filter(t => t.type === "penalty").length;

            expect(features.length).toBe(expectedFeatures);
            expect(penalties.length).toBe(expectedPenalties);
            expect(card.querySelector(".feature-box .trait-text").textContent).toBe("Small Modular Reactors");
        });
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
            expect(btn.querySelector(".money").textContent).toContain("123K");
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

        it("should create an upgrade button with level and cost", () => {
            const upgrade = game.upgradeset.getUpgrade("chronometer");
            upgrade.setLevel(2);

            const btn = createUpgradeButton({
                id: upgrade.id,
                image: upgrade.upgrade.icon,
                cost: upgrade.display_cost,
                level: upgrade.level,
                max_level: upgrade.max_level
            });

            expect(btn.dataset.id).toBe(upgrade.id);
            expect(btn.querySelector(".image").style.getPropertyValue("--bg-image")).toContain(upgrade.upgrade.icon);
            expect(btn.querySelector(".upgrade-price").textContent).toBe(upgrade.display_cost);
            expect(btn.querySelector(".levels").textContent).toBe("2/32");
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