import { BASE_COLS_DESKTOP, BASE_ROWS_DESKTOP } from "../utils.js";

export const SAVE_FORMAT_VERSION = 2;

export function validateSaveForRead(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Save invalid");
  const fmt = raw.save_format_version;
  const save_format_version = typeof fmt === "number" ? fmt : SAVE_FORMAT_VERSION;
  if (save_format_version !== SAVE_FORMAT_VERSION) throw new Error("Unsupported save version");
  const base_rows =
    typeof raw.base_rows === "number"
      ? raw.base_rows
      : typeof raw.rows === "number"
        ? raw.rows
        : BASE_ROWS_DESKTOP;
  const base_cols =
    typeof raw.base_cols === "number"
      ? raw.base_cols
      : typeof raw.cols === "number"
        ? raw.cols
        : BASE_COLS_DESKTOP;
  return { ...raw, save_format_version, base_rows, base_cols };
}

export function validateSaveForWrite(data) {
  return validateSaveForRead(data);
}

export function tryValidateSaveForStorage(parsed) {
  try {
    return validateSaveForRead(parsed);
  } catch {
    return null;
  }
}
