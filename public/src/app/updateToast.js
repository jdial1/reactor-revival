import { UPDATE_TOAST_STYLES } from "../styles/updateToastStyles.js";

function removeExistingUpdateToast() {
  const existingToast = document.querySelector(".update-toast");
  if (existingToast) existingToast.remove();
}

function createUpdateToastElement() {
  const toast = document.createElement("div");
  toast.className = "update-toast";
  toast.innerHTML = `
    <div class="update-toast-content">
      <div class="update-toast-message">
        <span class="update-toast-text">New content available, click to reload.</span>
      </div>
      <button id="refresh-button" class="update-toast-button">Reload</button>
      <button class="update-toast-close" onclick="this.closest('.update-toast').remove()">×</button>
    </div>
  `;
  return toast;
}

function injectUpdateToastStyles() {
  if (document.querySelector("#update-toast-styles")) return;
  const style = document.createElement("style");
  style.id = "update-toast-styles";
  style.textContent = UPDATE_TOAST_STYLES;
  document.head.appendChild(style);
}

function attachUpdateToastRefreshHandler(toast) {
  const refreshButton = toast.querySelector("#refresh-button");
  refreshButton.addEventListener("click", () => {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  });
}

const UPDATE_TOAST_AUTO_REMOVE_MS = 10000;
const TOAST_ANIMATION_MS = 300;

function scheduleUpdateToastAutoRemove(toast) {
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.animation = `toast-slide-up ${TOAST_ANIMATION_MS}ms ease-out reverse`;
      setTimeout(() => {
        if (document.body.contains(toast)) toast.remove();
      }, TOAST_ANIMATION_MS);
    }
  }, UPDATE_TOAST_AUTO_REMOVE_MS);
}

export function showUpdateToast(newVersion, currentVersion) {
  removeExistingUpdateToast();
  const toast = createUpdateToastElement();
  injectUpdateToastStyles();
  document.body.appendChild(toast);
  attachUpdateToastRefreshHandler(toast);
  scheduleUpdateToastAutoRemove(toast);
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
