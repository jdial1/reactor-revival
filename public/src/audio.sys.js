import { subscribe } from "valtio/vanilla";
import { preferences } from "./store.js";

export function attachAudioSys(getAudioService, getGame) {
  const unsubs = [];
  unsubs.push(
    subscribe(preferences, () => {
      const audio = getAudioService();
      if (audio && audio._isInitialized && typeof audio._loadVolumeSettings === "function") {
        audio._loadVolumeSettings();
      }
    })
  );
  return () => {
    for (const u of unsubs) {
      try {
        u();
      } catch (_) {}
    }
  };
}
