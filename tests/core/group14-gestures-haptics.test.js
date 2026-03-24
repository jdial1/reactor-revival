import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM } from "../helpers/setup.js";
import {
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_MAX,
  MOMENTUM_DECAY_FACTOR,
  SNAP_BACK_THRESHOLD_RATIO,
} from "../../public/src/utils.js";
import { requestWakeLock, releaseWakeLock } from "../../public/src/services.js";

describe("Group 14: Mobile Gestures, Haptics and Wake Lock", () => {
  let game;
  let document;
  let prevInnerWidth;

  beforeEach(async () => {
    prevInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    const setup = await setupGameWithDOM();
    game = setup.game;
    document = setup.document;
    game.ui.gridScaler.init();
    game.ui.gridScaler.setupGestures();
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { value: prevInnerWidth, configurable: true });
    vi.restoreAllMocks();
  });

  it("clamps pinch scale to ZOOM_SCALE_MIN and ZOOM_SCALE_MAX", () => {
    const scaler = game.ui.gridScaler;
    const reactor = document.getElementById("reactor");
    scaler.reactor = reactor;
    scaler.wrapper = document.getElementById("reactor_wrapper");
    scaler.gestureState.initialDistance = 100;
    scaler.gestureState.initialScale = 1;
    scaler.gestureState.isPinching = true;
    scaler.gestureState.isPanning = true;
    scaler.gestureState.touches = [
      { clientX: 0, clientY: 0 },
      { clientX: 100, clientY: 0 },
    ];
    scaler.gestureState.currentScale = 1;
    scaler.gestureState.currentTranslate = { x: 0, y: 0 };
    scaler.gestureState.lastTranslate = { x: 0, y: 0 };
    scaler.gestureState.lastMoveTime = performance.now();
    scaler.gestureState.pinchMidpointInWrapper = { x: 0, y: 0 };
    const moveIn = {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 500, clientY: 0 },
      ],
      preventDefault: () => {},
    };
    scaler.handleTouchMove(moveIn);
    expect(scaler.gestureState.targetScale).toBe(ZOOM_SCALE_MAX);
    const moveOut = {
      touches: [
        { clientX: 45, clientY: 0 },
        { clientX: 55, clientY: 0 },
      ],
      preventDefault: () => {},
    };
    scaler.gestureState.initialDistance = 100;
    scaler.gestureState.initialScale = 1;
    scaler.handleTouchMove(moveOut);
    expect(scaler.gestureState.targetScale).toBe(ZOOM_SCALE_MIN);
  });

  it("decays momentum velocity by MOMENTUM_DECAY_FACTOR each animation frame", () => {
    vi.useFakeTimers();
    const scaler = game.ui.gridScaler;
    const reactor = document.getElementById("reactor");
    const wrapper = document.getElementById("reactor_wrapper");
    scaler.reactor = reactor;
    scaler.wrapper = wrapper;
    const limitX = (wrapper.clientWidth || 1) * SNAP_BACK_THRESHOLD_RATIO;
    scaler.gestureState.velocity = { x: 100, y: 0 };
    scaler.gestureState.currentTranslate = { x: limitX * 0.5, y: 0 };
    scaler.gestureState.isPinching = false;
    scaler.startInertiaOrSnapBack();
    vi.advanceTimersByTime(16);
    expect(scaler.gestureState.velocity.x).toBeCloseTo(100 * MOMENTUM_DECAY_FACTOR, 5);
    vi.useRealTimers();
  });

  it("does not enter pinch mode until movement exceeds pinch threshold", () => {
    const scaler = game.ui.gridScaler;
    const wrapper = document.getElementById("reactor_wrapper");
    scaler.wrapper = wrapper;
    scaler.gestureState.initialDistance = 100;
    scaler.gestureState.initialScale = 1;
    scaler.gestureState.currentScale = 1;
    scaler.gestureState.currentTranslate = { x: 0, y: 0 };
    scaler.gestureState.lastTranslate = { x: 0, y: 0 };
    scaler.gestureState.lastMoveTime = performance.now();
    scaler.gestureState.touches = [
      { clientX: 0, clientY: 0 },
      { clientX: 100, clientY: 0 },
    ];
    scaler.gestureState.pinchDistanceThreshold = 20;
    const moveWithinThreshold = {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 110, clientY: 0 },
      ],
      preventDefault: vi.fn(),
    };
    scaler.handleTouchMove(moveWithinThreshold);
    expect(scaler.gestureState.isPinching).toBe(false);
    expect(scaler.gestureState.isPanning).toBe(false);
    expect(moveWithinThreshold.preventDefault).not.toHaveBeenCalled();

    const moveBeyondThreshold = {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 125, clientY: 0 },
      ],
      preventDefault: vi.fn(),
    };
    scaler.handleTouchMove(moveBeyondThreshold);
    expect(scaler.gestureState.isPinching).toBe(true);
    expect(scaler.gestureState.isPanning).toBe(true);
    expect(moveBeyondThreshold.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("stops pinch state and starts inertia when one touch remains", () => {
    const scaler = game.ui.gridScaler;
    const startInertiaSpy = vi.spyOn(scaler, "startInertiaOrSnapBack");
    scaler.gestureState.isPinching = true;
    scaler.gestureState.isPanning = true;
    scaler.gestureState.touches = [{ clientX: 0, clientY: 0 }, { clientX: 100, clientY: 0 }];

    scaler.handleTouchEnd({ touches: [{ clientX: 42, clientY: 7 }] });

    expect(scaler.gestureState.isPinching).toBe(false);
    expect(scaler.gestureState.isPanning).toBe(false);
    expect(scaler.gestureState.touches).toEqual([]);
    expect(startInertiaSpy).toHaveBeenCalledTimes(1);
  });

  it("long-press sells tile and clears dragging state", () => {
    vi.useFakeTimers();
    const input = game.ui.inputHandler;
    const tile = game.tileset.getTile(0, 0);
    const interaction = game.ui.uiState.interaction;
    interaction.isDragging = true;
    const handleSpy = vi.spyOn(game.ui.gridController, "handleGridInteraction").mockResolvedValue(undefined);
    const state = input._buildPointerState(tile, { clientX: 4, clientY: 4 });

    input._scheduleLongPressForTile(state, tile);
    vi.advanceTimersByTime(input.longPressDuration);

    expect(handleSpy).toHaveBeenCalledWith(tile, { type: "longpress", button: 0 });
    expect(game.ui.uiState.interaction.sellingTileKey).toBeNull();
    expect(game.ui.uiState.interaction.isDragging).toBe(false);
    vi.useRealTimers();
  });

  it("movement beyond threshold cancels long-press and applies drag tile once", async () => {
    const input = game.ui.inputHandler;
    const firstTile = game.tileset.getTile(0, 0);
    const secondTile = game.tileset.getTile(0, 1);
    const interaction = game.ui.uiState.interaction;
    interaction.isDragging = true;
    const handleSpy = vi.spyOn(game.ui.gridController, "handleGridInteraction").mockResolvedValue(undefined);
    const state = input._buildPointerState(firstTile, { clientX: 0, clientY: 0 });
    state.longPressTargetTile = firstTile;
    input.longPressTimer = 1;
    const cancelLongPress = input._getCancelLongPress(state);
    const getTileFromEvent = vi.fn()
      .mockReturnValueOnce(secondTile)
      .mockReturnValueOnce(secondTile);
    const moveHandler = input._createPointerMoveHandler(state, getTileFromEvent, cancelLongPress, 18);

    await moveHandler({ clientX: 30, clientY: 0 });
    await moveHandler({ clientX: 36, clientY: 0 });

    expect(state.pointerMoved).toBe(true);
    expect(input.longPressTimer).toBeNull();
    expect(game.ui.uiState.interaction.sellingTileKey).toBeNull();
    expect(handleSpy).toHaveBeenCalledTimes(1);
    expect(handleSpy).toHaveBeenCalledWith(secondTile, { clientX: 30, clientY: 0 });
  });

  it("invokes navigator.vibrate with expected patterns for DeviceFeaturesUI", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const df = game.ui.deviceFeatures;
    df.doublePulseVibration();
    df.meltdownVibration();
    expect(vibrate).toHaveBeenCalledWith([30, 80, 30]);
    expect(vibrate).toHaveBeenCalledWith(200);
    vi.unstubAllGlobals();
  });

  it("does not throw when navigator.vibrate is missing", () => {
    vi.stubGlobal("navigator", { ...navigator, vibrate: undefined });
    const df = game.ui.deviceFeatures;
    expect(() => df.doublePulseVibration()).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("acquires wake lock when visible and skips when document is hidden", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const prev = document.visibilityState;
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await requestWakeLock();
    expect(request).toHaveBeenCalledWith("screen");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await requestWakeLock();
    releaseWakeLock();
    Object.defineProperty(document, "visibilityState", { value: prev, configurable: true });
    vi.unstubAllGlobals();
  });
});
