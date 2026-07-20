import { describe, it, expect, beforeEach, vi, setupGame } from "../helpers/setup.js";
import { GridCanvasRenderer, bindGridRendererSurfaces } from "@app/components/grid/ui-grid.js";

describe("Grid canvas culling (UI)", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
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
    const container = document.createElement("div");
    container.id = "mock-scroll-container";
    container.scrollLeft = 80;
    container.scrollTop = 80;
    Object.defineProperty(container, "clientWidth", { value: 80, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 80, configurable: true });
    document.body.appendChild(container);
    renderer._containerId = "mock-scroll-container";
    const mockCtx = {
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
    const mockDynamicCtx = {
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
    bindGridRendererSurfaces(renderer, {
      canvas: {},
      dynamicCanvas: {},
      ctx: mockCtx,
      dynamicCtx: mockDynamicCtx,
    });

    renderer.render(game);

    expect(mockCtx.clearRect).toHaveBeenCalledTimes(1);
    expect(mockCtx.clearRect).toHaveBeenCalledWith(80, 80, 40, 40);
    expect(renderer._staticDirtyTiles.size).toBe(0);
    container.remove();
  });
});
