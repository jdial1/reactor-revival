import { toNumber } from "./simUtils.js";

export class StatDispatcher {
  constructor(game) {
    this.game = game;
    this.derivedTable = [];
    this.partIdToIndex = new Map();
  }

  derive() {
    this.derivedTable = [];
    this.partIdToIndex.clear();

    const bridge = this.game.coreBridge;
    const compiled = bridge?.isActive
      ? (bridge.session?.listParts?.() ?? [])
      : [];

    for (let i = 0; i < compiled.length; i++) {
      const part = compiled[i];
      if (!part?.id) continue;
      const row = {
        id: part.id,
        containment: part.containment ?? 0,
        vent: part.vent ?? 0,
        power: typeof part.power === "number" && isFinite(part.power) ? part.power : (part.basePower ?? 0),
        heat: typeof part.heat === "number" && isFinite(part.heat) ? part.heat : (part.baseHeat ?? 0),
        base_power: part.basePower ?? 0,
        base_heat: part.baseHeat ?? 0,
        category: part.category ?? "",
        ticks: toNumber(part.baseTicks ?? 0),
        type: part.type ?? "",
        ep_heat: part.epHeat ?? 0,
        level: part.level ?? 1,
        transfer: part.transfer ?? 0,
        cell_pack_M: part.cellMultiplier ?? 1,
        cell_count_C: part.cellCount ?? 1,
        cell_count: part.cellCount ?? 1,
        range: part.definition?.range ?? 1,
        topologyType: part.definition?.topologyType || "Manhattan",
        vent_consumes_power: !!part.definition?.ventConsumesPower,
        outlet_respect_neighbor_cap: !!part.definition?.outletRespectNeighborCap,
        traits: part.definition?.traits || [],
        trait_mask: part.definition?.traitMask || 0,
        perpetual: !!part.perpetual,
        autoBuyReplaceCost: toNumber(part.baseCost ?? 0) * 1.5,
      };

      if (part.category === "reflector") {
        const v = part.definition?.neighborPulseValue ?? part.powerIncrease;
        row.neighbor_pulse_value = typeof v === "number" && isFinite(v) && v >= 0 ? v : 1;
      }

      const idx = this.derivedTable.length;
      this.partIdToIndex.set(part.id, idx);
      this.derivedTable.push(row);
    }
  }

  getPartRow(id) {
    const idx = this.partIdToIndex.get(id);
    if (idx === undefined) return null;
    return this.derivedTable[idx];
  }

  getIndex(id) {
    return this.partIdToIndex.get(id);
  }
}
