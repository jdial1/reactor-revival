const ACTION_HANDLERS = {
  sell: (g) => { g.sell_action(); },
  manualReduceHeat: (g) => { g.manual_reduce_heat_action(); },
  pause: (g) => { g.pause(); },
  resume: (g) => { g.resume(); },
  togglePause: (g) => { g.togglePause(); },
  rebootKeepEp: (g) => g.rebootActionKeepExoticParticles(),
  rebootDiscardEp: (g) => g.rebootActionDiscardExoticParticles(),
  reboot: (g) => g.reboot(),
  sellPart: (g, p) => { g.sellPart(p.tile); },
  pasteLayout: (g, p) => { g.action_pasteLayout(p.layout, p.options || {}); },
};

export function executeAction(game, action) {
  const { type, payload = {} } = action;
  const handler = ACTION_HANDLERS[type];
  if (!handler) return null;
  return handler(game, payload);
}
