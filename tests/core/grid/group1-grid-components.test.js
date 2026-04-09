import { describe, it, expect, beforeEach, vi, setupGame, toNum } from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";
import { REACTOR_HEAT_STANDARD_DIVISOR } from "@app/utils.js";
import { GridCanvasRenderer } from "@app/components/ui-grid.js";

describe("Group 1: Core Grid & Component Generation", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("locks base cell power and heat without reflectors", async () => {
    const cellTile = await placePart(game, 3, 3, "uranium1");
    const cellPart = game.partset.getPartById("uranium1");

    game.reactor.updateStats();

    expect(cellTile.power).toBe(cellPart.base_power);
    expect(cellTile.heat).toBe(cellPart.base_heat);
    expect(game.reactor.stats_power).toBe(cellPart.base_power);
    expect(game.reactor.stats_heat_generation).toBe(cellPart.base_heat);

    game.reactor.current_power = 0;
    game.reactor.current_heat = 0;
    game.reactor.heat_controlled = true;
    game.engine.tick();

    expect(toNum(game.reactor.current_power)).toBe(cellPart.base_power);
    expect(cellTile.ticks).toBe(cellPart.base_ticks - 1);
    const baseVent =
      toNum(game.reactor.max_heat) / REACTOR_HEAT_STANDARD_DIVISOR;
    const ventFactor = 1 + (game.reactor.vent_multiplier_eff || 0) / 100;
    const expectedReactorHeat =
      cellPart.base_heat - baseVent * ventFactor;
    expect(toNum(game.reactor.current_heat)).toBe(expectedReactorHeat);
    expect(game.state.heat_delta_per_tick).toBe(expectedReactorHeat);
    expect(game.state.power_delta_per_tick).toBe(cellPart.base_power);
  });

  it("locks cardinal reflector multiplier and ignores diagonal reflectors", async () => {
    const cellTile = await placePart(game, 5, 5, "uranium1");
    const reflectorCardinal = await placePart(game, 5, 6, "reflector1");
    const reflectorDiagonal = await placePart(game, 4, 4, "reflector1");
    const reflectorCardinalTicksBefore = reflectorCardinal.ticks;
    const reflectorDiagonalTicksBefore = reflectorDiagonal.ticks;

    const cellPart = game.partset.getPartById("uranium1");
    const reflectorPart = game.partset.getPartById("reflector1");
    const expectedPower = cellPart.base_power * (1 + reflectorPart.power_increase / 100);
    const expectedHeat = cellPart.base_heat * (1 + reflectorPart.heat_increase / 100);

    game.reactor.updateStats();

    expect(cellTile.power).toBe(expectedPower);
    expect(cellTile.heat).toBe(expectedHeat);
    expect(game.reactor.stats_power).toBe(expectedPower);
    expect(game.reactor.stats_heat_generation).toBe(expectedHeat);

    game.reactor.current_power = 0;
    game.reactor.current_heat = 0;
    game.reactor.heat_controlled = true;
    game.engine.tick();

    expect(toNum(game.reactor.current_power)).toBe(expectedPower);
    const baseVent =
      toNum(game.reactor.max_heat) / REACTOR_HEAT_STANDARD_DIVISOR;
    const ventFactor = 1 + (game.reactor.vent_multiplier_eff || 0) / 100;
    const expectedReactorHeat = expectedHeat - baseVent * ventFactor;
    expect(toNum(game.reactor.current_heat)).toBe(expectedReactorHeat);
    expect(game.state.heat_delta_per_tick).toBe(expectedReactorHeat);
    expect(game.state.power_delta_per_tick).toBe(expectedPower);
    expect(cellTile.ticks).toBe(cellPart.base_ticks - 1);
    expect(reflectorCardinal.ticks).toBe(reflectorCardinalTicksBefore - 1);
    expect(reflectorDiagonal.ticks).toBe(reflectorDiagonalTicksBefore);
  });

  it("locks capacitor and reactor plating global capacity effects", async () => {
    const baseMaxPower = toNum(game.reactor.max_power);
    const baseMaxHeat = toNum(game.reactor.max_heat);

    const capacitorTile = await placePart(game, 0, 0, "capacitor1");
    const platingTile = await placePart(game, 0, 1, "reactor_plating1");
    const addPower = toNum(capacitorTile.part.reactor_power);
    const addHeat = toNum(platingTile.part.reactor_heat);

    game.reactor.updateStats();

    expect(toNum(game.reactor.max_power)).toBe(baseMaxPower + addPower);
    expect(toNum(game.reactor.max_heat)).toBe(baseMaxHeat + addHeat);
    expect(game.reactor.stats_power).toBe(0);
    expect(game.reactor.stats_heat_generation).toBe(0);

    game.reactor.current_power = 0;
    game.reactor.current_heat = 0;
    game.engine.tick();

    expect(toNum(game.reactor.current_power)).toBe(0);
    expect(toNum(game.reactor.current_heat)).toBe(0);
    expect(Math.abs(game.state.power_delta_per_tick ?? 0)).toBe(0);
    expect(Math.abs(game.state.heat_delta_per_tick ?? 0)).toBe(0);
  });

  it("locks durability decrement by exactly one tick", async () => {
    const cellTile = await placePart(game, 1, 1, "uranium1");
    const cellPart = game.partset.getPartById("uranium1");

    game.engine.tick();

    expect(cellTile.ticks).toBe(cellPart.base_ticks - 1);
  });

  it("locks depletion when durability reaches zero", async () => {
    const cellTile = await placePart(game, 2, 2, "uranium1");
    cellTile.ticks = 1;

    game.engine.tick();

    expect(cellTile.part).toBeNull();
    expect(cellTile.ticks).toBe(0);
    game.reactor.updateStats();
    expect(game.reactor.stats_power).toBe(0);
    expect(game.reactor.stats_heat_generation).toBe(0);
  });

  it("culls tile visibility correctly at viewport boundaries", () => {
    const renderer = new GridCanvasRenderer({ game });
    renderer._tileSize = 50;
    const viewport = { left: 100, top: 100, width: 200, height: 200 };

    expect(renderer.tileInViewport(2, 2, viewport)).toBe(true);
    expect(renderer.tileInViewport(1, 1, viewport)).toBe(false);
    expect(renderer.tileInViewport(8, 8, viewport)).toBe(false);
    expect(renderer.tileInViewport(3, 2, viewport)).toBe(true);
    expect(renderer.tileInViewport(2, 1, viewport)).toBe(false);
  });

  it("renders and clears only dirty static tiles in viewport", () => {
    const renderer = new GridCanvasRenderer({ game });
    renderer._rows = 6;
    renderer._cols = 6;
    renderer._tileSize = 40;
    renderer._width = 240;
    renderer._height = 240;
    renderer._staticDirty = false;
    renderer._staticDirtyTiles.add("2,2");
    renderer._staticDirtyTiles.add("0,0");
    renderer._container = { scrollLeft: 80, scrollTop: 80, clientWidth: 80, clientHeight: 80, getBoundingClientRect: () => ({}) };
    renderer.ctx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      lineWidth: 1,
      fillStyle: "",
      strokeStyle: "",
    };
    renderer._dynamicCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      lineWidth: 1,
      fillStyle: "",
      strokeStyle: "",
      lineCap: "round",
    };

    renderer.render(game);

    expect(renderer.ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(renderer.ctx.clearRect).toHaveBeenCalledWith(80, 80, 40, 40);
    expect(renderer._staticDirtyTiles.size).toBe(0);
  });
});
