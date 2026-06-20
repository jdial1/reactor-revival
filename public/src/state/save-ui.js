import { backupModalTemplate } from "../templates/stateTemplates.js";

function renderBackupModalTemplate(content, onLoad, onCancel) {
  content.innerHTML = backupModalTemplate;
  content.querySelector('[data-action="load-backup"]')?.addEventListener("click", onLoad);
  content.querySelector('[data-action="cancel"]')?.addEventListener("click", onCancel);
}

export function showLoadBackupModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const content = document.createElement("div");
    overlay.appendChild(content);
    const resolveAndClose = (value) => {
      overlay.remove();
      resolve(value);
    };
    renderBackupModalTemplate(content, () => resolveAndClose(true), () => resolveAndClose(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) resolveAndClose(false);
    });
    document.body.appendChild(overlay);
  });
}
