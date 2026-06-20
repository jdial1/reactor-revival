import { subscribe } from "valtio/vanilla";
import { subscribeKey } from "valtio/vanilla/utils";
import { preferences } from "./store.js";

function syncAmbienceHeatFromState(getAudioService, game) {
  const audio = getAudioService();
  if (!audio?.ambienceManager || !game?.state) return;
  const st = game.state;
  const heat =
    typeof st.current_heat?.toNumber === "function"
      ? st.current_heat.toNumber()
      : Number(st.current_heat) || 0;
  const mh = st.max_heat;
  const maxHeat =
    typeof mh === "object" && mh != null && typeof mh.toNumber === "function"
      ? mh.toNumber()
      : Number(mh) || 0;
  audio.ambienceManager.updateAmbienceHeat(heat, maxHeat);
}

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
  if (typeof getGame === "function") {
    let heatUnsub = null;
    const wireHeat = () => {
      if (heatUnsub) {
        try {
          heatUnsub();
        } catch (_) {}
        heatUnsub = null;
      }
      const game = getGame();
      if (!game?.state) return;
      const run = () => syncAmbienceHeatFromState(getAudioService, game);
      run();
      heatUnsub = subscribeKey(game.state, "heat_ratio", run);
    };
    wireHeat();
    unsubs.push(() => {
      if (heatUnsub) {
        try {
          heatUnsub();
        } catch (_) {}
        heatUnsub = null;
      }
    });
  }
  return () => {
    for (const u of unsubs) {
      try {
        u();
      } catch (_) {}
    }
  };
}
