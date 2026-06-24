const CELL_LEVEL_TILES = { 1: 1, 2: 2, 3: 4 };
const CELL_TYPE_TO_NUM = { uranium: 1, plutonium: 2, thorium: 3, seaborgium: 4, dolorium: 5, nefastium: 6, protium: 1 };
const CELL_TYPES = new Set(Object.keys(CELL_TYPE_TO_NUM));
const VALVE_IMAGE_MAP = {
  overflow_valve: "valve_1_1",
  topup_valve: "valve_2_1",
  check_valve: "valve_3_1",
};
const FILENAME_PREFIX = { heat_exchanger: "exchanger", heat_inlet: "inlet", heat_outlet: "outlet", reactor_plating: "plating", particle_accelerator: "accelerator" };

export function getPartImagePath({ type, category, level = 1, id = null }) {
  const resolvedCategory = category || (CELL_TYPES.has(type) ? "cell" : type);
  if (resolvedCategory === "cell") {
    const cellType = type === "protium" ? "xcell" : "cell";
    const cellNum = CELL_TYPE_TO_NUM[type] || 1;
    const count = CELL_LEVEL_TILES[level] || 1;
    return `img/parts/${cellType}_${cellNum}_${count}.png`;
  }
  if (resolvedCategory === "valve") {
    const stem = (id && VALVE_IMAGE_MAP[id]) || "valve_1";
    return `img/parts/${stem}.png`;
  }
  const prefix = FILENAME_PREFIX[resolvedCategory] || type;
  return `img/parts/${prefix}_${level}.png`;
}
