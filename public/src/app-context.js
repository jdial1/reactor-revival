let appContext = null;

export function setAppContext(ctx) {
  appContext = ctx;
}

export function getAppContext() {
  return appContext;
}

export function requireAppContext() {
  if (!appContext) throw new Error("App context not initialized");
  return appContext;
}
