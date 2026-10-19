// Preferences per employee ID, saved to data/preferences.json after every change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchedule, normalizePreferences } from "./scheduler.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.join(HERE, "..", "..", "shared");
const DATA_DIR = path.join(HERE, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "preferences.json");
export const SEED = 42;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

export const ROSTER = readJson(path.join(SHARED, "roster.json"), []).sort((a, b) => (a.id < b.id ? -1 : 1));
const ROSTER_IDS = new Set(ROSTER.map((e) => e.id));

let prefs = {};
const saved = readJson(DATA_FILE, {});
for (const [id, p] of Object.entries(saved)) {
  if (ROSTER_IDS.has(id)) prefs[id] = normalizePreferences(p);
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(prefs, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic swap, so a crash never leaves half a file
}

export const store = {
  isKnown: (id) => ROSTER_IDS.has(id),
  submitted: (id) => id in prefs,
  get: (id) => prefs[id] || {},
  put(id, raw) {
    prefs[id] = normalizePreferences(raw);
    save();
  },
  loadSample() {
    const sample = readJson(path.join(SHARED, "sample-preferences.json"), {});
    prefs = {};
    for (const id of ROSTER_IDS) prefs[id] = normalizePreferences(sample[id] || {});
    save();
  },
  reset() {
    prefs = {};
    save();
  },
  status() {
    const pending = ROSTER.filter((e) => !(e.id in prefs));
    const complete = ROSTER.length > 0 && pending.length === 0;
    return {
      total: ROSTER.length,
      submitted: ROSTER.length - pending.length,
      pending,
      complete,
      result: complete ? buildSchedule(ROSTER, prefs, SEED) : null,
    };
  },
};
