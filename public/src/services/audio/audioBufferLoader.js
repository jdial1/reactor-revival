import { getResourceUrl, isTestEnv } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { runWithConcurrencyLimit } from "../../utils/concurrencyLimit.js";

const AUDIO_LOAD_CONCURRENCY = 6;

async function loadUrlMapInto(svc, urlMap, target) {
  const tasks = Object.entries(urlMap).map(([key, url]) => async () => {
    try {
      const r = await fetch(url);
      const ab = await r.arrayBuffer();
      target[key] = await svc.context.decodeAudioData(ab);
    } catch (e) {
      logger.log('warn', 'audio', 'Audio load failed', url, e);
    }
  });
  await runWithConcurrencyLimit(tasks, AUDIO_LOAD_CONCURRENCY);
}

async function loadAmbienceLayers(svc, base) {
  const layerUrls = [base + 'ambience_low.mp3', base + 'ambience_medium.mp3', base + 'ambience_high.mp3'];
  const results = await Promise.allSettled(
    layerUrls.map(async (url) => {
      try {
        const r = await fetch(url);
        const ab = await r.arrayBuffer();
        return await svc.context.decodeAudioData(ab);
      } catch (e) {
        logger.log('warn', 'audio', 'Ambience load failed', url, e);
        return null;
      }
    })
  );
  return results.map((p) => (p.status === 'fulfilled' ? p.value : null));
}

function shouldRestartAmbience(svc) {
  return svc._ambienceBuffers.length >= 3 && svc._ambienceBuffers.every(Boolean) &&
    svc.enabled && svc.ambienceGain?.gain.value > 0 && svc.ambienceManager.hasActiveAmbience();
}

export async function loadSampleBuffers(svc) {
  if (!svc.context || isTestEnv()) return;
  const base = getResourceUrl('audio/');
  const uiUrls = {
    click: base + 'ui_click.mp3',
    placement: base + 'placement.mp3',
    placement_cell: base + 'placement_cell.mp3',
    placement_plating: base + 'placement_plating.mp3',
    upgrade: base + 'upgrade.mp3',
    error: base + 'error.mp3',
    sell: base + 'sell.mp3',
    tab_switch: base + 'tab_switch.mp3',
    explosion: base + 'explosion.mp3',
    meltdown: base + 'meltdown.mp3',
    depletion: base + 'depletion.mp3',
    reboot: base + 'reboot.mp3'
  };
  const industrialUrls = { metal_clank: base + 'metal_clank.mp3', steam_hiss: base + 'steam_hiss.mp3' };
  const [, , ambienceResults] = await Promise.all([
    loadUrlMapInto(svc, uiUrls, svc._uiBuffers),
    loadUrlMapInto(svc, industrialUrls, svc._industrialBuffers),
    loadAmbienceLayers(svc, base),
  ]);
  svc._ambienceBuffers.push(...ambienceResults);
  if (shouldRestartAmbience(svc)) {
    svc.ambienceManager.stopAmbience();
    svc.ambienceManager.startAmbience();
  }
}
