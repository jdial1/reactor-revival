import {
  MOBILE_BREAKPOINT_PX,
  BASE_COLS_MOBILE,
  BASE_COLS_DESKTOP,
  BASE_ROWS_MOBILE,
  BASE_ROWS_DESKTOP,
} from "../constants.js";

export function calculateBaseDimensions() {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
  return {
    base_cols: isMobile ? BASE_COLS_MOBILE : BASE_COLS_DESKTOP,
    base_rows: isMobile ? BASE_ROWS_MOBILE : BASE_ROWS_DESKTOP,
  };
}
