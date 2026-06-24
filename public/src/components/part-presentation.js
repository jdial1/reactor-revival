import { renderToNode, PartButton } from "./button-factory.js";

const partElements = new WeakMap();

export function bindPartElement(part, el) {
  if (el && el.nodeType === 1) partElements.set(part, el);
  else partElements.delete(part);
}

export function getPartElement(part) {
  return partElements.get(part) ?? null;
}

export function createPartElement(part) {
  const onClick = () => {
    const el = getPartElement(part);
    if (part.affordable) {
      if (part.game?.ui?.help_mode_active && part.game?.ui?.tooltipManager) {
        part.game.ui.tooltipManager.show(part, null, true, el);
      }
      const uiState = part.game?.ui?.uiState;
      if (uiState?.interaction) {
        uiState.interaction.selectedPartId = part.id;
      }
      part.game.emit?.("partClicked", { part });
      el?.classList.add("part_active");
    } else if (part.game?.ui?.tooltipManager) {
      part.game.ui.tooltipManager.show(part, null, true, el);
    }
  };
  const el = renderToNode(PartButton(part, onClick));
  bindPartElement(part, el);
  return el;
}

export function attachPartPresentation(PartClass) {
  PartClass.prototype.createElement = function createElement() {
    return createPartElement(this);
  };
}
