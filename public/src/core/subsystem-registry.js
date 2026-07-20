const HOOKS = ["init", "onTick", "postTick", "teardown"];

export function createSubsystemRegistry() {
  const entries = new Map();
  return {
    register(name, hooks = {}) {
      if (!name) return;
      const next = { ...hooks };
      for (const key of HOOKS) {
        if (next[key] != null && typeof next[key] !== "function") {
          delete next[key];
        }
      }
      entries.set(name, next);
    },
    unregister(name) {
      entries.delete(name);
    },
    get(name) {
      return entries.get(name) ?? null;
    },
    has(name) {
      return entries.has(name);
    },
    list() {
      return [...entries.keys()];
    },
    run(hook, payload) {
      if (!HOOKS.includes(hook)) return;
      for (const [, entry] of entries) {
        const fn = entry[hook];
        if (typeof fn === "function") fn(payload);
      }
    },
    teardownAll(payload) {
      this.run("teardown", payload);
      entries.clear();
    },
  };
}

export function ensureSubsystemRegistry(game) {
  if (!game) return null;
  if (!game.subsystemRegistry) {
    game.subsystemRegistry = createSubsystemRegistry();
  }
  return game.subsystemRegistry;
}

export function registerSubsystem(game, name, hooks) {
  return ensureSubsystemRegistry(game)?.register(name, hooks);
}

export function runSubsystemHook(game, hook, payload) {
  const registry = game?.subsystemRegistry;
  if (!registry) return;
  registry.run(hook, payload ?? { game });
}

export function teardownAllSubsystems(game) {
  const registry = game?.subsystemRegistry;
  if (!registry) return;
  registry.teardownAll({ game });
}
