import { updateDecimal } from "../store.js";
import { serializeReactor, deserializeReactor } from "../../components/ui/copyPaste/layoutSerializer.js";
import { calculateLayoutCostBreakdown, calculateLayoutCost, renderLayoutPreview } from "../../components/ui/copyPaste/layoutCostUtils.js";
import { buildPartSummary, buildAffordableSet } from "../../components/ui/copyPaste/layoutSummaryUtils.js";
import {
  filterLayoutByCheckedTypes,
  clipToGrid,
  calculateCurrentSellValue,
  buildAffordableLayout,
  buildPasteState,
  validatePasteResources,
  getCostBreakdown,
} from "../../components/ui/copyPaste/layoutPasteLogic.js";

export class BlueprintService {
  constructor(game) {
    this.game = game;
  }

  serialize() {
    return serializeReactor(this.game);
  }

  deserialize(str) {
    return deserializeReactor(str);
  }

  getCostBreakdown(layout) {
    return calculateLayoutCostBreakdown(this.game?.partset, layout);
  }

  getTotalCost(layout) {
    return calculateLayoutCost(this.game?.partset, layout);
  }

  getPartSummary(layout) {
    return buildPartSummary(this.game?.partset, layout);
  }

  getAffordableSet(affordableLayout) {
    return buildAffordableSet(affordableLayout);
  }

  filterByTypes(layout, checkedTypes) {
    return filterLayoutByCheckedTypes(layout, checkedTypes);
  }

  clipToGrid(layout, rows, cols) {
    return clipToGrid(layout, rows ?? this.game.rows, cols ?? this.game.cols);
  }

  getCurrentSellValue() {
    return calculateCurrentSellValue(this.game?.tileset);
  }

  buildAffordableLayout(filteredLayout, sellCredit) {
    return buildAffordableLayout(filteredLayout, sellCredit, this.game.rows, this.game.cols, this.game);
  }

  buildPasteState(layout, checkedTypes, sellCheckboxChecked) {
    return buildPasteState(layout, checkedTypes, this.game, this.game?.tileset, sellCheckboxChecked);
  }

  validateResources(breakdown, sellCredit) {
    return validatePasteResources(
      breakdown,
      sellCredit,
      this.game.state.current_money,
      this.game.state.current_exotic_particles ?? 0
    );
  }

  renderPreview(layout, canvasEl, affordableSet) {
    return renderLayoutPreview(this.game?.partset, layout, canvasEl, affordableSet);
  }

  applyLayout(layout, skipCostDeduction = false) {
    const clipped = this.clipToGrid(layout);
    this.game.tileset.tiles_list.forEach(tile => {
      if (tile.enabled && tile.part) tile.clearPart();
    });

    clipped.flatMap((row, r) => (row || []).map((cell, c) => (cell?.id ? { r, c, cell } : null)).filter(Boolean))
      .forEach(({ r, c, cell }) => {
        const part = this.game.partset.getPartById(cell.id);
        if (part) {
          const tile = this.game.tileset.getTile(r, c);
          if (tile?.enabled) tile.setPart(part);
        }
      });

    if (!skipCostDeduction && !this.game.isSandbox) {
      const { money: costMoney, ep: costEp } = getCostBreakdown(clipped, this.game.partset);
      if (costMoney > 0 && this.game.state.current_money) {
        updateDecimal(this.game.state, "current_money", (d) => d.sub(costMoney));
      }
      if (costEp > 0 && this.game.state.current_exotic_particles) {
        updateDecimal(this.game.state, "current_exotic_particles", (d) => d.sub(costEp));
      }
    }
    return clipped;
  }
}
