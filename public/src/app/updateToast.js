import { html, render } from "lit-html";
import { UPDATE_TOAST_STYLES } from "../styles/updateToastStyles.js";

let _toastContainer = null;

function removeExistingUpdateToast() {
  const existing = document.querySelector(".update-toast");
  if (existing) existing.remove();
  if (_toastContainer?.parentNode) _toastContainer.remove();
  _toastContainer = null;
}

const UPDATE_TOAST_AUTO_REMOVE_MS = 10000;
const TOAST_ANIMATION_MS = 300;

function updateToastTemplate(onRefresh, onClose) {
  return html`
    <style>${UPDATE_TOAST_STYLES}</style>
    <div class="update-toast">
      <div class="update-toast-content">
        <div class="update-toast-message">
          <span class="update-toast-text">New content available, click to reload.</span>
        </div>
        <button id="refresh-button" class="update-toast-button" @click=${onRefresh}>Reload</button>
        <button class="update-toast-close" @click=${onClose}>×</button>
      </div>
    </div>
  `;
}

export function showUpdateToast(newVersion, currentVersion) {
  removeExistingUpdateToast();
  _toastContainer = document.createElement("div");
  document.body.appendChild(_toastContainer);

  const onRefresh = () => {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  };
  const onClose = () => {
    const toast = _toastContainer?.querySelector(".update-toast");
    if (toast) {
      toast.style.animation = `toast-slide-up ${TOAST_ANIMATION_MS}ms ease-out reverse`;
      setTimeout(() => removeExistingUpdateToast(), TOAST_ANIMATION_MS);
    }
  };

  render(updateToastTemplate(onRefresh, onClose), _toastContainer);

  setTimeout(() => {
    const toast = _toastContainer?.querySelector(".update-toast");
    if (toast && document.body.contains(toast)) {
      toast.style.animation = `toast-slide-up ${TOAST_ANIMATION_MS}ms ease-out reverse`;
      setTimeout(() => removeExistingUpdateToast(), TOAST_ANIMATION_MS);
    }
  }, UPDATE_TOAST_AUTO_REMOVE_MS);
}

let _swMessageHandler = null;

export function registerServiceWorkerUpdateListener() {
  if (!("serviceWorker" in navigator)) return;
  _swMessageHandler = (event) => {
    if (event?.data?.type === "NEW_VERSION_AVAILABLE") {
      showUpdateToast(event.data.version, event.data.currentVersion);
    }
  };
  navigator.serviceWorker.addEventListener("message", _swMessageHandler);
}

export function unregisterServiceWorkerUpdateListener() {
  if (!("serviceWorker" in navigator) || !_swMessageHandler) return;
  navigator.serviceWorker.removeEventListener("message", _swMessageHandler);
  _swMessageHandler = null;
}
