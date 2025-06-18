import { describe, it, expect, beforeEach } from "vitest";
import { setupGame } from "../helpers/setup.js";

describe("Partset Mechanics", () => {
  let game;
  beforeEach(async () => {
    game = await setupGame();
  });

  it("should initialize with all required parts", () => {
    const requiredParts = [
      "uranium1",
      "uranium2",
      "uranium3",
      "vent1",
      "capacitor1",
    ];
    requiredParts.forEach((partId) => {
      const part = game.partset.getPartById(partId);
      expect(part).toBeDefined();
      expect(part.id).toBe(partId);
    });
  });

  it("should get part by ID", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    expect(part.id).toBe("uranium1");
    expect(part.power).toBeGreaterThan(0);
    expect(part.heat).toBeGreaterThan(0);
    expect(part.cost).toBeGreaterThan(0);
  });

  it("should return undefined for invalid part ID", () => {
    const part = game.partset.getPartById("invalid_part");
    expect(part).toBeUndefined();
  });

  it("should get all parts of a specific type", () => {
    const uraniumParts = game.partset.getPartsByType("uranium");
    expect(uraniumParts.length).toBe(3);
    uraniumParts.forEach((part) => {
      expect(part.id).toMatch(/^uranium\d$/);
    });

    const ventParts = game.partset.getPartsByType("vent");
    expect(ventParts.length).toBe(3);
    ventParts.forEach((part) => {
      expect(part.id).toMatch(/^vent\d$/);
    });
  });

  it("should return empty array for invalid part type", () => {
    const parts = game.partset.getPartsByType("invalid_type");
    expect(parts).toEqual([]);
  });

  it("should get parts by tier", () => {
    const tier1Parts = game.partset.getPartsByTier(1);
    expect(tier1Parts.length).toBeGreaterThan(0);
    tier1Parts.forEach((part) => {
      expect(part.tier).toBe(1);
    });

    const tier2Parts = game.partset.getPartsByTier(2);
    expect(tier2Parts.length).toBeGreaterThan(0);
    tier2Parts.forEach((part) => {
      expect(part.tier).toBe(2);
    });
  });

  it("should return empty array for invalid tier", () => {
    const parts = game.partset.getPartsByTier(999);
    expect(parts).toEqual([]);
  });

  it("should get parts by category", () => {
    const cellParts = game.partset.getPartsByCategory("cell");
    expect(cellParts.length).toBeGreaterThan(0);
    cellParts.forEach((part) => {
      expect(part.category).toBe("cell");
    });

    const coolingParts = game.partset.getPartsByCategory("vent");
    expect(coolingParts.length).toBeGreaterThan(0);
    coolingParts.forEach((part) => {
      expect(part.category).toBe("vent");
    });
  });

  it("should return empty array for invalid category", () => {
    const parts = game.partset.getPartsByCategory("invalid_category");
    expect(parts).toEqual([]);
  });

  it("should get all available parts", () => {
    const allParts = game.partset.getAllParts();
    expect(allParts.length).toBeGreaterThan(0);
    expect(allParts.every((part) => part.id && part.type)).toBe(true);
  });
});
