import { describe, it, expect, vi, beforeEach, afterEach, setupGameWithDOM, mockClipboardAPI, getCopyPasteModalRefs } from '../../helpers/setup.js';

describe('Clipboard Functionality', () => {
    let ui;
    let mockNavigator;
    let game;
    let restoreClipboardMock;

    beforeEach(async () => {
        // Setup DOM environment
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;

        const clip = mockClipboardAPI();
        mockNavigator = clip.navigator;
        restoreClipboardMock = clip.restore;
    });

    afterEach(() => {
        restoreClipboardMock?.();
        vi.clearAllMocks();
    });

    describe('readFromClipboard', () => {
        it('should return success when clipboard API works', async () => {
            mockNavigator.clipboard.readText.mockResolvedValue('{"test": "data"}');

            const result = await ui.clipboardUI.readFromClipboard();

            expect(result.success).toBe(true);
            expect(result.data).toBe('{"test": "data"}');
            expect(result.method).toBe('clipboard-api');
        });

        it('should handle permission denied error', async () => {
            const permissionError = new Error('Permission denied');
            permissionError.name = 'NotAllowedError';
            mockNavigator.clipboard.readText.mockRejectedValue(permissionError);

            const result = await ui.clipboardUI.readFromClipboard();

            expect(result.success).toBe(false);
            expect(result.error).toBe('permission-denied');
            expect(result.message).toBe('Clipboard access denied. Please manually paste your data.');
        });

        it('should handle other clipboard errors', async () => {
            mockNavigator.clipboard.readText.mockRejectedValue(new Error('Other error'));

            const result = await ui.clipboardUI.readFromClipboard();

            expect(result.success).toBe(false);
            expect(result.error).toBe('no-clipboard-api');
            expect(result.message).toBe('Clipboard reading not supported. Please manually paste your data.');
        });
    });



    describe('Manual Entry Modal', () => {
        it('should show manual entry modal when clipboard access is denied', async () => {
            const permissionError = new Error('Permission denied');
            permissionError.name = 'NotAllowedError';
            mockNavigator.clipboard.readText.mockRejectedValue(permissionError);

            // Initialize the copy/paste UI
            ui.initializeCopyPasteUI();

            // Trigger paste button click
            const pasteBtn = document.getElementById('reactor_paste_btn');
            await pasteBtn.click();

            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check that modal is shown with manual entry title
            const refs = getCopyPasteModalRefs(document);
            expect(refs).not.toBeNull();
            expect(refs.modal.classList.contains('hidden')).toBe(false);
            expect(refs.modalTitle.textContent).toBe('Enter Reactor Layout Manually');
            expect(refs.modalText.placeholder).toBe('Enter reactor layout JSON data manually...');
        });
    });
}); 