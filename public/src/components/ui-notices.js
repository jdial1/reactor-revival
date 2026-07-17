import { getAppContext } from "../app-context.js";

export const showStatusNotice = ({ tag, body, durationMs = 4500 }) => {
  const uiState = getAppContext()?.ui?.uiState;
  if (!uiState || !body) return;
  uiState.active_notice = { tag, body };
  setTimeout(() => {
    if (uiState.active_notice?.body === body) uiState.active_notice = null;
  }, durationMs);
};
