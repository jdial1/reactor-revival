export class HeatSystem {
  constructor(engine) {
    this.engine = engine;
    this.segments = new Map();
    this.tileSegmentMap = new Map();
  }

  processTick(multiplier = 1.0) {
    const engine = this.engine;
    const game = engine.game;
    const reactor = game.reactor;
    const valveNeighborTiles = engine._valveNeighborCache;
    let heatFromInlets = 0;

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markStart("tick_heat_transfer");
    }

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markStart("tick_inlets");
    }

    for (let i = 0; i < engine.active_inlets.length; i++) {
      const tile = engine.active_inlets[i];
      const tile_part = tile.part;
      if (!tile_part) continue;

      const effectiveTransfer = tile.getEffectiveTransferValue() * multiplier;
      const containmentNeighbors = tile.containmentNeighborTiles;
      for (let j = 0; j < containmentNeighbors.length; j++) {
        const tile_containment = containmentNeighbors[j];
        if (!tile_containment.part || !tile_containment.heat_contained) continue;

        let transfer_heat = Math.min(effectiveTransfer, tile_containment.heat_contained);

        tile_containment.heat_contained -= transfer_heat;
        reactor.current_heat += transfer_heat;
        heatFromInlets += transfer_heat;
      }
    }

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_inlets");
    }
    game.logger?.debug(`[TICK STAGE] After heat transfer (inlets): Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markStart("tick_valves");
    }

    {
      if (!Array.isArray(engine.active_exchangers)) {
        engine.active_exchangers = [];
      }

      const valves = engine.active_valves;

      for (let vIdx = 0; vIdx < valves.length; vIdx++) {
        const valve = valves[vIdx];
        const valvePart = valve.part;
        const neighbors = engine._valveProcessing_neighbors;
        neighbors.length = 0;
        const valveNeighbors = valve.containmentNeighborTiles;
        for (let j = 0; j < valveNeighbors.length; j++) {
          const t = valveNeighbors[j];
          if (t.part) {
            neighbors.push(t);
          }
        }

        if (neighbors.length < 2) continue;

        const inputNeighbors = engine._valveProcessing_inputNeighbors;
        inputNeighbors.length = 0;
        const outputNeighbors = engine._valveProcessing_outputNeighbors;
        outputNeighbors.length = 0;

        if (valvePart.type === 'overflow_valve') {
          const orientation = engine._getValveOrientation(valvePart.id);
          const { inputNeighbor, outputNeighbor } = engine._getInputOutputNeighbors(valve, neighbors, orientation);

          if (inputNeighbor && outputNeighbor) {
            if (inputNeighbor.part?.category === 'valve') {
              const inputValveOrientation = engine._getValveOrientation(inputNeighbor.part.id);
              const inputValveNeighbors = engine._valve_inputValveNeighbors;
              inputValveNeighbors.length = 0;
              const inputNeighborNeighbors = inputNeighbor.containmentNeighborTiles;
              for (let j = 0; j < inputNeighborNeighbors.length; j++) {
                const t = inputNeighborNeighbors[j];
                if (t.part && t !== valve) {
                  inputValveNeighbors.push(t);
                }
              }
              const { outputNeighbor: inputValveOutput } = engine._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

              if (inputValveOutput !== valve) continue;
            }

            const inputHeat = inputNeighbor.heat_contained || 0;
            const inputContainment = inputNeighbor.part.containment || 1;
            const inputRatio = inputHeat / inputContainment;

            if (inputRatio >= 0.8) {
              inputNeighbors.push(inputNeighbor);
              outputNeighbors.push(outputNeighbor);
            }
          }
        } else if (valvePart.type === 'topup_valve') {
          const orientation = engine._getValveOrientation(valvePart.id);
          const { inputNeighbor, outputNeighbor } = engine._getInputOutputNeighbors(valve, neighbors, orientation);

          if (inputNeighbor && outputNeighbor) {
            if (inputNeighbor.part?.category === 'valve') {
              const inputValveOrientation = engine._getValveOrientation(inputNeighbor.part.id);
              const inputValveNeighbors = engine._valve_inputValveNeighbors;
              inputValveNeighbors.length = 0;
              const inputNeighborNeighbors = inputNeighbor.containmentNeighborTiles;
              for (let j = 0; j < inputNeighborNeighbors.length; j++) {
                const t = inputNeighborNeighbors[j];
                if (t.part && t !== valve) {
                  inputValveNeighbors.push(t);
                }
              }
              const { outputNeighbor: inputValveOutput } = engine._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

              if (inputValveOutput !== valve) continue;
            }

            const outputHeat = outputNeighbor.heat_contained || 0;
            const outputContainment = outputNeighbor.part.containment || 1;
            const outputRatio = outputHeat / outputContainment;

            if (outputRatio <= 0.2) {
              inputNeighbors.push(inputNeighbor);
              outputNeighbors.push(outputNeighbor);
            }
          }
        } else if (valvePart.type === 'check_valve') {
          const orientation = engine._getValveOrientation(valvePart.id);
          const { inputNeighbor, outputNeighbor } = engine._getInputOutputNeighbors(valve, neighbors, orientation);

          if (inputNeighbor && outputNeighbor) {
            if (inputNeighbor.part?.category === 'valve') {
              const inputValveOrientation = engine._getValveOrientation(inputNeighbor.part.id);
              const inputValveNeighbors = engine._valve_inputValveNeighbors;
              inputValveNeighbors.length = 0;
              const inputNeighborNeighbors = inputNeighbor.containmentNeighborTiles;
              for (let j = 0; j < inputNeighborNeighbors.length; j++) {
                const t = inputNeighborNeighbors[j];
                if (t.part && t !== valve) {
                  inputValveNeighbors.push(t);
                }
              }
              const { outputNeighbor: inputValveOutput } = engine._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

              if (inputValveOutput !== valve) continue;
            }

            inputNeighbors.push(inputNeighbor);
            outputNeighbors.push(outputNeighbor);
          }
        }

        if (inputNeighbors.length > 0 && outputNeighbors.length > 0) {
          for (let inputIdx = 0; inputIdx < inputNeighbors.length; inputIdx++) {
            const input = inputNeighbors[inputIdx];
            for (let outputIdx = 0; outputIdx < outputNeighbors.length; outputIdx++) {
              const output = outputNeighbors[outputIdx];
              const inputHeat = input.heat_contained || 0;
              let maxTransfer = valve.getEffectiveTransferValue() * multiplier;

              if (maxTransfer > 0) {
                if (valvePart.type === 'topup_valve') {
                  const outCap = output.part.containment || 1;
                  maxTransfer = Math.min(maxTransfer, outCap * 0.2);
                }

                const outputCap = output.part.containment || 0;
                const outputHeat = output.heat_contained || 0;
                const outputSpace = Math.max(0, outputCap - outputHeat);

                const transferAmount = Math.min(maxTransfer, inputHeat, outputSpace);

                if (transferAmount > 0) {
                  input.heat_contained -= transferAmount;
                  output.heat_contained += transferAmount;
                }
              }
            }
          }
        }

        valve.heat_contained = 0;
      }
    }

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_valves");
    }

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markStart("tick_exchangers");
    }

    {
      if (!Array.isArray(engine.active_exchangers)) {
        engine.active_exchangers = [];
      }
      const exchangers = engine.active_exchangers;

      if (!engine._heatCalc_startHeat) engine._heatCalc_startHeat = new Map();
      if (!engine._heatCalc_plannedOutByNeighbor) engine._heatCalc_plannedOutByNeighbor = new Map();
      if (!engine._heatCalc_plannedInByNeighbor) engine._heatCalc_plannedInByNeighbor = new Map();
      if (!engine._heatCalc_plannedInByExchanger) engine._heatCalc_plannedInByExchanger = new Map();
      if (!engine._valveNeighborExchangers) engine._valveNeighborExchangers = new Set();

      engine._heatCalc_startHeat.clear();
      engine._heatCalc_plannedCount = 0;
      engine._heatCalc_plannedOutByNeighbor.clear();
      engine._heatCalc_plannedInByNeighbor.clear();
      engine._heatCalc_plannedInByExchanger.clear();

      const startHeat = engine._heatCalc_startHeat;
      const valveNeighborExchangers = engine._valveNeighborExchangers;
      valveNeighborExchangers.clear();

      for (let i = 0; i < exchangers.length; i++) {
        const t = exchangers[i];
        if (!t.part || t.part.category === 'valve') continue;

        if (valveNeighborTiles.has(t)) {
          valveNeighborExchangers.add(t);
          startHeat.set(t, t.heat_contained || 0);
        } else {
          startHeat.set(t, t.heat_contained || 0);
        }
      }

      const plannedInByNeighbor = engine._heatCalc_plannedInByNeighbor;
      const plannedOutByNeighbor = engine._heatCalc_plannedOutByNeighbor;
      const plannedInByExchanger = engine._heatCalc_plannedInByExchanger;

      for (let i = 0; i < exchangers.length; i++) {
        const tile = exchangers[i];
        const tile_part = tile.part;
        if (!tile_part || tile_part.category === 'valve') continue;

        const heatStart = valveNeighborExchangers.has(tile) ? (tile.heat_contained || 0) : (startHeat.get(tile) || 0);
        const effectiveTransferValue = tile.getEffectiveTransferValue();

        const neighborsAll = tile.containmentNeighborTiles;
        const validNeighbors = engine._heatCalc_validNeighbors;
        validNeighbors.length = 0;
        for (let nIdx = 0; nIdx < neighborsAll.length; nIdx++) {
          if (neighborsAll[nIdx].part) validNeighbors.push(neighborsAll[nIdx]);
        }

        for (let sortIdx = 1; sortIdx < validNeighbors.length; sortIdx++) {
          const current = validNeighbors[sortIdx];
          let j = sortIdx - 1;
          while (j >= 0) {
            const a = validNeighbors[j];
            const aPref = (a.part.category === 'vent' || a.part.category === 'coolant_cell') ? 2 : (a.part.category === 'heat_exchanger' ? 0 : 1);
            const bPref = (current.part.category === 'vent' || current.part.category === 'coolant_cell') ? 2 : (current.part.category === 'heat_exchanger' ? 0 : 1);

            let shouldMove = false;
            if (bPref > aPref) {
              shouldMove = true;
            } else if (bPref === aPref) {
              const headA = Math.max((a.part.containment || 0) - (a.heat_contained || 0), 0);
              const headB = Math.max((current.part.containment || 0) - (current.heat_contained || 0), 0);
              if (headB > headA) shouldMove = true;
            }

            if (shouldMove) {
              validNeighbors[j + 1] = validNeighbors[j];
              j--;
            } else {
              break;
            }
          }
          validNeighbors[j + 1] = current;
        }

        let remainingPush = heatStart;

        let totalHeadroom = 0;
        for (let nIdx = 0; nIdx < validNeighbors.length; nIdx++) {
          const n = validNeighbors[nIdx];
          totalHeadroom += Math.max((n.part?.containment || 0) - (n.heat_contained || 0), 0);
        }
        if (totalHeadroom === 0) totalHeadroom = 1;

        for (let nIdx = 0; nIdx < validNeighbors.length; nIdx++) {
          const neighbor = validNeighbors[nIdx];
          const isExchangerNeighbor = startHeat.has(neighbor);
          const isValveNeighbor = valveNeighborTiles.has(neighbor);
          const isNeighborOfValveNeighbor = valveNeighborExchangers.has(tile) && isExchangerNeighbor;
          const nStartRaw = (isValveNeighbor || isNeighborOfValveNeighbor) ? (neighbor.heat_contained || 0) : (isExchangerNeighbor ? (startHeat.get(neighbor) || 0) : (neighbor.heat_contained || 0));
          const neighborCapacity = neighbor.part.containment || 0;

          if (remainingPush > 0 && (heatStart > nStartRaw || ((neighbor.part.category === 'vent' || neighbor.part.category === 'coolant_cell') && heatStart === nStartRaw && heatStart > 0))) {
            const diff = Math.max(0, heatStart - nStartRaw) || 1;

            const neighborHeadroomForWeight = Math.max(neighborCapacity - nStartRaw, 0);
            const capacityBias = Math.max(neighborHeadroomForWeight / totalHeadroom, 0);
            const biasedCap = Math.max(1, Math.floor(effectiveTransferValue * capacityBias * multiplier));
            let transfer_heat = Math.min(biasedCap, Math.ceil(diff / 2), remainingPush);

            if (transfer_heat > 0) {
              if (engine._heatCalc_plannedCount < engine._heatCalc_plannedPool.length) {
                const p = engine._heatCalc_plannedPool[engine._heatCalc_plannedCount++];
                p.from = tile;
                p.to = neighbor;
                p.amount = transfer_heat;
              } else {
                engine._heatCalc_plannedPool.push({ from: tile, to: neighbor, amount: transfer_heat });
                engine._heatCalc_plannedCount++;
              }

              remainingPush -= transfer_heat;
              plannedInByNeighbor.set(neighbor, (plannedInByNeighbor.get(neighbor) || 0) + transfer_heat);
              if (remainingPush <= 0) continue;
            }
          }

          if (!isExchangerNeighbor || isValveNeighbor || isNeighborOfValveNeighbor) {
            const alreadyOut = plannedOutByNeighbor.get(neighbor) || 0;
            const nAvailable = Math.max(0, nStartRaw - alreadyOut);
            if (nAvailable > 0 && nStartRaw > heatStart) {
              const diff = nStartRaw - heatStart;
              const biasedCap = effectiveTransferValue * multiplier;
              let transfer_heat = Math.min(biasedCap, Math.ceil(diff / 2), nAvailable);

              if (transfer_heat > 0) {
                if (engine._heatCalc_plannedCount < engine._heatCalc_plannedPool.length) {
                  const p = engine._heatCalc_plannedPool[engine._heatCalc_plannedCount++];
                  p.from = neighbor;
                  p.to = tile;
                  p.amount = transfer_heat;
                } else {
                  engine._heatCalc_plannedPool.push({ from: neighbor, to: tile, amount: transfer_heat });
                  engine._heatCalc_plannedCount++;
                }

                plannedOutByNeighbor.set(neighbor, alreadyOut + transfer_heat);
                plannedInByExchanger.set(tile, (plannedInByExchanger.get(tile) || 0) + transfer_heat);
              }
            }
          }
        }
      }

      for (let i = 0; i < engine._heatCalc_plannedCount; i++) {
        const p = engine._heatCalc_plannedPool[i];
        p.from.heat_contained -= p.amount;
        p.to.heat_contained += p.amount;
      }
    }

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_exchangers");
    }
    game.logger?.debug(`[TICK STAGE] After heat transfer (exchangers): Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markStart("tick_outlets");
    }

    for (let i = 0; i < engine.active_outlets.length; i++) {
      const tile = engine.active_outlets[i];
      const tile_part = tile.part;
      if (!tile_part || !tile.activated) continue;
      const neighbors = engine._outletProcessing_neighbors;
      neighbors.length = 0;
      const contNeighbors = tile.containmentNeighborTiles;
      for (let j = 0; j < contNeighbors.length; j++) {
        const t = contNeighbors[j];
        if (t.part && t.part.category !== 'valve') {
          neighbors.push(t);
        }
      }
      const transferCap = tile.getEffectiveTransferValue() * multiplier;
      let outlet_transfer_heat = Math.min(transferCap, reactor.current_heat);

      if (outlet_transfer_heat > 0 && reactor.current_heat > 0) {
        if (neighbors.length > 0) {
          const per_neighbor = outlet_transfer_heat / neighbors.length;

          for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            const cap = neighbor.part.containment || 0;
            const current = neighbor.heat_contained || 0;

            let toAdd = per_neighbor;
            if (tile_part.id === 'heat_outlet6' && cap > 0) {
              toAdd = Math.min(toAdd, Math.max(0, cap - current));
            }

            toAdd = Math.min(toAdd, reactor.current_heat);

            if (toAdd > 0) {
              neighbor.heat_contained += toAdd;
              reactor.current_heat -= toAdd;
              outlet_transfer_heat -= toAdd;
            }
          }
        } else {
          tile.heat_contained = (tile.heat_contained || 0) + outlet_transfer_heat;
          reactor.current_heat -= outlet_transfer_heat;
        }
      }
    }

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_outlets");
    }
    game.logger?.debug(`[TICK STAGE] After heat transfer (outlets): Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_heat_transfer");
    }

    return { heatFromInlets };
  }

  updateSegments() {}

  markSegmentsAsDirty() {}

  getSegmentForTile() {
    return null;
  }
}
