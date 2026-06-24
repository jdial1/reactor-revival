export function recordSimEvent(game, event) {
  const st = game?.state;
  if (!st || !Array.isArray(st.sim_event_queue)) return;
  st.sim_event_queue.push(event);
}

export function drainSimEventQueue(game) {
  const st = game?.state;
  if (!st || !Array.isArray(st.sim_event_queue) || !st.sim_event_queue.length) return [];
  return st.sim_event_queue.splice(0, st.sim_event_queue.length);
}
