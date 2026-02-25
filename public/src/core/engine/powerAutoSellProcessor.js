import Decimal from "../../utils/decimal.js";
import { logger } from "../../utils/logger.js";

export function processAutoSell(engine, multiplier, effectiveMaxPower) {
  const reactor = engine.game.reactor;
  const game = engine.game;
  const autoSellEnabled = reactor.auto_sell_enabled ?? game.state?.auto_sell ?? false;

  if (!autoSellEnabled) return;

  const sellCap = effectiveMaxPower.mul(reactor.auto_sell_multiplier).mul(multiplier);
  const sellAmount = Decimal.min(reactor.current_power, sellCap);
  logger.log('debug', 'engine', `[DIAGNOSTIC] Auto-sell calculated: sellCap=${sellCap}, sellAmount=${sellAmount}, max_power=${reactor.max_power}, auto_sell_multiplier=${reactor.auto_sell_multiplier}, multiplier=${multiplier}`);
  if (sellAmount.gt(0)) {
    reactor.current_power = reactor.current_power.sub(sellAmount);
    const value = sellAmount.mul(reactor.sell_price_multiplier || 1);
    engine.game.addMoney(value);
    let capacitor6Overcharged = false;
    for (let capIdx = 0; capIdx < engine.active_capacitors.length; capIdx++) {
      const capTile = engine.active_capacitors[capIdx];
      if (capTile?.part?.level === 6 || capTile?.part?.id === "capacitor6") {
        const cap = capTile.part.containment || 1;
        if (cap > 0 && (capTile.heat_contained || 0) / cap > 0.95) {
          capacitor6Overcharged = true;
          break;
        }
      }
    }
    if (capacitor6Overcharged) reactor.current_heat = reactor.current_heat.add(sellAmount.mul(0.5));
  }
}
