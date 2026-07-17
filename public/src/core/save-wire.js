import { getDecimal } from "../simUtils.js";

function isDecimal(value) {
  const Decimal = getDecimal();
  return value instanceof Decimal;
}

function pathJoin(base, key) {
  return base ? `${base}.${key}` : String(key);
}

function transformOut(value, path, values) {
  if (typeof value === "bigint") {
    values[path || ""] = [["bigint"]];
    return value.toString();
  }
  if (isDecimal(value)) {
    values[path || ""] = [["custom", "Decimal"]];
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => transformOut(item, pathJoin(path, i), values));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = transformOut(value[key], pathJoin(path, key), values);
    }
    return out;
  }
  return value;
}

function getAtPath(root, path) {
  if (!path) return root;
  const parts = path.split(".");
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function setAtPath(root, path, value) {
  if (!path) return value;
  const parts = path.split(".");
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] == null) cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

function transformIn(json, values) {
  if (!values || typeof values !== "object") return json;
  const Decimal = getDecimal();
  let data = json;
  for (const [path, tags] of Object.entries(values)) {
    if (!Array.isArray(tags)) continue;
    const raw = getAtPath(data, path);
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      if (!Array.isArray(tag)) continue;
      if (tag[0] === "custom" && tag[1] === "Decimal") {
        data = setAtPath(data, path, new Decimal(raw));
      } else if (tag[0] === "bigint") {
        data = setAtPath(data, path, BigInt(raw));
      }
    }
  }
  return data;
}

export function superjsonStringify(obj) {
  const values = {};
  const json = transformOut(obj, "", values);
  if (Object.keys(values).length === 0) return JSON.stringify(json);
  return JSON.stringify({ json, meta: { values, v: 1 } });
}

export function superjsonParse(str) {
  const parsed = JSON.parse(str);
  if (parsed && typeof parsed === "object" && "json" in parsed && "meta" in parsed) {
    return transformIn(parsed.json, parsed.meta?.values);
  }
  return parsed;
}
