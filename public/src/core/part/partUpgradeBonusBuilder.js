const PCT_BASE = 100;

function pctFromMultiplier(mult) {
  return Math.round((mult - 1) * PCT_BASE);
}

function addVentBonusLines(obj, upg, lines, context) {
  const tile = context?.tile;
  const tev = upg("improved_heat_vents");
  if (tev > 0) {
    lines.push(`<span class="pos">+${tev * PCT_BASE}%</span> venting`);
    lines.push(`<span class="pos">+${tev * PCT_BASE}%</span> max heat`);
  }
  const fh = upg("fluid_hyperdynamics");
  if (fh > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fh))}%</span> venting`);
  const fp = upg("fractal_piping");
  if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
  const av = upg("active_venting");
  if (av > 0 && tile?.containmentNeighborTiles) {
    let capCount = 0;
    for (const neighbor of tile.containmentNeighborTiles) {
      if (neighbor.part && neighbor.part.category === "capacitor") {
        capCount += neighbor.part.part?.level || neighbor.part.level || 1;
      }
    }
    if (capCount > 0) {
      const pct = av * capCount;
      lines.push(`<span class="pos">+${pct}%</span> venting from ${capCount} capacitor neighbors`);
    }
  }
}

function addHeatExchangerBonusLines(obj, upg, lines) {
  const ihe = upg("improved_heat_exchangers");
  if (ihe > 0) lines.push(`<span class="pos">+${ihe * PCT_BASE}%</span> transfer, <span class="pos">+${ihe * PCT_BASE}%</span> max heat`);
  const fh = upg("fluid_hyperdynamics");
  if (fh > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fh))}%</span> transfer`);
  const fp = upg("fractal_piping");
  if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
}

function addInletOutletBonusLines(obj, upg, lines) {
  const ihe = upg("improved_heat_exchangers");
  if (ihe > 0) lines.push(`<span class="pos">+${ihe * PCT_BASE}%</span> transfer, <span class="pos">+${ihe * PCT_BASE}%</span> max heat`);
  const fp = upg("fractal_piping");
  if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
}

function addCapacitorBonusLines(obj, upg, lines) {
  const iw = upg("improved_wiring");
  if (iw > 0) lines.push(`<span class="pos">+${iw * PCT_BASE}%</span> power capacity, <span class="pos">+${iw * PCT_BASE}%</span> max heat`);
  const qb = upg("quantum_buffering");
  if (qb > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, qb))}%</span> power capacity and max heat`);
}

function addCoolantCellBonusLines(obj, upg, lines) {
  const icc = upg("improved_coolant_cells");
  if (icc > 0) lines.push(`<span class="pos">+${icc * PCT_BASE}%</span> max heat`);
  const uc = upg("ultracryonics");
  if (uc > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, uc))}%</span> max heat`);
}

function addReflectorBonusLines(obj, upg, lines) {
  const ird = upg("improved_reflector_density");
  if (ird > 0) lines.push(`<span class="pos">+${ird * PCT_BASE}%</span> duration`);
  const inr = upg("improved_neutron_reflection");
  if (inr > 0) lines.push(`<span class="pos">+${inr}%</span> power reflection`);
  const fsr = upg("full_spectrum_reflectors");
  if (fsr > 0) lines.push(`<span class="pos">+${fsr * PCT_BASE}%</span> base power reflection`);
}

function addReactorPlatingBonusLines(obj, upg, lines) {
  const ia = upg("improved_alloys");
  if (ia > 0) lines.push(`<span class="pos">+${ia * PCT_BASE}%</span> reactor max heat`);
  const qb = upg("quantum_buffering");
  if (qb > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, qb))}%</span> reactor max heat`);
}

function addParticleAcceleratorBonusLines(obj, upg, lines) {
  const lvl = obj.level || 1;
  const id = lvl === 6 ? "improved_particle_accelerators6" : "improved_particle_accelerators1";
  const ipa = upg(id);
  if (ipa > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, ipa))}%</span> EP heat cap`);
}

function addCellBonusLines(obj, upg, lines, context) {
  const game = context?.game;
  if (!game?.upgradeset) return;
  const powerUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_power`);
  if (powerUpg?.level > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, powerUpg.level))}%</span> power`);
  const tickUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_tick`);
  if (tickUpg?.level > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, tickUpg.level))}%</span> duration`);
  const perpUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_perpetual`);
  if (perpUpg?.level > 0) lines.push("Auto-replacement enabled");
  const infused = upg("infused_cells");
  if (infused > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, infused))}%</span> power`);
  const unleashed = upg("unleashed_cells");
  if (unleashed > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, unleashed))}%</span> power and heat`);
  if (obj.type === "protium") {
    const unstable = upg("unstable_protium");
    if (unstable > 0) {
      const durPct = Math.round((1 - 1 / Math.pow(2, unstable)) * 100);
      const totalPct = (Math.pow(2, unstable) - 1) * 100;
      lines.push(`<span class="pos">+${totalPct}%</span> power and heat, <span class="neg">-${durPct}%</span> duration`);
    }
  }
}

const CATEGORY_BONUS_HANDLERS = {
  vent: addVentBonusLines,
  heat_exchanger: addHeatExchangerBonusLines,
  heat_inlet: addInletOutletBonusLines,
  heat_outlet: addInletOutletBonusLines,
  capacitor: addCapacitorBonusLines,
  coolant_cell: addCoolantCellBonusLines,
  reflector: addReflectorBonusLines,
  reactor_plating: addReactorPlatingBonusLines,
  particle_accelerator: addParticleAcceleratorBonusLines,
  cell: addCellBonusLines,
};

export function getUpgradeBonusLines(obj, context = {}) {
  const lines = [];
  if (!obj || obj.upgrade) return lines;
  const game = context.game ?? obj.game;
  if (!game?.upgradeset) return lines;
  const upg = (id) => game.upgradeset.getUpgrade(id)?.level || 0;
  const handler = CATEGORY_BONUS_HANDLERS[obj.category];
  if (handler) handler(obj, upg, lines, context);
  return lines;
}
