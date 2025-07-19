export function createTooltipCloseButton(onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "tooltip-close-btn-template"
  );
  if (btn && onClick) {
    btn.onclick = onClick;
  }
  return btn;
}

export function createHelpButton(onClick, title = "Click for information") {
  const btn = window.templateLoader.cloneTemplateElement("help-btn-template");
  if (btn) {
    btn.title = title;
    if (onClick) {
      btn.addEventListener("click", onClick);
    }
  }
  return btn;
}

export function createUpgradeButton(upgrade) {
  const btn = window.templateLoader.cloneTemplateElement(
    "upgrade-btn-template"
  );
  if (!btn) return null;

  // Set upgrade data
  btn.dataset.id = upgrade.id;

  // Set image
  const image = btn.querySelector(".image");
  if (image) {
    image.style.setProperty("--bg-image", `url(${upgrade.image})`);
  }

  // Set cost if available
  if (upgrade.cost !== undefined) {
    const price = btn.querySelector(".upgrade-price");
    if (price) {
      price.textContent = upgrade.cost;
      price.style.display = "";
    }
  }

  // Set level if available
  if (upgrade.level !== undefined) {
    const levels = btn.querySelector(".levels");
    if (levels) {
      levels.textContent = `${upgrade.level}/${upgrade.max_level}`;
      levels.style.display = "";
    }
  }

  return btn;
}

export function createPartButton(part) {
  const btn = window.templateLoader.cloneTemplateElement("part-btn-template");
  if (!btn) return null;
  btn.id = `part_btn_${part.id}`;
  btn.title = part.title;
  const imageDiv = btn.querySelector(".image");
  if (imageDiv) {
    imageDiv.style.setProperty("--bg-image", `url('${part.getImagePath()}')`);
  }
  const priceDiv = btn.querySelector(".part-price");
  if (priceDiv) {
    priceDiv.textContent = part.erequires ? `${part.cost} 🧬 EP` : `${part.cost}`;
  }
  btn.classList.toggle("unaffordable", !part.affordable);
  btn.disabled = !part.affordable;
  return btn;
}

export function createBuyButton(upgrade, onClick) {
  const btn = window.templateLoader.cloneTemplateElement("buy-btn-template");
  if (!btn) return null;

  btn.disabled = !upgrade.affordable;

  // Set cost text
  const costText = btn.querySelector(".cost-text");
  const cashIcon = btn.querySelector(".icon-inline");

  if (upgrade.current_cost !== undefined) {
    if (cashIcon) cashIcon.style.display = "";
    if (costText) costText.textContent = `${upgrade.current_cost}`;
  } else if (upgrade.current_ecost !== undefined) {
    if (cashIcon) cashIcon.style.display = "none";
    if (costText) costText.textContent = `${upgrade.current_ecost} 🧬 EP`;
  }

  if (onClick) {
    btn.onclick = onClick;
  }

  return btn;
}

export function createInstallButton(onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "install-btn-template"
  );
  if (btn && onClick) {
    btn.onclick = onClick;
  }
  return btn;
}

export function createCloudSaveButton(saveData, playedTimeStr, onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "cloud-save-btn-template"
  );
  if (!btn) return null;

  // Set dynamic content
  window.templateLoader.setText(
    btn,
    ".money",
    `$${saveData?.current_money ?? 0}`
  );
  window.templateLoader.setText(btn, ".played-time", playedTimeStr);

  if (onClick) {
    btn.onclick = onClick;
  }

  return btn;
}

export function createLoadingButton(text, spinnerClass = "loading-spinner") {
  const btn = window.templateLoader.cloneTemplateElement(
    "loading-btn-template"
  );
  if (!btn) return null;

  const spinner = btn.querySelector(".loading-spinner");
  if (spinner && spinnerClass !== "loading-spinner") {
    spinner.className = spinnerClass;
  }

  const textSpan = btn.querySelector(".loading-text");
  if (textSpan) {
    textSpan.textContent = text;
  }

  return btn;
}

export function createGoogleSignInButtonWithIcon(onClick) {
  const btn = window.templateLoader.cloneTemplateElement(
    "google-signin-btn-with-icon-template"
  );
  if (btn && onClick) {
    btn.onclick = onClick;
  }
  return btn;
}
