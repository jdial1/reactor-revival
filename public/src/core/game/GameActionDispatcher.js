import { GameActionSchema, ACTION_SCHEMA_REGISTRY } from "../schemas.js";

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
  const actionResult = GameActionSchema.safeParse(action);
  if (!actionResult.success) return null;
  const { type, payload = {} } = actionResult.data;
  const schema = ACTION_SCHEMA_REGISTRY[type];
  const payloadResult = schema ? schema.safeParse(payload) : { success: true, data: payload };
  if (!payloadResult.success) return null;
  const handler = ACTION_HANDLERS[type];
  if (!handler) return null;
  return handler(game, payloadResult.data);
}
