import { numFormat as fmt, resolveDomElement } from "./utils.js";

const partMappings = { "Quad Plutonium Cells": "./img/parts/cell_2_4.png", "Quad Thorium Cells": "./img/parts/cell_3_4.png", "Quad Seaborgium Cells": "./img/parts/cell_4_4.png", "Quad Dolorium Cells": "./img/parts/cell_5_4.png", "Quad Nefastium Cells": "./img/parts/cell_6_4.png", "Particle Accelerators": "./img/parts/accelerator_1.png", "Plutonium Cells": "./img/parts/cell_2_1.png", "Thorium Cells": "./img/parts/cell_3_1.png", "Seaborgium Cells": "./img/parts/cell_4_1.png", "Dolorium Cells": "./img/parts/cell_5_1.png", "Nefastium Cells": "./img/parts/cell_6_1.png", "Heat Vent": "./img/parts/vent_1.png", "Capacitors": "./img/parts/capacitor_1.png", "Dual Cell": "./img/parts/cell_1_2.png", "Uranium Cell": "./img/parts/cell_1_1.png", "Capacitor": "./img/parts/capacitor_1.png", "Cells": "./img/parts/cell_1_1.png", "Cell": "./img/parts/cell_1_1.png", "experimental part": "./img/parts/xcell_1_1.png", "Improved Chronometers upgrade": "./img/upgrades/upgrade_flux.png", "Improved Chronometers": "./img/upgrades/upgrade_flux.png", "Power": "./img/ui/icons/icon_power.png", "Heat": "./img/ui/icons/icon_heat.png", "Exotic Particles": "🧬" };

export function addPartIconsToTitle(game, title) {
  if (typeof title !== "string") return title;
  let processedTitle = title;
  const sortedMappings = Object.entries(partMappings).sort((a, b) => b[0].length - a[0].length);
  const placeholders = new Map();
  let placeholderCounter = 0;
  for (const [partName, iconPath] of sortedMappings) {
    const isEmoji = iconPath.length === 1 || iconPath.match(/^[^a-zA-Z0-9./]/);
    const escapedPartName = partName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedPartName.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (isEmoji) processedTitle = processedTitle.replace(regex, `${iconPath} ${partName}`);
    else { const iconHtml = `<img src=\"${iconPath}\" class=\"objective-part-icon\" alt=\"${partName}\" title=\"${partName}\">`; processedTitle = processedTitle.replace(regex, () => { const placeholder = `__PLACEHOLDER_${placeholderCounter}__`; placeholders.set(placeholder, `${iconHtml} ${partName}`); placeholderCounter++; return placeholder; }); }
  }
  for (const [placeholder, replacement] of placeholders) processedTitle = processedTitle.replace(placeholder, replacement);
  processedTitle = processedTitle.replace(/\$?\d{1,3}(?:,\d{3})+|\$?\d{4,}/g, (match) => { const hasDollar = match.startsWith("$"); const numStr = match.replace(/[^\d]/g, ""); const formatted = fmt(Number(numStr)); return hasDollar ? (`$${formatted}`) : formatted; });
  return processedTitle;
}

export function getObjectiveScrollDuration() { const baseWidth = 900; const baseDuration = 8; const screenWidth = (typeof window !== "undefined" && window.innerWidth) ? window.innerWidth : baseWidth; const duration = baseDuration * (screenWidth / baseWidth); return Math.max(5, Math.min(18, duration)); }

export function checkObjectiveTextScrolling(domElements) {
  const toastTitleEl = resolveDomElement(domElements?.objectives_toast_title)
    ?? (typeof document !== "undefined" ? document.getElementById("objectives_toast_title") : null);
  if (!toastTitleEl) return;
  toastTitleEl.style.animation = "none";
  toastTitleEl.classList.remove("objectives-toast-title--typewriter");
  const text = toastTitleEl.textContent || "";
  if (!text.trim()) return;
  toastTitleEl.textContent = text;
}
