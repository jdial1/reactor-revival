export const showLoadBackupModal = () =>
  new Promise((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";

    const panel = document.createElement("div");
    panel.className = "bios-overlay-content";
    panel.style.maxWidth = "420px";

    const title = document.createElement("h2");
    title.style.marginBottom = "0.75rem";
    title.style.fontSize = "0.9rem";
    title.textContent = "Save file corrupted";

    const body = document.createElement("p");
    body.style.fontSize = "0.65rem";
    body.style.color = "rgb(180 190 170)";
    body.style.marginBottom = "1rem";
    body.textContent = "The current save could not be read. Load from backup?";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.flexDirection = "column";
    actions.style.gap = "0.5rem";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "splash-btn";
    loadBtn.dataset.action = "load-backup";
    loadBtn.textContent = "Load backup";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "splash-btn splash-btn-exit";
    cancelBtn.dataset.action = "cancel";
    cancelBtn.textContent = "Cancel";

    actions.append(loadBtn, cancelBtn);
    panel.append(title, body, actions);
    overlay.appendChild(panel);

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
