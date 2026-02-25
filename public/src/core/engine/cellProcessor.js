import { VISUAL_EVENT_POWER, VISUAL_EVENT_HEAT } from "../engine.js";
import {
  VISUAL_PARTICLE_HIGH_THRESHOLD,
  VISUAL_PARTICLE_MED_THRESHOLD,
  VISUAL_PARTICLE_HIGH_COUNT,
  VISUAL_PARTICLE_MED_COUNT,
} from "../constants.js";

function getVisualParticleCount(value) {
  if (value >= VISUAL_PARTICLE_HIGH_THRESHOLD) return VISUAL_PARTICLE_HIGH_COUNT;
  if (value >= VISUAL_PARTICLE_MED_THRESHOLD) return VISUAL_PARTICLE_MED_COUNT;
  return 1;
}

function emitCellVisualEvents(engine, tile, multiplier) {
  if (tile.power > 0 && Math.random() < multiplier) {
    const count = getVisualParticleCount(tile.power);
    for (let k = 0; k < count; k++) {
      engine.enqueueVisualEvent(VISUAL_EVENT_POWER, tile.row, tile.col, 0);
    }
  }
  if (tile.heat > 0 && Math.random() < multiplier) {
    const count = getVisualParticleCount(tile.heat);
    for (let k = 0; k < count; k++) {
      engine.enqueueVisualEvent(VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
    }
  }
}

function countValidContainmentNeighbors(neighbors) {
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (n.part && n.part.containment > 0 && !n.exploded) count++;
  }
  return count;
}

function distributeHeatToNeighbors(neighbors, generatedHeat, validCount) {
  const heatPerNeighbor = generatedHeat / validCount;
  for (let j = 0; j < neighbors.length; j++) {
    const t = neighbors[j];
    if (t.part && t.part.containment > 0 && !t.exploded) {
      t.heat_contained += heatPerNeighbor;
    }
  }
}

function processReflectorNeighbors(engine, tile, multiplier) {
  const reflectorNeighbors = tile.reflectorNeighborTiles;
  for (let j = 0; j < reflectorNeighbors.length; j++) {
    const r_tile = reflectorNeighbors[j];
    if (r_tile.ticks > 0) {
      r_tile.ticks -= multiplier;
      if (r_tile.ticks <= 0) engine.handleComponentDepletion(r_tile);
    }
  }
}

function handleCellDepletion(engine, tile) {
  const part = tile.part;
  if (part.type === "protium") {
    engine.game.protium_particles += part.cell_count;
    engine.game.update_cell_power();
  }
  engine.handleComponentDepletion(tile);
}

export function processCells(engine, multiplier) {
  let power_add = 0;
  let heat_add = 0;

  for (let i = 0; i < engine.active_cells.length; i++) {
    const tile = engine.active_cells[i];
    if (!tile.part || tile.exploded || tile.ticks <= 0) continue;

    power_add += tile.power * multiplier;

    emitCellVisualEvents(engine, tile, multiplier);

    const generatedHeat = tile.heat * multiplier;
    const neighbors = tile.containmentNeighborTiles;
    const validCount = countValidContainmentNeighbors(neighbors);

    if (validCount > 0) {
      distributeHeatToNeighbors(neighbors, generatedHeat, validCount);
    } else {
      heat_add += generatedHeat;
    }

    tile.ticks -= multiplier;
    processReflectorNeighbors(engine, tile, multiplier);

    if (tile.ticks <= 0) handleCellDepletion(engine, tile);
  }

  return { power_add, heat_add };
}
