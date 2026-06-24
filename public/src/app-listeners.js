const _appUnsubs = [];

export function pushAppUnsub(unsub) {
  _appUnsubs.push(unsub);
}

export function teardownAppListeners() {
  while (_appUnsubs.length) {
    const fn = _appUnsubs.pop();
    try { fn(); } catch (_) {}
  }
}
