import { performance } from "../utils/util.js";

export class Engine {
  constructor(game) {
    this.game = game;
    this.animationFrameId = null;
    this.last_timestamp = 0;
    this.dtime = 0;
    this.running = false;
    this.last_session_update = 0;
    this.session_update_interval = 60000;
    this.tick_count = 0;
    this.active_cells = [];
    this.active_vessels = [];
    this.active_inlets = [];
    this.active_exchangers = [];
    this.active_outlets = [];
    this._partCacheDirty = true;
    this._valveNeighborCache = new Set(); // Cache for valve neighbors
    this._valveNeighborCacheDirty = true; // Track when to invalidate

    // Ensure arrays are always valid
    this._ensureArraysValid();

    this.time_accumulator = 0;

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

  _ensureArraysValid() {
    // Ensure all arrays are always valid arrays
    if (!Array.isArray(this.active_cells)) this.active_cells = [];
    if (!Array.isArray(this.active_vessels)) this.active_vessels = [];
    if (!Array.isArray(this.active_inlets)) this.active_inlets = [];
    if (!Array.isArray(this.active_exchangers)) this.active_exchangers = [];
    if (!Array.isArray(this.active_outlets)) this.active_outlets = [];
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last_timestamp = performance.now();
    this.last_session_update = Date.now();
    this.loop(this.last_timestamp);

    if (this.game.ui && this.game.ui.stateManager) {
      this.game.ui.stateManager.setVar("engine_status", "running");
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.game.updateSessionTime();
    if (this.game.ui && this.game.ui.stateManager) {
      this.game.ui.stateManager.setVar("engine_status", "stopped");
    }
  }

  isRunning() {
    return this.running;
  }

  addTimeTicks(tickCount) {
    if (!this.time_accumulator) {
      this.time_accumulator = 0;
    }
    const targetTickDuration = this.game.loop_wait;
    this.time_accumulator += tickCount * targetTickDuration;
    
    if (this.game.ui && typeof this.game.ui.updateTimeFluxButton === 'function') {
      const queuedTicks = Math.floor(this.time_accumulator / targetTickDuration);
      this.game.ui.updateTimeFluxButton(queuedTicks);
    }
  }

  markPartCacheAsDirty() {
    this._partCacheDirty = true;
    this._valveNeighborCacheDirty = true; // Invalidate valve neighbor cache too
    this._ensureArraysValid(); // Ensure arrays are valid when cache is marked dirty
  }

  _updatePartCaches() {
    if (!this._partCacheDirty) {
      return;
    }
    // Ensure arrays are always valid before proceeding
    this._ensureArraysValid();

    // Clear arrays efficiently
    this.active_cells.length = 0;
    this.active_vessels.length = 0;
    this.active_inlets.length = 0;
    this.active_exchangers.length = 0;
    this.active_outlets.length = 0;

    // Pre-allocate arrays for better performance
    const maxParts = this.game._rows * this.game._cols;
    this.active_cells = new Array(Math.min(maxParts, 100)); // Reasonable upper bound
    this.active_vessels = new Array(Math.min(maxParts, 100));
    this.active_inlets = new Array(Math.min(maxParts, 20));
    this.active_exchangers = new Array(Math.min(maxParts, 50));
    this.active_outlets = new Array(Math.min(maxParts, 20));

    let cellIndex = 0, vesselIndex = 0, inletIndex = 0, exchangerIndex = 0, outletIndex = 0;

    // Single pass through grid with early exits
    for (let row = 0; row < this.game._rows; row++) {
      for (let col = 0; col < this.game._cols; col++) {
        const tile = this.game.tileset.getTile(row, col);
        if (!tile?.part) continue;

        const part = tile.part;
        const category = part.category;

        // Use switch for better performance than multiple if statements
        switch (category) {
          case "cell":
            if (tile.ticks > 0) {
              this.active_cells[cellIndex++] = tile;
            }
            break;
          case "heat_inlet":
            this.active_inlets[inletIndex++] = tile;
            break;
          case "heat_exchanger":
          case "valve":
            this.active_exchangers[exchangerIndex++] = tile;
            break;
          case "heat_outlet":
            this.active_outlets[outletIndex++] = tile;
            break;
        }

        // Check containment conditions once
        const shouldAddToVessels = part.vent > 0 || category === "particle_accelerator" || (part.containment > 0 && category !== "valve");
        if (shouldAddToVessels) {
          this.active_vessels[vesselIndex++] = tile;
        }
      }
    }

    // Trim arrays to actual size
    this.active_cells.length = cellIndex;
    this.active_vessels.length = vesselIndex;
    this.active_inlets.length = inletIndex;
    this.active_exchangers.length = exchangerIndex;
    this.active_outlets.length = outletIndex;

    this._partCacheDirty = false;
  }

  _updateValveNeighborCache() {
    if (!this._valveNeighborCacheDirty) return;

    this._valveNeighborCache.clear();

    // Ensure part caches are up to date before processing valve neighbors
    if (this._partCacheDirty) {
      this._updatePartCaches();
    }

    // Ensure active_exchangers is always a valid array
    if (!Array.isArray(this.active_exchangers)) {
      this.active_exchangers = [];
    }

    // Pre-populate valve neighbors by finding all tiles that are adjacent to valves
    // This ensures proper neighbor filtering during heat exchange
    for (const tile of this.active_exchangers) {
      if (tile.part && tile.part.category === 'valve') {
        // Add all containment neighbors of this valve to the cache
        for (const neighbor of tile.containmentNeighborTiles) {
          if (neighbor.part && neighbor.part.category !== 'valve') {
            this._valveNeighborCache.add(neighbor);
          }
        }
      }
    }

    this._valveNeighborCacheDirty = false;
  }

  loop(timestamp) {
    if (!this.running || this.game.paused) {
      if (this.game.paused) {
         this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
         this.last_timestamp = timestamp; 
         return;
      }
      this.stop();
      return;
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("engine_loop");
    }

    const deltaTime = timestamp - this.last_timestamp;
    this.last_timestamp = timestamp;

    if (this._partCacheDirty) {
      this._updatePartCaches();
    }

    const targetTickDuration = this.game.loop_wait;

    // Accumulate time flux only if offline/away (>30s)
    if (deltaTime > 30000) {
      const previousAccumulator = this.time_accumulator || 0;
      this.time_accumulator = previousAccumulator + deltaTime;
      this.game.logger?.debug(`[TIME FLUX] Offline time detected (${deltaTime.toFixed(0)}ms), accumulator: ${previousAccumulator.toFixed(0)}ms -> ${this.time_accumulator.toFixed(0)}ms`);
    } else if (this.active_cells.length > 0) {
      // Standard gameplay loop - process live time
      let ticksToProcess = deltaTime / targetTickDuration;
      const maxLiveTicks = 10.0;
      const initialAccumulator = this.time_accumulator || 0;
      let fluxTicksUsed = 0;

      // If clamped, add excess time to accumulator to prevent spiral of death
      if (ticksToProcess > maxLiveTicks) {
        const originalTicks = ticksToProcess;
        const excessTime = (ticksToProcess - maxLiveTicks) * targetTickDuration;
        this.time_accumulator = (this.time_accumulator || 0) + excessTime;
        ticksToProcess = maxLiveTicks;
        this.game.logger?.debug(`[TIME FLUX] Live time clamped from ${originalTicks.toFixed(2)} to ${maxLiveTicks.toFixed(2)} ticks, excess ${excessTime.toFixed(0)}ms added to accumulator`);
      }

      // If Time Flux is enabled, consume banked time
      if (this.game.time_flux && this.time_accumulator > 0) {
        const maxFluxTicks = 10.0;
        const availableFluxTicks = this.time_accumulator / targetTickDuration;
        fluxTicksUsed = Math.min(availableFluxTicks, maxFluxTicks);
        
        ticksToProcess += fluxTicksUsed;
        this.time_accumulator -= (fluxTicksUsed * targetTickDuration);
        if (this.time_accumulator < 0.001) this.time_accumulator = 0;
        
        this.game.logger?.debug(`[TIME FLUX] Consuming banked time: ${fluxTicksUsed.toFixed(2)} flux ticks (${(fluxTicksUsed * targetTickDuration).toFixed(0)}ms), accumulator: ${initialAccumulator.toFixed(0)}ms -> ${this.time_accumulator.toFixed(0)}ms, Time Flux: ${this.game.time_flux ? 'ON' : 'OFF'}`);
      }

      if (ticksToProcess > 0) {
        this._processTick(ticksToProcess);
        if (fluxTicksUsed === 0 && initialAccumulator > 0) {
          this.game.logger?.debug(`[TIME FLUX] Processing live time only (${(deltaTime / targetTickDuration).toFixed(3)} ticks), accumulator preserved at ${initialAccumulator.toFixed(0)}ms, Time Flux: ${this.game.time_flux ? 'ON' : 'OFF'}`);
        }
      }
    }

    // Update Time Flux UI with queued tick count
    if (this.game.ui && typeof this.game.ui.updateTimeFluxButton === 'function') {
      const queuedTicks = Math.floor(this.time_accumulator / targetTickDuration);
      this.game.ui.updateTimeFluxButton(queuedTicks);
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("engine_loop");
    }

    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  tick() {
    return this._processTick(1.0, false);
  }

  manualTick() {
    return this._processTick(1.0, true);
  }

  _processTick(multiplier = 1.0, manual = false) {
    const tickStart = performance.now();
    const currentTickNumber = this.tick_count;
    
    this.game.logger?.debug(`[TICK START] Paused: ${this.game.paused}, Manual: ${manual}, Running: ${this.running}, Multiplier: ${multiplier.toFixed(4)}`);

    if (this.game.paused && !manual) {
      this.game.logger?.debug('[TICK ABORTED] Game is paused.');
      return;
    }
    
    this.game.logger?.groupCollapsed(`Processing Tick #${currentTickNumber} (Manual: ${manual}, x${multiplier.toFixed(2)})`);
    try {
      // Immediately check for meltdown condition before any processing
      if (this.game.reactor.has_melted_down) {
        this.game.logger?.debug(`[TICK ABORTED] Reactor already in meltdown state.`);
        this.game.logger?.groupEnd();
        return;
      }
      if (this.game.reactor.checkMeltdown()) {
        this.game.logger?.warn(`[TICK ABORTED] Meltdown triggered at start of tick.`);
        this.game.logger?.groupEnd();
        return;
      }
      
      if (this.game.logger) {
        this.game.logger.debug(`Manual: ${manual}, Paused: ${this.game.paused}, Running: ${this.running}`);
      }
    // Only measure tick performance if performance monitoring is enabled
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_total");
    }

    const reactor = this.game.reactor;
    const tileset = this.game.tileset;
    const ui = this.game.ui;
    this.game.logger?.debug(`[TICK START] Paused: ${this.game.paused}, Manual: ${manual}, Reactor Heat: ${reactor.current_heat.toFixed(2)}`);
    // Pre-allocate visual events array for better performance
    // Increased size to handle complex reactor layouts with many parts
    const visualEvents = new Array(200); // Increased from 100 to 200 for better performance
    let visualEventIndex = 0;

    // Update engine status indicator for tick
    if (ui && ui.stateManager) {
      ui.stateManager.setVar("engine_status", "tick");
    }

    // Record tick for performance tracking
    if (ui && ui.recordTick) {
      ui.recordTick();
    }

    // Don't process ticks if the game is paused
    if (this.game.paused && !manual) {
      this.game.logger?.debug('Tick skipped: Game is paused.');
      if (this.game.performance && this.game.performance.shouldMeasure()) {
        this.game.performance.markEnd("tick_total");
      }
      this.game.logger?.groupEnd();
      return;
    }

    // Don't process ticks if engine is not running (for automatic ticks)
    if (!this.running && !manual) {
      this.game.logger?.debug('Tick skipped: Engine not running and not a manual tick.');
      if (this.game.performance && this.game.performance.shouldMeasure()) {
        this.game.performance.markEnd("tick_total");
      }
      this.game.logger?.groupEnd();
      return;
    }

    // Force update part caches to ensure newly added parts are included
    this._partCacheDirty = true;
    this._updatePartCaches();
    this._updateValveNeighborCache(); // Update valve neighbor cache

    // Only measure categorize parts if performance monitoring is enabled
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_categorize_parts");
    }

    // The loop below is now handled by _updatePartCaches()
    // so we can remove it to avoid redundant work.
    const active_cells = this.active_cells;
    const active_vessels = this.active_vessels;

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_categorize_parts");
    }
    this.game.logger?.debug(`Processing ${active_cells.length} active cells and ${active_vessels.length} active vessels.`);
    this.game.logger?.debug(`[TICK] Processing ${this.active_cells.length} cells...`);

    let power_add = 0;
    let heat_add = 0; // Re-introduced for globally added heat

    // Use cached valve neighbors instead of recalculating
    const valveNeighborTiles = this._valveNeighborCache;

    // Note: We no longer track tiles that received heat from valves to prevent double-processing
    // This allows components to process their own heat transfer logic in the same tick

    // Only measure tick cells if performance monitoring is enabled
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_cells");
    }
    let cellsProcessed = 0;
    for (let i = 0; i < this.active_cells.length; i++) {
      const tile = this.active_cells[i];
      const part = tile.part;

      if (!part || tile.exploded) continue;
      if (tile.ticks <= 0) continue;

      power_add += tile.power * multiplier;
      cellsProcessed++;

      if (tile.power > 0 && Math.random() < multiplier) {
         const count = tile.power >= 200 ? 3 : tile.power >= 50 ? 2 : 1;
         if (visualEventIndex < visualEvents.length - count) {
           for(let k=0; k<count; k++) {
             visualEvents[visualEventIndex++] = { type: 'emit', icon: 'power', tile: [tile.row, tile.col] };
           }
         }
      }

      const generatedHeat = tile.heat * multiplier;

      if (tile.heat > 0 && Math.random() < multiplier) {
           const countH = tile.heat >= 200 ? 3 : tile.heat >= 50 ? 2 : 1;
           if (visualEventIndex < visualEvents.length - countH) {
               for(let k=0; k<countH; k++) {
                 visualEvents[visualEventIndex++] = { type: 'emit', icon: 'heat', tile: [tile.row, tile.col] };
               }
           }
      }

      const heatNeighbors = tile.containmentNeighborTiles.filter(
        (t) => t.part && t.part.containment > 0
      );

      if (heatNeighbors.length > 0) {
           const heat_per_neighbor = generatedHeat / heatNeighbors.length;
           for (let j = 0; j < heatNeighbors.length; j++) {
             heatNeighbors[j].heat_contained += heat_per_neighbor;
           }
      } else {
           heat_add += generatedHeat;
      }

      tile.ticks -= multiplier;
      
      for (const r_tile of tile.reflectorNeighborTiles) {
        if (r_tile.ticks > 0) {
          r_tile.ticks -= multiplier;
          if (r_tile.ticks <= 0) this.handleComponentDepletion(r_tile);
        }
      }

      if (tile.ticks <= 0) {
        if (part.type === "protium") {
          this.game.protium_particles += part.cell_count;
          this.game.update_cell_power();
        }
        this.handleComponentDepletion(tile);
      }
    }
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_cells");
    }
    this.game.logger?.debug(`Cell processing complete. Cells processed: ${cellsProcessed}. Power Added: ${power_add.toFixed(2)}, Heat Added to Reactor: ${heat_add.toFixed(2)}`);
    this.game.logger?.debug(`[TICK] After cells: Power generated=${power_add.toFixed(2)}, Heat to reactor=${heat_add.toFixed(2)}`);

    // Add only the globally-directed heat to the reactor.
    reactor.current_heat += heat_add;
    this.game.logger?.debug(`[TICK STAGE] After cell processing: Reactor Heat = ${reactor.current_heat.toFixed(2)}`);
    this.game.logger?.debug(`[TICK] Reactor state after cells: Power=${reactor.current_power.toFixed(2)}, Heat=${reactor.current_heat.toFixed(2)}`);
    if (heat_add > 0) {
      // Heat added to reactor
    }

    // (Explosion checks occur after outlet transfer but before vents to allow overfill)

    // Break down heat transfer into focused performance measurements
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_heat_transfer");
    }

    // Legacy Heat Transfer Logic
    // Inlets
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_inlets");
    }

    for (let i = 0; i < this.active_inlets.length; i++) {
      const tile = this.active_inlets[i];
      const tile_part = tile.part;
      if (!tile_part) continue;

      for (const tile_containment of tile.containmentNeighborTiles) {
        if (!tile_containment.part || !tile_containment.heat_contained) continue;
        
        let maxTransfer = tile.getEffectiveTransferValue() * multiplier;
        let transfer_heat = Math.min(maxTransfer, tile_containment.heat_contained);
        
        tile_containment.heat_contained -= transfer_heat;
        reactor.current_heat += transfer_heat;
        heat_add += transfer_heat;
      }
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_inlets");
    }
    this.game.logger?.debug(`[TICK STAGE] After heat transfer (inlets): Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    // Valves (directional heat transfer with conditional logic)
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_valves");
    }

    {
      // Ensure active_exchangers is always a valid array
      if (!Array.isArray(this.active_exchangers)) {
        this.active_exchangers = [];
      }

      // Filter valves once and store the result - optimize with early exit
      const valves = [];
      for (const tile of this.active_exchangers) {
        if (tile.part?.category === 'valve') {
          valves.push(tile);
        }
      }

      // Process valves efficiently with minimal logging
      for (const valve of valves) {
        const valvePart = valve.part;
        const neighbors = valve.containmentNeighborTiles.filter(t => t.part);

        if (neighbors.length < 2) continue; // Need at least 2 neighbors to transfer

        // Determine input and output neighbors based on valve type and orientation
        let inputNeighbors = [];
        let outputNeighbors = [];

        if (valvePart.type === 'overflow_valve') {
          // Overflow valve: only works if input side neighbor is above 80% containment
          const orientation = this._getValveOrientation(valvePart.id);
          const { inputNeighbor, outputNeighbor } = this._getInputOutputNeighbors(valve, neighbors, orientation);

          if (inputNeighbor && outputNeighbor) {
            // Validation: valves can't pull from other valves unless input connects to output
            if (inputNeighbor.part?.category === 'valve') {
              const inputValveOrientation = this._getValveOrientation(inputNeighbor.part.id);
              const inputValveNeighbors = inputNeighbor.containmentNeighborTiles.filter(t => t.part && t !== valve);
              const { outputNeighbor: inputValveOutput } = this._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

              // Only allow if this valve's input connects to another valve's output
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
          // Top-up valve: only works if output side neighbor is below 20% containment
          const orientation = this._getValveOrientation(valvePart.id);
          const { inputNeighbor, outputNeighbor } = this._getInputOutputNeighbors(valve, neighbors, orientation);

          if (inputNeighbor && outputNeighbor) {
            // Validation: valves can't pull from other valves unless input connects to output
            if (inputNeighbor.part?.category === 'valve') {
              const inputValveOrientation = this._getValveOrientation(inputNeighbor.part.id);
              const inputValveNeighbors = inputNeighbor.containmentNeighborTiles.filter(t => t.part && t !== valve);
              const { outputNeighbor: inputValveOutput } = this._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

              // Only allow if this valve's input connects to another valve's output
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
          // Check valve: one-way transfer from input to output
          const orientation = this._getValveOrientation(valvePart.id);
          const { inputNeighbor, outputNeighbor } = this._getInputOutputNeighbors(valve, neighbors, orientation);

          if (inputNeighbor && outputNeighbor) {
            // Validation: valves can't pull from other valves unless input connects to output
            if (inputNeighbor.part?.category === 'valve') {
              const inputValveOrientation = this._getValveOrientation(inputNeighbor.part.id);
              const inputValveNeighbors = inputNeighbor.containmentNeighborTiles.filter(t => t.part && t !== valve);
              const { outputNeighbor: inputValveOutput } = this._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);

              // Only allow if this valve's input connects to another valve's output
              if (inputValveOutput !== valve) continue;
            }

            // Check valve is always active (no threshold conditions)
            inputNeighbors.push(inputNeighbor);
            outputNeighbors.push(outputNeighbor);
          }
        }

        // Process heat transfer for each input-output pair
        // Only transfer if we have valid input and output neighbors
        // Valves should never store heat - they only transfer when both input and output are available
        if (inputNeighbors.length > 0 && outputNeighbors.length > 0) {
          if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
            console.log(`[ENGINE] Valve ${valvePart.id} has ${inputNeighbors.length} inputs and ${outputNeighbors.length} outputs`);
          }

          // Add valve to active_vessels only when it has valid input/output neighbors
          // This prevents idle valves from being processed by explosion checking
          if (!this.active_vessels.includes(valve)) {
            this.active_vessels.push(valve);
          }

          for (const input of inputNeighbors) {
            for (const output of outputNeighbors) {
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
                  if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    console.log(`[ENGINE] Valve ${valvePart.id} transferring ${transferAmount} heat from input to output`);
                  }

                  input.heat_contained -= transferAmount;
                  output.heat_contained += transferAmount;

                  // Note: Valve neighbors are now pre-populated in _updateValveNeighborCache()
                  // so we don't need to add them here during heat transfer
                  // DO NOT mark output as processed - it needs to run its own heat transfer logic

                  if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    console.log(`[ENGINE] Valve ${valvePart.id} transfer complete: input heat now ${input.heat_contained}, output heat now ${output.heat_contained}`);
                  }

                  // Add visual effect - DISABLED for performance
                  const cnt = transferAmount >= 50 ? 3 : transferAmount >= 15 ? 2 : 1;
                  for (let i = 0; i < cnt; i++) {
                    // visualEvents[visualEventIndex++] = {
                    //   type: 'flow',
                    //   icon: 'heat',
                    //   from: [input.row, input.col],
                    //   to: [output.row, output.col],
                    //   amount: transferAmount
                    // };
                  }
                }
              }
            }
          }
        } else {
          // Valve has no valid input/output pairs - remove it from active_vessels if it was there
          if (this.active_vessels.includes(valve)) {
            this.active_vessels = this.active_vessels.filter(v => v !== valve);
          }
        }

        valve.heat_contained = 0;
      }
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_valves");
    }

    // Exchangers (two-phase plan to prevent ping-pong; prioritize vents/coolants; capacity-aware)
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_exchangers");
    }

    {
      // Ensure active_exchangers is always a valid array
      if (!Array.isArray(this.active_exchangers)) {
        this.active_exchangers = [];
      }

      // Include all non-valve exchangers, but valve neighbors can only participate in limited ways
      const exchangers = this.active_exchangers.filter(t =>
        t.part &&
        t.part.category !== 'valve'
      );

      // For valve neighbors, we need to work with current heat values to account for valve transfers
      // For non-valve neighbors, we can use snapshots to prevent ping-pong effects
      // BUT: We need to ensure that heat received from valves is preserved throughout the tick
      const startHeat = new Map();
      const valveNeighborExchangers = new Set();

      for (const t of exchangers) {
        if (valveNeighborTiles.has(t)) {
          valveNeighborExchangers.add(t);
          // Store current heat for valve neighbors, but we'll use tile.heat_contained directly
          // This ensures heat received from valves is preserved
          startHeat.set(t, t.heat_contained || 0);
        } else {
          startHeat.set(t, t.heat_contained || 0);
        }
      }

      const planned = [];
      const plannedOutByNeighbor = new Map();
      const plannedInByNeighbor = new Map();
      const plannedInByExchanger = new Map();

      for (const tile of exchangers) {
        const tile_part = tile.part;
        if (!tile_part) continue;

        // For valve neighbors, always use current heat to preserve heat received from valves
        // For others, use snapshot to prevent ping-pong effects
        const heatStart = valveNeighborExchangers.has(tile) ? (tile.heat_contained || 0) : (startHeat.get(tile) || 0);

        // Prefer sinks first, then other parts, exchangers last
        // For valve neighbors, we need to be more careful about heat exchanger neighbors
        // but we shouldn't completely exclude them as it prevents heat flow through valves
        const neighborsAll = tile.containmentNeighborTiles.filter(t =>
          t.part
        );
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
          // For valve neighbors and their neighbors, always use current heat to preserve valve transfers
          // For others, use snapshot to prevent ping-pong effects
          const isExchangerNeighbor = startHeat.has(neighbor);
          const isValveNeighbor = valveNeighborTiles.has(neighbor);
          const isNeighborOfValveNeighbor = valveNeighborExchangers.has(tile) && isExchangerNeighbor;
          const nStartRaw = (isValveNeighbor || isNeighborOfValveNeighbor) ? (neighbor.heat_contained || 0) : (isExchangerNeighbor ? (startHeat.get(neighbor) || 0) : (neighbor.heat_contained || 0));
          const neighborCapacity = neighbor.part.containment || 0;
          const neighborHeadroomBase = neighborCapacity > 0 ? Math.max(0, neighborCapacity - nStartRaw) : Number.POSITIVE_INFINITY;
          const neighborHeadroom = Math.max(0, neighborHeadroomBase - (plannedInByNeighbor.get(neighbor) || 0));
          const isPreferred = neighbor.part.category === 'vent' || neighbor.part.category === 'coolant_cell';

          if (remainingPush > 0 && (heatStart > nStartRaw || (isPreferred && heatStart === nStartRaw && heatStart > 0))) {
            const diff = Math.max(0, heatStart - nStartRaw) || 1;
            const totalHeadroom = orderedNeighbors.reduce((sum, n) => sum + Math.max((n.part?.containment || 0) - (n.heat_contained || 0), 0), 0) || 1;
            const neighborHeadroomForWeight = Math.max(neighborCapacity - nStartRaw, 0);
            const capacityBias = Math.max(neighborHeadroomForWeight / totalHeadroom, 0);
            const biasedCap = Math.max(1, Math.floor(tile.getEffectiveTransferValue() * capacityBias * multiplier));

            let transfer_heat = Math.min(
              biasedCap,
              Math.ceil(diff / 2),
              remainingPush
            );

            // Valve neighbors can now process heat normally since we don't mark them as processed
            // This allows heat to flow through valves correctly

            if (transfer_heat > 0) {
              planned.push({ from: tile, to: neighbor, amount: transfer_heat });
              remainingPush -= transfer_heat;
              plannedInByNeighbor.set(neighbor, (plannedInByNeighbor.get(neighbor) || 0) + transfer_heat);
              if (remainingPush <= 0) continue;
            }
          }

          // Pull: only from non-exchanger neighbors that are hotter than this exchanger at start
          // Valve neighbors and their neighbors can now pull heat normally since we don't mark them as processed
          if (!isExchangerNeighbor || isValveNeighbor || isNeighborOfValveNeighbor) {
            const alreadyOut = plannedOutByNeighbor.get(neighbor) || 0;
            const nAvailable = Math.max(0, nStartRaw - alreadyOut);
            if (nAvailable > 0 && nStartRaw > heatStart) {
              const diff = nStartRaw - heatStart;
              const biasedCap = tile.getEffectiveTransferValue() * multiplier;
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
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          console.log(`[ENGINE] Heat exchanger transfer: ${p.amount} heat from ${p.from.part?.id} to ${p.to.part?.id}`);
        }

        p.from.heat_contained -= p.amount;
        p.to.heat_contained += p.amount;

        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          console.log(`[ENGINE] Heat exchanger transfer complete: ${p.from.part?.id} heat now ${p.from.heat_contained}, ${p.to.part?.id} heat now ${p.to.heat_contained}`);
        }

        // Debug: Log heat levels after each transfer for valve neighbors
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test' &&
          (valveNeighborTiles.has(p.from) || valveNeighborTiles.has(p.to))) {
          console.log(`[ENGINE] After transfer - ${p.from.part?.id}: ${p.from.heat_contained}, ${p.to.part?.id}: ${p.to.heat_contained}`);
        }

        const transfer_heat = p.amount;
        const cnt = transfer_heat >= 50 ? 3 : transfer_heat >= 15 ? 2 : 1;
        for (let i = 0; i < cnt; i++) {
          // visualEvents[visualEventIndex++] = { type: 'flow', icon: 'heat', from: [p.from.row, p.from.col], to: [p.to.row, p.to.col], amount: transfer_heat };
        }
      }

      // Debug: Log final heat levels for valve neighbors after exchanger processing
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        for (const tile of exchangers) {
          if (tile.part?.category === 'heat_exchanger') {
            const isValveNeighbor = valveNeighborTiles.has(tile);
            console.log(`[ENGINE] After exchanger processing - ${tile.part?.id}: ${tile.heat_contained} (valve neighbor: ${isValveNeighbor})`);
          }
        }
      }
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_exchangers");
    }
    this.game.logger?.debug(`[TICK STAGE] After heat transfer (exchangers): Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    // Outlets
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_outlets");
    }

    for (let i=0; i<this.active_outlets.length; i++) {
       const tile = this.active_outlets[i];
       const tile_part = tile.part;
       if (!tile_part) continue;
       
       const neighbors = tile.containmentNeighborTiles.filter(t => t.part && t.part.category !== 'valve');
       if (neighbors.length) {
           const transferCap = tile.getEffectiveTransferValue() * multiplier;
           let outlet_transfer_heat = Math.min(transferCap, reactor.current_heat);
           
           if (outlet_transfer_heat > 0) {
               const per_neighbor = outlet_transfer_heat / neighbors.length;
               
               for(const neighbor of neighbors) {
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
           }
       }
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_outlets");
    }
    this.game.logger?.debug(`[TICK STAGE] After heat transfer (outlets): Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    // End the overall heat transfer measurement
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_heat_transfer");
    }

    // Process Particle Accelerators and Extreme Capacitors
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_particle_accelerators");
    }

    let ep_chance_add = 0;
    for (let i=0; i<this.active_vessels.length; i++) {
       const tile = this.active_vessels[i];
       const part = tile.part;
       if (part && part.category === "particle_accelerator" && tile.heat_contained > 0) {
           const lower_heat = Math.min(tile.heat_contained, part.ep_heat);
           const chance = (Math.log(lower_heat) / Math.log(10)) * (lower_heat / part.ep_heat);
           ep_chance_add += chance * multiplier;
       }
    }
    this.game.logger?.debug(`[EP-GEN] Total EP chance for this tick: ${ep_chance_add}`);
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_particle_accelerators");
    }

    // Check for explosions AFTER outlet transfer but BEFORE venting
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_explosions");
    }

    const tilesToExplode = [];
    for (const tile of this.active_vessels) {
      if (!tile.part || tile.exploded) continue;

      const part = tile.part;
      if (part && part.containment > 0 && tile.heat_contained > part.containment) {
        tilesToExplode.push(tile);
      }
    }

    // Process explosions in batch to avoid interrupting the main loop
    for (const tile of tilesToExplode) {
      const part = tile.part;
      if (part?.category === "particle_accelerator") {
        reactor.checkMeltdown();
      }
      this.handleComponentExplosion(tile);
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_explosions");
    }

    // Process Vents - filter once and store result
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_vents");
    }

    const activeVents = [];
    for (const tile of this.active_vessels) {
      if (tile.part?.category === 'vent') {
        activeVents.push(tile);
      }
    }

    for(const tile of activeVents) {
        if(!tile.part || tile.exploded) continue;
        
        const ventRate = tile.getEffectiveVentValue() * multiplier;
        const heat = tile.heat_contained;
        
        let vent_reduce = Math.min(ventRate, heat);
        
        if (tile.part.id === "vent6") {
            const powerAvail = reactor.current_power;
            const powerNeeded = vent_reduce;
            if (powerNeeded > powerAvail) {
                vent_reduce = powerAvail;
            }
            reactor.current_power -= vent_reduce;
        }
        
        tile.heat_contained -= vent_reduce;
        
        if (vent_reduce > 0 && Math.random() < multiplier) {
        const cnt = vent_reduce >= 50 ? 3 : vent_reduce >= 15 ? 2 : 1;
        for (let i = 0; i < cnt; i++) {
          // visualEvents[visualEventIndex++] = { type: 'emit', part: 'vent', icon: 'heat', tile: [tile.row, tile.col] };
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

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_vents");
    }
    this.game.logger?.debug(`[TICK STAGE] After vent processing: Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    // Add generated power to reactor with overflow logic
    const powerToAdd = power_add;
    const potentialPower = reactor.current_power + powerToAdd;
    
    if (potentialPower > reactor.max_power) {
      const excessPower = potentialPower - reactor.max_power;
      reactor.current_power = reactor.max_power;
      reactor.current_heat += excessPower;
    } else {
      reactor.current_power = potentialPower;
    }

    if (ep_chance_add > 0) {
      let ep_gain = Math.floor(ep_chance_add);
      if (Math.random() < (ep_chance_add % 1)) ep_gain++;
      
      if (ep_gain > 0) {
        this.game.exotic_particles += ep_gain;
        this.game.total_exotic_particles += ep_gain;
        this.game.current_exotic_particles += ep_gain;
        ui.stateManager.setVar("exotic_particles", this.game.exotic_particles);
        ui.stateManager.setVar("total_exotic_particles", this.game.total_exotic_particles);
        ui.stateManager.setVar("current_exotic_particles", this.game.current_exotic_particles);
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

    // Only measure tick stats if performance monitoring is enabled
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_stats");
    }

    reactor.updateStats();

    const powerMult = reactor.power_multiplier || 1;
    if (powerMult !== 1) {
       const extra = power_add * (powerMult - 1);
       reactor.current_power += extra; 
       if (reactor.current_power > reactor.max_power) {
           reactor.current_heat += (reactor.current_power - reactor.max_power);
           reactor.current_power = reactor.max_power;
       }
    }

    if (ui.stateManager.getVar("auto_sell")) {
      const sellCap = Math.floor(reactor.max_power * reactor.auto_sell_multiplier) * multiplier;
      const sellAmount = Math.min(reactor.current_power, sellCap);
      
      if (sellAmount > 0) {
        reactor.current_power -= sellAmount;
        this.game.current_money += sellAmount;
        ui.stateManager.setVar("current_money", this.game.current_money);
      }
    }

    if (reactor.current_power > reactor.max_power)
      reactor.current_power = reactor.max_power;

    if (reactor.current_heat > 0 && reactor.heat_controlled) {
      const ventBonus = reactor.vent_multiplier_eff || 0;
      const baseRed = (reactor.max_heat / 10000);
      const reduction = baseRed * (1 + ventBonus / 100) * multiplier;
      
      reactor.current_heat -= reduction;
    }
    if (reactor.current_heat < 0) reactor.current_heat = 0;

    ui.stateManager.setVar("current_power", reactor.current_power);
    ui.stateManager.setVar("current_heat", reactor.current_heat);

    // Update heat visuals for immediate visual feedback
    if (ui.updateHeatVisuals) {
      ui.updateHeatVisuals();
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_stats");
    }

    const now = Date.now();
    if (now - this.last_session_update >= this.session_update_interval) {
      this.game.updateSessionTime();
      this.last_session_update = now;
    }
    this.game.logger?.debug(`[TICK STAGE] Before final meltdown check: Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    if (visualEventIndex > 0 && this.game.ui && typeof this.game.ui._renderVisualEvents === 'function') {
        this.game.ui._renderVisualEvents(visualEvents.slice(0, visualEventIndex));
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_total");
    }
    this.tick_count++;
    } catch (error) {
      console.error(`Error in _processTick:`, error);
      if (ui && ui.stateManager) {
        ui.stateManager.setVar("engine_status", "stopped");
      }
      throw error;
    } finally {
      this.game.logger?.groupEnd();
    }
    const tickDuration = performance.now() - tickStart;
    this.game.debugHistory.add('engine', 'tick', { number: currentTickNumber, duration: tickDuration });
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  handleComponentExplosion(tile) {
    // Mark the tile as exploded to prevent further processing
    tile.exploded = true;
    if (this.game.audio) {
      this.game.audio.play('explosion');
    }

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
