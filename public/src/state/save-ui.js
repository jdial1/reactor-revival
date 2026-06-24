import { backupModalTemplate } from "../templates/stateTemplates.js";

export function showLoadBackupModal() {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const content = document.createElement("div");
    content.innerHTML = backupModalTemplate;
    overlay.appendChild(content);
    const resolveAndClose = (value) => {
      controller.abort();
      overlay.remove();
      resolve(value);
    };
    overlay.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset?.action;
      if (action === "load-backup") resolveAndClose(true);
      else if (action === "cancel") resolveAndClose(false);
      else if (e.target === overlay) resolveAndClose(false);
    }, { signal });
    document.body.appendChild(overlay);
  });
}
