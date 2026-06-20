import { attachGameLoopWorkerPort } from "./gameLoopWorkerCore.js";
import { attachPhysicsWorkerPort } from "./physicsWorkerCore.js";

const gameLoopOnMessage = attachGameLoopWorkerPort(self);
const physicsOnMessage = attachPhysicsWorkerPort(self);

self.onmessage = function engineUnifiedOnMessage(e) {
  const d = e.data;
  if (d?.type === "timerControl" || d?.type === "economyCommand" || d?.type === "tick") {
    gameLoopOnMessage(e);
  } else {
    physicsOnMessage(e);
  }
};
