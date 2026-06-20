import { attachPhysicsWorkerPort } from "./physicsWorkerCore.js";

self.onmessage = attachPhysicsWorkerPort(self);
