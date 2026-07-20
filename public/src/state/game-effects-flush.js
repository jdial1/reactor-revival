import { drainGameEffects } from "../effect-orchestrator.js";
import {
  enqueueGameEffect,
  enqueueWarningLoop as enqueueWarningLoopOnly,
  enqueueWarningStop as enqueueWarningStopOnly,
} from "./game-effects.js";

export function flushGameEffects(game) {
  drainGameEffects(game, () => game?.ui);
}

export function enqueueAndDrain(game, effect) {
  enqueueGameEffect(game, effect);
  flushGameEffects(game);
}

export function enqueueWarningLoop(game, intensity = 0.5) {
  enqueueWarningLoopOnly(game, intensity);
  flushGameEffects(game);
}

export function enqueueWarningStop(game) {
  enqueueWarningStopOnly(game);
  flushGameEffects(game);
}
