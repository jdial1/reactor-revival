import { toDecimal } from "../../utils/decimal.js";
import { logger } from "../../utils/logger.js";

export function handleComponentExplosion(engine, tile) {
  tile.exploded = true;
  if (engine.game.audio) {
    const pan = engine.game.calculatePan ? engine.game.calculatePan(tile.col) : 0;
    engine.game.audio.play('explosion', null, pan);
  }

  if (tile && tile.heat_contained > 0) {
    if (engine.game.reactor.decompression_enabled) {
      const heatToRemove = tile.heat_contained;
      const after = engine.game.reactor.current_heat.sub(heatToRemove);
      engine.game.reactor.current_heat = after.lt(0) ? toDecimal(0) : after;
      logger.log('debug', 'engine', `[DECOMPRESSION] Vented ${heatToRemove} heat from explosion.`);
    } else {
      engine.game.reactor.current_heat = engine.game.reactor.current_heat.add(tile.heat_contained);
    }
  }
  if (engine.game.reactor.insurance_percentage > 0 && tile.part) {
    const costNum = tile.part.cost && typeof tile.part.cost.toNumber === 'function' ? tile.part.cost.toNumber() : Number(tile.part.cost || 0);
    const refund = Math.floor(costNum * engine.game.reactor.insurance_percentage);
    if (refund > 0) {
      engine.game.addMoney(refund);
      logger.log('debug', 'engine', `[INSURANCE] Refunded $${refund} for exploded ${tile.part.id}`);
    }
  }

  tile.exploding = true;
  if (typeof engine.game.emit === "function") {
    engine.game.emit("component_explosion", { row: tile.row, col: tile.col, partId: tile.part?.id });
  }
  setTimeout(() => {
    engine.handleComponentDepletion(tile);
    tile.exploding = false;
  }, 600);
}
