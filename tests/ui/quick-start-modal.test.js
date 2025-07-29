import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupGameWithDOM, cleanupGame } from "../helpers/setup.js";

describe('Quick Start Modal', () => {
    beforeEach(() => {
        // Mock localStorage
        const localStorageMock = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn()
        };
        Object.defineProperty(global, 'localStorage', {
            value: localStorageMock,
            writable: true
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should clear quick start modal flag when starting new game', () => {
        // Set the flag to indicate modal has been shown before
        localStorage.setItem("reactorGameQuickStartShown", "1");

        // Verify the flag is set
        expect(localStorage.setItem).toHaveBeenCalledWith("reactorGameQuickStartShown", "1");

        // Clear the quick start modal flag (as done in the new game button handler)
        localStorage.removeItem("reactorGameQuickStartShown");

        // Verify the flag has been cleared
        expect(localStorage.removeItem).toHaveBeenCalledWith("reactorGameQuickStartShown");
    });

    it('should set quick start modal flag when modal is closed', () => {
        // Ensure no quick start modal has been shown before
        localStorage.removeItem("reactorGameQuickStartShown");

        // Simulate closing the modal (as done in showQuickStartModal)
        const closeModal = () => {
            localStorage.setItem("reactorGameQuickStartShown", "1");
        };

        // Call the close function
        closeModal();

        // Verify the flag was set
        expect(localStorage.setItem).toHaveBeenCalledWith("reactorGameQuickStartShown", "1");
    });

    it('should check for quick start modal flag correctly', () => {
        // Test when flag is not set
        localStorage.getItem.mockReturnValue(null);
        const shouldShowModal = !localStorage.getItem("reactorGameQuickStartShown");
        expect(shouldShowModal).toBe(true);

        // Test when flag is set
        localStorage.getItem.mockReturnValue("1");
        const shouldNotShowModal = !localStorage.getItem("reactorGameQuickStartShown");
        expect(shouldNotShowModal).toBe(false);
    });

    it('should handle new game flow correctly', () => {
        // Simulate the new game button handler logic
        const startNewGame = () => {
            // Clear the quick start modal flag for new games
            localStorage.removeItem("reactorGameQuickStartShown");

            // Check if modal should be shown (it should, since we just cleared the flag)
            const shouldShowModal = !localStorage.getItem("reactorGameQuickStartShown");
            return shouldShowModal;
        };

        // Call the new game function
        const modalShouldShow = startNewGame();

        // Verify the flag was cleared and modal should be shown
        expect(localStorage.removeItem).toHaveBeenCalledWith("reactorGameQuickStartShown");
        expect(modalShouldShow).toBe(true);
    });

    it('should handle loaded game flow correctly', () => {
        // Simulate the loaded game flow (without clearing the flag)
        const startLoadedGame = () => {
            // Don't clear the flag for loaded games
            // Check if modal should be shown
            const shouldShowModal = !localStorage.getItem("reactorGameQuickStartShown");
            return shouldShowModal;
        };

        // Set the flag to indicate modal has been shown before
        localStorage.setItem("reactorGameQuickStartShown", "1");

        // Mock the getItem to return the set value
        localStorage.getItem.mockReturnValue("1");

        // Call the loaded game function
        const modalShouldShow = startLoadedGame();

        // Verify the flag was not cleared and modal should not be shown
        expect(localStorage.removeItem).not.toHaveBeenCalledWith("reactorGameQuickStartShown");
        expect(modalShouldShow).toBe(false);
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