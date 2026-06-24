import { describe, it, expect, beforeEach, setupGameLogicOnly } from "../helpers/setup.js";
import { buildSaveDTO, absorbSaveDTO, parseAndValidateSave } from "@app/domain/game-save.js";
import { serializeSave } from "@app/storage/index.js";

describe("save DTO boundary", () => {
  let game;

  beforeEach(async () => {
    game = await setupGameLogicOnly();
    await game.partset.initialize();
    await game.upgradeset.initialize();
    if (!game.tileset.initialized) game.tileset.initialize();
  });

  it("round-trips through absorbSaveDTO", async () => {
    const dto = await buildSaveDTO(game);
    const serialized = serializeSave(dto);
    const reparsed = parseAndValidateSave(serialized);
    await absorbSaveDTO(game, reparsed);
    const dto2 = await buildSaveDTO(game);
    expect(dto2.version).toBe(dto.version);
    expect(dto2.rows).toBe(dto.rows);
    expect(dto2.cols).toBe(dto.cols);
  });
});
