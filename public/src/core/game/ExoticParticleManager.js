import { toDecimal } from "../../utils/decimal.js";
import { setDecimal } from "../store.js";

function ensureDecimal(v) {
  return (v != null && typeof v.gte === "function") ? v : toDecimal(v ?? 0);
}

export class ExoticParticleManager {
  constructor(game) {
    this.game = game;
    this._exotic_particles = toDecimal(0);
  }

  get total_exotic_particles() {
    return this.game.state.total_exotic_particles ?? toDecimal(0);
  }

  set total_exotic_particles(v) {
    setDecimal(this.game.state, "total_exotic_particles", ensureDecimal(v));
  }

  get exotic_particles() {
    return this._exotic_particles;
  }

  set exotic_particles(v) {
    this._exotic_particles = ensureDecimal(v);
  }

  get current_exotic_particles() {
    return this.game.state.current_exotic_particles;
  }

  set current_exotic_particles(v) {
    setDecimal(this.game.state, "current_exotic_particles", ensureDecimal(v));
  }

  get reality_flux() {
    return this.game.state.reality_flux ?? toDecimal(0);
  }

  set reality_flux(v) {
    setDecimal(this.game.state, "reality_flux", ensureDecimal(v));
  }

  grantCheatExoticParticle(amount = 1) {
    const delta = toDecimal(amount);
    this.game.markCheatsUsed();
    this.exotic_particles = this.exotic_particles.add(delta);
    this.total_exotic_particles = this.total_exotic_particles.add(delta);
    this.current_exotic_particles = this.current_exotic_particles.add(delta);
    this.game.emit("exoticParticlesChanged", {
      exotic_particles: this.exotic_particles,
      current_exotic_particles: this.current_exotic_particles,
      total_exotic_particles: this.total_exotic_particles,
      reality_flux: this.reality_flux
    });
  }
}
