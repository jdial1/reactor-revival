import {
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
  HEAT_CALC_POOL_SIZE,
} from "../constants.js";
import {
  INLET_STRIDE, VALVE_STRIDE, EXCHANGER_STRIDE, OUTLET_STRIDE
} from "../heatPayloadSchema.js";

export function initHeatCalcState(engine) {
  engine._heatCalc_startHeat = new Map();
  engine._heatCalc_planned = [];
  engine._heatCalc_plannedPool = [];
  for (let i = 0; i < HEAT_CALC_POOL_SIZE; i++) {
    engine._heatCalc_plannedPool.push({ from: null, to: null, amount: 0 });
  }
  engine._heatCalc_plannedCount = 0;
  engine._heatCalc_plannedOutByNeighbor = new Map();
  engine._heatCalc_plannedInByNeighbor = new Map();
  engine._heatCalc_plannedInByExchanger = new Map();
  engine._heatCalc_validNeighbors = [];
  engine._outletProcessing_neighbors = [];
  engine._explosion_tilesToExplode = [];
}

export function initValveState(engine) {
  engine._valveProcessing_valves = [];
  engine._valveProcessing_neighbors = [];
  engine._valveProcessing_inputNeighbors = [];
  engine._valveProcessing_outputNeighbors = [];
  engine._valve_inputValveNeighbors = [];
  engine._valveNeighborExchangers = new Set();
  engine._ventProcessing_activeVents = [];
}

export function initHeatPayloadBuffers(engine) {
  engine._heatPayload_inlets = new Float32Array(HEAT_PAYLOAD_MAX_INLETS * INLET_STRIDE);
  engine._heatPayload_valves = new Float32Array(HEAT_PAYLOAD_MAX_VALVES * VALVE_STRIDE);
  engine._heatPayload_valveNeighbors = new Float32Array(HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS);
  engine._heatPayload_exchangers = new Float32Array(HEAT_PAYLOAD_MAX_EXCHANGERS * EXCHANGER_STRIDE);
  engine._heatPayload_outlets = new Float32Array(HEAT_PAYLOAD_MAX_OUTLETS * OUTLET_STRIDE);
}

export function initSABState(engine) {
  engine._heatUseSABNative = typeof SharedArrayBuffer !== "undefined" &&
    typeof globalThis.crossOriginIsolated !== "undefined" &&
    globalThis.crossOriginIsolated === true;
  engine._heatUseSABOverride = false;
  engine._heatUseSAB = engine._heatUseSABNative;
  engine._heatSABView = null;
  engine._containmentSABView = null;
  engine._heatTransferHeat = null;
  engine._heatTransferContainment = null;
}

export function initWorkerState(engine) {
  engine._worker = null;
  engine._workerPending = false;
  engine._workerHeartbeatId = null;
  engine._workerFailed = false;
  engine._workerTickId = 0;
  engine._lastHeatTimeoutWarn = 0;
  engine._heatWorkerConsecutiveTimeouts = 0;
  engine._gameLoopWorker = null;
  engine._gameLoopWorkerPending = false;
  engine._gameLoopTickContext = null;
  engine._gameLoopWorkerFailed = false;
  engine._gameLoopWorkerTickId = 0;
}

export function initAllEngineState(engine) {
  initHeatCalcState(engine);
  initValveState(engine);
  initHeatPayloadBuffers(engine);
  initSABState(engine);
  initWorkerState(engine);
}
