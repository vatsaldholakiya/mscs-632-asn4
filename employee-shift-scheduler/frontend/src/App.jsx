import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BACKENDS, OfflineError, makeApi } from "./api.js";
import PreferenceForm from "./PreferenceForm.jsx";
import Results from "./Results.jsx";

function savedBackend() {
  try {
    const v = localStorage.getItem("backend");
    return BACKENDS[v] ? v : "python";
  } catch {
    return "python";
  }
}

export default function App() {
  const [backendKey, setBackendKey] = useState(savedBackend);
  const backend = BACKENDS[backendKey];
  const api = useMemo(() => makeApi(backend.url), [backend.url]);

  const [meta, setMeta] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // { employee, initial }
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const resultsRef = useRef(null);
  const wasComplete = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, emps, st] = await Promise.all([api.meta(), api.employees(), api.status()]);
      setMeta(m);
      setEmployees(emps);
      setStatus(st);
      wasComplete.current = st.complete;
      setOffline(false);
    } catch (e) {
      setMeta(null);
      setStatus(null);
      setEmployees([]);
      if (e instanceof OfflineError) setOffline(true);
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    setSelected(null);
    setToast("");
    load();
  }, [load]);

  function switchBackend(key) {
    setBackendKey(key);
    try {
      localStorage.setItem("backend", key);
    } catch {
      /* remembering the choice is optional */
    }
  }

  // Keep the "submitted" flags in sync with the status the backend just returned.
  function applyStatus(st) {
    const pendingIds = new Set(st.pending.map((p) => p.id));
    setEmployees((list) => list.map((e) => ({ ...e, submitted: !pendingIds.has(e.id) })));
    setStatus(st);
    if (st.complete && !wasComplete.current) {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
    wasComplete.current = st.complete;
  }

  async function run(action) {
    setError("");
    try {
      return await action();
    } catch (e) {
      if (e instanceof OfflineError) setOffline(true);
      else setError(e.message);
      return null;
    }
  }

  async function pick(employee) {
    const res = await run(() => api.getPreferences(employee.id));
    if (res) setSelected({ employee, initial: res.preferences || {} });
  }

  async function save(preferences) {
    setSaving(true);
    const st = await run(() => api.savePreferences(selected.employee.id, preferences));
    setSaving(false);
    if (!st) return;
    const who = `${selected.employee.firstName} ${selected.employee.lastName}`;
    setToast(st.complete ? `Saved ${who}. Everyone is in, so the schedule is ready below.` : `Saved ${who}. ${st.submitted} of ${st.total} submitted.`);
    setSelected(null);
    setQuery("");
    applyStatus(st);
  }

  async function demo(kind) {
    setBusy(true);
    const st = await run(() => (kind === "sample" ? api.loadSample() : api.reset()));
    setBusy(false);
    if (!st) return;
    setSelected(null);
    setToast(kind === "sample" ? "Loaded sample entries for all employees." : "Cleared all entries.");
    applyStatus(st);
  }

  const q = query.trim().toLowerCase();
  const matches = employees.filter(
    (e) => !q || `${e.firstName} ${e.lastName} ${e.id}`.toLowerCase().includes(q)
  );
  const pct = status ? Math.round((status.submitted / status.total) * 100) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Shift Scheduler</h1>
          <span className="muted small">7 days · 3 shifts · 2 people per shift</span>
        </div>
        <div className="backend-switch">
          <label htmlFor="backend">Backend</label>
          <select id="backend" value={backendKey} onChange={(e) => switchBackend(e.target.value)}>
            {Object.entries(BACKENDS).map(([k, b]) => (
              <option key={k} value={k}>{b.label} ({b.url.split(":").pop()})</option>
            ))}
          </select>
          <span className={`badge ${offline ? "down" : meta ? "up" : ""}`}>
            <span className="led" />
            {offline ? "Not running" : meta ? `Served by ${meta.backend}` : "Connecting…"}
          </span>
        </div>
      </header>

      <main className="content">
        {offline && (
          <div className="banner error">
            <div>
              <strong>Can't reach the {backend.label} backend at {backend.url}.</strong>
              <div className="small">
                Start it in a terminal: <code>{backend.start}</code>
                {backendKey === "python" && <> (on Windows: <code>python app.py</code>)</>}
              </div>
            </div>
            <button type="button" onClick={load}>Try again</button>
          </div>
        )}
        {error && <div className="banner error">{error}</div>}
        {toast && !offline && <div className="banner ok">{toast}</div>}

        {!offline && status && (
          <div className="layout">
            <section className="card entry">
              <h2>Enter your preferences</h2>
              {selected ? (
                <PreferenceForm
                  key={selected.employee.id}
                  employee={selected.employee}
                  initial={selected.initial}
                  saving={saving}
                  onSave={save}
                  onCancel={() => setSelected(null)}
                />
              ) : (
                <>
                  <input
                    id="search"
                    className="search"
                    type="search"
                    placeholder="Search your name or ID"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <ul className="names">
                    {matches.map((e) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => pick(e)}>
                          <span>{e.firstName} {e.lastName}</span>
                          <span className="mono muted small">{e.id}</span>
                          {e.submitted && <span className="tick">Submitted · edit</span>}
                        </button>
                      </li>
                    ))}
                    {matches.length === 0 && <li className="muted small">No employee matches "{query}".</li>}
                  </ul>
                </>
              )}
            </section>

            <aside className="card progress">
              <h2>Progress</h2>
              <div className="count">
                <strong>{status.submitted}</strong> of {status.total} submitted
              </div>
              <div className="bar"><span style={{ width: `${pct}%` }} /></div>
              {status.pending.length > 0 ? (
                <>
                  <h3>Still waiting on</h3>
                  <ul className="pending">
                    {status.pending.map((p) => (
                      <li key={p.id}>{p.firstName} {p.lastName} <span className="mono muted small">{p.id}</span></li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="small">Everyone has submitted. The schedule is below.</p>
              )}
              <div className="demo">
                <h3>Demo</h3>
                <div className="demo-buttons">
                  <button type="button" onClick={() => demo("sample")} disabled={busy}>Load sample entries</button>
                  <button type="button" onClick={() => demo("reset")} disabled={busy}>Reset</button>
                </div>
                <p className="muted small">Each backend keeps its own entries.</p>
              </div>
            </aside>
          </div>
        )}

        {!offline && loading && !status && <p className="muted">Loading…</p>}

        {!offline && status?.complete && status.result && (
          <div ref={resultsRef}>
            <Results result={status.result} backendLabel={meta?.backend ?? backend.label} />
          </div>
        )}
      </main>
    </div>
  );
}
