import { get, set } from "../storage/idb-keyval.js";

const OUTBOX_KEY = "reactor_network_outbox_v1";

function serializeOutboxRows(rows) {
  return JSON.parse(JSON.stringify(rows, (_key, value) => {
    if (value != null && typeof value.toNumber === "function") {
      try {
        return value.toNumber();
      } catch {
        return Number(value) || 0;
      }
    }
    return value;
  }));
}

export async function outboxReadAll() {
  return (await get(OUTBOX_KEY)) || [];
}

async function outboxWriteAll(rows) {
  await set(OUTBOX_KEY, serializeOutboxRows(rows));
}

export async function outboxEnqueue(record) {
  const rows = await outboxReadAll();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  rows.push({ id, attempts: 0, nextRetryAt: 0, ...record });
  await outboxWriteAll(rows);
  return id;
}

export async function outboxRemoveById(id) {
  const rows = (await outboxReadAll()).filter((r) => r.id !== id);
  await outboxWriteAll(rows);
}

export async function outboxUpdateById(id, patch) {
  const rows = await outboxReadAll();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return;
  rows[i] = { ...rows[i], ...patch };
  await outboxWriteAll(rows);
}

export async function outboxPeekReady(nowMs = Date.now()) {
  const rows = await outboxReadAll();
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i].nextRetryAt ?? 0) <= nowMs) return rows[i];
  }
  return null;
}
