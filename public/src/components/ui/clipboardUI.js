import { logger } from "../../utils/logger.js";

export class ClipboardUI {
  constructor(ui) {
    this.ui = ui;
  }

  async writeToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return { success: true, method: 'clipboard-api' };
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Clipboard API failed:', error);
    }
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) return { success: true, method: 'exec-command' };
    } catch (error) {
      logger.warn("execCommand fallback failed:", error);
    }
    return { success: false, error: 'No clipboard method available' };
  }

  async readFromClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        return { success: true, data: text, method: 'clipboard-api' };
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Clipboard API read failed:', error);
      if (error.name === 'NotAllowedError') {
        return { success: false, error: 'permission-denied', message: 'Clipboard access denied. Please manually paste your data.' };
      }
    }
    return { success: false, error: 'no-clipboard-api', message: 'Clipboard reading not supported. Please manually paste your data.' };
  }
}
