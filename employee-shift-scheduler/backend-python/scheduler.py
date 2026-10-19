"""Weekly shift scheduler (Python implementation).

Rules (same as the Node backend, step for step):
  * One shift per employee per day, at most 5 days per week.
  * Exactly 2 employees per shift (cap = minimum = 2).
  * Pass 1 walks Mon -> Sun: preferred round, backup round, same-day move,
    then employees carried in from the previous day.
  * Pass 2 randomly fills any shift that is still short.
  * A seeded random generator (Mulberry32) makes the output reproducible and
    identical to the Node backend.
"""

import math

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
SHIFTS = ["morning", "afternoon", "evening"]
CAP = 2
MIN_PER_SHIFT = 2
MAX_DAYS = 5
MIN_EMPLOYEES = math.ceil(MIN_PER_SHIFT * len(SHIFTS) * len(DAYS) / MAX_DAYS)  # 9
POINTS = {"preferred": 2, "backup": 1}
HOW_KINDS = ["preferred", "backup", "moved", "carried", "random"]

MASK32 = 0xFFFFFFFF


class Mulberry32:
    """Small seeded random generator; produces the same numbers as the JS version."""

    def __init__(self, seed):
        self.state = seed & MASK32

    def next(self):
        self.state = (self.state + 0x6D2B79F5) & MASK32
        t = self.state
        t = ((t ^ (t >> 15)) * (t | 1)) & MASK32
        t = (t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & MASK32)) & MASK32)) & MASK32
        return ((t ^ (t >> 14)) & MASK32) / 4294967296

    def rand_int(self, n):
        return math.floor(self.next() * n)

    def shuffle(self, items):
        for i in range(len(items) - 1, 0, -1):
            j = self.rand_int(i + 1)
            items[i], items[j] = items[j], items[i]
        return items


def normalize_preferences(raw):
    """Clean one employee's weekly preferences instead of rejecting bad input."""
    clean = {}
    if not isinstance(raw, dict):
        return clean
    for day in DAYS:
        entry = raw.get(day)
        if not isinstance(entry, dict):
            continue
        preferred = entry.get("preferred")
        if preferred not in SHIFTS:
            preferred = None
        raw_backups = entry.get("backups")
        if not isinstance(raw_backups, list):
            raw_backups = []
        # Keep shift order, drop duplicates, unknown names and the preferred shift.
        backups = [s for s in SHIFTS if s in raw_backups and s != preferred]
        if preferred is None and not backups:
            continue  # no preference that day
        clean[day] = {"preferred": preferred, "backups": backups}
    return clean


def build_schedule(roster, preferences, seed):
    """Return the weekly schedule, or {"error": ...} when headcount is too low."""
    if len(roster) < MIN_EMPLOYEES:
        return {"error": f"Need at least {MIN_EMPLOYEES} employees, have {len(roster)}"}

    rng = Mulberry32(seed)
    people = {e["id"]: e for e in roster}
    ids = sorted(people)
    prefs = {i: preferences.get(i, {}) for i in ids}

    schedule = {d: {s: [] for s in SHIFTS} for d in DAYS}
    working = {d: set() for d in DAYS}
    days_worked = {i: 0 for i in ids}
    score = {i: 0 for i in ids}
    tally = {i: {k: 0 for k in HOW_KINDS} for i in ids}
    warnings = []

    def name(i):
        return f"{people[i]['firstName']} {people[i]['lastName']}"

    def eligible(i, day):
        return i not in working[day] and days_worked[i] < MAX_DAYS

    def has_room(day, shift):
        return len(schedule[day][shift]) < CAP

    def assign(i, day, shift, how):
        schedule[day][shift].append({"id": i, "how": how})
        working[day].add(i)
        days_worked[i] += 1
        score[i] += POINTS.get(how, 0)
        tally[i][how] += 1

    def least_filled(day, options):
        open_shifts = [s for s in SHIFTS if s in options and has_room(day, s)]
        if not open_shifts:
            return None
        fewest = min(len(schedule[day][s]) for s in open_shifts)
        tied = [s for s in open_shifts if len(schedule[day][s]) == fewest]
        if len(tied) == 1:
            return tied[0]
        return tied[rng.rand_int(len(tied))]

    def has_open_backup(i, day):
        entry = prefs[i].get(day)
        if entry is None:
            return False
        return any(has_room(day, b) for b in entry["backups"])

    def priority_order(group, day):
        # Shuffle breaks ties; then lowest score first, then people with no open backup.
        ordered = rng.shuffle(sorted(group))
        return sorted(ordered, key=lambda i: (score[i], 1 if has_open_backup(i, day) else 0))

    # ---------- Pass 1: preferences, day by day ----------
    carry_in = []
    for di, day in enumerate(DAYS):
        is_last_day = di == len(DAYS) - 1
        pool = []

        # Round 1: preferred shift.
        for shift in SHIFTS:
            wanters = [i for i in ids
                       if day in prefs[i] and prefs[i][day]["preferred"] == shift and eligible(i, day)]
            slots = CAP - len(schedule[day][shift])
            if len(wanters) <= slots:
                for i in wanters:
                    assign(i, day, shift, "preferred")
            else:
                # Conflict: more people want this shift than it can hold.
                ordered = priority_order(wanters, day)
                for i in ordered[:slots]:
                    assign(i, day, shift, "preferred")
                pool.extend(ordered[slots:])

        # Employees who only ticked backups for this day join the backup round.
        for i in ids:
            entry = prefs[i].get(day)
            if entry and entry["preferred"] is None and entry["backups"] and eligible(i, day):
                pool.append(i)

        # Round 2: backups. Round 3: any open shift the same day, else carry.
        next_carry = []
        if pool:
            leftovers = []
            for i in priority_order(pool, day):
                shift = least_filled(day, prefs[i][day]["backups"])
                if shift:
                    assign(i, day, shift, "backup")
                else:
                    leftovers.append(i)
            for i in leftovers:
                shift = least_filled(day, SHIFTS)
                if shift:
                    assign(i, day, shift, "moved")
                elif is_last_day:
                    warnings.append(f"{name(i)} could not be placed on {day} (week ends)")
                else:
                    next_carry.append(i)

        # Round 4: employees carried in from the previous day (one day only).
        for i in carry_in:
            if not eligible(i, day):
                continue  # already working today through their own preference
            shift = least_filled(day, SHIFTS)
            if shift:
                assign(i, day, shift, "carried")
            else:
                warnings.append(f"{name(i)} was carried to {day}, but {day} is full")

        carry_in = next_carry

    # ---------- Pass 2: random fill for short shifts ----------
    for day in DAYS:
        for shift in SHIFTS:
            while len(schedule[day][shift]) < MIN_PER_SHIFT:
                candidates = [i for i in ids if eligible(i, day)]
                if not candidates:
                    warnings.append(f"{day} {shift} has {len(schedule[day][shift])} of "
                                    f"{MIN_PER_SHIFT}: no eligible employee left")
                    break
                assign(candidates[rng.rand_int(len(candidates))], day, shift, "random")

    # ---------- Build the response ----------
    demand = {}
    for day in DAYS:
        row = {s: sum(1 for i in ids if day in prefs[i] and prefs[i][day]["preferred"] == s)
               for s in SHIFTS}
        row["listed"] = sum(1 for i in ids if day in prefs[i])
        demand[day] = row

    named_schedule = {
        day: {
            shift: [{"id": a["id"], "firstName": people[a["id"]]["firstName"],
                     "lastName": people[a["id"]]["lastName"], "how": a["how"]}
                    for a in schedule[day][shift]]
            for shift in SHIFTS
        }
        for day in DAYS
    }

    summary = []
    for i in ids:
        row = {"id": i, "firstName": people[i]["firstName"], "lastName": people[i]["lastName"],
               "requested": len(prefs[i])}
        row.update(tally[i])
        row["daysWorked"] = days_worked[i]
        row["score"] = score[i]
        summary.append(row)

    return {"seed": seed, "demand": demand, "schedule": named_schedule,
            "summary": summary, "warnings": warnings}
