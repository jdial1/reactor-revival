import { describe, it, expect, beforeEach, vi, setupGame, toNum } from "../../helpers/setup.js";
import { SaveDataSchema } from "../../../public/schema/index.js";
import { ObjectiveIndexSchema, SaveDecimalSchema } from "../../../public/schema/numberLikeSchema.js";
import { toDecimal, serializeSave, deserializeSave, migrateLocalStorageToIndexedDB } from "@app/utils.js";
import { parseAndValidateSave } from "@app/store.js";

const STABLE_RUN_ID = "11111111-1111-1111-1111-111111111111";

describe("Group 6: Persistence & Data Integrity", () => {
  describe("SaveDataSchema", () => {
    it("locks Zod schema fallbacks for corrupted save files", () => {
      const corruptedSave = {
        version: "1.4.0",
        current_money: "NaN",
        objectives: {
          current_objective_index: -5,
        },
      };

      const parsed = SaveDataSchema.safeParse(corruptedSave);
      expect(parsed.success).toBe(true);
      const validated = parsed.data;

      expect(validated.version).toBe("1.4.0");
      expect(validated.current_money.eq(toDecimal(0))).toBe(true);
      expect(validated.current_money.toString()).toBe("0");
      expect(toNum(validated.current_money)).toBe(0);
      expect(Object.is(toNum(validated.current_money), 0)).toBe(true);

      expect(validated.objectives.current_objective_index).toBe(0);
      expect(Object.is(validated.objectives.current_objective_index, 0)).toBe(true);
      expect(Number.isInteger(validated.objectives.current_objective_index)).toBe(true);
    });

    it("matches parseAndValidateSave output for the same corrupted payload", () => {
      const corruptedSave = {
        version: "1.4.0",
        run_id: STABLE_RUN_ID,
        current_money: "NaN",
        objectives: { current_objective_index: -5 },
      };

      const fromSchema = SaveDataSchema.parse(corruptedSave);
      const fromState = parseAndValidateSave(corruptedSave);

      expect(fromState.version).toBe(fromSchema.version);
      expect(fromState.run_id).toBe(fromSchema.run_id);
      expect(fromState.run_id).toBe(STABLE_RUN_ID);
      expect(fromState.current_money.eq(fromSchema.current_money)).toBe(true);
      expect(fromState.objectives.current_objective_index).toBe(
        fromSchema.objectives.current_objective_index
      );
    });

    it("defaults missing objectives block to index 0, empty tiles, and money 0", () => {
      const minimal = { version: "1.0.0", run_id: STABLE_RUN_ID };
      const parsed = SaveDataSchema.safeParse(minimal);
      expect(parsed.success).toBe(true);
      expect(parsed.data.run_id).toBe(STABLE_RUN_ID);
      expect(parsed.data.objectives.current_objective_index).toBe(0);
      expect(parsed.data.objectives.completed_objectives).toEqual([]);
      expect(parsed.data.tiles).toEqual([]);
      expect(parsed.data.rows).toBe(12);
      expect(parsed.data.cols).toBe(12);
      expect(parsed.data.base_rows).toBe(12);
      expect(parsed.data.base_cols).toBe(12);
      expect(parsed.data.current_money.eq(toDecimal(0))).toBe(true);
      expect(parsed.data.current_money.toString()).toBe("0");
    });

    it("replaces tiles with [] when any tile row fails TileSchema", () => {
      const bad = {
        version: "1.0.0",
        run_id: STABLE_RUN_ID,
        tiles: [{ row: -1, col: 0, partId: "uranium1", ticks: 0, heat_contained: 0 }],
      };
      const parsed = SaveDataSchema.safeParse(bad);
      expect(parsed.success).toBe(true);
      expect(parsed.data.tiles).toEqual([]);
    });

    it("migrates legacy 2D tile arrays to flat tiles with exact coordinates and defaults", () => {
      const legacy = {
        version: "1.0.0",
        run_id: STABLE_RUN_ID,
        tiles: [
          [{ id: "uranium1" }, null],
          [null, { partId: "vent1", ticks: 2 }],
        ],
      };
      const parsed = SaveDataSchema.parse(legacy);
      expect(parsed.tiles.length).toBe(2);
      expect(parsed.tiles).toEqual([
        { row: 0, col: 0, partId: "uranium1", ticks: 0, heat_contained: 0 },
        { row: 1, col: 1, partId: "vent1", ticks: 2, heat_contained: 0 },
      ]);
    });

    it("round-trips through serializeSave and parseAndValidateSave with identical money and objectives", () => {
      const payload = {
        version: "1.4.0",
        run_id: STABLE_RUN_ID,
        current_money: toDecimal(42),
        objectives: { current_objective_index: 3, completed_objectives: [] },
        tiles: [],
      };
      const once = SaveDataSchema.parse(payload);
      const wire = serializeSave(once);
      expect(typeof wire).toBe("string");
      const deserialized = deserializeSave(wire);
      const twice = parseAndValidateSave(deserialized);

      expect(twice.version).toBe(once.version);
      expect(twice.run_id).toBe(once.run_id);
      expect(twice.current_money.eq(once.current_money)).toBe(true);
      expect(toNum(twice.current_money)).toBe(42);
      expect(twice.objectives.current_objective_index).toBe(3);
      expect(twice.objectives.completed_objectives).toEqual([]);
    });

    it("parses superjson wire via parseAndValidateSave the same as the object form", () => {
      const payload = {
        version: "1.4.0",
        run_id: STABLE_RUN_ID,
        current_money: toDecimal(7),
        objectives: { current_objective_index: 1, completed_objectives: [] },
        tiles: [],
      };
      const validated = SaveDataSchema.parse(payload);
      const wire = serializeSave(validated);
      const fromWire = parseAndValidateSave(wire);
      const fromObj = parseAndValidateSave(validated);

      expect(fromWire.version).toBe(fromObj.version);
      expect(fromWire.run_id).toBe(fromObj.run_id);
      expect(fromWire.current_money.eq(fromObj.current_money)).toBe(true);
      expect(fromWire.objectives.current_objective_index).toBe(fromObj.objectives.current_objective_index);
      expect(fromWire.tiles).toEqual(fromObj.tiles);
    });

    it("parses plain JSON string saves through parseAndValidateSave", () => {
      const plain = JSON.stringify({
        version: "1.0.0",
        run_id: STABLE_RUN_ID,
        objectives: { current_objective_index: 2, completed_objectives: [] },
        tiles: [],
      });
      const data = parseAndValidateSave(plain);
      expect(data.version).toBe("1.0.0");
      expect(data.run_id).toBe(STABLE_RUN_ID);
      expect(data.objectives.current_objective_index).toBe(2);
      expect(data.current_money.eq(toDecimal(0))).toBe(true);
      expect(data.current_money.toString()).toBe("0");
    });

    it("normalizes completed_objectives booleans to strict true-only flags", () => {
      const raw = {
        version: "1.0.0",
        run_id: STABLE_RUN_ID,
        objectives: {
          current_objective_index: 0,
          completed_objectives: [true, false, null, undefined],
        },
        tiles: [],
      };
      const data = SaveDataSchema.parse(raw);
      expect(data.objectives.completed_objectives).toEqual([true, false, false, false]);
    });
  });

  describe("parseAndValidateSave failures", () => {
    it("throws when input is null", () => {
      expect(() => parseAndValidateSave(null)).toThrow("Save corrupted: validation failed");
    });

    it("throws when wire is not valid JSON", () => {
      expect(() => parseAndValidateSave("{ not json")).toThrow(SyntaxError);
    });
  });

  describe("ObjectiveIndexSchema / SaveDecimalSchema", () => {
    it("clamps negative indices and string negatives to 0", () => {
      expect(ObjectiveIndexSchema.parse(-5)).toBe(0);
      expect(ObjectiveIndexSchema.parse("-3")).toBe(0);
      expect(ObjectiveIndexSchema.parse(undefined)).toBe(0);
    });

    it("preserves non-negative integers and floors fractional numbers", () => {
      expect(ObjectiveIndexSchema.parse(7)).toBe(7);
      expect(ObjectiveIndexSchema.parse("12")).toBe(12);
      expect(ObjectiveIndexSchema.parse(5.9)).toBe(5);
      expect(ObjectiveIndexSchema.parse("8.9")).toBe(8);
      expect(ObjectiveIndexSchema.parse("foo")).toBe(0);
    });

    it("coerces NaN money strings and non-finite numbers to 0", () => {
      expect(SaveDecimalSchema.parse("NaN").eq(toDecimal(0))).toBe(true);
      expect(SaveDecimalSchema.parse("").eq(toDecimal(0))).toBe(true);
      expect(SaveDecimalSchema.parse(undefined).eq(toDecimal(0))).toBe(true);
      expect(toNum(SaveDecimalSchema.parse("NaN"))).toBe(0);
      expect(SaveDecimalSchema.safeParse(Number.NaN).success).toBe(false);
      expect(SaveDecimalSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    });

    it("preserves finite decimal inputs", () => {
      const d = SaveDecimalSchema.parse("123.5");
      expect(d.eq(toDecimal("123.5"))).toBe(true);
    });
  });

  describe("paste layout (unrecognized part)", () => {
    let game;

    beforeEach(async () => {
      game = await setupGame();
    });

    it("gracefully ignores unrecognized part IDs during paste", () => {
      const moneyBefore = game.state.current_money;
      const moneyBeforeStr = moneyBefore.toString();
      const layout = [[{ t: "uranium", id: "unknown_part_999", lvl: 1 }]];

      expect(() => game.action_pasteLayout(layout, { skipCostDeduction: true })).not.toThrow();

      const tile = game.tileset.getTile(0, 0);
      expect(tile).not.toBeNull();
      expect(tile.part).toBeNull();
      expect(tile.ticks).toBe(0);
      expect(game.state.current_money.eq(moneyBefore)).toBe(true);
      expect(game.state.current_money.toString()).toBe(moneyBeforeStr);
    });

    it("applies recognized parts while skipping unrecognized part IDs", () => {
      const moneyBefore = game.state.current_money;
      const moneyBeforeStr = moneyBefore.toString();
      expect(game.rows).toBeGreaterThanOrEqual(1);
      expect(game.cols).toBeGreaterThanOrEqual(2);

      const uraniumPart = game.partset.getPartById("uranium1");
      expect(uraniumPart).not.toBeNull();

      const layout = [[
        { t: "uranium", id: "uranium1", lvl: 1 },
        { t: "uranium", id: "unknown_part_999", lvl: 1 },
      ]];

      expect(() => game.action_pasteLayout(layout, { skipCostDeduction: true })).not.toThrow();

      const t0 = game.tileset.getTile(0, 0);
      const t1 = game.tileset.getTile(0, 1);
      expect(t0).not.toBeNull();
      expect(t1).not.toBeNull();
      expect(t0.part).not.toBeNull();
      expect(t0.part.id).toBe("uranium1");
      expect(t0.part.level).toBe(1);
      expect(t0.ticks).toBe(uraniumPart.ticks);
      expect(t1.part).toBeNull();
      expect(t1.ticks).toBe(0);
      expect(game.state.current_money.eq(moneyBefore)).toBe(true);
      expect(game.state.current_money.toString()).toBe(moneyBeforeStr);
    });
  });

  describe("localStorage to IndexedDB migration", () => {
    it("copies legacy save keys when idb slots are empty", async () => {
      const savedIndexedDB = global.indexedDB;
      global.indexedDB = {};
      localStorage.setItem("reactorGameSave_1", "slot1-data");
      localStorage.setItem("reactorCurrentSaveSlot", "1");
      await migrateLocalStorageToIndexedDB();
      expect(localStorage.getItem("reactorGameSave_1")).toBe("slot1-data");
      expect(localStorage.getItem("reactorCurrentSaveSlot")).toBe("1");
      global.indexedDB = savedIndexedDB;
    });

    it("swallows storage adapter failures without deleting legacy localStorage", async () => {
      const savedIndexedDB = global.indexedDB;
      global.indexedDB = {};
      localStorage.setItem("reactorGameSave_2", "slot2-data");
      const getItemSpy = vi
        .spyOn(localStorage, "getItem")
        .mockImplementation((key) => {
          if (key === "reactorGameSave_2") throw new Error("storage read failed");
          return null;
        });
      await expect(migrateLocalStorageToIndexedDB()).resolves.toBeUndefined();
      getItemSpy.mockRestore();
      expect(localStorage.getItem("reactorGameSave_2")).toBe("slot2-data");
      global.indexedDB = savedIndexedDB;
    });
  });
});
