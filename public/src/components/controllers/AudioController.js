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
  }

  detach(game) {
    this._unsub.forEach((fn) => { try { fn(); } catch (_) {} });
    this._unsub.length = 0;
    if (game) game.audio = null;
    this._attached = false;
  }
}
