import { AUDIO_SPECS } from "./audioConfig.js";
import { EVENT_TO_EFFECTS } from "./soundProfiles.js";
import { playSoundEffect } from "./audioEffectPlayer.js";

const P = AUDIO_SPECS.placement;
const E = AUDIO_SPECS.explosion;

function trySample(svc, sampleKey, category, pan) {
  const buf = svc._uiBuffers?.[sampleKey];
  if (buf) {
    svc._playSample(sampleKey, category, pan);
    return true;
  }
  return false;
}

function handleClick(svc, opts) {
  const config = EVENT_TO_EFFECTS.click;
  if (config.duckAmbience) svc._duckAmbience();
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  playSoundEffect(svc, "click_osc", opts, opts);
  playSoundEffect(svc, "click_spring", opts, opts);
}

function handleError(svc, opts) {
  const config = EVENT_TO_EFFECTS.error;
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  playSoundEffect(svc, "error_osc", opts, opts);
}

function handleTabSwitch(svc, opts) {
  const config = EVENT_TO_EFFECTS.tab_switch;
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  if (config.sampleFallback && trySample(svc, config.sampleFallback, opts.category, opts.pan)) return;
  playSoundEffect(svc, "tab_switch_osc", opts, opts);
}

function handleUiHover(svc, opts) {
  const config = EVENT_TO_EFFECTS.ui_hover;
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  playSoundEffect(svc, "ui_hover_flyback", opts, opts);
  playSoundEffect(svc, "ui_hover_static", opts, opts);
}

function handleSell(svc, opts) {
  const config = EVENT_TO_EFFECTS.sell;
  if (config.duckAmbience) svc._duckAmbience();
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  if (config.sampleFallback && trySample(svc, config.sampleFallback, opts.category, opts.pan)) return;
  playSoundEffect(svc, "sell_osc", opts, opts);
}

function handlePlacement(svc, opts) {
  const config = EVENT_TO_EFFECTS.placement;
  const { subtype, category, pan, spatialOpts } = opts;
  const sampleKey = config.sampleMap?.[subtype] ?? config.sampleMap?.default ?? "placement";
  if (trySample(svc, sampleKey, category, pan)) return;
  const thud = playSoundEffect(svc, "placement_thud", opts, opts);
  playSoundEffect(svc, "placement_click", opts, opts);
  if (subtype === "cell") {
    playSoundEffect(svc, "placement_cell_osc", opts, opts);
  } else if (subtype === "plating") {
    if (thud?.gain) thud.gain.gain.setValueAtTime(P.platingGain, opts.t + P.thudRampTimeS);
    playSoundEffect(svc, "placement_plating_osc", opts, opts);
  } else if (subtype === "vent") {
    if (thud?.gain) thud.gain.gain.linearRampToValueAtTime(P.ventGain, opts.t + P.thudRampTimeS);
    playSoundEffect(svc, "placement_vent_noise", opts, opts);
  }
}

function handlePurge(svc, opts) {
  const config = EVENT_TO_EFFECTS.purge;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleUpgrade(svc, opts) {
  const config = EVENT_TO_EFFECTS.upgrade;
  if (trySample(svc, config.sampleKey, opts.category, null)) return;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleReboot(svc, opts) {
  const config = EVENT_TO_EFFECTS.reboot;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleObjective(svc, opts) {
  const config = EVENT_TO_EFFECTS.objective;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleSave(svc, opts) {
  const config = EVENT_TO_EFFECTS.save;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleExplosion(svc, opts) {
  const config = EVENT_TO_EFFECTS.explosion;
  const { param, now } = opts;
  const isMeltdown = opts.subtype === "meltdown" || param === "meltdown";
  if (config.throttle && !isMeltdown && now - svc._lastExplosionTime < svc._config.explosionInterval) return;
  svc._lastExplosionTime = now;
  const execOpts = {
    ...opts,
    masterVol: isMeltdown ? E.masterVolMeltdown : E.masterVolNormal,
    usePanner: !isMeltdown,
    hissDuration: isMeltdown ? E.meltdownHissDurationS : E.hissDurationS,
    debrisCount: isMeltdown ? E.meltdownDebrisCount : E.debrisCount,
  };
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, execOpts));
  if (isMeltdown && config.meltdownEffects) {
    config.meltdownEffects.forEach((id) => playSoundEffect(svc, id, opts, opts));
  }
}

function handleFlux(svc, opts) {
  const config = EVENT_TO_EFFECTS.flux;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleComponentOverheat(svc, opts) {
  const config = EVENT_TO_EFFECTS.component_overheat;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleDepletion(svc, opts) {
  const config = EVENT_TO_EFFECTS.depletion;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleWarning(svc, opts) {
  const intensity = opts.intensity ?? 0.5;
  svc.warningManager.startWarningLoop(intensity);
}

const EVENT_HANDLERS = {
  click: handleClick,
  error: handleError,
  tab_switch: handleTabSwitch,
  ui_hover: handleUiHover,
  sell: handleSell,
  placement: handlePlacement,
  purge: handlePurge,
  upgrade: handleUpgrade,
  reboot: handleReboot,
  objective: handleObjective,
  save: handleSave,
  explosion: handleExplosion,
  flux: handleFlux,
  component_overheat: handleComponentOverheat,
  depletion: handleDepletion,
  warning: handleWarning,
};

export function handleAudioEvent(svc, eventType, context, options = {}) {
  const handler = EVENT_HANDLERS[eventType];
  if (handler) {
    const merged = { ...context, ...options };
    handler(svc, merged);
  }
}
