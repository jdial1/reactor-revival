import { numFormat } from "../js/util.js";

export function createNewGameButton(onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "splash-new-game-btn-template"
  );
  if (btn && onClick) {
    btn.onclick = onClick;
  }
  return btn;
}

export function createLoadGameButton(
  saveData,
  playedTimeStr,
  isCloudSynced,
  onClick
) {
  const btn = window.templateLoader.cloneTemplateElement(
    "splash-load-game-btn-template"
  );
  if (!btn) return null;

  // Set dynamic content
  window.templateLoader.setText(
    btn,
    ".money",
    `$${numFormat(saveData?.current_money ?? 0)}`
  );
  // Use innerHTML for played-time to allow HTML tags
  const playedTimeEl = btn.querySelector(".played-time");
  if (playedTimeEl) playedTimeEl.innerHTML = playedTimeStr;
  window.templateLoader.setVisible(btn, ".synced-label", isCloudSynced);

  if (onClick) {
    btn.onclick = onClick;
  }
  return btn;
}

export function createUploadToCloudButton(onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "splash-upload-option-btn-template"
  );
  if (btn && onClick) {
    btn.onclick = onClick;
  }
  return btn;
}

export function createLoadFromCloudButton(onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "splash-load-cloud-btn-template"
  );
  if (btn && onClick) {
    btn.onclick = onClick;
  }
  return btn;
}

export function createGoogleSignInButton(onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "splash-google-signin-btn-template"
  );
  if (btn && onClick) {
    btn.onclick = onClick;
  }
  return btn;
}

export function createGoogleSignOutButton(onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "splash-google-signout-btn-template"
  );
  if (btn && onClick) {
    btn.onclick = onClick;
  }
  return btn;
}

export function createLoadGameUploadRow(
  saveData,
  playedTimeStr,
  isCloudSynced,
  onLoadClick,
  onUploadClick
) {
  const row = window.templateLoader.cloneTemplateElement(
    "splash-load-game-upload-row-template"
  );
  if (!row) return null;
  // Set dynamic content for load game button
  const loadGameBtn = row.querySelector("#splash-load-game-btn");
  if (loadGameBtn) {
    window.templateLoader.setText(
      loadGameBtn,
      ".money",
      `$${numFormat(saveData?.current_money ?? 0)}`
    );
    const playedTimeEl = loadGameBtn.querySelector(".played-time");
    if (playedTimeEl) playedTimeEl.innerHTML = playedTimeStr;
    window.templateLoader.setVisible(
      loadGameBtn,
      ".synced-label",
      isCloudSynced
    );
    if (onLoadClick) loadGameBtn.onclick = onLoadClick;
  }
  // Set up upload button
  const uploadBtn = row.querySelector("#splash-upload-option-btn");
  if (uploadBtn && onUploadClick) uploadBtn.onclick = onUploadClick;
  return row;
}

export function createLoadGameButtonFullWidth(
  saveData,
  playedTimeStr,
  isCloudSynced,
  onClick
) {
  const btn = window.templateLoader.cloneTemplateElement(
    "splash-load-game-btn-template"
  );
  if (!btn) return null;

  const headerSpan = btn.querySelector(".load-game-header span");
  if (headerSpan) {
    headerSpan.textContent = "Load Game"; // Set a default that can be overridden
  }

  // Remove money and played time details for a cleaner button
  const moneyEl = btn.querySelector('.money');
  if (moneyEl) moneyEl.remove();
  const playedTimeEl = btn.querySelector('.played-time');
  if (playedTimeEl) playedTimeEl.remove();

  window.templateLoader.setVisible(btn, ".synced-label", isCloudSynced);

  if (onClick) btn.onclick = onClick;

  return btn;
}
