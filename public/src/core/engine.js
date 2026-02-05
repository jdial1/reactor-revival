import { performance } from "../utils/util.js";

export class Engine {
  constructor(game) {
    this.game = game;
    this._testFrameCount = 0;
    this._maxTestFrames = 200;
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
    this.active_valves = [];
    this.active_vents = [];
    this.active_capacitors = [];
    this._partCacheDirty = true;
    this._valveNeighborCache = new Set();
    this._valveNeighborCacheDirty = true;
    this._valveOrientationCache = new Map();

    // Object Pooling & Memory Optimization
    this._visualEventPool = [];
    for (let i = 0; i < 200; i++) {
      this._visualEventPool.push({ type: null, icon: null, tile: null, part: null });
    }
    this._visualEventCount = 0;

    // Heat Manager Pre-allocation (Avoid GC)
    this._heatCalc_startHeat = new Map();
    this._heatCalc_planned = [];
    this._heatCalc_plannedPool = [];
    for(let i=0; i<500; i++) this._heatCalc_plannedPool.push({ from: null, to: null, amount: 0 });
    this._heatCalc_plannedCount = 0;
    
    this._heatCalc_plannedOutByNeighbor = new Map();
    this._heatCalc_plannedInByNeighbor = new Map();
    this._heatCalc_plannedInByExchanger = new Map();

    // Heat Exchanger/Outlet/Explosion Processing - GC Optimization
    this._heatCalc_validNeighbors = [];
    this._outletProcessing_neighbors = [];
    this._explosion_tilesToExplode = [];

    // Valve Processing Pre-allocation (Avoid GC)
    this._valveOrientationCache = new Map();
    this._valveNeighborResult = { inputNeighbor: null, outputNeighbor: null };
    this._valveProcessing_valves = [];
    this._valveProcessing_neighbors = [];
    this._valveProcessing_inputNeighbors = [];
    this._valveProcessing_outputNeighbors = [];
    this._valve_inputValveNeighbors = [];
    this._valveNeighborExchangers = new Set();
    this._valveNeighborResult = { inputNeighbor: null, outputNeighbor: null };

    // Outlet Processing Pre-allocation (Avoid GC)
    this._outletProcessing_neighbors = [];

    // Vent Processing Pre-allocation (Avoid GC)
    this._ventProcessing_activeVents = [];

    // Valve orientation cache (avoids repeated regex in hot path)
    this._valveOrientationCache = new Map();

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
      getSegmentForTile: () => {
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
    this._testFrameCount = 0;
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
    this._testFrameCount = 0;
    if (this.animationFrameId !== null && this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = null;
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
    this.active_valves.length = 0;
    this.active_vents.length = 0;
    this.active_capacitors.length = 0;

    // Pre-allocate arrays for better performance
    const maxParts = this.game._rows * this.game._cols;
    this.active_cells = new Array(Math.min(maxParts, 100)); // Reasonable upper bound
    this.active_vessels = new Array(Math.min(maxParts, 100));
    this.active_inlets = new Array(Math.min(maxParts, 20));
    this.active_exchangers = new Array(Math.min(maxParts, 50));
    this.active_outlets = new Array(Math.min(maxParts, 20));
    this.active_valves = new Array(Math.min(maxParts, 20));
    this.active_vents = new Array(Math.min(maxParts, 50));
    this.active_capacitors = new Array(Math.min(maxParts, 50));

    let cellIndex = 0, vesselIndex = 0, inletIndex = 0, exchangerIndex = 0, outletIndex = 0;
    let valveIndex = 0, ventIndex = 0, capacitorIndex = 0;

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
            this.active_exchangers[exchangerIndex++] = tile;
            break;
          case "valve":
            this.active_exchangers[exchangerIndex++] = tile;
            this.active_valves[valveIndex++] = tile;
            break;
          case "reactor_plating":
            if (part.transfer > 0) {
              this.active_exchangers[exchangerIndex++] = tile;
            }
            break;
          case "heat_outlet":
            if (tile.activated) {
              this.active_outlets[outletIndex++] = tile;
            }
            break;
          case "vent":
            this.active_vents[ventIndex++] = tile;
            break;
          case "capacitor":
            this.active_capacitors[capacitorIndex++] = tile;
            break;
          default:
            break;
        }

        // Fix: Ensure vents are added to active_vessels even if part.vent is 0 (can happen if base_vent not set correctly on init)
        const shouldAddToVessels = (category === 'vent') || (part.vent > 0) || category === "particle_accelerator" || (part.containment > 0 && category !== "valve");
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
    this.active_valves.length = valveIndex;
    this.active_vents.length = ventIndex;
    this.active_capacitors.length = capacitorIndex;

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
    for (let i = 0; i < this.active_valves.length; i++) {
      const tile = this.active_valves[i];
      // Add all containment neighbors of this valve to the cache
      const neighbors = tile.containmentNeighborTiles;
      for (let j = 0; j < neighbors.length; j++) {
        const neighbor = neighbors[j];
        if (neighbor.part && neighbor.part.category !== 'valve') {
          this._valveNeighborCache.add(neighbor);
        }
      }
    }

    this._valveNeighborCacheDirty = false;
  }

  loop(timestamp) {
    // CRITICAL: Prevent runaway loops in test environment by capping frames
    const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') ||
                      (typeof global !== 'undefined' && global.__VITEST__) ||
                      (typeof window !== 'undefined' && window.__VITEST__);

    if (isTestEnv) {
      this._testFrameCount = (this._testFrameCount || 0) + 1;
      const maxFrames = this._maxTestFrames || 200;
      if (this._testFrameCount > maxFrames) {
        this.running = false;
        this.animationFrameId = null;
        return;
      }
    } else {
      this._testFrameCount = 0;
    }

    // Double-check running state
    if (!this.running) {
      this.animationFrameId = null;
      return;
    }
    
    if (this.game.paused) {
      if (!isTestEnv) {
        this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
        this.last_timestamp = timestamp; 
      }
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
        const heatRatio = this.game.reactor.max_heat > 0 ? this.game.reactor.current_heat / this.game.reactor.max_heat : 0;
        if (heatRatio >= 0.9) {
          this.game.logger?.warn("[TIME FLUX] Safety stop: Heat > 90%. Pausing game and disabling Time Flux.");
          this.game.ui.stateManager.setVar("time_flux", false);
          this.game.pause();
          ticksToProcess = 0;
        } else {
          const maxFluxTicks = 10.0;
          const availableFluxTicks = this.time_accumulator / targetTickDuration;
          fluxTicksUsed = Math.min(availableFluxTicks, maxFluxTicks);
          ticksToProcess += fluxTicksUsed;
          const subtractedAmount = fluxTicksUsed * targetTickDuration;
          this.time_accumulator -= subtractedAmount;
          if (this.time_accumulator < 0.001) this.time_accumulator = 0;
          this.game.logger?.debug(`[TIME FLUX] Consuming banked time: ${fluxTicksUsed.toFixed(2)} flux ticks (${(fluxTicksUsed * targetTickDuration).toFixed(0)}ms), accumulator: ${initialAccumulator.toFixed(0)}ms -> ${this.time_accumulator.toFixed(0)}ms, Time Flux: ${this.game.time_flux ? 'ON' : 'OFF'}`);
        }
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

    // Schedule next frame, respecting test frame cap
    if (isTestEnv && (this._testFrameCount || 0) >= (this._maxTestFrames || 200)) {
      this.running = false;
      this.animationFrameId = null;
      return;
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
    
    if (this.game.logger) {
      this.game.logger.debug(`[TICK START] Paused: ${this.game.paused}, Manual: ${manual}, Running: ${this.running}, Multiplier: ${multiplier.toFixed(4)}`);
    }

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
    const ui = this.game.ui;
    if (this.game.logger) {
      this.game.logger.debug(`[TICK START] Paused: ${this.game.paused}, Manual: ${manual}, Reactor Heat: ${reactor.current_heat.toFixed(2)}`);
    }
    
    // Reset Visual Event Pool
    this._visualEventCount = 0;
    
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
      if (ui && ui.stateManager) {
        ui.stateManager.setVar("power_delta_per_tick", 0);
        ui.stateManager.setVar("heat_delta_per_tick", 0);
      }
      this.game.logger?.debug('Tick skipped: Game is paused.');
      if (this.game.performance && this.game.performance.shouldMeasure()) {
        this.game.performance.markEnd("tick_total");
      }
      this.game.logger?.groupEnd();
      return;
    }

    const powerBeforeTick = reactor.current_power;
    const heatBeforeTick = reactor.current_heat;

    // Removed: Blocking check for !this.running && !manual
    // This ensures game.engine.tick() works in tests even if engine loop is stopped
    // tick() is an explicit request to process a tick, so it should execute regardless of running state

    // Force update part caches to ensure newly added parts are included
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
    if (this.game.logger) {
      this.game.logger.debug(`Processing ${active_cells.length} active cells and ${active_vessels.length} active vessels.`);
      this.game.logger.debug(`[TICK] Processing ${this.active_cells.length} cells...`);
    }

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
        for(let k=0; k<count; k++) {
          if (this._visualEventCount < this._visualEventPool.length) {
            const evt = this._visualEventPool[this._visualEventCount++];
            evt.type = 'emit';
            evt.icon = 'power';
            evt.tile = tile;
            evt.part = null;
          }
        }
      }

      const generatedHeat = tile.heat * multiplier;

      if (tile.heat > 0 && Math.random() < multiplier) {
        const countH = tile.heat >= 200 ? 3 : tile.heat >= 50 ? 2 : 1;
        for(let k=0; k<countH; k++) {
          if (this._visualEventCount < this._visualEventPool.length) {
            const evt = this._visualEventPool[this._visualEventCount++];
            evt.type = 'emit';
            evt.icon = 'heat';
            evt.tile = tile;
            evt.part = null;
          }
        }
      }
      
      // Optimization: Avoid .filter() allocation inside loop
      const neighbors = tile.containmentNeighborTiles;
      let validNeighborCount = 0;
      for(let nIdx = 0; nIdx < neighbors.length; nIdx++) {
        if (neighbors[nIdx].part && neighbors[nIdx].part.containment > 0 && !neighbors[nIdx].exploded) {
           validNeighborCount++;
        }
      }

      if (validNeighborCount > 0) {
        const heat_per_neighbor = generatedHeat / validNeighborCount;
        for (let j = 0; j < neighbors.length; j++) {
          const t = neighbors[j];
          if (t.part && t.part.containment > 0 && !t.exploded) {
            t.heat_contained += heat_per_neighbor;
          }
        }
      } else {
        heat_add += generatedHeat;
      }

      tile.ticks -= multiplier;
      
      const reflectorNeighbors = tile.reflectorNeighborTiles;
      for (let j = 0; j < reflectorNeighbors.length; j++) {
        const r_tile = reflectorNeighbors[j];
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

      const effectiveTransfer = tile.getEffectiveTransferValue() * multiplier;
      const containmentNeighbors = tile.containmentNeighborTiles;
      for (let j = 0; j < containmentNeighbors.length; j++) {
        const tile_containment = containmentNeighbors[j];
        if (!tile_containment.part || !tile_containment.heat_contained) continue;
        
        let transfer_heat = Math.min(effectiveTransfer, tile_containment.heat_contained);
        
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

      // GC Optimization: Use pre-allocated arrays to avoid allocations in the hot path
      const valves = this.active_valves;

      // Process valves efficiently with minimal logging
      for (let vIdx = 0; vIdx < valves.length; vIdx++) {
        const valve = valves[vIdx];
        const valvePart = valve.part;
        const neighbors = this._valveProcessing_neighbors;
        neighbors.length = 0; // Clear the array
        const valveNeighbors = valve.containmentNeighborTiles;
        for (let j = 0; j < valveNeighbors.length; j++) {
          const t = valveNeighbors[j];
          if (t.part) {
            neighbors.push(t);
          }
        }

        if (neighbors.length < 2) continue; // Need at least 2 neighbors to transfer

        // Determine input and output neighbors based on valve type and orientation
        const inputNeighbors = this._valveProcessing_inputNeighbors;
        inputNeighbors.length = 0;
        const outputNeighbors = this._valveProcessing_outputNeighbors;
        outputNeighbors.length = 0;

        if (valvePart.type === 'overflow_valve') {
          // Overflow valve: only works if input side neighbor is above 80% containment
          const orientation = this._getValveOrientation(valvePart.id);
          const { inputNeighbor, outputNeighbor } = this._getInputOutputNeighbors(valve, neighbors, orientation);

          if (inputNeighbor && outputNeighbor) {
            // Validation: valves can't pull from other valves unless input connects to output
            if (inputNeighbor.part?.category === 'valve') {
              const inputValveOrientation = this._getValveOrientation(inputNeighbor.part.id);
              const inputValveNeighbors = this._valve_inputValveNeighbors;
              inputValveNeighbors.length = 0;
              const inputNeighborNeighbors = inputNeighbor.containmentNeighborTiles;
              for (let j = 0; j < inputNeighborNeighbors.length; j++) {
                const t = inputNeighborNeighbors[j];
                if (t.part && t !== valve) {
                  inputValveNeighbors.push(t);
                }
              }
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
              const inputValveNeighbors = this._valve_inputValveNeighbors;
              inputValveNeighbors.length = 0;
              const inputNeighborNeighbors = inputNeighbor.containmentNeighborTiles;
              for (let j = 0; j < inputNeighborNeighbors.length; j++) {
                const t = inputNeighborNeighbors[j];
                if (t.part && t !== valve) {
                  inputValveNeighbors.push(t);
                }
              }
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
              const inputValveNeighbors = this._valve_inputValveNeighbors;
              inputValveNeighbors.length = 0;
              const inputNeighborNeighbors = inputNeighbor.containmentNeighborTiles;
              for (let j = 0; j < inputNeighborNeighbors.length; j++) {
                const t = inputNeighborNeighbors[j];
                if (t.part && t !== valve) {
                  inputValveNeighbors.push(t);
                }
              }
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

                  // Note: Valve neighbors are now pre-populated in _updateValveNeighborCache()
                  // so we don't need to add them here during heat transfer
                  // DO NOT mark output as processed - it needs to run its own heat transfer logic

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
      if (!Array.isArray(this.active_exchangers)) {
        this.active_exchangers = [];
      }
      const exchangers = this.active_exchangers;

      if (!this._heatCalc_startHeat) this._heatCalc_startHeat = new Map();
      if (!this._heatCalc_plannedOutByNeighbor) this._heatCalc_plannedOutByNeighbor = new Map();
      if (!this._heatCalc_plannedInByNeighbor) this._heatCalc_plannedInByNeighbor = new Map();
      if (!this._heatCalc_plannedInByExchanger) this._heatCalc_plannedInByExchanger = new Map();
      if (!this._valveNeighborExchangers) this._valveNeighborExchangers = new Set();

      this._heatCalc_startHeat.clear();
      this._heatCalc_plannedCount = 0;
      this._heatCalc_plannedOutByNeighbor.clear();
      this._heatCalc_plannedInByNeighbor.clear();
      this._heatCalc_plannedInByExchanger.clear();

      const startHeat = this._heatCalc_startHeat;
      const valveNeighborExchangers = this._valveNeighborExchangers;
      valveNeighborExchangers.clear();

      // Pre-pass
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

      const plannedInByNeighbor = this._heatCalc_plannedInByNeighbor;
      const plannedOutByNeighbor = this._heatCalc_plannedOutByNeighbor;
      const plannedInByExchanger = this._heatCalc_plannedInByExchanger;

      for (let i = 0; i < exchangers.length; i++) {
        const tile = exchangers[i];
        const tile_part = tile.part;
        if (!tile_part || tile_part.category === 'valve') continue;

        const heatStart = valveNeighborExchangers.has(tile) ? (tile.heat_contained || 0) : (startHeat.get(tile) || 0);
        const effectiveTransferValue = tile.getEffectiveTransferValue();
        
        // Reuse neighbors array from Tile cache, avoid .filter()
        const neighborsAll = tile.containmentNeighborTiles;
        const validNeighbors = this._heatCalc_validNeighbors;
        validNeighbors.length = 0;
        for(let nIdx=0; nIdx<neighborsAll.length; nIdx++) {
            if(neighborsAll[nIdx].part) validNeighbors.push(neighborsAll[nIdx]);
        }

        // Manual insertion sort for small neighbor array (max 4-8 elements)
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

        // Calculate totalHeadroom once per exchanger
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
            
            if (remainingPush > 0 && (heatStart > nStartRaw || (/*isPreferred*/(neighbor.part.category === 'vent' || neighbor.part.category === 'coolant_cell') && heatStart === nStartRaw && heatStart > 0))) {
                 const diff = Math.max(0, heatStart - nStartRaw) || 1;

                 const neighborHeadroomForWeight = Math.max(neighborCapacity - nStartRaw, 0);
                 const capacityBias = Math.max(neighborHeadroomForWeight / totalHeadroom, 0);
                 const biasedCap = Math.max(1, Math.floor(effectiveTransferValue * capacityBias * multiplier));
                 let transfer_heat = Math.min(biasedCap, Math.ceil(diff / 2), remainingPush);

                 if (transfer_heat > 0) {
                    // Use Pool
                    if (this._heatCalc_plannedCount < this._heatCalc_plannedPool.length) {
                        const p = this._heatCalc_plannedPool[this._heatCalc_plannedCount++];
                        p.from = tile;
                        p.to = neighbor;
                        p.amount = transfer_heat;
                    } else {
                        // Fallback / Expand pool
                        this._heatCalc_plannedPool.push({ from: tile, to: neighbor, amount: transfer_heat });
                        this._heatCalc_plannedCount++;
                    }
                    
                    remainingPush -= transfer_heat;
                    plannedInByNeighbor.set(neighbor, (plannedInByNeighbor.get(neighbor) || 0) + transfer_heat);
                    if (remainingPush <= 0) continue;
                 }
            }

            // Pull logic
            if (!isExchangerNeighbor || isValveNeighbor || isNeighborOfValveNeighbor) {
                const alreadyOut = plannedOutByNeighbor.get(neighbor) || 0;
                const nAvailable = Math.max(0, nStartRaw - alreadyOut);
                if (nAvailable > 0 && nStartRaw > heatStart) {
                    const diff = nStartRaw - heatStart;
                    const biasedCap = effectiveTransferValue * multiplier;
                    let transfer_heat = Math.min(biasedCap, Math.ceil(diff / 2), nAvailable);

                    if (transfer_heat > 0) {
                        // Use Pool
                        if (this._heatCalc_plannedCount < this._heatCalc_plannedPool.length) {
                            const p = this._heatCalc_plannedPool[this._heatCalc_plannedCount++];
                            p.from = neighbor;
                            p.to = tile;
                            p.amount = transfer_heat;
                        } else {
                            this._heatCalc_plannedPool.push({ from: neighbor, to: tile, amount: transfer_heat });
                            this._heatCalc_plannedCount++;
                        }
                        
                        plannedOutByNeighbor.set(neighbor, alreadyOut + transfer_heat);
                        plannedInByExchanger.set(tile, (plannedInByExchanger.get(tile) || 0) + transfer_heat);
                    }
                }
            }
        }
      }

      // Apply Planned Transfers
      for (let i=0; i < this._heatCalc_plannedCount; i++) {
        const p = this._heatCalc_plannedPool[i];
        p.from.heat_contained -= p.amount;
        p.to.heat_contained += p.amount;
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
       if (!tile_part || !tile.activated) continue;
       const neighbors = this._outletProcessing_neighbors;
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
               
               for(let j = 0; j < neighbors.length; j++) {
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

    // Check explosions BEFORE venting to ensure strict containment limits
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_explosions");
    }

    const tilesToExplode = this._explosion_tilesToExplode;
    tilesToExplode.length = 0;
    for (let i = 0; i < this.active_vessels.length; i++) {
      const tile = this.active_vessels[i];
      if (!tile.part || tile.exploded) continue;

      const part = tile.part;
      if (part && part.containment > 0 && tile.heat_contained > part.containment) {
        tilesToExplode.push(tile);
      }
    }

    for (let i = 0; i < tilesToExplode.length; i++) {
      const tile = tilesToExplode[i];
      const part = tile.part;
      if (part?.category === "particle_accelerator") {
        reactor.checkMeltdown();
      }
      this.handleComponentExplosion(tile);
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_explosions");
    }

    // Process Vents AFTER explosions to allow venting of remaining heat
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_vents");
    }

    const activeVents = this.active_vents;
    for(let i = 0; i < activeVents.length; i++) {
        const tile = activeVents[i];
        if(!tile.part) continue;
        
        let ventRate = tile.getEffectiveVentValue() * multiplier;
        if(ventRate <= 0) continue;

        if (reactor.convective_boost > 0) {
          let emptyNeighbors = 0;
          const r = tile.row;
          const c = tile.col;
          const tileset = this.game.tileset;

          let n = tileset.getTile(r - 1, c);
          if (n && n.enabled && !n.part) emptyNeighbors++;
          n = tileset.getTile(r + 1, c);
          if (n && n.enabled && !n.part) emptyNeighbors++;
          n = tileset.getTile(r, c - 1);
          if (n && n.enabled && !n.part) emptyNeighbors++;
          n = tileset.getTile(r, c + 1);
          if (n && n.enabled && !n.part) emptyNeighbors++;

          if (emptyNeighbors > 0) {
            ventRate *= (1 + (emptyNeighbors * reactor.convective_boost));
          }
        }
        
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

        if (reactor.stirling_multiplier > 0 && vent_reduce > 0) {
          const stirlingPower = vent_reduce * reactor.stirling_multiplier;
          power_add += stirlingPower;
        }
        
        if (vent_reduce > 0 && Math.random() < multiplier) {
          try {
            if (this.game.ui && typeof this.game.ui.blinkVent === 'function') {
              this.game.ui.blinkVent(tile);
            }
          } catch { /* ignore */ }
        }
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_vents");
    }
    this.game.logger?.debug(`[TICK STAGE] After vent processing: Reactor Heat = ${reactor.current_heat.toFixed(2)}`);

    // Add generated power to reactor with overflow logic
    this.game.logger?.debug(`[DIAGNOSTIC] Power generated (power_add): ${power_add}`);
    this.game.logger?.debug(`[DIAGNOSTIC] current_power at start of power calc: ${reactor.current_power}`);
    
    const powerToAdd = power_add;
    const effectiveMaxPower = reactor.altered_max_power && reactor.altered_max_power !== reactor.base_max_power
      ? reactor.altered_max_power
      : reactor.max_power;
    const potentialPower = reactor.current_power + powerToAdd;
    
    this.game.logger?.debug(`[DIAGNOSTIC] potentialPower (current + generated): ${potentialPower}`);
    
    if (potentialPower > effectiveMaxPower) {
      const excessPower = potentialPower - effectiveMaxPower;
      const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
      reactor.current_power = effectiveMaxPower;
      reactor.current_heat += excessPower * overflowToHeat;
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
            for (let j = 0; j < this.active_vessels.length; j++) {
              const t = this.active_vessels[j];
              if (t.part?.category === 'particle_accelerator' && t.heat_contained > 0) {
                this.game.ui.emitEP(t);
                emitted++;
                if (emitted >= 5) break;
              }
            }
          }
        } catch { /* ignore in test env */ }
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
           const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
           reactor.current_heat += (reactor.current_power - reactor.max_power) * overflowToHeat;
           reactor.current_power = reactor.max_power;
       }
    }

    this.game.logger?.debug(`[DIAGNOSTIC] current_power BEFORE auto-sell logic: ${reactor.current_power}`);

    if (ui.stateManager.getVar("auto_sell")) {
      const sellCap = Math.floor(effectiveMaxPower * reactor.auto_sell_multiplier) * multiplier;
      const sellAmount = Math.min(reactor.current_power, sellCap);
      
      this.game.logger?.debug(`[DIAGNOSTIC] Auto-sell calculated: sellCap=${sellCap}, sellAmount=${sellAmount}, max_power=${reactor.max_power}, auto_sell_multiplier=${reactor.auto_sell_multiplier}, multiplier=${multiplier}`);
      
      if (sellAmount > 0) {
        reactor.current_power -= sellAmount;
        const value = sellAmount * (reactor.sell_price_multiplier || 1);
        this.game.current_money += value;
        ui.stateManager.setVar("current_money", this.game.current_money);
      }
    }
    
    this.game.logger?.debug(`[DIAGNOSTIC] current_power AFTER auto-sell logic: ${reactor.current_power}`);

    if (reactor.current_power > reactor.max_power)
      reactor.current_power = reactor.max_power;

    if (reactor.power_to_heat_ratio > 0 && reactor.current_heat > 0) {
      const heatPercent = reactor.current_heat / reactor.max_heat;
      
      if (heatPercent > 0.80 && reactor.current_power > 0) {
        const heatToRemoveTarget = reactor.current_heat * 0.10;
        const powerNeeded = heatToRemoveTarget / reactor.power_to_heat_ratio;
        const powerUsed = Math.min(reactor.current_power, powerNeeded);
        const heatRemoved = powerUsed * reactor.power_to_heat_ratio;

        reactor.current_power -= powerUsed;
        reactor.current_heat -= heatRemoved;
      }
    }

    if (reactor.current_heat > 0 && reactor.heat_controlled) {
      const ventBonus = reactor.vent_multiplier_eff || 0;
      const baseRed = (reactor.max_heat / 10000);
      const reduction = baseRed * (1 + ventBonus / 100) * multiplier;
      
      reactor.current_heat -= reduction;
    }
    if (reactor.current_heat < 0) reactor.current_heat = 0;

    // --- FLUX ACCUMULATORS LOGIC ---
    let fluxLevel = reactor.flux_accumulator_level;
    if (!fluxLevel && this.game.upgradeset) {
      const upg = this.game.upgradeset.getUpgrade("flux_accumulators");
      if (upg) {
        fluxLevel = upg.level;
      }
    }
    if (fluxLevel > 0 && reactor.max_power > 0) {
      const powerRatio = reactor.current_power / reactor.max_power;
      if (powerRatio >= 0.90) {
        let activeCaps = 0;
        for (let j = 0; j < this.active_vessels.length; j++) {
          const t = this.active_vessels[j];
          if (t.part?.category === 'capacitor') {
            const capLevel = t.part.level || 1;
            activeCaps += capLevel;
          }
        }

        const epGain = 0.0001 * fluxLevel * activeCaps * multiplier;
        if (epGain > 0) {
          this.game.exotic_particles += epGain;
          this.game.total_exotic_particles += epGain;
          this.game.current_exotic_particles += epGain;
          ui.stateManager.setVar("exotic_particles", this.game.exotic_particles);
          ui.stateManager.setVar("total_exotic_particles", this.game.total_exotic_particles);
          ui.stateManager.setVar("current_exotic_particles", this.game.current_exotic_particles);
        }
      }
    }
    // --------------------------------

    // --- AUTONOMIC REPAIR LOGIC ---
    if (reactor.auto_repair_rate > 0 && reactor.current_power >= 50) {
      let repairsRemaining = Math.floor(reactor.auto_repair_rate * multiplier);
      const powerCostPerRepair = 50;

      // Iterate active cells that have durability (ticks)
      for (let i = 0; i < this.active_cells.length; i++) {
        const tile = this.active_cells[i];
        if (repairsRemaining <= 0 || reactor.current_power < powerCostPerRepair) break;
        if (tile.part && tile.part.ticks > 0) {
          // Repair 1 tick
          tile.ticks += 1;
          reactor.current_power -= powerCostPerRepair;
          repairsRemaining--;
        }
      }
    }
    // ------------------------------

    const rawPowerDelta = reactor.current_power - powerBeforeTick;
    const rawHeatDelta = reactor.current_heat - heatBeforeTick;
    const norm = Math.max(0.001, multiplier);
    ui.stateManager.setVar("power_delta_per_tick", rawPowerDelta / norm);
    ui.stateManager.setVar("heat_delta_per_tick", rawHeatDelta / norm);
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

    // Render Visual Events (Optimized)
    if (this._visualEventCount > 0 && this.game.ui && typeof this.game.ui._renderVisualEvents === 'function') {
      this.game.ui._renderVisualEvents(this._visualEventPool, this._visualEventCount);
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_total");
    }
    this.tick_count++;
    } catch (error) {
      console.error(`Error in _processTick:`, error);
      if (this.game.ui && this.game.ui.stateManager) {
        this.game.ui.stateManager.setVar("engine_status", "stopped");
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
    tile.exploded = true;
    if (this.game.audio) {
      const pan = this.game.calculatePan ? this.game.calculatePan(tile.col) : 0;
      this.game.audio.play('explosion', null, pan);
    }

    if (tile && tile.heat_contained > 0) {
      if (this.game.reactor.decompression_enabled) {
        const heatToRemove = tile.heat_contained;
        this.game.reactor.current_heat = Math.max(0, this.game.reactor.current_heat - heatToRemove);
        if (this.game.logger) {
          this.game.logger.debug(`[DECOMPRESSION] Vented ${heatToRemove} heat from explosion.`);
        }
      } else {
        this.game.reactor.current_heat += tile.heat_contained;
      }
    }

    if (this.game.reactor.insurance_percentage > 0 && tile.part) {
      const refund = Math.floor(tile.part.cost * this.game.reactor.insurance_percentage);
      if (refund > 0) {
        this.game.addMoney(refund);
        if (this.game.logger) {
          this.game.logger.debug(`[INSURANCE] Refunded $${refund} for exploded ${tile.part.id}`);
        }
      }
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
    let orientation = this._valveOrientationCache.get(valveId);
    if (orientation !== undefined) return orientation;

    const match = valveId.match(/(\d+)$/);
    orientation = match ? parseInt(match[1]) : 1;
    this._valveOrientationCache.set(valveId, orientation);
    return orientation;
  }

  /**
   * Get input and output neighbors based on valve orientation
   * @param {Tile} valve - The valve tile
   * @param {Array} neighbors - Array of neighbor tiles
   * @param {number} orientation - Valve orientation (1-4)
   * @returns {Object} Object with inputNeighbor and outputNeighbor properties
   */
  _getInputOutputNeighbors(valve, neighbors, orientation) {
    const result = this._valveNeighborResult;
    if (neighbors.length < 2) {
      result.inputNeighbor = null;
      result.outputNeighbor = null;
      return result;
    }

    let inputNeighbor, outputNeighbor;

    if (neighbors.length === 2) {
      const a = neighbors[0];
      const b = neighbors[1];
      let isAFirst = false;

      if (orientation === 1 || orientation === 3) {
        isAFirst = a.col < b.col;
      } else {
        isAFirst = a.row < b.row;
      }

      const first = isAFirst ? a : b;
      const last = isAFirst ? b : a;

      switch (orientation) {
        case 1: inputNeighbor = first; outputNeighbor = last; break;
        case 2: inputNeighbor = first; outputNeighbor = last; break;
        case 3: inputNeighbor = last; outputNeighbor = first; break;
        case 4: inputNeighbor = last; outputNeighbor = first; break;
        default: inputNeighbor = first; outputNeighbor = last;
      }
    } else {
      const sortedNeighbors = neighbors.sort((a, b) => {
        if (orientation === 1 || orientation === 3) {
          return a.col - b.col;
        } else {
          return a.row - b.row;
        }
      });

      switch (orientation) {
        case 1: inputNeighbor = sortedNeighbors[0]; outputNeighbor = sortedNeighbors[sortedNeighbors.length - 1]; break;
        case 2: inputNeighbor = sortedNeighbors[0]; outputNeighbor = sortedNeighbors[sortedNeighbors.length - 1]; break;
        case 3: inputNeighbor = sortedNeighbors[sortedNeighbors.length - 1]; outputNeighbor = sortedNeighbors[0]; break;
        case 4: inputNeighbor = sortedNeighbors[sortedNeighbors.length - 1]; outputNeighbor = sortedNeighbors[0]; break;
        default: inputNeighbor = sortedNeighbors[0]; outputNeighbor = sortedNeighbors[sortedNeighbors.length - 1];
      }
    }

    result.inputNeighbor = inputNeighbor;
    result.outputNeighbor = outputNeighbor;
    return result;
  }
}
