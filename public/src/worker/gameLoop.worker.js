import { attachGameLoopWorkerPort } from "./gameLoopWorkerCore.js";

self.onmessage = attachGameLoopWorkerPort(self);
