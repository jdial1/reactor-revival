export {
  StorageAdapter,
  AUTOSAVE_SLOT_KEY,
  migrateLocalStorageToIndexedDB,
  rotateSlot1ToBackup,
  getBackupSaveForSlot1Async,
  setSlot1FromBackupAsync,
  serializeSave,
  deserializeSave,
} from "./adapter.js";
export { StorageUtils, STORAGE_KEYS } from "./local.js";
