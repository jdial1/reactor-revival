import { subscribeKey } from "../../core/store.js";
import { preferences } from "../../core/preferencesStore.js";

export class AudioController {
  constructor(api) {
    this.api = api;
    this._unsub = [];
  }

  attach(game) {
    if (!game || this._attached) return;
    this._attached = true;
    const audio = this.api.getAudioService?.();
    if (audio) game.audio = audio;
    const onPartPlaced = () => game.audio?.trigger?.("placement");
    if (game.on) {
      game.on("partPlaced", onPartPlaced);
      this._unsub.push(() => game.off?.("partPlaced", onPartPlaced));
    }
    const ui = this.api.getUI?.();
    if (ui?.uiState && game.audio) {
      ui.uiState.audio_muted = !!preferences.mute;
      ui.uiState.volume_master = preferences.volumeMaster ?? 1;
      ui.uiState.volume_effects = preferences.volumeEffects ?? 1;
      ui.uiState.volume_alerts = preferences.volumeAlerts ?? 1;
      ui.uiState.volume_system = preferences.volumeSystem ?? 1;
      ui.uiState.volume_ambience = preferences.volumeAmbience ?? 1;
      const volumeKeys = ["volume_master", "volume_effects", "volume_alerts", "volume_system", "volume_ambience"];
      const prefMap = { volume_master: "volumeMaster", volume_effects: "volumeEffects", volume_alerts: "volumeAlerts", volume_system: "volumeSystem", volume_ambience: "volumeAmbience" };
      const audioMap = { volume_master: "master", volume_effects: "effects", volume_alerts: "alerts", volume_system: "system", volume_ambience: "ambience" };
      volumeKeys.forEach((k) => {
        this._unsub.push(subscribeKey(ui.uiState, k, () => {
          const v = ui.uiState[k];
          if (v != null && preferences) preferences[prefMap[k]] = v;
          game.audio?.setVolume?.(audioMap[k], v ?? 1);
        }));
      });
      this._unsub.push(subscribeKey(ui.uiState, "audio_muted", () => {
        game.audio?.toggleMute?.(ui.uiState.audio_muted);
        if (preferences) preferences.mute = ui.uiState.audio_muted;
      }));
    }
  }

  detach(game) {
    this._unsub.forEach((fn) => { try { fn(); } catch (_) {} });
    this._unsub.length = 0;
    if (game) game.audio = null;
    this._attached = false;
  }
}
