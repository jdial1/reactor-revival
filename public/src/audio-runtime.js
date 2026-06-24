const audioContextByService = new WeakMap();
const audioContextById = new Map();
const audioServicesById = new Map();
const audioNodesById = new Map();
const uiBuffersById = new Map();
const industrialBuffersById = new Map();
const ambienceBuffersById = new Map();
let nextAudioServiceId = 1;

export function createUiBufferStore() {
  return {
    click: null,
    placement: null,
    placement_cell: null,
    placement_plating: null,
    upgrade: null,
    error: null,
    sell: null,
    tab_switch: null,
    explosion: null,
    meltdown: null,
    depletion: null,
    reboot: null,
    ep_spark: null,
  };
}

export function createIndustrialBufferStore() {
  return { metal_clank: null, steam_hiss: null };
}

export function registerAudioService(service) {
  const id = nextAudioServiceId++;
  service._audioServiceId = id;
  audioServicesById.set(id, service);
  uiBuffersById.set(id, createUiBufferStore());
  industrialBuffersById.set(id, createIndustrialBufferStore());
  ambienceBuffersById.set(id, []);
  return id;
}

export function ensureAudioNodes(service) {
  const resolved = resolveAudioService(service);
  if (!resolved?._audioServiceId) return {};
  let nodes = audioNodesById.get(resolved._audioServiceId);
  if (!nodes) {
    nodes = {
      masterGain: null,
      effectsGain: null,
      alertsGain: null,
      systemGain: null,
      ambienceGain: null,
      ambienceDuckGain: null,
      researchEpHum: null,
    };
    audioNodesById.set(resolved._audioServiceId, nodes);
  }
  return nodes;
}

export function getUiBuffers(service) {
  const resolved = resolveAudioService(service);
  if (!resolved) return null;
  const id = resolved._audioServiceId;
  if (id == null) return resolved._uiBuffers ?? null;
  let store = uiBuffersById.get(id);
  if (!store) {
    store = createUiBufferStore();
    uiBuffersById.set(id, store);
  }
  return store;
}

export function setUiBuffers(service, value) {
  const id = service?._audioServiceId;
  if (id != null && value) uiBuffersById.set(id, value);
}

export function getIndustrialBuffers(service) {
  const resolved = resolveAudioService(service);
  if (!resolved) return null;
  const id = resolved._audioServiceId;
  if (id == null) return resolved._industrialBuffers ?? null;
  let store = industrialBuffersById.get(id);
  if (!store) {
    store = createIndustrialBufferStore();
    industrialBuffersById.set(id, store);
  }
  return store;
}

export function getAmbienceBuffers(service) {
  const resolved = resolveAudioService(service);
  if (!resolved) return null;
  const id = resolved._audioServiceId;
  if (id == null) return resolved._ambienceBuffers ?? null;
  let store = ambienceBuffersById.get(id);
  if (!store) {
    store = [];
    ambienceBuffersById.set(id, store);
  }
  return store;
}

export function setAmbienceBuffers(service, value) {
  const id = service?._audioServiceId;
  if (id != null) ambienceBuffersById.set(id, value);
}

export function getAudioContext(service) {
  const resolved = resolveAudioService(service);
  if (!resolved) return null;
  const id = resolved._audioServiceId;
  const ctx =
    (id != null ? audioContextById.get(id) : null) ??
    audioContextByService.get(resolved) ??
    resolved._contextStore ??
    null;
  if (!ctx) return null;
  try {
    void ctx.state;
  } catch {
    return null;
  }
  return ctx;
}

export function getServiceAudioContext(service) {
  return audioContextByService.get(service) ?? service?._contextStore ?? null;
}

export function setServiceAudioContext(service, value) {
  if (!service) return;
  service._contextStore = value;
  if (value) {
    audioContextByService.set(service, value);
    if (service._audioServiceId != null) audioContextById.set(service._audioServiceId, value);
  } else {
    audioContextByService.delete(service);
    if (service._audioServiceId != null) audioContextById.delete(service._audioServiceId);
  }
}

export function resolveAudioService(service) {
  if (!service) return null;
  const id = service._audioServiceId;
  if (id != null) {
    const registered = audioServicesById.get(id);
    if (registered) return registered;
  }
  return service;
}
