import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  setupGame,
  setupGameWithDOM,
  monitorFloatingTextPooling,
} from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";

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

  it("reuses floating text nodes via pool after timed recycle", () => {
    vi.useFakeTimers();
    const div = document.createElement("div");
    const inner = document.createElement("div");
    inner.className = "floating-text-container";
    div.appendChild(inner);
    document.body.appendChild(div);
    const pool = game.ui._visualPool.floatingText;
    const initialPool = pool.length;
    const mon = monitorFloatingTextPooling(vi, document);
    for (let i = 0; i < 25; i++) {
      game.ui.particleEffectsUI.showFloatingText(div, 10);
      vi.advanceTimersByTime(1001);
    }
    expect(mon.counts.div).toBeLessThanOrEqual(2);
    expect(pool.length).toBeGreaterThanOrEqual(initialPool);
    document.body.removeChild(div);
    mon.restore();
    vi.useRealTimers();
  });
});
