import { subscribeKey, preferences } from "../../store.js";

export class AudioController {
  constructor(api) {
    this.api = api;
    this.unsubs = [];
  }

  attach(game) {
    if (!game || this._attached) return;
    this._attached = true;
    const audio = this.api.getAudioService?.();
    if (audio) game.audio = audio;

    const syncVolumes = () => {
      if (!game.audio) return;
      game.audio.setVolume?.("master", preferences.volumeMaster ?? 1);
      game.audio.setVolume?.("effects", preferences.volumeEffects ?? 1);
      game.audio.setVolume?.("alerts", preferences.volumeAlerts ?? 1);
      game.audio.setVolume?.("system", preferences.volumeSystem ?? 1);
      game.audio.setVolume?.("ambience", preferences.volumeAmbience ?? 1);
      game.audio.toggleMute?.(!!preferences.mute);
    };
    syncVolumes();
    this.unsubs.push(subscribeKey(preferences, "volumeMaster", syncVolumes));
    this.unsubs.push(subscribeKey(preferences, "volumeEffects", syncVolumes));
    this.unsubs.push(subscribeKey(preferences, "volumeAlerts", syncVolumes));
    this.unsubs.push(subscribeKey(preferences, "volumeSystem", syncVolumes));
    this.unsubs.push(subscribeKey(preferences, "volumeAmbience", syncVolumes));
    this.unsubs.push(subscribeKey(preferences, "mute", syncVolumes));

    if (game.state) {
      const syncHeatBalanced = (balanced) => {
        game.audio?.warningManager?.setHeatBalanced?.(!!balanced);
      };
      this.unsubs.push(subscribeKey(game.state, "heat_balanced", syncHeatBalanced));
      syncHeatBalanced(game.state.heat_balanced);

      const syncAmbience = () => {
        const vc = game.state.active_vent_count ?? 0;
        const ec = game.state.active_exchanger_count ?? 0;
        game.audio?.industrialManager?.scheduleIndustrialAmbience(vc, ec);
      };
      this.unsubs.push(subscribeKey(game.state, "active_vent_count", syncAmbience));
      this.unsubs.push(subscribeKey(game.state, "active_exchanger_count", syncAmbience));
      syncAmbience();
    }
  }

  detach(game) {
    this.unsubs.forEach((unsubscribe) => { try { unsubscribe(); } catch (_) {} });
    this.unsubs.length = 0;
    if (game) game.audio = null;
    this._attached = false;
  }
}
