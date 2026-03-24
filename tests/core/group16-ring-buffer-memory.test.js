import { describe, it, expect, beforeEach, afterEach, vi, setupGame, setupGameWithDOM } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";
import { ParticleSystem } from "../../public/src/components/VisualEffectsManager.js";

describe("Group 16: Visual Event Ring Buffer and Pooling", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("keeps ring buffer storage fixed size and advances tail on overflow", () => {
    const max = game.engine.MAX_EVENTS;
    const buf = game.engine._eventRingBuffer;
    expect(buf.length).toBe(max * 4);
    for (let i = 0; i < max + 40; i++) {
      game.engine.enqueueVisualEvent(1, 0, 0, 0);
    }
    expect(buf.length).toBe(max * 4);
    const d = game.engine.getEventBuffer();
    const pending = (d.head - d.tail + max) % max;
    expect(pending).toBeLessThan(max);
  });

  it("drains visual events via render and ack then leaves buffer empty", async () => {
    const setup = await setupGameWithDOM();
    const g = setup.game;
    await placePart(g, 0, 0, "uranium1");
    g.engine.enqueueVisualEvent(1, 0, 0, 0);
    const desc1 = g.engine.getEventBuffer();
    expect(desc1.head).not.toBe(desc1.tail);
    g.ui._renderVisualEvents(desc1);
    const desc2 = g.engine.getEventBuffer();
    expect(desc2.head).toBe(desc2.tail);
    g.ui._renderVisualEvents(desc2);
    const desc3 = g.engine.getEventBuffer();
    expect(desc3.head).toBe(desc3.tail);
  });

  it("caps particle steam array size under burst creation", () => {
    const ps = new ParticleSystem();
    ps.setSize(100, 100);
    for (let i = 0; i < 2000; i++) {
      ps.createSteamParticles(50, 50, 10);
    }
    expect(ps._steam.length).toBeLessThanOrEqual(512);
  });

  it("removes dead particles after update and respects hard limits across all pools", () => {
    const ps = new ParticleSystem();
    ps.setSize(200, 200);
    for (let i = 0; i < 2000; i++) {
      ps.createSteamParticles(10, 10, 4);
      ps.createCriticalBuildupEmbers(10, 10);
      ps.createSellSparks(0, 0, 100, 100);
    }
    expect(ps._steam.length).toBeLessThanOrEqual(512);
    expect(ps._embers.length).toBeLessThanOrEqual(256);
    expect(ps._sparks.length).toBeLessThanOrEqual(192);
    ps.createBoltParticle(0, 0, 1, 1);
    ps.update(5000);
    expect(ps._steam.length).toBe(0);
    expect(ps._embers.length).toBe(0);
    expect(ps._sparks.length).toBe(0);
    expect(ps._bolts.length).toBe(0);
  });

  it("reuses floating text nodes via pool after timed recycle", () => {
    vi.useFakeTimers();
    const div = document.createElement("div");
    const inner = document.createElement("div");
    inner.className = "floating-text-container";
    div.appendChild(inner);
    document.body.appendChild(div);
    const pool = game.ui._visualPool.floatingText;
    const initialPool = pool.length;
    let created = 0;
    const orig = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "div") created++;
      return orig(tag);
    });
    for (let i = 0; i < 25; i++) {
      game.ui.particleEffectsUI.showFloatingText(div, 10);
      vi.advanceTimersByTime(1001);
    }
    expect(created).toBeLessThanOrEqual(2);
    expect(pool.length).toBeGreaterThanOrEqual(initialPool);
    document.body.removeChild(div);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
});
