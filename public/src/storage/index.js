export {
  StorageAdapter,
  AUTOSAVE_SLOT_KEY,
  migrateLocalStorageToIndexedDB,
  getBackupSaveForSlot1,
  setSlot1FromBackup,
  rotateSlot1ToBackup,
  getBackupSaveForSlot1Async,
  setSlot1FromBackupAsync,
  serializeSave,
  deserializeSave,
} from "./adapter.js";
export { StorageUtils, STORAGE_KEYS } from "./local.js";
export { USER_PREF_KEYS, getPref, setPref } from "./prefs.js";
