"""Python backend: plain standard library, no packages to install.

Run:  python3 app.py      (Windows: python app.py)
Serves the same REST API as the Node backend, on port 4001.
"""

import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from scheduler import build_schedule, normalize_preferences

PORT = int(os.environ.get("PORT", 4001))
SEED = 42
BACKEND_NAME = "Python"

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(HERE, "..", "shared")
DATA_DIR = os.path.join(HERE, "data")
DATA_FILE = os.path.join(DATA_DIR, "preferences.json")


def read_json(path, fallback):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return fallback


ROSTER = sorted(read_json(os.path.join(SHARED, "roster.json"), []), key=lambda e: e["id"])
ROSTER_BY_ID = {e["id"]: e for e in ROSTER}


class Store:
    """Preferences per employee ID, saved to data/preferences.json after every change."""

    def __init__(self):
        self.lock = threading.Lock()
        saved = read_json(DATA_FILE, {})
        self.prefs = {i: normalize_preferences(p) for i, p in saved.items() if i in ROSTER_BY_ID}

    def _save(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.prefs, f, indent=2)
        os.replace(tmp, DATA_FILE)  # atomic swap, so a crash never leaves half a file

    def put(self, emp_id, raw):
        with self.lock:
            self.prefs[emp_id] = normalize_preferences(raw)
            self._save()

    def load_sample(self):
        sample = read_json(os.path.join(SHARED, "sample-preferences.json"), {})
        with self.lock:
            self.prefs = {i: normalize_preferences(sample.get(i, {})) for i in ROSTER_BY_ID}
            self._save()

    def reset(self):
        with self.lock:
            self.prefs = {}
            self._save()

    def status(self):
        with self.lock:
            prefs = dict(self.prefs)
        pending = [e for e in ROSTER if e["id"] not in prefs]
        complete = len(ROSTER) > 0 and not pending
        return {
            "total": len(ROSTER),
            "submitted": len(ROSTER) - len(pending),
            "pending": pending,
            "complete": complete,
            "result": build_schedule(ROSTER, prefs, SEED) if complete else None,
        }


store = Store()

PREFS_PATH = re.compile(r"^/employees/([^/]+)/preferences$")


class Handler(BaseHTTPRequestHandler):
    # ---- helpers ----
    def _send(self, code, body=None):
        payload = b"" if body is None else json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if body is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            return {}

    def _path(self):
        return self.path.split("?", 1)[0].rstrip("/") or "/"

    def log_message(self, fmt, *args):
        print(f"[python] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")

    # ---- routes ----
    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        path = self._path()
        if path == "/meta":
            self._send(200, {"backend": BACKEND_NAME})
        elif path == "/employees":
            prefs = store.prefs
            self._send(200, [dict(e, submitted=e["id"] in prefs) for e in ROSTER])
        elif path == "/status":
            self._send(200, store.status())
        elif PREFS_PATH.match(path):
            emp_id = PREFS_PATH.match(path).group(1)
            if emp_id not in ROSTER_BY_ID:
                self._send(404, {"error": f"Unknown employee {emp_id}"})
            else:
                self._send(200, {"id": emp_id, "preferences": store.prefs.get(emp_id, {})})
        else:
            self._send(404, {"error": "Not found"})

    def do_PUT(self):
        match = PREFS_PATH.match(self._path())
        if not match:
            self._send(404, {"error": "Not found"})
            return
        emp_id = match.group(1)
        if emp_id not in ROSTER_BY_ID:
            self._send(404, {"error": f"Unknown employee {emp_id}"})
            return
        store.put(emp_id, self._body().get("preferences", {}))
        self._send(200, store.status())

    def do_POST(self):
        path = self._path()
        if path == "/demo/sample":
            store.load_sample()
            self._send(200, store.status())
        elif path == "/demo/reset":
            store.reset()
            self._send(200, store.status())
        else:
            self._send(404, {"error": "Not found"})


if __name__ == "__main__":
    if not ROSTER:
        print("Could not read shared/roster.json. Run this from the backend-python folder of the project.")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Python backend on http://127.0.0.1:{PORT}  ({len(ROSTER)} employees)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
