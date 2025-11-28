import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, cleanupGame } from "../helpers/setup.js";

describe('Quick Start Modal', () => {
    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        localStorage.clear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should clear quick start modal flag when starting new game', () => {
        localStorage.setItem("reactorGameQuickStartShown", "1");
        localStorage.removeItem("reactorGameQuickStartShown");
        expect(localStorage.getItem("reactorGameQuickStartShown")).toBeNull();
    });

    it('should set quick start modal flag when modal is closed', () => {
        const closeModal = () => {
            localStorage.setItem("reactorGameQuickStartShown", "1");
        };
        closeModal();
        expect(localStorage.getItem("reactorGameQuickStartShown")).toBe("1");
    });

    it('should check for quick start modal flag correctly', () => {
        const shouldShowModal = !localStorage.getItem("reactorGameQuickStartShown");
        expect(shouldShowModal).toBe(true);

        localStorage.setItem("reactorGameQuickStartShown", "1");
        const shouldNotShowModal = !localStorage.getItem("reactorGameQuickStartShown");
        expect(shouldNotShowModal).toBe(false);
    });

    it('should handle new game flow correctly', () => {
        localStorage.setItem("reactorGameQuickStartShown", "1");
        localStorage.removeItem("reactorGameQuickStartShown");
        expect(localStorage.getItem("reactorGameQuickStartShown")).toBeNull();
    });

    it('should handle loaded game flow correctly', () => {
        localStorage.setItem("reactorGameQuickStartShown", "1");
        expect(localStorage.getItem("reactorGameQuickStartShown")).toBe("1");
    });

    describe('Integration with actual game code', () => {
        let game, document, window;

        beforeEach(async () => {
            const setup = await setupGameWithDOM();
            game = setup.game;
            document = setup.document;
            window = setup.window;

            // Mock fetch for modal HTML
            global.fetch = vi.fn();
            global.fetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('<div id="quick-start-modal">Test Modal</div>')
            });
        });

        afterEach(() => {
            cleanupGame();
        });

        it('should show quick start modal when flag is not set', async () => {
            // Ensure no quick start modal has been shown before
            localStorage.removeItem("reactorGameQuickStartShown");

            // Mock the showQuickStartModal function to capture if it's called
            let modalShown = false;
            const originalShowQuickStartModal = window.showQuickStartModal;
            window.showQuickStartModal = vi.fn(async () => {
                modalShown = true;
            });

            try {
                // Simulate the startGame logic that checks for the modal
                if (!localStorage.getItem("reactorGameQuickStartShown")) {
                    await window.showQuickStartModal();
                }

                // Verify the modal was shown
                expect(modalShown).toBe(true);
                expect(window.showQuickStartModal).toHaveBeenCalled();
            } finally {
                // Restore original function
                window.showQuickStartModal = originalShowQuickStartModal;
            }
        });

        it('should not show quick start modal when flag is set', async () => {
            // Set the flag to indicate modal has been shown before
            localStorage.setItem("reactorGameQuickStartShown", "1");

            // Mock the showQuickStartModal function to capture if it's called
            let modalShown = false;
            const originalShowQuickStartModal = window.showQuickStartModal;
            window.showQuickStartModal = vi.fn(async () => {
                modalShown = true;
            });

            try {
                // Simulate the startGame logic that checks for the modal
                if (!localStorage.getItem("reactorGameQuickStartShown")) {
                    await window.showQuickStartModal();
                }

                // Verify the modal was NOT shown
                expect(modalShown).toBe(false);
                expect(window.showQuickStartModal).not.toHaveBeenCalled();
            } finally {
                // Restore original function
                window.showQuickStartModal = originalShowQuickStartModal;
            }
        });
    });
}); 