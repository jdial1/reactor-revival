import { toDecimal, toNumber } from "../simUtils.js";
import { projectHeatMapToTileset } from "./core-state-projection.js";

export function bumpGridPartsRevision(tileset) {
  if (!tileset) return;
  tileset._partsRevision = (tileset._partsRevision ?? 0) + 1;
  const engine = tileset.game?.engine;
  if (engine) engine._workerPartSnapshotCache = null;
}

export function syncGridCheap(_bridge) {}

function copyTileStateToInstance(bridge, tile, inst, row, col) {
  if (tile.heat_contained != null) {
    bridge.session.grid.setTileHeat(row, col, toNumber(tile.heat_contained));
  }
  if (tile.ticks != null) inst.ticks = tile.ticks;
  else if (tile.part?.ticks) inst.ticks = tile.part.ticks;
  if (bridge.session.grid.tileHeatMap) {
    bridge.session.grid.tileHeatMap.setActivated(row, col, tile.activated !== false);
  }
  delete inst.power;
  delete inst.heat;
}

export function hydrateGridFromHost(bridge) {
  if (!bridge.session || !bridge.game?.tileset) return;
  const { tileset, rows, cols } = bridge.game;
  if (bridge.session.grid.rows !== rows || bridge.session.grid.cols !== cols) {
    bridge.session.grid.resize(rows, cols);
  }
  bridge.session.grid.clearGrid();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = tileset.getTile(r, c);
      const partId = tile?.part?.id;
      if (partId) {
        bridge.session.placeComponent(r, c, partId);
        const inst = bridge.session.grid.getComponentAt(r, c);
        if (inst) copyTileStateToInstance(bridge, tile, inst, r, c);
      }
    }
  }
  bridge.session.grid.currentHeat = toNumber(bridge.game.reactor?.current_heat ?? 0);
  bridge.session.grid.currentPower = toNumber(bridge.game.reactor?.current_power ?? 0);
  bridge.session.grid.recalculateCaps?.();
}

export function syncGridToGame(bridge) {
  const game = bridge.game;
  const session = bridge.session;
  if (!game?.tileset || !session) return;
  const { tileset, partset, rows, cols } = game;
  const grid = session.grid;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = tileset.getTile(r, c);
      const inst = grid.getComponentAt(r, c);
      if (!inst) {
        if (tile?.part) {
          tile.part = null;
          tile._setProjectedTicks?.(0);
          tile._setProjectedHeat?.(0);
          tile.display_power = 0;
          tile.display_heat = 0;
          tile.activated = false;
        } else if (tile) {
          tile._setProjectedHeat?.(0);
          tile._setProjectedTicks?.(0);
        } else {
          continue;
        }
        if (!tile._setProjectedTicks) {
          tile.ticks = 0;
          tile.heat_contained = toDecimal(0);
        }
        continue;
      }
      const part = partset.getPartById(inst.definition.id);
      if (!part) continue;
      const tileHeat = grid.getTileHeat(r, c);
      tile.applySessionSync(part, inst, typeof tileHeat === "number" ? tileHeat : 0);
    }
  }
  projectHeatMapToTileset(bridge);
  bumpGridPartsRevision(tileset);
  game.tileset.updateActiveTiles?.();
}
