// src/components/buttonFactory.js
// Consolidated button creation logic for the Reactor Revival game

import { numFormat } from "../utils/util.js";

// --- Splash Screen Buttons ---

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

export function createLoadGameButtonFullWidth(
    saveData,
    playedTimeStr,
    isCloudSynced,
    onClick
) {
    const btn = window.templateLoader.cloneTemplateElement(
        "splash-load-game-full-width-btn-template"
    );
    if (!btn) return null;

    // Set dynamic content
    window.templateLoader.setText(
        btn,
        ".money",
        `$${numFormat(saveData?.current_money ?? 0)}`
    );
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
        window.templateLoader.setVisible(loadGameBtn, ".synced-label", isCloudSynced);
        if (onLoadClick) {
            loadGameBtn.onclick = onLoadClick;
        }
    }

    // Set up upload button
    const uploadBtn = row.querySelector("#splash-upload-option-btn");
    if (uploadBtn && onUploadClick) {
        uploadBtn.onclick = onUploadClick;
    }

    return row;
}

// --- General UI Buttons ---

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

export function createCloudSaveButton(saveData, playedTimeStr, onClick) {
    const btn = window.templateLoader.cloneTemplateElement(
        "cloud-save-btn-template"
    );
    if (!btn) return null;

    // Set dynamic content
    window.templateLoader.setText(
        btn,
        ".money",
        `$${numFormat(saveData?.current_money ?? 0)}`
    );
    const playedTimeEl = btn.querySelector(".played-time");
    if (playedTimeEl) playedTimeEl.innerHTML = playedTimeStr;

    if (onClick) {
        btn.onclick = onClick;
    }
    return btn;
}

export function createLoadingButton(text, spinnerClass = "loading-spinner") {
    const btn = window.templateLoader.cloneTemplateElement("loading-btn-template");
    if (!btn) return null;

    const textEl = btn.querySelector(".loading-text");
    if (textEl) {
        textEl.textContent = text;
    }

    const spinner = btn.querySelector(`.${spinnerClass}`);
    if (spinner) {
        spinner.style.display = "";
    }

    return btn;
}

export function createGoogleSignInButtonWithIcon(onClick) {
    const btn = window.templateLoader.cloneTemplateElement(
        "google-signin-btn-template"
    );
    if (btn && onClick) {
        btn.onclick = onClick;
    }
    return btn;
}

export function createInstallButton(onClick) {
    const btn = window.templateLoader.cloneTemplateElement("install-btn-template");
    if (btn && onClick) {
        btn.onclick = onClick;
    }
    return btn;
} 