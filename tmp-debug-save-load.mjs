import { setupGameWithDOM, cleanupGame } from "./tests/helpers/setup.js";

const { game } = await setupGameWithDOM();

for (let r = 0; r < game.rows; r++) {
  for (let c = 0; c < game.cols; c++) {
    const partId = (r + c) % 2 === 0 ? "capacitor1" : "vent1";
    const tile = game.tileset.getTile(r, c);
    await tile.setPart(game.partset.getPartById(partId));
  }
}

game.saveGame();
const slot = parseInt(global.localStorage.getItem("reactorCurrentSaveSlot") || "1", 10);
const savedData = JSON.parse(global.localStorage.getItem(`reactorGameSave_${slot}`));
console.log("Saved tiles:", savedData.tiles.length);
console.log("First tile entry:", savedData.tiles.find((t) => t.row === 0 && t.col === 0));

const newSetup = await setupGameWithDOM();
const newGame = newSetup.game;
newGame.engine.stop();
await newGame.loadGame(slot);
await new Promise((resolve) => setTimeout(resolve, 200));
newGame.tileset.updateActiveTiles();
newGame.engine.markPartCacheAsDirty();
newGame.engine._updatePartCaches();

const loadTile = newGame.tileset.getTile(0, 0);
console.log("Loaded tile part:", loadTile.part?.id);

await cleanupGame();

