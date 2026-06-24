import { describe, it, expect, vi, beforeEach, afterEach, setupGameWithDOM, mockClipboardAPI, getCopyPasteModalRefs } from '../../helpers/setup.js';

describe('Paste Modal Unaffordable Text', () => {
    let game;
    let ui;
    let mockNav;
    let restoreClipboardMock;

    beforeEach(async () => {
        // Setup DOM environment
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;

        const clip = mockClipboardAPI();
        mockNav = clip.navigator;
        restoreClipboardMock = clip.restore;
        mockNav.clipboard.writeText.mockResolvedValue();
        mockNav.clipboard.readText.mockResolvedValue('{"size":{"rows":3,"cols":3},"parts":[]}');
    });

    afterEach(() => {
        restoreClipboardMock?.();
        vi.clearAllMocks();
    });

    describe('Unaffordable Layout', () => {
        it('should show unaffordable text when layout costs more than player money', async () => {
            // Set player money to a low amount
            game.current_money = 100;

            // Create an expensive layout
            const expensiveLayout = {
                size: { rows: 3, cols: 3 },
                parts: [
                    { r: 0, c: 0, t: "uranium", id: "uranium3", lvl: 3 },
                    { r: 0, c: 1, t: "uranium", id: "uranium3", lvl: 3 },
                    { r: 0, c: 2, t: "uranium", id: "uranium3", lvl: 3 }
                ]
            };

            mockNav.clipboard.writeText.mockResolvedValue();
            mockNav.clipboard.readText.mockResolvedValue(JSON.stringify(expensiveLayout));

            // Initialize the copy/paste UI
            ui.initializeCopyPasteUI();

            // Trigger paste button click
            const pasteBtn = document.getElementById('reactor_paste_btn');
            await pasteBtn.click();

            // Wait for modal to be set up
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check that modal is shown
            const refs = getCopyPasteModalRefs(document);
            expect(refs).not.toBeNull();
            expect(refs.modal.classList.contains('hidden')).toBe(false);

            expect(refs.modalCost.innerHTML).toContain("needed");
            expect(refs.modalCost.innerHTML).toContain("you have");
        });

        it('should show affordable text when layout costs less than player money', async () => {
            // Set player money to a high amount
            game.current_money = 10000;

            // Create a cheap layout
            const cheapLayout = {
                size: { rows: 3, cols: 3 },
                parts: [
                    { r: 0, c: 0, t: "uranium", id: "uranium1", lvl: 1 }
                ]
            };

            mockNav.clipboard.writeText.mockResolvedValue();
            mockNav.clipboard.readText.mockResolvedValue(JSON.stringify(cheapLayout));

            // Initialize the copy/paste UI
            ui.initializeCopyPasteUI();

            // Trigger paste button click
            const pasteBtn = document.getElementById('reactor_paste_btn');
            await pasteBtn.click();

            // Wait for modal to be set up
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check that modal is shown
            const refs = getCopyPasteModalRefs(document);
            expect(refs).not.toBeNull();
            expect(refs.modal.classList.contains('hidden')).toBe(false);

            expect(refs.modalCost.innerHTML).not.toContain('Not Enough Money');
        });

        it('should update unaffordable text when player money changes', async () => {
            // Set player money to a low amount
            game.current_money = 100;

            // Create an expensive layout
            const expensiveLayout = {
                size: { rows: 3, cols: 3 },
                parts: [
                    { r: 0, c: 0, t: "uranium", id: "uranium3", lvl: 3 }
                ]
            };

            mockNav.clipboard.writeText.mockResolvedValue();
            mockNav.clipboard.readText.mockResolvedValue(JSON.stringify(expensiveLayout));

            // Initialize the copy/paste UI
            ui.initializeCopyPasteUI();

            // Trigger paste button click
            const pasteBtn = document.getElementById('reactor_paste_btn');
            await pasteBtn.click();

            // Wait for modal to be set up
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check that unaffordable text is displayed initially
            const refs = getCopyPasteModalRefs(document);
            expect(refs).not.toBeNull();
            expect(refs.modalCost.innerHTML).toContain("needed");
            expect(refs.modalCost.innerHTML).toContain("you have");

            game.current_money = 10000;

            refs.modalText.value = JSON.stringify(expensiveLayout);
            refs.modalText.dispatchEvent(new Event('input'));

            // Wait for update
            await new Promise(resolve => setTimeout(resolve, 50));

            // Check that unaffordable text is no longer displayed
            expect(refs.modalCost.innerHTML).not.toContain('Not Enough Money');
        });
    });
}); 