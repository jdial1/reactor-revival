import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupGameWithDOM } from '../helpers/setup.js';

describe.skip('Clipboard Functionality', () => {
    let ui;
    let mockNavigator;
    let game;

    beforeEach(async () => {
        // Setup DOM environment
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;

        // Add the modal elements to the DOM
        const modalHtml = `
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
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Mock navigator.clipboard
        mockNavigator = {
            clipboard: {
                writeText: vi.fn(),
                readText: vi.fn()
            }
        };
        Object.defineProperty(global, 'navigator', {
            value: mockNavigator,
            writable: true
        });

        // Mock navigator.clipboard
        mockNavigator = {
            clipboard: {
                writeText: vi.fn(),
                readText: vi.fn()
            }
        };
        Object.defineProperty(global, 'navigator', {
            value: mockNavigator,
            writable: true
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('readFromClipboard', () => {
        it('should return success when clipboard API works', async () => {
            mockNavigator.clipboard.readText.mockResolvedValue('{"test": "data"}');

            const result = await ui.readFromClipboard();

            expect(result.success).toBe(true);
            expect(result.data).toBe('{"test": "data"}');
            expect(result.method).toBe('clipboard-api');
        });

        it('should handle permission denied error', async () => {
            const permissionError = new Error('Permission denied');
            permissionError.name = 'NotAllowedError';
            mockNavigator.clipboard.readText.mockRejectedValue(permissionError);

            const result = await ui.readFromClipboard();

            expect(result.success).toBe(false);
            expect(result.error).toBe('permission-denied');
            expect(result.message).toBe('Clipboard access denied. Please manually paste your data.');
        });

        it('should handle other clipboard errors', async () => {
            mockNavigator.clipboard.readText.mockRejectedValue(new Error('Other error'));

            const result = await ui.readFromClipboard();

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
            const modal = document.getElementById('reactor_copy_paste_modal');
            const modalTitle = document.getElementById('reactor_copy_paste_modal_title');
            const modalText = document.getElementById('reactor_copy_paste_text');

            expect(modal.classList.contains('hidden')).toBe(false);
            expect(modalTitle.textContent).toBe('Enter Reactor Layout Manually');
            expect(modalText.placeholder).toBe('Enter reactor layout JSON data manually...');
        });
    });
}); 