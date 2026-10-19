// Both backends serve the same API on different ports. The header dropdown picks one.
export const BACKENDS = {
  python: { label: "Python", url: "http://127.0.0.1:4001", start: "cd backend-python && python3 app.py" },
  node: { label: "Node", url: "http://127.0.0.1:4000", start: "cd backend-node && npm start" },
};

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const SHIFTS = ["morning", "afternoon", "evening"];

export class OfflineError extends Error {}

// Thin fetch wrapper bound to one backend's base URL.
export function makeApi(base) {
  async function http(path, options = {}) {
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        headers: { "content-type": "application/json" },
        ...options,
      });
    } catch {
      throw new OfflineError(`Can't reach ${base}`);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }

  return {
    meta: () => http("/meta"),
    employees: () => http("/employees"),
    status: () => http("/status"),
    getPreferences: (id) => http(`/employees/${id}/preferences`),
    savePreferences: (id, preferences) =>
      http(`/employees/${id}/preferences`, { method: "PUT", body: JSON.stringify({ preferences }) }),
    loadSample: () => http("/demo/sample", { method: "POST" }),
    reset: () => http("/demo/reset", { method: "POST" }),
  };
}
