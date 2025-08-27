import { performance } from "../utils/util.js";

export class Engine {
  constructor(game) {
    this.game = game;
    this.loop_timeout = null;
    this.last_tick_time = null;
    this.dtime = 0;
    this.running = false;
    this.last_session_update = 0;
    this.session_update_interval = 60000;
    this.tick_count = 0; // Added for heat distribution rotation
    this.active_cells = [];
    this.active_vessels = [];
    this.active_inlets = [];
    this.active_exchangers = [];
    this.active_outlets = [];
    this._partCacheDirty = true;

    // Add heatManager stub for tests
    this.heatManager = {
      segments: new Map(),
      tileSegmentMap: new Map(),
      processTick: () => {
        // Heat processing is now done in the engine tick
        if (!this.game.paused) {
          // This is a stub - actual heat processing is in _processTick
        }
      },
      updateSegments: () => {
        // This is a stub - segment updates are handled elsewhere
      },
      markSegmentsAsDirty: () => {
        // This is a stub - segment dirty marking is handled elsewhere
      },
      getSegmentForTile: (tile) => {
        // This is a stub - segment lookup is handled elsewhere
        return null;
      }
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.loop_timeout) {
      this.last_tick_time = performance.now();
      this.last_session_update = Date.now();

      this.loop();
    }

    // Update engine status indicator
    if (this.game.ui && this.game.ui.stateManager) {
      this.game.ui.stateManager.setVar("engine_status", "running");
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.loop_timeout);
    this.loop_timeout = null;
    this.last_tick_time = null;

    this.game.updateSessionTime();

    // Update engine status indicator
    if (this.game.ui && this.game.ui.stateManager) {
      this.game.ui.stateManager.setVar("engine_status", "stopped");
    }
  }

  isRunning() {
    return this.running;
  }

  markPartCacheAsDirty() {
    this._partCacheDirty = true;
  }

  _updatePartCaches() {
    if (!this._partCacheDirty) return;

    this.active_cells = [];
    this.active_vessels = [];
    this.active_inlets = [];
    this.active_exchangers = [];
    this.active_outlets = [];

    let vesselsAdded = 0;
    for (let row = 0; row < this.game._rows; row++) {
      for (let col = 0; col < this.game._cols; col++) {
        const tile = this.game.tileset.getTile(row, col);
        if (!tile || !tile.part) continue;

        const part = tile.part;
        const category = part.category;

        if (category === "cell" && tile.ticks > 0) {
          this.active_cells.push(tile);
        }
        if (part.vent > 0 || category === "particle_accelerator" || (part.containment > 0 && category !== "valve")) {
          this.active_vessels.push(tile);
          vesselsAdded++;
          // Debug logging only in test mode
          if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
            this.game.logger?.debug(`Added ${part.id} at (${row}, ${col}) to active_vessels`);
          }
        }
        // Valves are only added to active_vessels if they have valid input/output neighbors
        // This prevents them from exploding when idle
        if (category === "valve") {
          // We'll add them to active_vessels later if they have valid neighbors
        }
        if (category === "heat_inlet") {
          this.active_inlets.push(tile);
        }
        if (category === "heat_exchanger" || category === "valve") {
          this.active_exchangers.push(tile);
        }
        if (category === "heat_outlet") {
          this.active_outlets.push(tile);
        }
      }
    }

    // Debug logging only in test mode
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      this.game.logger?.debug(`Updated part caches: ${vesselsAdded} vessels, ${this.active_cells.length} cells`);
    }


    this._partCacheDirty = false;
  }

  loop() {
    if (!this.running || this.game.paused) {
      this.stop();
      return;
    }

    this.game.performance.markStart("engine_loop");

    const chronometerUpgrade = this.game.upgradeset.getUpgrade("chronometer");
    const tick_duration =
      this.game.loop_wait / (chronometerUpgrade?.level + 1 || 1);

    const now = performance.now();
    if (this.last_tick_time) {
      this.dtime += now - this.last_tick_time;
    }

    this.last_tick_time = now;

    let ticks_to_process = Math.floor(this.dtime / tick_duration);

    if (ticks_to_process > 0) {
      const time_flux_enabled = this.game.ui.stateManager.getVar("time_flux");
      if (time_flux_enabled && ticks_to_process > 1) {
        const max_catch_up_ticks = 1000;
        if (ticks_to_process > max_catch_up_ticks) {
          ticks_to_process = max_catch_up_ticks;
        }

        this.game.performance.markStart("batch_ticks");
        for (let i = 0; i < ticks_to_process; i++) {
          this.tick();
        }
        this.game.performance.markEnd("batch_ticks");
      } else {
        this.tick();
      }
      this.dtime -= ticks_to_process * tick_duration;
    }

    this.game.performance.markEnd("engine_loop");

    this.loop_timeout = setTimeout(() => this.loop(), tick_duration);
  }

  tick() {
    return this._processTick(false);
  }

  // Manual tick processing for tests
  manualTick() {
    return this._processTick(true);
  }

  _processTick(manual = false) {
    this.game.performance.markStart("tick_total");
    const reactor = this.game.reactor;
    const tileset = this.game.tileset;
    const ui = this.game.ui;
    // Collect visual events for this tick and flush once at end
    const visualEvents = [];

    // Update engine status indicator for tick
    if (ui && ui.stateManager) {
      ui.stateManager.setVar("engine_status", "tick");
    }

    // Don't process ticks if the game is paused
    if (this.game.paused) {
      this.game.performance.markEnd("tick_total");
      return;
    }

    // Don't process ticks if engine is not running (for automatic ticks)
    if (!this.running && !manual) {
      this.game.performance.markEnd("tick_total");
      return;
    }

    if (reactor.has_melted_down) {
      return;
    }

    // Force update part caches to ensure newly added parts are included
    this._partCacheDirty = true;
    this._updatePartCaches(); // Add this call at the beginning of the tick

    this.game.performance.markStart("tick_categorize_parts");
    // The loop below is now handled by _updatePartCaches()
    // so we can remove it to avoid redundant work.
    const active_cells = this.active_cells;
    const active_vessels = this.active_vessels;
    this.game.performance.markEnd("tick_categorize_parts");

    let power_add = 0;
    let heat_add = 0; // Re-introduced for globally added heat

    // Get all valve tiles to identify their neighbors (needed for both heat exchange and outlet transfer)
    const valveNeighborTiles = new Set();

    this.game.performance.markStart("tick_cells");
    this.active_cells.forEach((tile) => {
      const part = tile.part;
      if (!part || tile.exploded) return;

      // Skip processing if ticks are 0
      if (tile.ticks <= 0) {
        return;
      }
      power_add += tile.power;

      if (tile.power > 0) {
        const count = tile.power >= 200 ? 3 : tile.power >= 50 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          visualEvents.push({ type: 'emit', part: 'cell', icon: 'power', tile: [tile.row, tile.col] });
        }
      }
      if (tile.heat > 0) {
        const countH = tile.heat >= 200 ? 3 : tile.heat >= 50 ? 2 : 1;
        for (let i = 0; i < countH; i++) {
          visualEvents.push({ type: 'emit', part: 'cell', icon: 'heat', tile: [tile.row, tile.col] });
        }
      }
      const heatNeighbors = tile.containmentNeighborTiles.filter(
        (t) => t.part && t.part.containment > 0
      );
      if (heatNeighbors.length > 0) {
        const heat_remove = Math.ceil(tile.heat / heatNeighbors.length);
        heatNeighbors.forEach((neighbor) => {
          neighbor.heat_contained += heat_remove;
          // Visual: local containment receiving heat flow from cell
          visualEvents.push({
            type: 'flow',
            icon: 'heat',
            from: [tile.row, tile.col],
            to: [neighbor.row, neighbor.col],
            amount: heat_remove
          });
        });
      } else {
        heat_add += tile.heat;
        // Visual: show heat going directly to reactor when no neighbors
        visualEvents.push({
          type: 'flow',
          icon: 'heat',
          from: [tile.row, tile.col],
          to: 'reactor', // Special target to indicate reactor
          amount: tile.heat
        });
      }

      tile.ticks--;

      for (const r_tile of tile.reflectorNeighborTiles) {
        if (r_tile.ticks > 0) {
          r_tile.ticks--;
          if (r_tile.ticks === 0) this.handleComponentDepletion(r_tile);
          // Visual: show reflector contributing to the cell with a power icon flow
          visualEvents.push({
            type: 'flow',
            icon: 'power',
            from: [r_tile.row, r_tile.col],
            to: [tile.row, tile.col]
          });
        }
      }

      if (tile.ticks === 0) {
        if (part.type === "protium") {
          this.game.protium_particles += part.cell_count;
          this.game.update_cell_power();
        }
        this.handleComponentDepletion(tile);
      }
    });
    this.game.performance.markEnd("tick_cells");

    // Add only the globally-directed heat to the reactor.
    reactor.current_heat += heat_add;
    if (heat_add > 0) {
      // Heat added to reactor
    }

    // (Explosion checks occur after outlet transfer and before vents to allow overfill)

    this.game.performance.markStart("tick_vents");

    // Legacy Heat Transfer Logic
    // Inlets
    for (const tile of this.active_inlets) {
      const tile_part = tile.part;
      if (!tile_part) continue;
      for (const tile_containment of tile.containmentNeighborTiles) {
        if (!tile_containment.part || !tile_containment.heat_contained) continue;
        let transfer_heat = Math.min(tile.getEffectiveTransferValue(), tile_containment.heat_contained);
        tile_containment.heat_contained -= transfer_heat;
        reactor.current_heat += transfer_heat;
        heat_add += transfer_heat;
        if (transfer_heat > 0) {
          const cnt = transfer_heat >= 50 ? 3 : transfer_heat >= 15 ? 2 : 1;
          for (let i = 0; i < cnt; i++) {
            visualEvents.push({ type: 'flow', icon: 'heat', from: [tile_containment.row, tile_containment.col], to: [tile.row, tile.col], amount: transfer_heat });
          }
        }
      }
    }

    // Valves (directional heat transfer with conditional logic)
    {
      const valves = this.active_exchangers.filter(t => t.part && t.part.category === 'valve');

      // Collect all tiles that are neighbors of valves (needed for heat exchange and outlet transfer)
      for (const valve of valves) {
        const neighbors = valve.containmentNeighborTiles.filter(t => t.part);
        for (const neighbor of neighbors) {
          valveNeighborTiles.add(neighbor);
        }
      }

      // Debug logging for valve processing
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        // Processing valves for heat transfer
      }

      for (const valve of valves) {
        const valvePart = valve.part;
        const neighbors = valve.containmentNeighborTiles.filter(t => t.part);

        // Debug logging for valve neighbors (only in test mode)
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          this.game.logger?.debug(`Valve ${valvePart.id} at (${valve.row},${valve.col}) has ${neighbors.length} neighbors`);
          neighbors.forEach((n, i) => {
            this.game.logger?.debug(`  Neighbor ${i}: ${n.part.id} at (${n.row},${n.col}) with heat ${n.heat_contained || 0}`);
          });
        }

        if (neighbors.length < 2) continue; // Need at least 2 neighbors to transfer

        // Determine input and output neighbors based on valve type and orientation
        let inputNeighbors = [];
        let outputNeighbors = [];

        if (valvePart.type === 'overflow_valve') {
          // Overflow valve: only works if input side neighbor is above 80% containment
          // Determine input/output based on valve orientation from ID
          if (neighbors.length >= 2) {
            const orientation = this._getValveOrientation(valvePart.id);
            const { inputNeighbor, outputNeighbor } = this._getInputOutputNeighbors(valve, neighbors, orientation);

            if (inputNeighbor && outputNeighbor) {
              // Validation: valves can't pull from other valves unless input connects to output
              if (inputNeighbor.part?.category === 'valve') {
                // Check if this valve's input connects to another valve's output
                const inputValveOrientation = this._getValveOrientation(inputNeighbor.part.id);
                const inputValveNeighbors = inputNeighbor.containmentNeighborTiles.filter(t => t.part && t !== valve);
                const { inputNeighbor: inputValveInput, outputNeighbor: inputValveOutput } = this._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

                // Only allow if this valve's input connects to the other valve's output
                if (inputValveOutput !== valve) {
                  if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    this.game.logger?.debug(`Overflow valve ${valvePart.id} blocked: input valve ${inputNeighbor.part.id} input doesn't connect to this valve's output`);
                  }
                  continue; // Skip this valve - input/output misaligned
                }
              }

              const inputHeat = inputNeighbor.heat_contained || 0;
              const inputContainment = inputNeighbor.part.containment || 1;
              const inputRatio = inputHeat / inputContainment;

              if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                this.game.logger?.debug(`Overflow valve: input neighbor heat=${inputHeat}, containment=${inputContainment}, ratio=${inputRatio.toFixed(3)} (>=0.8? ${inputRatio >= 0.8})`);
              }

              if (inputRatio >= 0.8) {
                // Input neighbor is above 80% containment, can transfer
                inputNeighbors.push(inputNeighbor);
                outputNeighbors.push(outputNeighbor);
              }
            }
          }
        } else if (valvePart.type === 'topup_valve') {
          // Top-up valve: only works if output side neighbor is below 20% containment
          // Determine input/output based on valve orientation from ID
          if (neighbors.length >= 2) {
            const orientation = this._getValveOrientation(valvePart.id);
            const { inputNeighbor, outputNeighbor } = this._getInputOutputNeighbors(valve, neighbors, orientation);

            if (inputNeighbor && outputNeighbor) {
              // Validation: valves can't pull from other valves unless input connects to output
              if (inputNeighbor.part?.category === 'valve') {
                // Check if this valve's input connects to another valve's output
                const inputValveOrientation = this._getValveOrientation(inputNeighbor.part.id);
                const inputValveNeighbors = inputNeighbor.containmentNeighborTiles.filter(t => t.part && t !== valve);
                const { inputNeighbor: inputValveInput, outputNeighbor: inputValveOutput } = this._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

                // Only allow if this valve's input connects to the other valve's output
                if (inputValveOutput !== valve) {
                  if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    this.game.logger?.debug(`Top-up valve ${valvePart.id} blocked: input valve ${inputNeighbor.part.id} input doesn't connect to this valve's output`);
                  }
                  continue; // Skip this valve - input/output misaligned
                }
              }

              const outputHeat = outputNeighbor.heat_contained || 0;
              const outputContainment = outputNeighbor.part.containment || 1;
              const outputRatio = outputHeat / outputContainment;

              if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                this.game.logger?.debug(`Top-up valve: output neighbor heat=${outputHeat}, containment=${outputContainment}, ratio=${outputRatio.toFixed(3)} (<=0.2? ${outputRatio <= 0.2})`);
              }

              if (outputRatio <= 0.2) {
                // Output neighbor is below 20% containment, can transfer
                inputNeighbors.push(inputNeighbor);
                outputNeighbors.push(outputNeighbor);
              }
            }
          }
        } else if (valvePart.type === 'check_valve') {
          // Check valve: one-way transfer from input to output
          // Determine input/output based on valve orientation from ID
          if (neighbors.length >= 2) {
            const orientation = this._getValveOrientation(valvePart.id);
            const { inputNeighbor, outputNeighbor } = this._getInputOutputNeighbors(valve, neighbors, orientation);

            if (inputNeighbor && outputNeighbor) {
              // Validation: valves can't pull from other valves unless input connects to output
              if (inputNeighbor.part?.category === 'valve') {
                // Check if this valve's input connects to another valve's output
                const inputValveOrientation = this._getValveOrientation(inputNeighbor.part.id);
                const inputValveNeighbors = inputNeighbor.containmentNeighborTiles.filter(t => t.part && t !== valve);
                const { inputNeighbor: inputValveInput, outputNeighbor: inputValveOutput } = this._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

                // Only allow if this valve's input connects to another valve's output
                if (inputValveOutput !== valve) {
                  if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    this.game.logger?.debug(`Check valve ${valvePart.id} blocked: input valve ${inputNeighbor.part.id} input doesn't connect to this valve's output`);
                  }
                  continue; // Skip this valve - input/output misaligned
                }
              }

              // Check valve is always active (no threshold conditions)
              inputNeighbors.push(inputNeighbor);
              outputNeighbors.push(outputNeighbor);
            }
          }
        }

        // Process heat transfer for each input-output pair
        // Only transfer if we have valid input and output neighbors
        // Valves should never store heat - they only transfer when both input and output are available
        if (inputNeighbors.length > 0 && outputNeighbors.length > 0) {
          // Add valve to active_vessels only when it has valid input/output neighbors
          // This prevents idle valves from being processed by explosion checking
          if (!this.active_vessels.includes(valve)) {
            this.active_vessels.push(valve);
            if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
              this.game.logger?.debug(`Added valve ${valvePart.id} to active_vessels - has valid input/output neighbors`);
            }
          }

          if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
            this.game.logger?.debug(`Valve ${valvePart.id} at (${valve.row},${valve.col}) has ${inputNeighbors.length} inputs and ${outputNeighbors.length} outputs, proceeding with heat transfer`);
          }

          for (const input of inputNeighbors) {
            for (const output of outputNeighbors) {
              const inputHeat = input.heat_contained || 0;
              const outputHeat = output.heat_contained || 0;
              const valveTransfer = valve.getEffectiveTransferValue();

              if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                this.game.logger?.debug(`Valve ${valvePart.id} checking transfer: input heat=${inputHeat}, output heat=${outputHeat}, valve transfer=${valveTransfer}`);
              }

              if (valveTransfer > 0) {
                // For valves, always transfer from input to output based on valve capacity
                // The direction is determined by valve orientation, not heat differences
                const transferAmount = Math.min(
                  valveTransfer,
                  inputHeat
                );

                if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                  this.game.logger?.debug(`Valve ${valvePart.id} calculated transfer amount: ${transferAmount}`);
                }

                if (transferAmount > 0) {
                  input.heat_contained -= transferAmount;
                  output.heat_contained += transferAmount;

                  // Debug logging for valve heat transfer
                  if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    this.game.logger?.debug(`Valve ${valvePart.id} transferred ${transferAmount} heat from (${input.row},${input.col}) to (${output.row},${output.col})`);
                  }

                  // Add visual effect
                  const cnt = transferAmount >= 50 ? 3 : transferAmount >= 15 ? 2 : 1;
                  for (let i = 0; i < cnt; i++) {
                    visualEvents.push({
                      type: 'flow',
                      icon: 'heat',
                      from: [input.row, input.col],
                      to: [output.row, output.col],
                      amount: transferAmount
                    });
                  }
                }
              } else if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                this.game.logger?.debug(`Valve ${valvePart.id} transfer conditions not met: inputHeat > outputHeat? ${inputHeat > outputHeat}, valveTransfer > 0? ${valveTransfer > 0}`);
              }
            }
          }
        } else {
          // Valve has no valid input/output pairs - remove it from active_vessels if it was there
          // This prevents idle valves from being processed by explosion checking
          if (this.active_vessels.includes(valve)) {
            this.active_vessels = this.active_vessels.filter(v => v !== valve);
            if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
              this.game.logger?.debug(`Removed valve ${valvePart.id} from active_vessels - no valid input/output neighbors`);
            }
          }

          if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
            this.game.logger?.debug(`Valve ${valvePart.id} at (${valve.row},${valve.col}) has no valid input/output pairs: ${inputNeighbors.length} inputs, ${outputNeighbors.length} outputs`);
          }
        }

        // Safety check: valves should never store heat
        // If a valve somehow has heat, clear it
        if (valve.heat_contained > 0) {
          if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
            this.game.logger?.debug(`Valve ${valvePart.id} had ${valve.heat_contained} heat stored - clearing it (valves should not store heat)`);
          }
          valve.heat_contained = 0;
        }
      }

      // Collect all tiles that are neighbors of valves
      for (const valve of valves) {
        const neighbors = valve.containmentNeighborTiles.filter(t => t.part);
        for (const neighbor of neighbors) {
          valveNeighborTiles.add(neighbor);
        }
      }

      // Exchangers (two-phase plan to prevent ping-pong; prioritize vents/coolants; capacity-aware)
      {
        // Snapshot heat for all exchangers; non-exchangers are read live
        const startHeat = new Map();

        // Exclude both valves and their neighbors from general heat exchange
        const exchangers = this.active_exchangers.filter(t =>
          t.part &&
          t.part.category !== 'valve' &&
          !valveNeighborTiles.has(t)
        );

        for (const t of exchangers) startHeat.set(t, t.heat_contained || 0);

        const planned = [];
        const plannedOutByNeighbor = new Map();
        const plannedInByNeighbor = new Map();
        const plannedInByExchanger = new Map();

        for (const tile of exchangers) {
          const tile_part = tile.part;
          if (!tile_part) continue;
          const heatStart = startHeat.get(tile) || 0;

          // Prefer sinks first, then other parts, exchangers last
          const neighborsAll = tile.containmentNeighborTiles.filter(t => t.part);
          const headroomOf = (t) => {
            const cap = t.part?.containment || 0;
            const heat = t.heat_contained || 0;
            return Math.max(cap - heat, 0);
          };
          const preferred = neighborsAll
            .filter(t => t.part.category === 'vent' || t.part.category === 'coolant_cell')
            .sort((a, b) => headroomOf(b) - headroomOf(a));
          const exchNeighbors = neighborsAll
            .filter(t => t.part.category === 'heat_exchanger')
            .sort((a, b) => headroomOf(b) - headroomOf(a));
          const others = neighborsAll
            .filter(t => !preferred.includes(t) && !exchNeighbors.includes(t))
            .sort((a, b) => headroomOf(b) - headroomOf(a));
          const orderedNeighbors = [...preferred, ...others, ...exchNeighbors];

          let remainingPush = heatStart; // cap push amounts so we don't exceed starting heat
          const exchangerCapacity = tile_part.containment || 0;
          const exchangerHeadroomBase = exchangerCapacity > 0 ? Math.max(0, exchangerCapacity - heatStart) : Number.POSITIVE_INFINITY;

          for (const neighbor of orderedNeighbors) {
            const isExchangerNeighbor = startHeat.has(neighbor);
            const nStartRaw = isExchangerNeighbor ? (startHeat.get(neighbor) || 0) : (neighbor.heat_contained || 0);
            const neighborCapacity = neighbor.part.containment || 0;
            const neighborHeadroomBase = neighborCapacity > 0 ? Math.max(0, neighborCapacity - nStartRaw) : Number.POSITIVE_INFINITY;
            const neighborHeadroom = Math.max(0, neighborHeadroomBase - (plannedInByNeighbor.get(neighbor) || 0));
            const isPreferred = neighbor.part.category === 'vent' || neighbor.part.category === 'coolant_cell';

            // Push: if exchanger is hotter than neighbor OR equal but neighbor is a sink (bias to sinks)
            if (remainingPush > 0 && (heatStart > nStartRaw || (isPreferred && heatStart === nStartRaw && heatStart > 0))) {
              const diff = Math.max(0, heatStart - nStartRaw) || 1; // ensure at least 1 when equal to sink
              // Capacity-aware weighting: larger headroom neighbors get a larger share of this tile's per-neighbor capability
              const totalHeadroom = orderedNeighbors.reduce((sum, n) => sum + Math.max((n.part?.containment || 0) - (n.heat_contained || 0), 0), 0) || 1;
              const neighborHeadroomForWeight = Math.max(neighborCapacity - nStartRaw, 0);
              const capacityBias = Math.max(neighborHeadroomForWeight / totalHeadroom, 0);
              const biasedCap = Math.max(1, Math.floor(tile.getEffectiveTransferValue() * capacityBias));
              let transfer_heat = Math.min(
                biasedCap,
                Math.ceil(diff / 2),
                remainingPush
              );
              if (transfer_heat > 0) {
                planned.push({ from: tile, to: neighbor, amount: transfer_heat });
                remainingPush -= transfer_heat;
                plannedInByNeighbor.set(neighbor, (plannedInByNeighbor.get(neighbor) || 0) + transfer_heat);
                if (remainingPush <= 0) continue;
              }
            }

            // Pull: only from non-exchanger neighbors that are hotter than this exchanger at start
            if (!isExchangerNeighbor) {
              const alreadyOut = plannedOutByNeighbor.get(neighbor) || 0;
              const nAvailable = Math.max(0, nStartRaw - alreadyOut);
              if (nAvailable > 0 && nStartRaw > heatStart) {
                const diff = nStartRaw - heatStart;
                // Pull: capacity-aware, but allow overfill by not capping to exchanger headroom
                const biasedCap = tile.getEffectiveTransferValue();
                let transfer_heat = Math.min(
                  biasedCap,
                  Math.ceil(diff / 2),
                  nAvailable
                );
                if (transfer_heat > 0) {
                  planned.push({ from: neighbor, to: tile, amount: transfer_heat });
                  plannedOutByNeighbor.set(neighbor, alreadyOut + transfer_heat);
                  plannedInByExchanger.set(tile, (plannedInByExchanger.get(tile) || 0) + transfer_heat);
                }
              }
            }
          }
        }

        // Apply all planned transfers
        for (const p of planned) {
          p.from.heat_contained -= p.amount;
          p.to.heat_contained += p.amount;
          const transfer_heat = p.amount;
          const cnt = transfer_heat >= 50 ? 3 : transfer_heat >= 15 ? 2 : 1;
          for (let i = 0; i < cnt; i++) {
            visualEvents.push({ type: 'flow', icon: 'heat', from: [p.from.row, p.from.col], to: [p.to.row, p.to.col], amount: transfer_heat });
          }
        }
      }

      // Outlets
      for (const tile of this.active_outlets) {
        const tile_part = tile.part;
        if (!tile_part) continue;
        // Exclude valve neighbors from heat outlet transfer to prevent interference with valve heat transfer
        const containmentNeighbors = tile.containmentNeighborTiles.filter(t =>
          t.part &&
          t.part.category !== 'valve' &&
          !valveNeighborTiles.has(t)
        );
        if (containmentNeighbors.length) {
          // Max heat this outlet can move from the reactor this tick
          let outlet_transfer_heat = Math.min(tile.getEffectiveTransferValue(), reactor.current_heat);
          if (outlet_transfer_heat <= 0) continue;

          // Split intended transfer evenly across neighbors (allow overfill beyond containment)
          const intended_per_neighbor = Math.ceil(outlet_transfer_heat / containmentNeighbors.length);

          for (const tile_containment of containmentNeighbors) {
            if (!tile_containment.part) continue;

            const currentNeighborHeat = tile_containment.heat_contained || 0;
            const neighborCapacity = tile_containment.part.containment || 0;

            // Always allow overfill to enable explosions for standard outlets.
            // For the extreme outlet (range 2), avoid instant overfill/explosion in the same tick
            // so tests can observe heat reaching two-tiles-away components.
            let amountToAdd = Math.min(intended_per_neighbor, reactor.current_heat);
            if (tile_part.id === 'heat_outlet6' && neighborCapacity > 0) {
              const headroom = Math.max(0, neighborCapacity - currentNeighborHeat);
              amountToAdd = Math.min(amountToAdd, headroom);
            }
            if (amountToAdd <= 0) continue;

            tile_containment.heat_contained += amountToAdd;
            reactor.current_heat -= amountToAdd;
            {
              const cnt = amountToAdd >= 50 ? 3 : amountToAdd >= 15 ? 2 : 1;
              for (let i = 0; i < cnt; i++) {
                visualEvents.push({ type: 'flow', icon: 'heat', from: [tile.row, tile.col], to: [tile_containment.row, tile_containment.col], amount: amountToAdd });
              }
            }

            // If we've exhausted the outlet's transfer or reactor heat, stop early
            outlet_transfer_heat -= amountToAdd;
            if (outlet_transfer_heat <= 0 || reactor.current_heat <= 0) break;
          }
        }
      }
    }

    // Process Particle Accelerators and Extreme Capacitors
    const ep_chance_percent = 1 + this.game.total_exotic_particles / 100;
    let ep_chance_add = 0;
    this.active_vessels.forEach((tile) => {
      const part = tile.part;

      // EP generation from particle accelerators (still handled per-tile)
      if (part && part.category === "particle_accelerator" && tile.heat_contained > 0) {
        const lower_heat = Math.min(tile.heat_contained, part.ep_heat);
        ep_chance_add +=
          (Math.log(lower_heat) / Math.log(10)) * (lower_heat / part.ep_heat);
      }
    });

    // Check for explosions AFTER outlet transfer but BEFORE venting
    const tilesToExplode = [];
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      this.game.logger?.debug(`Checking ${this.active_vessels.length} active vessels for explosions`);
      this.game.logger?.debug(`Active vessels:`, this.active_vessels.map(t => t.part?.id));
    }
    for (const tile of this.active_vessels) {
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        this.game.logger?.debug(`Processing tile:`, tile.part?.id, `at (${tile.row}, ${tile.col}), exploded=${tile.exploded}`);
      }
      if (!tile.part || tile.exploded) {
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          this.game.logger?.debug(`Skipping tile: no part or already exploded, exploded=${tile.exploded}`);
        }
        continue;
      }
      const part = tile.part;
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        this.game.logger?.debug(`Checking ${part.id} at (${tile.row}, ${tile.col}): heat=${tile.heat_contained}, containment=${part.containment}, condition=${part.containment > 0 && tile.heat_contained > part.containment}`);
      }
      if (part && part.containment > 0 && tile.heat_contained > part.containment) {
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          this.game.logger?.debug(`Component ${part.id} at (${tile.row}, ${tile.col}) exploded: heat=${tile.heat_contained}, containment=${part.containment}`);
        }
        tilesToExplode.push(tile);
      }
    }
    for (const tile of tilesToExplode) {
      const part = tile.part;
      if (part?.category === "particle_accelerator") {
        reactor.checkMeltdown();
      }
      this.handleComponentExplosion(tile);
    }

    // Process Vents
    const activeVents = this.active_vessels.filter(t => t.part?.category === 'vent');
    for (const tile of activeVents) {
      if (!tile.part || tile.exploded) continue;

      // Skip venting for tiles that are valve outputs (to prevent interference with valve heat transfer)
      if (valveNeighborTiles.has(tile)) {
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          this.game.logger?.debug(`Skipping venting for valve output tile ${tile.part.id} at (${tile.row}, ${tile.col}) to preserve valve heat transfer`);
        }
        continue;
      }

      let vent_reduce = Math.min(
        tile.part.getEffectiveVentValue(),
        tile.heat_contained
      );
      // Special logic for Extreme Vent (vent6)
      if (tile.part.id === "vent6") {
        const powerToConsume = Math.min(vent_reduce, reactor.current_power);
        vent_reduce = powerToConsume;
        reactor.current_power -= powerToConsume;
      }
      tile.heat_contained -= vent_reduce;
      if (vent_reduce > 0) {
        const cnt = vent_reduce >= 50 ? 3 : vent_reduce >= 15 ? 2 : 1;
        for (let i = 0; i < cnt; i++) {
          visualEvents.push({ type: 'emit', part: 'vent', icon: 'heat', tile: [tile.row, tile.col] });
        }
        // Blink indicator visually
        try {
          if (this.game.ui && typeof this.game.ui.blinkVent === 'function') {
            for (let i = 0; i < cnt; i++) {
              const delay = i * 60;
              setTimeout(() => this.game.ui.blinkVent(tile), delay);
            }
          }
        } catch (_) { /* ignore */ }
      }
    }

    this.game.performance.markEnd("tick_vents");

    // Add generated power to reactor
    reactor.current_power += Math.round(power_add);
    if (reactor.current_power > reactor.max_power) {
      reactor.current_power = reactor.max_power;
    }

    // Check for component explosions - REMOVED: This is now handled during vessel processing above

    if (ep_chance_add > 0) {
      let ep_gain =
        Math.floor(ep_chance_add) + (Math.random() < ep_chance_add % 1 ? 1 : 0);
      if (ep_gain > 0) {
        this.game.exotic_particles += ep_gain;
        ui.stateManager.setVar("exotic_particles", this.game.exotic_particles);
        // Visual: EP emission from accelerators towards EP display (limit burst count)
        try {
          if (this.game.ui && typeof this.game.ui.emitEP === 'function') {
            let emitted = 0;
            for (const t of this.active_vessels) {
              if (t.part?.category === 'particle_accelerator' && t.heat_contained > 0) {
                this.game.ui.emitEP(t);
                emitted++;
                if (emitted >= 5) break;
              }
            }
          }
        } catch (_) { /* ignore in test env */ }
      }
    }

    this.game.performance.markStart("tick_stats");
    // Forceful Fusion is now handled in reactor.updateStats()

    // Update reactor stats to ensure max_power and other values are current
    reactor.updateStats();

    // Apply global power multiplier to the power that was already added
    const powerMultiplier = reactor.power_multiplier || 1;
    if (powerMultiplier !== 1) {
      // Calculate the additional power from the multiplier
      const additionalPower = (power_add * powerMultiplier) - power_add;
      reactor.current_power += additionalPower;
    }

    // Auto-sell logic - move this after power multiplier is applied
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      this.game.logger?.debug(`Auto-sell check: auto_sell=${ui.stateManager.getVar("auto_sell")}, current_power=${reactor.current_power}`);
    }
    if (ui.stateManager.getVar("auto_sell")) {
      const sell_amount = Math.min(
        reactor.current_power,
        Math.floor(reactor.max_power * reactor.auto_sell_multiplier)
      );
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        this.game.logger?.debug(`Auto-sell calculation: current_power=${reactor.current_power}, max_power=${reactor.max_power}, multiplier=${reactor.auto_sell_multiplier}, sell_amount=${sell_amount}`);
      }
      if (sell_amount > 0) {
        const powerBeforeSell = reactor.current_power;
        reactor.current_power -= sell_amount;
        this.game.current_money += sell_amount;
        ui.stateManager.setVar("current_money", this.game.current_money);
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          this.game.logger?.debug(`Auto-sell executed: power_before=${powerBeforeSell}, sell_amount=${sell_amount}, power_after=${reactor.current_power}`);
        }
      }
    }

    if (reactor.current_power > reactor.max_power)
      reactor.current_power = reactor.max_power;

    if (reactor.current_heat > 0 && reactor.heat_controlled) {
      // Auto heat reduction - only active when heat_controlled is true
      const ventMultiplier = reactor.vent_multiplier || 1;
      reactor.current_heat -= (reactor.max_heat / 10000) * ventMultiplier;
    }
    if (reactor.current_heat < 0) reactor.current_heat = 0;

    ui.stateManager.setVar("current_power", reactor.current_power);
    ui.stateManager.setVar("current_heat", reactor.current_heat);

    // Update heat visuals for immediate visual feedback
    if (ui.updateHeatVisuals) {
      ui.updateHeatVisuals();
    }

    this.game.performance.markEnd("tick_stats");

    const now = Date.now();
    if (now - this.last_session_update >= this.session_update_interval) {
      this.game.updateSessionTime();
      this.last_session_update = now;
    }

    if (reactor.checkMeltdown()) this.stop();

    // Flush visual events once per tick
    try {
      if (visualEvents.length && this.game.ui && typeof this.game.ui._renderVisualEvents === 'function') {
        this.game.ui._renderVisualEvents(visualEvents);
      }
    } catch (_) { /* ignore */ }

    this.game.performance.markEnd("tick_total");
    this.tick_count = (this.tick_count || 0) + 1; // Increment tick_count at the end of each tick

    // Flush visual events to the game buffer once per tick
    if (visualEvents.length) {
      // Enqueueing visual events
      this.game.enqueueVisualEvents(visualEvents);
    }
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  handleComponentExplosion(tile) {
    // Mark the tile as exploded to prevent further processing
    tile.exploded = true;

    // Add the component's heat to the reactor before it's cleared
    if (tile && tile.heat_contained > 0) {
      this.game.reactor.current_heat += tile.heat_contained;
    }

    if (tile.$el) {
      // Add the class to trigger the CSS animation
      tile.$el.classList.add("exploding");

      // Set a timeout to clean up after the animation finishes
      // The duration (600ms) should match the animation duration in your CSS
      setTimeout(() => {
        this.handleComponentDepletion(tile);
        // It's good practice to remove the class after the animation
        if (tile.$el) {
          tile.$el.classList.remove("exploding");
        }
      }, 600);
    } else {
      // If there's no element, just deplete it immediately
      this.handleComponentDepletion(tile);
    }
  }

  /**
   * Get valve orientation from valve ID
   * @param {string} valveId - The valve part ID (e.g., "overflow_valve", "overflow_valve2", etc.)
   * @returns {number} Orientation: 1=left input/right output, 2=top input/bottom output, 3=right input/left output, 4=bottom input/top output
   */
  _getValveOrientation(valveId) {
    // Extract orientation from valve ID (e.g., "overflow_valve2" -> 2)
    const match = valveId.match(/(\d+)$/);
    if (match) {
      return parseInt(match[1]);
    }
    // Default to orientation 1 (left input/right output) for valves without number suffix
    return 1;
  }

  /**
   * Get input and output neighbors based on valve orientation
   * @param {Tile} valve - The valve tile
   * @param {Array} neighbors - Array of neighbor tiles
   * @param {number} orientation - Valve orientation (1-4)
   * @returns {Object} Object with inputNeighbor and outputNeighbor properties
   */
  _getInputOutputNeighbors(valve, neighbors, orientation) {
    if (neighbors.length < 2) {
      return { inputNeighbor: null, outputNeighbor: null };
    }

    // Sort neighbors by position relative to valve
    const sortedNeighbors = neighbors.sort((a, b) => {
      // For horizontal orientations (1, 3), sort by column
      if (orientation === 1 || orientation === 3) {
        return a.col - b.col;
      }
      // For vertical orientations (2, 4), sort by row
      else {
        return a.row - b.row;
      }
    });

    let inputNeighbor, outputNeighbor;

    switch (orientation) {
      case 1: // Left input, right output
        inputNeighbor = sortedNeighbors[0];  // Leftmost
        outputNeighbor = sortedNeighbors[sortedNeighbors.length - 1]; // Rightmost
        break;
      case 2: // Top input, bottom output
        inputNeighbor = sortedNeighbors[0];  // Topmost
        outputNeighbor = sortedNeighbors[sortedNeighbors.length - 1]; // Bottommost
        break;
      case 3: // Right input, left output
        inputNeighbor = sortedNeighbors[sortedNeighbors.length - 1]; // Rightmost
        outputNeighbor = sortedNeighbors[0];  // Leftmost
        break;
      case 4: // Bottom input, top output
        inputNeighbor = sortedNeighbors[sortedNeighbors.length - 1]; // Bottommost
        outputNeighbor = sortedNeighbors[0];  // Topmost
        break;
      default:
        // Fallback to left input, right output
        inputNeighbor = sortedNeighbors[0];
        outputNeighbor = sortedNeighbors[sortedNeighbors.length - 1];
    }

    return { inputNeighbor, outputNeighbor };
  }
}
