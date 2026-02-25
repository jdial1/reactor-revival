export function getPannedDest(svc, categoryGain, pan, usePanner = true) {
  if (pan === null || pan === undefined || !usePanner || !svc.context?.createStereoPanner) return categoryGain;
  const p = svc.context.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(categoryGain);
  return p;
}
