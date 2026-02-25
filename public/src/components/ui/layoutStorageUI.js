import { StorageUtils } from "../../utils/util.js";

const MY_LAYOUTS_STORAGE_KEY = 'reactor_my_layouts';

export class LayoutStorageUI {
  constructor(ui) {
    this.ui = ui;
  }

  static get MY_LAYOUTS_STORAGE_KEY() {
    return MY_LAYOUTS_STORAGE_KEY;
  }

  getMyLayouts() {
    try {
      const arr = StorageUtils.get(MY_LAYOUTS_STORAGE_KEY);
      if (!arr) return [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  saveMyLayouts(layouts) {
    StorageUtils.set(MY_LAYOUTS_STORAGE_KEY, layouts);
  }

  addToMyLayouts(name, data) {
    const list = this.getMyLayouts();
    list.unshift({
      id: String(Date.now()),
      name: name || `Layout ${list.length + 1}`,
      data,
      createdAt: Date.now()
    });
    this.saveMyLayouts(list);
  }

  removeFromMyLayouts(id) {
    const list = this.getMyLayouts().filter((e) => e.id !== id);
    this.saveMyLayouts(list);
  }
}
