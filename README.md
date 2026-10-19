# Employee Shift Scheduler

A weekly shift scheduler built **twice**: once with a **Python** backend and once with a **JavaScript (Node + Express)** backend, behind one shared **React** frontend. Both backends serve the same REST API and run the same scheduling rules, so the frontend can switch between them and gets the identical schedule from either one.

**Features**

- No login. Each employee searches for their name and enters preferences for the week's 21 shifts (7 days × morning, afternoon, evening).
- Per day: one **preferred** shift (radio button) and any number of **backups** (checkboxes, all equal).
- The page shows who still hasn't submitted. As soon as the last employee saves, the schedule appears.
- Results: the final schedule, how each employee did, and preferred-shift demand vs. capacity.
- A header dropdown switches between the Python and Node backends without restarting anything.
- **Load sample entries** and **Reset** buttons for quick demos.
- Each backend saves its own entries to `data/preferences.json`, so a restart loses nothing.

---

## Install requirements

Install **Node.js 20.19+** (or 22.12+) and **Python 3.8+**.

**macOS** (with [Homebrew](https://brew.sh)):

```bash
brew install node python
```

**Windows** (with winget, in PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
```

Then install the npm packages in one step from the project root:

```bash
./setup.sh
```

The Python backend uses only the standard library, so it needs no `pip install`. (On Windows, run `setup.sh` from Git Bash, or run `npm install` inside `frontend` and `backend-node`.)

---

## How to run

Open **three terminals**, all starting from the project root. Run both backends if you want to switch between them in the page.

### 1. Python backend: port 4001

```bash
cd backend-python
python3 app.py        # Windows: python app.py
# -> "Python backend on http://127.0.0.1:4001  (12 employees)"
```

### 2. Node backend: port 4000

```bash
cd backend-node
npm start
# -> "Node backend on http://127.0.0.1:4000  (12 employees)"
```

### 3. Frontend: port 5173

```bash
cd frontend
npm run dev
# -> open http://localhost:5173
```

Pick the backend in the **Backend** dropdown at the top right. The badge next to it confirms which backend answered. If the chosen backend isn't running, the page says so and shows the command to start it.

---

## How to use

1. Search for a name (or ID) and click it.
2. For each day, pick a **Preferred** shift. Tick **Backup** on any other shifts you'd accept. Leave a day empty for no preference.
3. Click **Save preferences**. The progress panel updates and lists who is still missing.
4. When the 12th employee saves, the schedule appears below. Clicking a name again lets that employee edit; the schedule recomputes.

For a quick demo, click **Load sample entries** (fills all 12 from `shared/sample-preferences.json`), or **Reset** to start over.

---

## How the scheduler works

Rules: one shift per employee per day, at most 5 days per week, and exactly 2 employees per shift.

**Pass 1: preferences, Monday to Sunday.** For each day:
1. **Preferred round.** Everyone gets their preferred shift unless more than 2 people want it (a conflict). The 2 slots then go to the people with the **lowest score so far**, then to people with **no open backup** that day, then a seeded random tie-break.
2. **Backup round.** People who lost a conflict take their least-filled open backup.
3. **Same-day move.** If no backup is open, they take any open shift that day.
4. **Carry.** If the whole day is full, they are carried to the next day and fill a leftover slot there (one day only).

**Pass 2: random fill.** Any shift still under 2 people gets a random employee who isn't working that day and has worked fewer than 5 days.

**Score:** preferred = 2, backup = 1, anything else = 0. The score keeps conflicts fair across people, so the same employee doesn't keep losing.

Both backends use the same seeded random generator (Mulberry32, seed 42), so they produce identical schedules.

---

## Assumptions

- Every shift has exactly 2 employees (the minimum equals the cap), so a week has 42 slots.
- At least ceil(42 / 5) = 9 employees are needed. With fewer, the scheduler returns an error. The roster is fixed at 12 for now.
- Everyone is available all week. A blank day means no preference, not unavailable.
- All users are trusted. Resubmitting overwrites the previous entry.
- Input is cleaned rather than rejected (unknown shifts dropped, duplicate backups removed).

---

## Project structure

```
employee-shift-scheduler/
├── setup.sh
├── shared/
│   ├── roster.json                the 12 employees (ID, first and last name)
│   └── sample-preferences.json    demo entries for all 12
├── backend-python/                port 4001, standard library only
│   ├── app.py                     HTTP server and routes
│   └── scheduler.py               scheduling rules
├── backend-node/                  port 4000, Express
│   ├── server.js
│   └── src/  app.js (routes), store.js (storage), scheduler.js (scheduling rules)
└── frontend/                      React + Vite, port 5173
    └── src/  App.jsx, PreferenceForm.jsx, Results.jsx, api.js, index.css
```

---

## Troubleshooting

- **"Can't reach the … backend"**: that backend isn't running. Start it with the command shown on the page.
- **`python3: command not found` on Windows**: use `python app.py`.
- **Port already in use**: another copy is still running. Stop it with Ctrl+C in its terminal, or start on another port with `PORT=4002 python3 app.py` (the frontend expects 4000 and 4001).
- **Start fresh**: click **Reset**, or delete `backend-python/data/` and `backend-node/data/`.
