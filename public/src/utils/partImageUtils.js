const CELL_LEVEL_TILES = { 1: 1, 2: 2, 3: 4 };

const CELL_TYPE_TO_NUM = {
  uranium: 1, plutonium: 2, thorium: 3,
  seaborgium: 4, dolorium: 5, nefastium: 6,
  protium: 1,
};

const CELL_TYPES = new Set(Object.keys(CELL_TYPE_TO_NUM));

const VALVE_IMAGE_MAP = {
  overflow_valve: "valve_1_1", overflow_valve2: "valve_1_2",
  overflow_valve3: "valve_1_3", overflow_valve4: "valve_1_4",
  topup_valve: "valve_2_1", topup_valve2: "valve_2_2",
  topup_valve3: "valve_2_3", topup_valve4: "valve_2_4",
  check_valve: "valve_3_1", check_valve2: "valve_3_2",
  check_valve3: "valve_3_3", check_valve4: "valve_3_4",
};

const CATEGORY_FOLDERS = {
  cell: "cells",
  reflector: "reflectors",
  capacitor: "capacitors",
  vent: "vents",
  heat_exchanger: "exchangers",
  heat_inlet: "inlets",
  heat_outlet: "outlets",
  coolant_cell: "coolants",
  reactor_plating: "platings",
  particle_accelerator: "accelerators",
  accelerator: "accelerators",
  valve: "valves",
};

const FILENAME_PREFIX = {
  heat_exchanger: "exchanger",
  heat_inlet: "inlet",
  heat_outlet: "outlet",
  reactor_plating: "plating",
  particle_accelerator: "accelerator",
};

export function getPartImagePath({ type, category, level = 1, id = null }) {
  const resolvedCategory = category || (CELL_TYPES.has(type) ? "cell" : type);
  const folder = CATEGORY_FOLDERS[resolvedCategory] || resolvedCategory;

  if (resolvedCategory === "cell") {
    const cellType = type === "protium" ? "xcell" : "cell";
    const cellNum = CELL_TYPE_TO_NUM[type] || 1;
    const count = CELL_LEVEL_TILES[level] || 1;
    return `img/parts/${folder}/${cellType}_${cellNum}_${count}.png`;
  }

  if (resolvedCategory === "valve") {
    const filename = (id && VALVE_IMAGE_MAP[id]) || "valve_1";
    return `img/parts/${folder}/${filename}.png`;
  }

  const prefix = FILENAME_PREFIX[resolvedCategory] || type;
  return `img/parts/${folder}/${prefix}_${level}.png`;
}
