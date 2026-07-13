import { describe, it, expect } from "../../helpers/setup.js";
import { PhysicsTickResultSchema } from "../../../public/src/schema/stateSchemas.js";

describe("Group 13: Web Worker Concurrency and Fallbacks", () => {
  it("rejects malformed physics worker results via PhysicsTickResultSchema", () => {
    const bad = { tickId: 1, reactorHeat: "not-a-number" };
    expect(PhysicsTickResultSchema.safeParse(bad).success).toBe(false);
  });
});
