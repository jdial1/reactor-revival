import { collectAllPartIds, buildPartDefFromCatalog } from "./partCatalog.js";
import { Part } from "./logic.js"; 

export class StatDispatcher {
  constructor(game) {
    this.game = game;
    this.derivedTable = [];
    this.partIdToIndex = new Map();
  }

  derive() {
    this.derivedTable = [];
    this.partIdToIndex.clear();
    
    const allIds = collectAllPartIds();
    for (let i = 0; i < allIds.length; i++) {
      const id = allIds[i];
      const def = buildPartDefFromCatalog(id);
      if (!def) continue;
      
      const part = new Part(def, this.game);
      
      const row = {
        id: part.id,
        containment: part.containment ?? 0,
        vent: part.vent ?? 0,
        power: (typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power)) ? part.power : (part.base_power ?? 0),
        heat: (typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat)) ? part.heat : (part.base_heat ?? 0),
        base_power: part.base_power ?? 0,
        base_heat: part.base_heat ?? 0,
        category: part.category ?? "",
        ticks: part.ticks ?? 0,
        type: part.type ?? "",
        ep_heat: part.ep_heat ?? 0,
        level: part.level ?? 1,
        transfer: part.transfer ?? 0,
        cell_pack_M: part.cell_pack_M ?? 1,
        cell_count_C: part.cell_count_C ?? part.cell_count ?? 1,
        cell_count: part.cell_count ?? 1,
        range: part.range ?? 1,
        topologyType: part.topologyType || "Manhattan",
        vent_consumes_power: !!part.vent_consumes_power,
        outlet_respect_neighbor_cap: !!part.outlet_respect_neighbor_cap,
        traits: part.traits || [],
        trait_mask: part.trait_mask || 0,
        perpetual: !!part.perpetual,
      };
      
      if (part.category === "reflector") {
        const v = part.neighbor_pulse_value;
        row.neighbor_pulse_value = typeof v === "number" && isFinite(v) && v >= 0 ? v : 1;
      }
      
      if (typeof part.getAutoReplacementCost === "function") {
        const c = part.getAutoReplacementCost();
        row.autoBuyReplaceCost = typeof c?.toNumber === "function" ? c.toNumber() : Number(c) || 0;
      } else {
        row.autoBuyReplaceCost = 0;
      }

      const idx = this.derivedTable.length;
      this.partIdToIndex.set(id, idx);
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
