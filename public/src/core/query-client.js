const store = new Map();

function keyOf(queryKey) {
  return JSON.stringify(queryKey);
}

function matchesPrefix(storedKey, queryKey) {
  let parsed;
  try {
    parsed = JSON.parse(storedKey);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed) || parsed.length < queryKey.length) return false;
  for (let i = 0; i < queryKey.length; i++) {
    if (parsed[i] !== queryKey[i]) return false;
  }
  return true;
}

export class QueryClient {
  constructor(options = {}) {
    this.defaultOptions = options.defaultOptions ?? {};
  }

  async fetchQuery({ queryKey, queryFn, staleTime, retry }) {
    const defaults = this.defaultOptions.queries ?? {};
    const ttl = staleTime ?? defaults.staleTime ?? 0;
    const retries = retry ?? defaults.retry ?? 0;
    const key = keyOf(queryKey);
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.data;

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await queryFn();
        store.set(key, { data, at: Date.now() });
        return data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  getQueryData(queryKey) {
    return store.get(keyOf(queryKey))?.data;
  }

  invalidateQueries({ queryKey }) {
    if (!queryKey) {
      store.clear();
      return;
    }
    for (const key of [...store.keys()]) {
      if (matchesPrefix(key, queryKey)) store.delete(key);
    }
  }
}
