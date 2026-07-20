import { getActiveBridge } from "../bridge/active.js";
import { bumpSnapshotRev } from "./snapshot-rev.js";

export function applyToggleStateChange(game, toggleName, value) {
  if (!toggleName) return;
  const next = !!value;
  const bridge = getActiveBridge(game);
  if (bridge?.isActive) {
    bridge.dispatch({ type: "SET_TOGGLE", payload: { toggleName, value: next } });
    return;
  }
  if (game.state) game.state[toggleName] = next;
  if (toggleName === "heat_control" && game.reactor) game.reactor.heat_controlled = next;
  bumpSnapshotRev(game);
  if (toggleName !== "pause") return;
  game.paused = next;
  if (!game.engine) return;
  if (next) game.engine.stop();
  else game.engine.start();
}
