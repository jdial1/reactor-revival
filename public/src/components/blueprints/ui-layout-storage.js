import { StorageUtils } from "../../storage/index.js";

export const MY_LAYOUTS_STORAGE_KEY = "reactor_my_layouts";

export function getMyLayouts() {
  try {
    const arr = StorageUtils.get(MY_LAYOUTS_STORAGE_KEY);
    if (!arr) return [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveMyLayouts(layouts) {
  StorageUtils.set(MY_LAYOUTS_STORAGE_KEY, layouts);
}

export function addToMyLayouts(name, data) {
  const list = getMyLayouts();
  list.unshift({
    id: String(Date.now()),
    name: name || `Layout ${list.length + 1}`,
    data,
    createdAt: Date.now(),
  });
  saveMyLayouts(list);
}

export function saveRecoveredBlueprint(data) {
  const recoveredName = "Recovered Blueprint";
  const list = getMyLayouts();
  const existing = list.findIndex((entry) => entry.name === recoveredName);
  const entry = {
    id: existing >= 0 ? list[existing].id : String(Date.now()),
    name: recoveredName,
    data,
    createdAt: Date.now(),
  };
  if (existing >= 0) list[existing] = entry;
  else list.unshift(entry);
  saveMyLayouts(list);
}

export function removeFromMyLayouts(id) {
  const list = getMyLayouts().filter((e) => e.id !== id);
  saveMyLayouts(list);
}
