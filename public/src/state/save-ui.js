export const showLoadBackupModal = () =>
  new Promise((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const content = document.createElement("div");
    content.innerHTML = `<div class="bios-overlay-content" style="max-width: 420px;">
  <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Save file corrupted</h2>
  <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 1rem;">The current save could not be read. Load from backup?</p>
  <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    <button type="button" class="splash-btn" data-action="load-backup">Load backup</button>
    <button type="button" class="splash-btn splash-btn-exit" data-action="cancel">Cancel</button>
  </div>
</div>`;
    overlay.appendChild(content);
    const resolveAndClose = (value) => {
      controller.abort();
      overlay.remove();
      resolve(value);
    };
    overlay.addEventListener(
      "click",
      (e) => {
        const action = e.target.closest("[data-action]")?.dataset?.action;
        if (action === "load-backup") resolveAndClose(true);
        else if (action === "cancel") resolveAndClose(false);
        else if (e.target === overlay) resolveAndClose(false);
      },
      { signal },
    );
    document.body.appendChild(overlay);
  });
