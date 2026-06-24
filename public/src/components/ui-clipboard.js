import { writeClipboardText, readClipboardText } from "../core/clipboard.js";

class ClipboardUI {
  constructor(ui) {
    this.ui = ui;
  }
  writeToClipboard(text) {
    return writeClipboardText(text);
  }
  readFromClipboard() {
    return readClipboardText();
  }
}

export { ClipboardUI };
