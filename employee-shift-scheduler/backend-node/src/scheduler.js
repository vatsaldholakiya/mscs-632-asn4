// Weekly shift scheduler (JavaScript implementation).
//
// Rules (same as the Python backend, step for step):
//   * One shift per employee per day, at most 5 days per week.
//   * Exactly 2 employees per shift (cap = minimum = 2).
//   * Pass 1 walks Mon -> Sun: preferred round, backup round, same-day move,
//     then employees carried in from the previous day.
//   * Pass 2 randomly fills any shift that is still short.
//   * A seeded random generator (Mulberry32) makes the output reproducible and
//     identical to the Python backend.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const SHIFTS = ["morning", "afternoon", "evening"];
export const CAP = 2;
export const MIN_PER_SHIFT = 2;
export const MAX_DAYS = 5;
export const MIN_EMPLOYEES = Math.ceil((MIN_PER_SHIFT * SHIFTS.length * DAYS.length) / MAX_DAYS); // 9
const POINTS = { preferred: 2, backup: 1 };
const HOW_KINDS = ["preferred", "backup", "moved", "carried", "random"];

// Small seeded random generator; produces the same numbers as the Python version.
class Mulberry32 {
  constructor(seed) {
    this.state = seed >>> 0;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  randInt(n) {
    return Math.floor(this.next() * n);
  }
  shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.randInt(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

// Clean one employee's weekly preferences instead of rejecting bad input.
export function normalizePreferences(raw) {
  const clean = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;
  for (const day of DAYS) {
    const entry = raw[day];
    if (!entry || typeof entry !== "object") continue;
    const preferred = SHIFTS.includes(entry.preferred) ? entry.preferred : null;
    const rawBackups = Array.isArray(entry.backups) ? entry.backups : [];
    // Keep shift order, drop duplicates, unknown names and the preferred shift.
    const backups = SHIFTS.filter((s) => rawBackups.includes(s) && s !== preferred);
    if (preferred === null && backups.length === 0) continue; // no preference that day
    clean[day] = { preferred, backups };
  }
  return clean;
}

const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Return the weekly schedule, or { error } when headcount is too low.
export function buildSchedule(roster, preferences, seed) {
  if (roster.length < MIN_EMPLOYEES) {
    return { error: `Need at least ${MIN_EMPLOYEES} employees, have ${roster.length}` };
  }

  const rng = new Mulberry32(seed);
  const people = Object.fromEntries(roster.map((e) => [e.id, e]));
  const ids = Object.keys(people).sort(byId);
  const prefs = Object.fromEntries(ids.map((i) => [i, preferences[i] || {}]));

  const schedule = Object.fromEntries(DAYS.map((d) => [d, Object.fromEntries(SHIFTS.map((s) => [s, []]))]));
  const working = Object.fromEntries(DAYS.map((d) => [d, new Set()]));
  const daysWorked = Object.fromEntries(ids.map((i) => [i, 0]));
  const score = Object.fromEntries(ids.map((i) => [i, 0]));
  const tally = Object.fromEntries(ids.map((i) => [i, Object.fromEntries(HOW_KINDS.map((k) => [k, 0]))]));
  const warnings = [];

  const name = (i) => `${people[i].firstName} ${people[i].lastName}`;
  const eligible = (i, day) => !working[day].has(i) && daysWorked[i] < MAX_DAYS;
  const hasRoom = (day, shift) => schedule[day][shift].length < CAP;

  function assign(i, day, shift, how) {
    schedule[day][shift].push({ id: i, how });
    working[day].add(i);
    daysWorked[i] += 1;
    score[i] += POINTS[how] || 0;
    tally[i][how] += 1;
  }

  function leastFilled(day, options) {
    const open = SHIFTS.filter((s) => options.includes(s) && hasRoom(day, s));
    if (open.length === 0) return null;
    const fewest = Math.min(...open.map((s) => schedule[day][s].length));
    const tied = open.filter((s) => schedule[day][s].length === fewest);
    if (tied.length === 1) return tied[0];
    return tied[rng.randInt(tied.length)];
  }

  function hasOpenBackup(i, day) {
    const entry = prefs[i][day];
    if (!entry) return false;
    return entry.backups.some((b) => hasRoom(day, b));
  }

  // Shuffle breaks ties; then lowest score first, then people with no open backup.
  function priorityOrder(group, day) {
    const ordered = rng.shuffle([...group].sort(byId));
    const key = Object.fromEntries(ordered.map((i) => [i, [score[i], hasOpenBackup(i, day) ? 1 : 0]]));
    return ordered.sort((a, b) => key[a][0] - key[b][0] || key[a][1] - key[b][1]); // stable sort
  }

  // ---------- Pass 1: preferences, day by day ----------
  let carryIn = [];
  DAYS.forEach((day, di) => {
    const isLastDay = di === DAYS.length - 1;
    const pool = [];

    // Round 1: preferred shift.
    for (const shift of SHIFTS) {
      const wanters = ids.filter((i) => prefs[i][day] && prefs[i][day].preferred === shift && eligible(i, day));
      const slots = CAP - schedule[day][shift].length;
      if (wanters.length <= slots) {
        for (const i of wanters) assign(i, day, shift, "preferred");
      } else {
        // Conflict: more people want this shift than it can hold.
        const ordered = priorityOrder(wanters, day);
        for (const i of ordered.slice(0, slots)) assign(i, day, shift, "preferred");
        pool.push(...ordered.slice(slots));
      }
    }

    // Employees who only ticked backups for this day join the backup round.
    for (const i of ids) {
      const entry = prefs[i][day];
      if (entry && entry.preferred === null && entry.backups.length > 0 && eligible(i, day)) pool.push(i);
    }

    // Round 2: backups. Round 3: any open shift the same day, else carry.
    const nextCarry = [];
    if (pool.length > 0) {
      const leftovers = [];
      for (const i of priorityOrder(pool, day)) {
        const shift = leastFilled(day, prefs[i][day].backups);
        if (shift) assign(i, day, shift, "backup");
        else leftovers.push(i);
      }
      for (const i of leftovers) {
        const shift = leastFilled(day, SHIFTS);
        if (shift) assign(i, day, shift, "moved");
        else if (isLastDay) warnings.push(`${name(i)} could not be placed on ${day} (week ends)`);
        else nextCarry.push(i);
      }
    }

    // Round 4: employees carried in from the previous day (one day only).
    for (const i of carryIn) {
      if (!eligible(i, day)) continue; // already working today through their own preference
      const shift = leastFilled(day, SHIFTS);
      if (shift) assign(i, day, shift, "carried");
      else warnings.push(`${name(i)} was carried to ${day}, but ${day} is full`);
    }

    carryIn = nextCarry;
  });

  // ---------- Pass 2: random fill for short shifts ----------
  for (const day of DAYS) {
    for (const shift of SHIFTS) {
      while (schedule[day][shift].length < MIN_PER_SHIFT) {
        const candidates = ids.filter((i) => eligible(i, day));
        if (candidates.length === 0) {
          warnings.push(`${day} ${shift} has ${schedule[day][shift].length} of ${MIN_PER_SHIFT}: no eligible employee left`);
          break;
        }
        assign(candidates[rng.randInt(candidates.length)], day, shift, "random");
      }
    }
  }

  // ---------- Build the response ----------
  const demand = {};
  for (const day of DAYS) {
    const row = {};
    for (const s of SHIFTS) row[s] = ids.filter((i) => prefs[i][day] && prefs[i][day].preferred === s).length;
    row.listed = ids.filter((i) => prefs[i][day]).length;
    demand[day] = row;
  }

  const namedSchedule = {};
  for (const day of DAYS) {
    namedSchedule[day] = {};
    for (const shift of SHIFTS) {
      namedSchedule[day][shift] = schedule[day][shift].map((a) => ({
        id: a.id,
        firstName: people[a.id].firstName,
        lastName: people[a.id].lastName,
        how: a.how,
      }));
    }
  }

  const summary = ids.map((i) => ({
    id: i,
    firstName: people[i].firstName,
    lastName: people[i].lastName,
    requested: Object.keys(prefs[i]).length,
    ...tally[i],
    daysWorked: daysWorked[i],
    score: score[i],
  }));

  return { seed, demand, schedule: namedSchedule, summary, warnings };
}
