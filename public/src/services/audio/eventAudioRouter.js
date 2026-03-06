import { EVENT_TO_EFFECTS } from "./soundProfiles.js";
import { playSoundEffect } from "./audioEffectPlayer.js";

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
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleError(svc, opts) {
  const config = EVENT_TO_EFFECTS.error;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleTabSwitch(svc, opts) {
  const config = EVENT_TO_EFFECTS.tab_switch;
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  if (config.sampleFallback) trySample(svc, config.sampleFallback, opts.category, opts.pan);
}

function handleUiHover(svc, opts) {
  const config = EVENT_TO_EFFECTS.ui_hover;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleSell(svc, opts) {
  const config = EVENT_TO_EFFECTS.sell;
  if (config.duckAmbience) svc._duckAmbience();
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  if (config.sampleFallback) trySample(svc, config.sampleFallback, opts.category, opts.pan);
}

function handlePlacement(svc, opts) {
  const config = EVENT_TO_EFFECTS.placement;
  const { subtype, category, pan } = opts;
  const sampleKey = config.sampleMap?.[subtype] ?? config.sampleMap?.default ?? "placement";
  trySample(svc, sampleKey, category, pan);
}

function handlePurge(svc, opts) {
  const config = EVENT_TO_EFFECTS.purge;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleUpgrade(svc, opts) {
  const config = EVENT_TO_EFFECTS.upgrade;
  trySample(svc, config.sampleKey, opts.category, null);
}

function handleReboot(svc, opts) {
  const config = EVENT_TO_EFFECTS.reboot;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
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
  trySample(svc, config.sampleKey, opts.category, opts.pan);
  if (isMeltdown && config.meltdownSampleKey) {
    trySample(svc, config.meltdownSampleKey, opts.category, opts.pan);
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
  trySample(svc, config.sampleKey, opts.category, opts.pan);
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
