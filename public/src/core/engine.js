import Decimal, { toDecimal } from "../utils/decimal.js";
import { performance, isTestEnv } from "../utils/util.js";
import { HeatSystem } from "./heatSystem.js";
import { runHeatStepFromTyped, HEAT_EPSILON } from "./heatCalculations.js";
import {
  INLET_STRIDE, INLET_OFFSET_INDEX, INLET_OFFSET_RATE, INLET_OFFSET_N_COUNT, INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE, VALVE_OFFSET_INDEX, VALVE_OFFSET_TYPE, VALVE_OFFSET_ORIENTATION, VALVE_OFFSET_RATE, VALVE_OFFSET_INPUT_IDX, VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE, EXCHANGER_OFFSET_INDEX, EXCHANGER_OFFSET_RATE, EXCHANGER_OFFSET_CONTAINMENT, EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES, EXCHANGER_OFFSET_NEIGHBOR_CAPS, EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE, OUTLET_OFFSET_INDEX, OUTLET_OFFSET_RATE, OUTLET_OFFSET_ACTIVATED, OUTLET_OFFSET_IS_OUTLET6, OUTLET_OFFSET_N_COUNT,
  OUTLET_OFFSET_NEIGHBOR_INDICES, OUTLET_OFFSET_NEIGHBOR_CAPS,
  MAX_NEIGHBORS
} from "./heatPayloadSchema.js";
import { logger } from "../utils/logger.js";

const HEAT_PAYLOAD_MAX_INLETS = 32;
const HEAT_PAYLOAD_MAX_VALVES = 32;
const HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS = 256;
const HEAT_PAYLOAD_MAX_EXCHANGERS = 64;
const HEAT_PAYLOAD_MAX_OUTLETS = 32;
const GRID_SIZE_NO_SAB_THRESHOLD = 2500;
const MAX_TICKS_PER_FRAME_NO_SAB = 2;
const SLOW_MODE_TICKS_PER_FRAME = 2;
const TIME_FLUX_CHUNK_TICKS = 100;

export const VISUAL_EVENT_POWER = 1;
export const VISUAL_EVENT_HEAT = 2;
export const VISUAL_EVENT_EXPLOSION = 3;

export class Engine {
  constructor(game) {
    this.game = game;
    this._testFrameCount = 0;
    this._maxTestFrames = 200;
    this.animationFrameId = null;
    this._pausedTimeoutId = null;
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

    this.MAX_EVENTS = 500;
    this._eventRingBuffer = new Uint32Array(this.MAX_EVENTS * 4);
    this._eventHead = 0;
    this._eventTail = 0;

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
    this._valveNeighborResult = { inputNeighbor: null, outputNeighbor: null };
    this._valveProcessing_valves = [];
    this._valveProcessing_neighbors = [];
    this._valveProcessing_inputNeighbors = [];
    this._valveProcessing_outputNeighbors = [];
    this._valve_inputValveNeighbors = [];
    this._valveNeighborExchangers = new Set();
    this._valveNeighborResult = { inputNeighbor: null, outputNeighbor: null };

    // Outlet Processing Pre-allocation
    this._outletProcessing_neighbors = [];

    // Vent Processing Pre-allocation
    this._ventProcessing_activeVents = [];

    // Ensure arrays are always valid
    this._ensureArraysValid();

    this.time_accumulator = 0;
    this._frameTimeAccumulator = 0;
    this._timeFluxCatchupTotalTicks = 0;
    this._timeFluxCatchupRemainingTicks = 0;
    this._timeFluxFastForward = false;

    this.heatManager = new HeatSystem(this);
    this._lastHeatFlowDebug = [];
    this._heatFlowVectorPool = [];
    this._worker = null;
    this._workerPending = false;
    this._workerHeartbeatId = null;
    this._workerHeartbeatMs = 32;
    this._workerFailed = false;
    this._heatPayload_inlets = new Float32Array(HEAT_PAYLOAD_MAX_INLETS * INLET_STRIDE);
    this._heatPayload_valves = new Float32Array(HEAT_PAYLOAD_MAX_VALVES * VALVE_STRIDE);
    this._heatPayload_valveNeighbors = new Float32Array(HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS);
    this._heatPayload_exchangers = new Float32Array(HEAT_PAYLOAD_MAX_EXCHANGERS * EXCHANGER_STRIDE);
    this._heatPayload_outlets = new Float32Array(HEAT_PAYLOAD_MAX_OUTLETS * OUTLET_STRIDE);
    this._heatUseSABNative = typeof SharedArrayBuffer !== "undefined" && typeof globalThis.crossOriginIsolated !== "undefined" && globalThis.crossOriginIsolated === true;
    this._heatUseSABOverride = false;
    this._heatUseSAB = this._heatUseSABNative;
    this._heatSABView = null;
    this._containmentSABView = null;
    this._workerTickId = 0;
    this._heatTransferHeat = null;
    this._heatTransferContainment = null;
    this._gameLoopWorker = null;
    this._gameLoopWorkerPending = false;
    this._gameLoopTickContext = null;
    this._gameLoopWorkerFailed = false;
    this._gameLoopWorkerTickId = 0;
  }

  setForceNoSAB(override) {
    this._heatUseSABOverride = !!override;
    this._heatUseSAB = this._heatUseSABNative && !this._heatUseSABOverride;
  }

  _useGameLoopWorker() {
    if (typeof Worker === "undefined" || this._gameLoopWorkerFailed) return false;
    return this._heatUseSAB === true;
  }

  _useWorker() {
    if (typeof Worker === "undefined" || this._workerFailed) return false;
    if (!this._heatUseSAB && this.game.rows * this.game.cols >= GRID_SIZE_NO_SAB_THRESHOLD) return false;
    return true;
  }

  _serializeStateForGameLoopWorker() {
    const game = this.game;
    const ts = game.tileset;
    const reactor = game.reactor;
    if (!ts?.heatMap) return null;
    const gridLen = ts.heatMap.length;
    if (!this._heatUseSAB) return null;
    const needBoth = !this._heatSABView || this._heatSABView.length !== gridLen ||
      !this._containmentSABView || this._containmentSABView.length !== gridLen;
    if (needBoth) {
      this._heatSABView = new Float32Array(new SharedArrayBuffer(gridLen * 4));
      this._containmentSABView = new Float32Array(new SharedArrayBuffer(gridLen * 4));
      this._heatSABView.set(ts.heatMap);
      ts.heatMap = this._heatSABView;
      for (let r = 0; r < game.rows; r++) {
        for (let c = 0; c < game.cols; c++) {
          const tile = ts.getTile(r, c);
          if (tile?.part) this._containmentSABView[ts.gridIndex(r, c)] = tile.part.containment || 0;
        }
      }
    } else {
      this._heatSABView.set(ts.heatMap);
    }
    const partIdToIndex = {};
    const partTable = [];
    const partLayout = [];
    const list = ts.active_tiles_list || [];
    for (let i = 0; i < list.length; i++) {
      const tile = list[i];
      if (!tile?.enabled || !tile.part) continue;
      const part = tile.part;
      if (partIdToIndex[part.id] === undefined) {
        partIdToIndex[part.id] = partTable.length;
        partTable.push({
          id: part.id,
          containment: part.containment ?? 0,
          vent: part.vent ?? 0,
          power: part.power ?? 0,
          heat: part.heat ?? 0,
          category: part.category ?? "",
          ticks: part.ticks ?? 0,
          type: part.type ?? "",
          ep_heat: part.ep_heat ?? 0,
          level: part.level ?? 1,
          transfer: part.transfer ?? 0
        });
      }
      const transferRate = typeof tile.getEffectiveTransferValue === "function" ? tile.getEffectiveTransferValue() : 0;
      const ventRate = typeof tile.getEffectiveVentValue === "function" ? tile.getEffectiveVentValue() : 0;
      partLayout.push({
        r: tile.row,
        c: tile.col,
        partIndex: partIdToIndex[part.id],
        ticks: tile.ticks ?? 0,
        activated: !!tile.activated,
        transferRate,
        ventRate
      });
    }
    const current_heat = reactor.current_heat && typeof reactor.current_heat.toNumber === "function" ? reactor.current_heat.toNumber() : Number(reactor.current_heat ?? 0);
    const current_power = reactor.current_power && typeof reactor.current_power.toNumber === "function" ? reactor.current_power.toNumber() : Number(reactor.current_power ?? 0);
    const max_heat = reactor.max_heat && typeof reactor.max_heat.toNumber === "function" ? reactor.max_heat.toNumber() : Number(reactor.max_heat ?? 0);
    const max_power = reactor.max_power && typeof reactor.max_power.toNumber === "function" ? reactor.max_power.toNumber() : Number(reactor.max_power ?? 0);
    return {
      heatBuffer: this._heatSABView.buffer,
      partLayout,
      partTable,
      reactorState: {
        current_heat,
        current_power,
        max_heat,
        max_power,
        auto_sell_multiplier: reactor.auto_sell_multiplier ?? 0,
        sell_price_multiplier: reactor.sell_price_multiplier ?? 1,
        power_overflow_to_heat_ratio: reactor.power_overflow_to_heat_ratio ?? 0.5,
        power_multiplier: reactor.power_multiplier ?? 1,
        heat_controlled: reactor.heat_controlled ? 1 : 0,
        vent_multiplier_eff: reactor.vent_multiplier_eff ?? 0,
        stirling_multiplier: reactor.stirling_multiplier ?? 0
      },
      rows: game.rows,
      cols: game.cols,
      maxCols: ts.max_cols ?? game.cols,
      autoSell: !!game.ui?.stateManager?.getVar?.("auto_sell"),
      multiplier: 1,
      tickCount: 1
    };
  }

  _applyGameLoopTickResult(data) {
    if (!data || data.error) return;
    const game = this.game;
    const reactor = game.reactor;
    const ui = game.ui;
    const ts = game.tileset;
    const cols = game.cols;
    const maxCols = ts?.max_cols ?? cols;
    const rawHeat = data.reactorHeat ?? 0;
    reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
    reactor.current_power = toDecimal(data.reactorPower ?? 0);
    if (Array.isArray(data.explosionIndices)) {
      for (let i = 0; i < data.explosionIndices.length; i++) {
        const idx = data.explosionIndices[i] | 0;
        const tile = ts.getTile((idx / maxCols) | 0, idx % maxCols);
        if (tile?.part) this.handleComponentExplosion(tile);
      }
    }
    if (Array.isArray(data.depletionIndices)) {
      for (let i = 0; i < data.depletionIndices.length; i++) {
        const idx = data.depletionIndices[i] | 0;
        const tile = ts.getTile((idx / maxCols) | 0, idx % maxCols);
        if (tile?.part) this.handleComponentDepletion(tile);
      }
    }
    if (Array.isArray(data.tileUpdates)) {
      for (let i = 0; i < data.tileUpdates.length; i++) {
        const u = data.tileUpdates[i];
        const tile = ts.getTile(u.r, u.c);
        if (tile && typeof u.ticks === "number") tile.ticks = u.ticks;
      }
    }
    if (Number(data.moneyEarned) > 0) game.addMoney(data.moneyEarned);
    const norm = Math.max(0.001, data.tickCount || 1);
    if (ui?.stateManager) {
      ui.stateManager.setVar("power_delta_per_tick", (data.powerDelta ?? 0) / norm);
      ui.stateManager.setVar("heat_delta_per_tick", (data.heatDelta ?? 0) / norm);
      ui.stateManager.setVar("current_power", reactor.current_power);
      ui.stateManager.setVar("current_heat", reactor.current_heat);
    }
    if (ui?.updateHeatVisuals) ui.updateHeatVisuals();
    this.tick_count += data.tickCount || 1;
    if (ui?.recordTick) ui.recordTick();
    reactor.updateStats();
    const now = Date.now();
    if (now - this.last_session_update >= this.session_update_interval) {
      this.game.updateSessionTime();
      this.last_session_update = now;
    }
  }

  _getGameLoopWorker() {
    if (this._gameLoopWorker) return this._gameLoopWorker;
    try {
      const url = new URL("../worker/gameLoop.worker.js", import.meta.url).href;
      this._gameLoopWorker = new Worker(url, { type: "module" });
      this._gameLoopWorker.onmessage = (e) => {
        const data = e.data;
        if (data?.type !== "tickResult") return;
        this._gameLoopWorkerPending = false;
        const ctx = this._gameLoopTickContext;
        this._gameLoopTickContext = null;
        if (data.error) return;
        if (!ctx || data.tickId !== ctx.tickId) return;
        this._applyGameLoopTickResult(data);
      };
    } catch (err) {
      this._gameLoopWorkerFailed = true;
      this.game?.logger?.warn?.("[GameLoopWorker] Failed to create worker", err);
    }
    return this._gameLoopWorker;
  }

  _buildHeatPayload(multiplier) {
    const game = this.game;
    const ts = game.tileset;
    const reactor = game.reactor;
    const rows = game.rows;
    const cols = game.cols;
    const gridLen = ts.heatMap.length;
    let heatCopy;
    let containment;
    if (this._heatUseSAB) {
      const needBoth = !this._heatSABView || this._heatSABView.length !== gridLen ||
        !this._containmentSABView || this._containmentSABView.length !== gridLen;
      if (needBoth) {
        this._heatSABView = new Float32Array(new SharedArrayBuffer(gridLen * 4));
        this._containmentSABView = new Float32Array(new SharedArrayBuffer(gridLen * 4));
      }
      this._heatSABView.set(ts.heatMap);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = ts.getTile(r, c);
          if (tile?.part) this._containmentSABView[ts.gridIndex(r, c)] = tile.part.containment || 0;
        }
      }
      if (ts.heatMap !== this._heatSABView) ts.heatMap = this._heatSABView;
      heatCopy = this._heatSABView;
      containment = this._containmentSABView;
    } else {
      if (!this._heatTransferHeat || this._heatTransferHeat.length !== gridLen) {
        this._heatTransferHeat = new Float32Array(gridLen);
        this._heatTransferContainment = new Float32Array(gridLen);
      }
      heatCopy = this._heatTransferHeat;
      heatCopy.set(ts.heatMap);
      containment = this._heatTransferContainment;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = ts.getTile(r, c);
          if (tile?.part) containment[ts.gridIndex(r, c)] = tile.part.containment || 0;
        }
      }
    }
    let nInlets = 0;
    const inletsBuf = this._heatPayload_inlets;
    for (let i = 0; i < this.active_inlets.length && nInlets < HEAT_PAYLOAD_MAX_INLETS; i++) {
      const tile = this.active_inlets[i];
      if (!tile.part) continue;
      const neighbors = tile.containmentNeighborTiles;
      let nCount = 0;
      for (let j = 0; j < neighbors.length && nCount < MAX_NEIGHBORS; j++) {
        const t = neighbors[j];
        if (t.part) {
          inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_NEIGHBORS + nCount] = ts.gridIndex(t.row, t.col);
          nCount++;
        }
      }
      inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
      inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_RATE] = tile.getEffectiveTransferValue();
      inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_N_COUNT] = nCount;
      nInlets++;
    }
    let nValveNeighbors = 0;
    const valveNbrBuf = this._heatPayload_valveNeighbors;
    this._valveNeighborCache.forEach((t) => {
      if (nValveNeighbors < HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS) valveNbrBuf[nValveNeighbors++] = ts.gridIndex(t.row, t.col);
    });
    let nValves = 0;
    const valvesBuf = this._heatPayload_valves;
    const neighbors = this._valveProcessing_neighbors;
    for (let vIdx = 0; vIdx < this.active_valves.length && nValves < HEAT_PAYLOAD_MAX_VALVES; vIdx++) {
      const valve = this.active_valves[vIdx];
      const valvePart = valve.part;
      if (!valvePart) continue;
      neighbors.length = 0;
      const valveNeighbors = valve.containmentNeighborTiles;
      for (let j = 0; j < valveNeighbors.length; j++) {
        const t = valveNeighbors[j];
        if (t.part) neighbors.push(t);
      }
      if (neighbors.length < 2) continue;
      const orientation = this._getValveOrientation(valvePart.id);
      const { inputNeighbor, outputNeighbor } = this._getInputOutputNeighbors(valve, neighbors, orientation);
      if (!inputNeighbor || !outputNeighbor) continue;
      if (inputNeighbor.part?.category === 'valve') {
        const inputValveOrientation = this._getValveOrientation(inputNeighbor.part.id);
        const inputValveNeighbors = this._valve_inputValveNeighbors;
        inputValveNeighbors.length = 0;
        const inputNeighborNeighbors = inputNeighbor.containmentNeighborTiles;
        for (let j = 0; j < inputNeighborNeighbors.length; j++) {
          const t = inputNeighborNeighbors[j];
          if (t.part && t !== valve) inputValveNeighbors.push(t);
        }
        const { outputNeighbor: inputValveOutput } = this._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);
        if (inputValveOutput !== valve) continue;
      }
      if (valvePart.type === 'overflow_valve') {
        const inputRatio = (inputNeighbor.heat_contained || 0) / (inputNeighbor.part.containment || 1);
        if (inputRatio < 0.8) continue;
      } else if (valvePart.type === 'topup_valve') {
        const outputRatio = (outputNeighbor.heat_contained || 0) / (outputNeighbor.part.containment || 1);
        if (outputRatio > 0.2) continue;
      }
      const typeId = valvePart.type === 'overflow_valve' ? 1 : valvePart.type === 'topup_valve' ? 2 : 3;
      const base = nValves * VALVE_STRIDE;
      valvesBuf[base + VALVE_OFFSET_INDEX] = ts.gridIndex(valve.row, valve.col);
      valvesBuf[base + VALVE_OFFSET_TYPE] = typeId;
      valvesBuf[base + VALVE_OFFSET_ORIENTATION] = orientation;
      valvesBuf[base + VALVE_OFFSET_RATE] = valve.getEffectiveTransferValue();
      valvesBuf[base + VALVE_OFFSET_INPUT_IDX] = ts.gridIndex(inputNeighbor.row, inputNeighbor.col);
      valvesBuf[base + VALVE_OFFSET_OUTPUT_IDX] = ts.gridIndex(outputNeighbor.row, outputNeighbor.col);
      nValves++;
    }
    let nExchangers = 0;
    const exchBuf = this._heatPayload_exchangers;
    for (let i = 0; i < this.active_exchangers.length && nExchangers < HEAT_PAYLOAD_MAX_EXCHANGERS; i++) {
      const tile = this.active_exchangers[i];
      const part = tile.part;
      if (!part || part.category === 'valve') continue;
      const neighborsAll = tile.containmentNeighborTiles;
      let nCount = 0;
      for (let n = 0; n < neighborsAll.length && nCount < MAX_NEIGHBORS; n++) {
        const t = neighborsAll[n];
        if (!t.part) continue;
        const base = nExchangers * EXCHANGER_STRIDE;
        exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + nCount] = ts.gridIndex(t.row, t.col);
        exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + nCount] = t.part.containment || 0;
        exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_CATS + nCount] = (t.part.category === 'vent' || t.part.category === 'coolant_cell') ? 2 : (t.part.category === 'heat_exchanger' ? 0 : 1);
        nCount++;
      }
      const base = nExchangers * EXCHANGER_STRIDE;
      exchBuf[base + EXCHANGER_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
      exchBuf[base + EXCHANGER_OFFSET_RATE] = tile.getEffectiveTransferValue();
      exchBuf[base + EXCHANGER_OFFSET_CONTAINMENT] = part.containment || 1;
      exchBuf[base + EXCHANGER_OFFSET_N_COUNT] = nCount;
      nExchangers++;
    }
    let nOutlets = 0;
    const outBuf = this._heatPayload_outlets;
    const outNeighbors = this._outletProcessing_neighbors;
    for (let i = 0; i < this.active_outlets.length && nOutlets < HEAT_PAYLOAD_MAX_OUTLETS; i++) {
      const tile = this.active_outlets[i];
      const part = tile.part;
      if (!part) continue;
      outNeighbors.length = 0;
      const contNeighbors = tile.containmentNeighborTiles;
      for (let j = 0; j < contNeighbors.length; j++) {
        const t = contNeighbors[j];
        if (t.part && t.part.category !== 'valve') outNeighbors.push(t);
      }
      const base = nOutlets * OUTLET_STRIDE;
      outBuf[base + OUTLET_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
      outBuf[base + OUTLET_OFFSET_RATE] = tile.getEffectiveTransferValue();
      outBuf[base + OUTLET_OFFSET_ACTIVATED] = tile.activated ? 1 : 0;
      outBuf[base + OUTLET_OFFSET_IS_OUTLET6] = part.id === 'heat_outlet6' ? 1 : 0;
      outBuf[base + OUTLET_OFFSET_N_COUNT] = outNeighbors.length;
      for (let j = 0; j < outNeighbors.length && j < MAX_NEIGHBORS; j++) {
        const t = outNeighbors[j];
        outBuf[base + OUTLET_OFFSET_NEIGHBOR_INDICES + j] = ts.gridIndex(t.row, t.col);
        outBuf[base + OUTLET_OFFSET_NEIGHBOR_CAPS + j] = t.part?.containment || 0;
      }
      nOutlets++;
    }
    const heatBuffer = heatCopy.buffer;
    const containmentBuffer = containment.buffer;
    const reactorHeatNum = reactor.current_heat && typeof reactor.current_heat.toNumber === "function" ? reactor.current_heat.toNumber() : Number(reactor.current_heat ?? 0);
    let transferList;
    let msg;
    if (this._heatUseSAB) {
      const inletsCopy = new Float32Array(nInlets * INLET_STRIDE);
      inletsCopy.set(inletsBuf.subarray(0, nInlets * INLET_STRIDE));
      const valvesCopy = new Float32Array(nValves * VALVE_STRIDE);
      valvesCopy.set(valvesBuf.subarray(0, nValves * VALVE_STRIDE));
      const valveNeighborsCopy = new Float32Array(nValveNeighbors);
      valveNeighborsCopy.set(valveNbrBuf.subarray(0, nValveNeighbors));
      const exchangersCopy = new Float32Array(nExchangers * EXCHANGER_STRIDE);
      exchangersCopy.set(exchBuf.subarray(0, nExchangers * EXCHANGER_STRIDE));
      const outletsCopy = new Float32Array(nOutlets * OUTLET_STRIDE);
      outletsCopy.set(outBuf.subarray(0, nOutlets * OUTLET_STRIDE));
      transferList = [inletsCopy.buffer, valvesCopy.buffer, valveNeighborsCopy.buffer, exchangersCopy.buffer, outletsCopy.buffer];
      msg = {
        heatBuffer,
        containmentBuffer,
        reactorHeat: reactorHeatNum,
        multiplier,
        rows,
        cols,
        inletsData: inletsCopy.buffer,
        nInlets,
        valvesData: valvesCopy.buffer,
        nValves,
        valveNeighborData: valveNeighborsCopy.buffer,
        nValveNeighbors,
        exchangersData: exchangersCopy.buffer,
        nExchangers,
        outletsData: outletsCopy.buffer,
        nOutlets,
        useSAB: true
      };
    } else {
      transferList = [heatBuffer, containmentBuffer, inletsBuf.buffer, valvesBuf.buffer, valveNbrBuf.buffer, exchBuf.buffer, outBuf.buffer];
      msg = {
        heatBuffer,
        containmentBuffer,
        reactorHeat: reactorHeatNum,
        multiplier,
        rows,
        cols,
        inletsData: inletsBuf.buffer,
        nInlets,
        valvesData: valvesBuf.buffer,
        nValves,
        valveNeighborData: valveNbrBuf.buffer,
        nValveNeighbors,
        exchangersData: exchBuf.buffer,
        nExchangers,
        outletsData: outBuf.buffer,
        nOutlets
      };
    }
    const typedPayload = {
      heat: heatCopy,
      containment,
      reactorHeat: reactorHeatNum,
      multiplier,
      inletsData: inletsBuf,
      nInlets,
      valvesData: valvesBuf,
      nValves,
      valveNeighborData: valveNbrBuf,
      nValveNeighbors,
      exchangersData: exchBuf,
      nExchangers,
      outletsData: outBuf,
      nOutlets
    };
    return { msg, transferList, payloadForSync: typedPayload };
  }

  _runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick) {
    const build = this._buildHeatPayload(multiplier);
    if (!build?.payloadForSync) return;
    const { heat, containment, ...rest } = build.payloadForSync;
    const recordTransfers = [];
    const result = runHeatStepFromTyped(heat, containment, { ...rest, recordTransfers });
    this.game.tileset.heatMap = heat;
    this.game.reactor.current_heat = toDecimal(result.reactorHeat);
    this._returnHeatFlowVectors(this._lastHeatFlowDebug);
    const cols = this.game.cols;
    for (const t of recordTransfers) {
      const v = this._getHeatFlowVector();
      v.fromRow = (t.fromIdx / cols) | 0;
      v.fromCol = t.fromIdx % cols;
      v.toRow = (t.toIdx / cols) | 0;
      v.toCol = t.toIdx % cols;
      v.amount = t.amount;
      this._lastHeatFlowDebug.push(v);
    }
    this._continueTickAfterHeat(multiplier, power_add, heat_add + result.heatFromInlets, powerBeforeTick, heatBeforeTick);
  }

  _getWorker() {
    if (this._worker) return this._worker;
    try {
      const url = new URL("../worker/physics.worker.js", import.meta.url).href;
      this._worker = new Worker(url, { type: "module" });
        this._worker.onmessage = (e) => {
        if (this._workerHeartbeatId) {
          clearTimeout(this._workerHeartbeatId);
          this._workerHeartbeatId = null;
        }
        const data = e.data;
        const useSAB = data?.useSAB === true;
        if (!useSAB && !data?.heatBuffer) {
          this._workerPending = false;
          return;
        }
        if (!this.game?.tileset) {
          this._workerPending = false;
          return;
        }
        if (!this._workerPending) return;
        const ctx = this._workerTickContext;
        this._workerPending = false;
        this._workerTickContext = null;
        if (!ctx || data.tickId !== ctx.tickId) return;
        if (!useSAB) {
          this._heatTransferHeat = new Float32Array(data.heatBuffer);
          if (data.containmentBuffer) this._heatTransferContainment = new Float32Array(data.containmentBuffer);
          this.game.tileset.heatMap = this._heatTransferHeat;
          if (data.inletsData) this._heatPayload_inlets = new Float32Array(data.inletsData);
          if (data.valvesData) this._heatPayload_valves = new Float32Array(data.valvesData);
          if (data.valveNeighborData) this._heatPayload_valveNeighbors = new Float32Array(data.valveNeighborData);
          if (data.exchangersData) this._heatPayload_exchangers = new Float32Array(data.exchangersData);
          if (data.outletsData) this._heatPayload_outlets = new Float32Array(data.outletsData);
        }
        const rawHeat = data.reactorHeat ?? this.game.reactor.current_heat.toNumber();
        this.game.reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
        const heat_add = ctx.heat_add + (data.heatFromInlets ?? 0);
        this._returnHeatFlowVectors(this._lastHeatFlowDebug);
        const cols = this.game.cols;
        for (const t of data.transfers || []) {
          const v = this._getHeatFlowVector();
          v.fromRow = (t.fromIdx / cols) | 0;
          v.fromCol = t.fromIdx % cols;
          v.toRow = (t.toIdx / cols) | 0;
          v.toCol = t.toIdx % cols;
          v.amount = t.amount;
          this._lastHeatFlowDebug.push(v);
        }
        this._continueTickAfterHeat(ctx.multiplier, ctx.power_add, heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick, data.explosionIndices);
      };
    } catch (err) {
      this._workerFailed = true;
      this.game?.logger?.warn?.("[Worker] Failed to create physics worker", err);
    }
    return this._worker;
  }

  getLastHeatFlowVectors() {
    return this._lastHeatFlowDebug;
  }

  _getHeatFlowVector() {
    const v = this._heatFlowVectorPool.pop();
    return v || { fromRow: 0, fromCol: 0, toRow: 0, toCol: 0, amount: 0 };
  }

  _returnHeatFlowVectors(arr) {
    for (let i = 0; i < arr.length; i++) this._heatFlowVectorPool.push(arr[i]);
    arr.length = 0;
  }

  enqueueVisualEvent(typeId, row, col, value) {
    if (this._timeFluxFastForward) return;
    const idx = this._eventHead * 4;
    this._eventRingBuffer[idx] = typeId;
    this._eventRingBuffer[idx + 1] = row;
    this._eventRingBuffer[idx + 2] = col;
    this._eventRingBuffer[idx + 3] = value;
    this._eventHead = (this._eventHead + 1) % this.MAX_EVENTS;
    if (this._eventHead === this._eventTail) {
      this._eventTail = (this._eventTail + 1) % this.MAX_EVENTS;
    }
  }

  getEventBuffer() {
    return {
      buffer: this._eventRingBuffer,
      head: this._eventHead,
      tail: this._eventTail,
      max: this.MAX_EVENTS
    };
  }

  ackEvents(newTail) {
    this._eventTail = newTail;
  }

  _hasHeatActivity() {
    return this.active_cells.length > 0 ||
      this.active_exchangers.length > 0 ||
      this.active_inlets.length > 0 ||
      this.active_outlets.length > 0 ||
      this.active_valves.length > 0 ||
      this.active_vents.length > 0;
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
    if (this._pausedTimeoutId != null) {
      clearTimeout(this._pausedTimeoutId);
      this._pausedTimeoutId = null;
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
    this._valveNeighborCacheDirty = true;
    this._valveOrientationCache.clear();
    this._ensureArraysValid();
  }

  _updatePartCaches() {
    if (!this._partCacheDirty) {
      return;
    }
    this._ensureArraysValid();

    this.active_cells.length = 0;
    this.active_vessels.length = 0;
    this.active_inlets.length = 0;
    this.active_exchangers.length = 0;
    this.active_outlets.length = 0;
    this.active_valves.length = 0;
    this.active_vents.length = 0;
    this.active_capacitors.length = 0;

    for (let row = 0; row < this.game._rows; row++) {
      for (let col = 0; col < this.game._cols; col++) {
        const tile = this.game.tileset.getTile(row, col);
        if (!tile?.part) continue;

        const part = tile.part;
        const category = part.category;

        switch (category) {
          case "cell":
            if (tile.ticks > 0) this.active_cells.push(tile);
            break;
          case "heat_inlet":
            this.active_inlets.push(tile);
            break;
          case "heat_exchanger":
            this.active_exchangers.push(tile);
            break;
          case "valve":
            this.active_exchangers.push(tile);
            this.active_valves.push(tile);
            break;
          case "reactor_plating":
            if (part.transfer > 0) this.active_exchangers.push(tile);
            break;
          case "heat_outlet":
            if (tile.activated) this.active_outlets.push(tile);
            break;
          case "vent":
            this.active_vents.push(tile);
            break;
          case "capacitor":
            this.active_capacitors.push(tile);
            break;
          default:
            break;
        }

        const shouldAddToVessels = (category === 'vent') || (part.vent > 0) || category === "particle_accelerator" || (part.containment > 0 && category !== "valve");
        if (shouldAddToVessels) this.active_vessels.push(tile);
      }
    }

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
    const inTestEnv = isTestEnv();
    const raf = (typeof window !== 'undefined' && window.requestAnimationFrame) ? window.requestAnimationFrame : globalThis.requestAnimationFrame;

    if (inTestEnv) {
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
      if (this.game.tutorialManager?.currentStep >= 0 || this.game.tutorialManager?._claimStepActive) this.game.tutorialManager.tick();
      if (!inTestEnv) {
        this.last_timestamp = timestamp;
        const PAUSED_POLL_MS = 500;
        this._pausedTimeoutId = setTimeout(() => {
          this._pausedTimeoutId = null;
          if (this.running && this.game.paused) this.loop(performance.now());
        }, PAUSED_POLL_MS);
      }
      return;
    }

    if (this.game.tutorialManager?.currentStep >= 0 || this.game.tutorialManager?._claimStepActive) this.game.tutorialManager.tick();

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("engine_loop");
    }

    const deltaTime = timestamp - this.last_timestamp;
    this.last_timestamp = timestamp;

    if (this._partCacheDirty) {
      this._updatePartCaches();
    }

    const targetTickDuration = this.game.loop_wait;
    const maxLiveTicks = 10;
    const maxCatchupTicks = 500;

    if (deltaTime > 30000) {
      const previousAccumulator = this.time_accumulator || 0;
      this.time_accumulator = previousAccumulator + deltaTime;
      const maxAccumulator = 100 * targetTickDuration;
      if (this.time_accumulator > maxAccumulator) {
        this.game.logger?.warn("Lag spike detected, clamping accumulator");
        this.time_accumulator = maxAccumulator;
      }
      this.game.logger?.debug(`[TIME FLUX] Offline time detected (${deltaTime.toFixed(0)}ms), accumulator: ${previousAccumulator.toFixed(0)}ms -> ${this.time_accumulator.toFixed(0)}ms`);
    } else if (this._hasHeatActivity()) {
      this._frameTimeAccumulator = (this._frameTimeAccumulator || 0) + deltaTime;
      const initialAccumulator = this.time_accumulator || 0;
      const queuedTicksBefore = Math.floor(this.time_accumulator / targetTickDuration);
      if (this.game.time_flux && queuedTicksBefore > 0) {
        if (!this._timeFluxCatchupTotalTicks) {
          this._timeFluxCatchupTotalTicks = queuedTicksBefore;
          this._timeFluxCatchupRemainingTicks = queuedTicksBefore;
        } else if (queuedTicksBefore > this._timeFluxCatchupRemainingTicks) {
          const addedTicks = queuedTicksBefore - this._timeFluxCatchupRemainingTicks;
          this._timeFluxCatchupRemainingTicks += addedTicks;
          this._timeFluxCatchupTotalTicks += addedTicks;
        }
      } else {
        this._timeFluxCatchupTotalTicks = 0;
        this._timeFluxCatchupRemainingTicks = 0;
      }

      if (this.game.time_flux && this.time_accumulator > 0) {
        const heatRatio = this.game.reactor.max_heat.gt(0) ? this.game.reactor.current_heat.div(this.game.reactor.max_heat).toNumber() : 0;
        if (heatRatio >= 0.9) {
          this.game.logger?.warn("[TIME FLUX] Safety stop: Heat > 90%. Pausing game and disabling Time Flux.");
          this.game.ui.stateManager.setVar("time_flux", false);
          this.game.pause();
        }
      }

      if (!this.game.paused) {
        const rawLiveTicks = this._frameTimeAccumulator / targetTickDuration;
        let liveTicks;
        if (rawLiveTicks > maxLiveTicks) {
          const excessTime = (rawLiveTicks - maxLiveTicks) * targetTickDuration;
          this.time_accumulator = (this.time_accumulator || 0) + excessTime;
          liveTicks = maxLiveTicks;
          this._frameTimeAccumulator = maxLiveTicks * targetTickDuration;
          this.game.logger?.debug(`[TIME FLUX] Live time clamped, excess ${excessTime.toFixed(0)}ms added to accumulator`);
        } else {
          liveTicks = Math.floor(rawLiveTicks);
          this._frameTimeAccumulator -= liveTicks * targetTickDuration;
        }

        let fluxTicks = 0;
        if (this.game.time_flux && this.time_accumulator > 0) {
          const availableFluxTicks = Math.floor(this.time_accumulator / targetTickDuration);
          const maxFluxTicks = Math.max(0, maxCatchupTicks - liveTicks);
          fluxTicks = Math.min(availableFluxTicks, maxFluxTicks);
          this.time_accumulator -= fluxTicks * targetTickDuration;
          if (this.time_accumulator < 0.001) this.time_accumulator = 0;
          if (fluxTicks > 0 && this._timeFluxCatchupRemainingTicks > 0) {
            this._timeFluxCatchupRemainingTicks = Math.max(0, this._timeFluxCatchupRemainingTicks - fluxTicks);
          }
          this.game.logger?.debug(`[TIME FLUX] Consuming banked time: ${fluxTicks} flux ticks, accumulator: ${initialAccumulator.toFixed(0)}ms -> ${this.time_accumulator.toFixed(0)}ms`);
        }

        let totalTicks = liveTicks + fluxTicks;
        if (!this._heatUseSAB && totalTicks > MAX_TICKS_PER_FRAME_NO_SAB) {
          const excess = totalTicks - MAX_TICKS_PER_FRAME_NO_SAB;
          totalTicks = MAX_TICKS_PER_FRAME_NO_SAB;
          this.time_accumulator += excess * targetTickDuration;
          fluxTicks = Math.max(0, fluxTicks - excess);
          liveTicks = totalTicks - fluxTicks;
        }
        if (this._gameLoopWorkerPending && totalTicks > SLOW_MODE_TICKS_PER_FRAME) {
          const excess = totalTicks - SLOW_MODE_TICKS_PER_FRAME;
          this.time_accumulator += excess * targetTickDuration;
          totalTicks = SLOW_MODE_TICKS_PER_FRAME;
          fluxTicks = Math.min(fluxTicks, totalTicks);
          liveTicks = totalTicks - fluxTicks;
          this.game.logger?.debug(`[SLOW MODE] Main thread behind worker queue, capping to ${totalTicks} ticks this frame`);
        }
        if (totalTicks > 0 && this._useGameLoopWorker() && !this._gameLoopWorkerPending) {
          const state = this._serializeStateForGameLoopWorker();
          if (state) {
            this._gameLoopWorkerTickId = (this._gameLoopWorkerTickId || 0) + 1;
            this._gameLoopTickContext = { tickId: this._gameLoopWorkerTickId };
            state.tickId = this._gameLoopWorkerTickId;
            state.tickCount = totalTicks;
            state.multiplier = 1;
            if (fluxTicks > 0) this._timeFluxFastForward = true;
            this._gameLoopWorkerPending = true;
            const w = this._getGameLoopWorker();
            if (w) {
              w.postMessage({ type: "tick", ...state });
            } else {
              this._gameLoopWorkerPending = false;
              this._gameLoopTickContext = null;
              for (let i = 0; i < totalTicks; i++) this._processTick(1.0);
            }
            if (fluxTicks > 0) this._timeFluxFastForward = false;
          } else {
            for (let i = 0; i < liveTicks; i++) this._processTick(1.0);
            if (fluxTicks > 0) {
              this._timeFluxFastForward = true;
              for (let i = 0; i < fluxTicks; i++) this._processTick(1.0);
              this._timeFluxFastForward = false;
            }
          }
        } else if (totalTicks > 0 && (!this._useGameLoopWorker() || this._gameLoopWorkerPending)) {
          for (let i = 0; i < liveTicks; i++) {
            this._processTick(1.0);
          }
        }
        if (fluxTicks > 0 && (!this._useGameLoopWorker() || this._gameLoopWorkerPending)) {
          this._timeFluxFastForward = true;
          const reactor = this.game.reactor;
          const sampleTicks = 5;
          const stableHeatRatio = 0.8;
          const maxProjectionPerChunk = Math.max(0, TIME_FLUX_CHUNK_TICKS - sampleTicks);
          let remaining = fluxTicks;
          while (remaining > 0 && !reactor.has_melted_down) {
            const chunk = Math.min(TIME_FLUX_CHUNK_TICKS, remaining);
            const canProject = chunk > sampleTicks &&
              (reactor.max_heat.lte(0) || reactor.current_heat.div(reactor.max_heat).toNumber() < stableHeatRatio);
            if (canProject) {
              const heat0 = reactor.current_heat;
              const power0 = reactor.current_power;
              const money0 = this.game.current_money;
              for (let i = 0; i < sampleTicks; i++) this._processTick(1.0);
              const heat1 = reactor.current_heat;
              const power1 = reactor.current_power;
              const money1 = this.game.current_money;
              const avgHeatPerTick = heat1.sub(heat0).div(sampleTicks).toNumber();
              const avgPowerPerTick = power1.sub(power0).div(sampleTicks).toNumber();
              const avgMoneyPerTick = (money1 && money1.sub ? money1.sub(money0).div(sampleTicks).toNumber() : 0);
              const heatRatioAfter = reactor.max_heat.gt(0) ? heat1.div(reactor.max_heat).toNumber() : 0;
              const stable = heatRatioAfter < stableHeatRatio && !reactor.has_melted_down &&
                Number.isFinite(avgHeatPerTick) && Number.isFinite(avgPowerPerTick);
              const N = stable ? Math.min(chunk - sampleTicks, maxProjectionPerChunk) : 0;
              if (N > 0) {
                this._applyTimeFluxProjection(N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick);
                remaining -= sampleTicks + N;
              } else {
                for (let i = 0; i < chunk - sampleTicks; i++) this._processTick(1.0);
                remaining -= chunk;
              }
            } else {
              for (let i = 0; i < chunk; i++) this._processTick(1.0);
              remaining -= chunk;
            }
          }
          this._timeFluxFastForward = false;
        }
        if (fluxTicks === 0 && initialAccumulator > 0) {
          this.game.logger?.debug(`[TIME FLUX] Processing live time only (${liveTicks} ticks), accumulator preserved at ${initialAccumulator.toFixed(0)}ms`);
        }
        const queuedTicksAfter = Math.floor(this.time_accumulator / targetTickDuration);
        if (queuedTicksAfter === 0 && this._timeFluxCatchupTotalTicks) {
          this._timeFluxCatchupTotalTicks = 0;
          this._timeFluxCatchupRemainingTicks = 0;
        }
      }
    }

    const queuedTicks = Math.floor(this.time_accumulator / targetTickDuration);
    if (!this.game.time_flux || queuedTicks === 0) {
      this._timeFluxCatchupTotalTicks = 0;
      this._timeFluxCatchupRemainingTicks = 0;
    } else if (!this._timeFluxCatchupTotalTicks) {
      this._timeFluxCatchupTotalTicks = queuedTicks;
      this._timeFluxCatchupRemainingTicks = queuedTicks;
    }
    if (this.game.ui && typeof this.game.ui.updateTimeFluxSimulation === "function") {
      if (this.game.time_flux && queuedTicks > 0 && this._timeFluxCatchupTotalTicks > 0) {
        const total = this._timeFluxCatchupTotalTicks;
        const remaining = this._timeFluxCatchupRemainingTicks;
        const progress = Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
        this.game.ui.updateTimeFluxSimulation(progress, true);
      } else {
        this.game.ui.updateTimeFluxSimulation(100, false);
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
    if (inTestEnv && (this._testFrameCount || 0) >= (this._maxTestFrames || 200)) {
      this.running = false;
      this.animationFrameId = null;
      return;
    }
    if (this._pausedTimeoutId != null) {
      clearTimeout(this._pausedTimeoutId);
      this._pausedTimeoutId = null;
    }
    this.animationFrameId = raf(this.loop.bind(this));
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
        for (let k = 0; k < count; k++) {
          this.enqueueVisualEvent(VISUAL_EVENT_POWER, tile.row, tile.col, 0);
        }
      }

      const generatedHeat = tile.heat * multiplier;

      if (tile.heat > 0 && Math.random() < multiplier) {
        const countH = tile.heat >= 200 ? 3 : tile.heat >= 50 ? 2 : 1;
        for (let k = 0; k < countH; k++) {
          this.enqueueVisualEvent(VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
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

    reactor.current_heat = reactor.current_heat.add(heat_add);
    this.game.logger?.debug(`[TICK STAGE] After cell processing: Reactor Heat = ${reactor.current_heat.toFixed(2)}`);
    this.game.logger?.debug(`[TICK] Reactor state after cells: Power=${reactor.current_power.toFixed(2)}, Heat=${reactor.current_heat.toFixed(2)}`);
    if (heat_add > 0) {
      // Heat added to reactor
    }

    // (Explosion checks occur after outlet transfer but before vents to allow overfill)

    const canSendWorker = this._useWorker() && (this._heatUseSAB || !this._workerPending);
    if (canSendWorker) {
      const payload = this._buildHeatPayload(multiplier);
      if (payload) {
        this._workerTickId++;
        this._workerTickContext = { multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick, tickId: this._workerTickId };
        payload.msg.tickId = this._workerTickId;
        this._workerPending = true;
        const w = this._getWorker();
        if (!w) {
          this._workerPending = false;
          this._workerTickContext = null;
          this._runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
          return;
        }
        w.postMessage(payload.msg, payload.transferList);
        if (this._workerHeartbeatId) clearTimeout(this._workerHeartbeatId);
        this._workerHeartbeatId = setTimeout(() => {
          if (!this._workerPending) return;
          this._workerHeartbeatId = null;
          this._workerPending = false;
          const ctx = this._workerTickContext;
          this._workerTickContext = null;
          this.game?.logger?.warn?.("[Worker] Heat step timeout, falling back to main thread");
          if (ctx) this._runHeatStepSync(ctx.multiplier, ctx.power_add, ctx.heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick);
        }, this._workerHeartbeatMs);
        return;
      }
    }
    const heatResult = this.heatManager.processTick(multiplier);
    heat_add += heatResult.heatFromInlets;
    this._returnHeatFlowVectors(this._lastHeatFlowDebug);
    const cols = this.game.cols;
    for (const t of heatResult.transfers || []) {
      const v = this._getHeatFlowVector();
      v.fromRow = (t.fromIdx / cols) | 0;
      v.fromCol = t.fromIdx % cols;
      v.toRow = (t.toIdx / cols) | 0;
      v.toCol = t.toIdx % cols;
      v.amount = t.amount;
      this._lastHeatFlowDebug.push(v);
    }
    this._continueTickAfterHeat(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
    } catch (error) {
      logger.error("Error in _processTick:", error);
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

  _continueTickAfterHeat(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick, explosionIndices = null) {
    const reactor = this.game.reactor;
    const ui = this.game.ui;

    for (let i = 0; i < this.active_vessels.length; i++) {
      const tile = this.active_vessels[i];
      if (tile.part?.id !== "particle_accelerator6") continue;
      const cap = tile.part.containment || 0;
      const current = tile.heat_contained || 0;
      const space = Math.max(0, cap - current);
      if (space <= 0 || reactor.current_heat.lte(0)) continue;
      const rate = tile.getEffectiveTransferValue ? tile.getEffectiveTransferValue() : 0;
      const maxPull = rate * multiplier;
      const pull = Math.min(maxPull, reactor.current_heat.toNumber(), space);
      if (pull > 0) {
        reactor.current_heat = reactor.current_heat.sub(pull);
        tile.heat_contained += pull;
        power_add += pull;
      }
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_particle_accelerators");
    }

    let ep_chance_add = 0;
    for (let i=0; i<this.active_vessels.length; i++) {
       const tile = this.active_vessels[i];
       const part = tile.part;
       if (part && part.category === "particle_accelerator" && tile.heat_contained > 0) {
           const safeHeatCap = 1e100;
           const lower_heat = Math.min(tile.heat_contained, part.ep_heat, safeHeatCap);
           if (lower_heat <= 0 || !Number.isFinite(part.ep_heat) || part.ep_heat <= 0) continue;
           const chance = (Math.log(lower_heat) / Math.log(10)) * (lower_heat / part.ep_heat);
           ep_chance_add += Number.isFinite(chance) ? chance * multiplier : 0;
       }
    }
    this.game.logger?.debug(`[EP-GEN] Total EP chance for this tick: ${ep_chance_add}`);
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_particle_accelerators");
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_explosions");
    }

    const ts = this.game.tileset;
    const cols = this.game.cols;
    if (Array.isArray(explosionIndices) && explosionIndices.length > 0) {
      for (let i = 0; i < explosionIndices.length; i++) {
        const idx = explosionIndices[i] | 0;
        const tile = ts.getTile((idx / cols) | 0, idx % cols);
        if (!tile?.part || tile.exploded) continue;
        if (tile.part?.category === "particle_accelerator") reactor.checkMeltdown();
        this.handleComponentExplosion(tile);
      }
    } else {
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
        if (tile.part?.category === "particle_accelerator") reactor.checkMeltdown();
        this.handleComponentExplosion(tile);
      }
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
            const powerAvail = reactor.current_power.toNumber();
            const powerNeeded = vent_reduce;
            if (powerNeeded > powerAvail) vent_reduce = powerAvail;
            reactor.current_power = reactor.current_power.sub(vent_reduce);
        }
        
        tile.heat_contained -= vent_reduce;

        if (reactor.stirling_multiplier > 0 && vent_reduce > 0) {
          const stirlingPower = vent_reduce * reactor.stirling_multiplier;
          power_add += stirlingPower;
        }
        
        if (vent_reduce > 0) {
          this.enqueueVisualEvent(VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
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
    const effectiveMaxPower = (reactor.altered_max_power && toDecimal(reactor.altered_max_power).neq(reactor.base_max_power))
      ? toDecimal(reactor.altered_max_power) : reactor.max_power;
    const potentialPower = reactor.current_power.add(powerToAdd);

    this.game.logger?.debug(`[DIAGNOSTIC] potentialPower (current + generated): ${potentialPower}`);
    if (potentialPower.gt(effectiveMaxPower)) {
      const excessPower = potentialPower.sub(effectiveMaxPower);
      const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
      reactor.current_power = effectiveMaxPower;
      reactor.current_heat = reactor.current_heat.add(excessPower.mul(overflowToHeat));
    } else {
      reactor.current_power = potentialPower;
    }

    if (ep_chance_add > 0) {
      let ep_gain = Math.floor(ep_chance_add);
      if (Math.random() < (ep_chance_add % 1)) ep_gain++;
      
      if (ep_gain > 0) {
        this.game.exotic_particles = this.game.exotic_particles.add(ep_gain);
        this.game.total_exotic_particles = this.game.total_exotic_particles.add(ep_gain);
        this.game.current_exotic_particles = this.game.current_exotic_particles.add(ep_gain);
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
    if (typeof reactor.recordClassificationStats === "function") reactor.recordClassificationStats();

    const powerMult = reactor.power_multiplier || 1;
    if (powerMult !== 1) {
      const extra = power_add * (powerMult - 1);
      reactor.current_power = reactor.current_power.add(extra);
      if (reactor.current_power.gt(reactor.max_power)) {
        const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
        const overflow = reactor.current_power.sub(reactor.max_power);
        reactor.current_heat = reactor.current_heat.add(overflow.mul(overflowToHeat));
        reactor.current_power = reactor.max_power;
      }
    }

    this.game.logger?.debug(`[DIAGNOSTIC] current_power BEFORE auto-sell logic: ${reactor.current_power}`);

    if (ui.stateManager.getVar("auto_sell")) {
      const sellCap = effectiveMaxPower.mul(reactor.auto_sell_multiplier).mul(multiplier);
      const sellAmount = Decimal.min(reactor.current_power, sellCap);
      this.game.logger?.debug(`[DIAGNOSTIC] Auto-sell calculated: sellCap=${sellCap}, sellAmount=${sellAmount}, max_power=${reactor.max_power}, auto_sell_multiplier=${reactor.auto_sell_multiplier}, multiplier=${multiplier}`);
      if (sellAmount.gt(0)) {
        reactor.current_power = reactor.current_power.sub(sellAmount);
        const value = sellAmount.mul(reactor.sell_price_multiplier || 1);
        this.game.addMoney(value);
        let capacitor6Overcharged = false;
        for (let capIdx = 0; capIdx < this.active_capacitors.length; capIdx++) {
          const capTile = this.active_capacitors[capIdx];
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
    this.game.logger?.debug(`[DIAGNOSTIC] current_power AFTER auto-sell logic: ${reactor.current_power}`);
    if (reactor.current_power.gt(reactor.max_power)) reactor.current_power = reactor.max_power;

    if (reactor.power_to_heat_ratio > 0 && reactor.current_heat.gt(0)) {
      const heatPercent = reactor.current_heat.div(reactor.max_heat).toNumber();
      if (heatPercent > 0.80 && reactor.current_power.gt(0)) {
        const heatToRemoveTarget = reactor.current_heat.mul(0.10).toNumber();
        const powerNeeded = heatToRemoveTarget / reactor.power_to_heat_ratio;
        const powerUsed = Math.min(reactor.current_power.toNumber(), powerNeeded);
        const heatRemoved = powerUsed * reactor.power_to_heat_ratio;
        reactor.current_power = reactor.current_power.sub(powerUsed);
        reactor.current_heat = reactor.current_heat.sub(heatRemoved);
      }
    }
    if (reactor.current_heat.gt(0) && reactor.heat_controlled) {
      const ventBonus = reactor.vent_multiplier_eff || 0;
      const baseRed = reactor.max_heat.toNumber() / 10000;
      const reduction = baseRed * (1 + ventBonus / 100) * multiplier;
      reactor.current_heat = reactor.current_heat.sub(reduction);
    }
    if (reactor.current_heat.lt(0)) reactor.current_heat = toDecimal(0);

    // --- FLUX ACCUMULATORS LOGIC ---
    let fluxLevel = reactor.flux_accumulator_level;
    if (!fluxLevel && this.game.upgradeset) {
      const upg = this.game.upgradeset.getUpgrade("flux_accumulators");
      if (upg) {
        fluxLevel = upg.level;
      }
    }
    if (fluxLevel > 0 && reactor.max_power.gt(0)) {
      const powerRatio = reactor.current_power.div(reactor.max_power).toNumber();
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
          this.game.exotic_particles = this.game.exotic_particles.add(epGain);
          this.game.total_exotic_particles = this.game.total_exotic_particles.add(epGain);
          this.game.current_exotic_particles = this.game.current_exotic_particles.add(epGain);
          ui.stateManager.setVar("exotic_particles", this.game.exotic_particles);
          ui.stateManager.setVar("total_exotic_particles", this.game.total_exotic_particles);
          ui.stateManager.setVar("current_exotic_particles", this.game.current_exotic_particles);
        }
      }
    }
    // --------------------------------

    let realityFluxGain = 0;
    const activeTiles = this.game.tileset?.active_tiles_list;
    if (activeTiles?.length) {
      const rateProtium = 0.0005;
      const rateNefastium = 0.001;
      const rateBlackHole = 0.002;
      for (let i = 0; i < activeTiles.length; i++) {
        const part = activeTiles[i].part;
        if (!part) continue;
        if (part.type === "protium") realityFluxGain += rateProtium;
        else if (part.type === "nefastium") realityFluxGain += rateNefastium;
        else if (part.id === "particle_accelerator6") realityFluxGain += rateBlackHole;
      }
      realityFluxGain *= multiplier;
      if (realityFluxGain > 0) {
        const add = toDecimal(realityFluxGain);
        this.game.reality_flux = this.game.reality_flux.add(add);
        ui.stateManager.setVar("reality_flux", this.game.reality_flux);
      }
    }

    // --- AUTONOMIC REPAIR LOGIC ---
    if (reactor.auto_repair_rate > 0 && reactor.current_power.gte(50)) {
      let repairsRemaining = Math.floor(reactor.auto_repair_rate * multiplier);
      const powerCostPerRepair = 50;
      for (let i = 0; i < this.active_cells.length; i++) {
        const tile = this.active_cells[i];
        if (repairsRemaining <= 0 || reactor.current_power.lt(powerCostPerRepair)) break;
        if (tile.part && tile.part.ticks > 0) {
          tile.ticks += 1;
          reactor.current_power = reactor.current_power.sub(powerCostPerRepair);
          repairsRemaining--;
        }
      }
    }
    // ------------------------------

    const rawPowerDelta = reactor.current_power.sub(powerBeforeTick).toNumber();
    const rawHeatDelta = reactor.current_heat.sub(heatBeforeTick).toNumber();
    const norm = Math.max(0.001, multiplier);
    ui.stateManager.setVar("power_delta_per_tick", rawPowerDelta / norm);
    ui.stateManager.setVar("heat_delta_per_tick", rawHeatDelta / norm);
    ui.stateManager.setVar("current_power", reactor.current_power);
    ui.stateManager.setVar("current_heat", reactor.current_heat);
    if (this.game.audio && typeof this.game.audio.updateAmbienceHeat === 'function') {
      this.game.audio.updateAmbienceHeat(reactor.current_heat.toNumber(), reactor.max_heat.toNumber());
    }

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

    if (this._eventHead !== this._eventTail && this.game.ui && typeof this.game.ui._renderVisualEvents === 'function') {
      this.game.ui._renderVisualEvents(this.getEventBuffer());
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_total");
    }
    this.tick_count++;
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  _applyTimeFluxProjection(N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick) {
    const reactor = this.game.reactor;
    const ui = this.game.ui;
    const newHeat = reactor.current_heat.add(avgHeatPerTick * N);
    reactor.current_heat = Decimal.max(toDecimal(0), Decimal.min(reactor.max_heat, newHeat));
    const effectiveMaxPower = (reactor.altered_max_power && toDecimal(reactor.altered_max_power).neq(reactor.base_max_power))
      ? toDecimal(reactor.altered_max_power) : reactor.max_power;
    const newPower = reactor.current_power.add(avgPowerPerTick * N);
    reactor.current_power = Decimal.max(toDecimal(0), Decimal.min(effectiveMaxPower, newPower));
    if (Number.isFinite(avgMoneyPerTick) && avgMoneyPerTick !== 0) {
      this.game.addMoney(avgMoneyPerTick * N);
    }
    const cells = this.active_cells.slice();
    const reflectorSet = new Set();
    for (let i = 0; i < cells.length; i++) {
      const tile = cells[i];
      const refs = tile.reflectorNeighborTiles;
      for (let j = 0; j < refs.length; j++) reflectorSet.add(refs[j]);
    }
    for (let i = 0; i < cells.length; i++) {
      const tile = cells[i];
      if (tile.ticks != null) tile.ticks -= N;
    }
    for (const r of reflectorSet) {
      if (r.ticks != null) r.ticks -= N;
    }
    for (let i = 0; i < cells.length; i++) {
      const tile = cells[i];
      if (tile.ticks <= 0 && tile.part) {
        if (tile.part.type === "protium") {
          this.game.protium_particles += tile.part.cell_count;
          this.game.update_cell_power();
        }
        this.handleComponentDepletion(tile);
      }
    }
    for (const r of reflectorSet) {
      if (r.ticks <= 0 && r.part) this.handleComponentDepletion(r);
    }
    this.tick_count += N;
    this.markPartCacheAsDirty();
    if (ui?.stateManager) {
      ui.stateManager.setVar("current_heat", reactor.current_heat);
      ui.stateManager.setVar("current_power", reactor.current_power);
    }
    if (reactor.updateStats) reactor.updateStats();
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
        const after = this.game.reactor.current_heat.sub(heatToRemove);
        this.game.reactor.current_heat = after.lt(0) ? toDecimal(0) : after;
        if (this.game.logger) {
          this.game.logger.debug(`[DECOMPRESSION] Vented ${heatToRemove} heat from explosion.`);
        }
      } else {
        this.game.reactor.current_heat = this.game.reactor.current_heat.add(tile.heat_contained);
      }
    }
    if (this.game.reactor.insurance_percentage > 0 && tile.part) {
      const costNum = tile.part.cost && typeof tile.part.cost.toNumber === 'function' ? tile.part.cost.toNumber() : Number(tile.part.cost || 0);
      const refund = Math.floor(costNum * this.game.reactor.insurance_percentage);
      if (refund > 0) {
        this.game.addMoney(refund);
        if (this.game.logger) {
          this.game.logger.debug(`[INSURANCE] Refunded $${refund} for exploded ${tile.part.id}`);
        }
      }
    }

    tile.exploding = true;
    setTimeout(() => {
      this.handleComponentDepletion(tile);
      tile.exploding = false;
    }, 600);
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
