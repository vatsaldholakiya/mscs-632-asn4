import { useState } from "react";
import { DAYS, SHIFTS } from "./api.js";

const DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// One row per day, one column per shift: a radio for the preferred shift and a checkbox for backups.
export default function PreferenceForm({ employee, initial, saving, onSave, onCancel }) {
  const [prefs, setPrefs] = useState(() => {
    const start = {};
    for (const d of DAYS) start[d] = { preferred: initial[d]?.preferred ?? null, backups: initial[d]?.backups ?? [] };
    return start;
  });

  function choosePreferred(day, shift) {
    setPrefs((p) => ({ ...p, [day]: { preferred: shift, backups: p[day].backups.filter((b) => b !== shift) } }));
  }

  function toggleBackup(day, shift) {
    setPrefs((p) => {
      const has = p[day].backups.includes(shift);
      const backups = has ? p[day].backups.filter((b) => b !== shift) : [...p[day].backups, shift];
      return { ...p, [day]: { ...p[day], backups } };
    });
  }

  function clearDay(day) {
    setPrefs((p) => ({ ...p, [day]: { preferred: null, backups: [] } }));
  }

  function submit(e) {
    e.preventDefault();
    const out = {};
    for (const d of DAYS) if (prefs[d].preferred) out[d] = prefs[d];
    onSave(out);
  }

  const filledDays = DAYS.filter((d) => prefs[d].preferred).length;

  return (
    <form className="pref-form" onSubmit={submit}>
      <div className="pref-form-head">
        <div>
          <h3>{employee.firstName} {employee.lastName}</h3>
          <span className="muted mono">{employee.id}</span>
        </div>
        <button type="button" className="link" onClick={onCancel}>Change name</button>
      </div>
      <p className="muted small">
        Pick one preferred shift per day. Tick any backups you'd also accept; backups count equally.
        Leave a day empty if you have no preference.
      </p>

      <div className="frame">
        <table className="grid">
          <thead>
            <tr>
              <th>Day</th>
              {SHIFTS.map((s) => (
                <th key={s}><span className={`dot ${s}`} />{cap(s)}</th>
              ))}
              <th aria-label="Clear" />
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d) => (
              <tr key={d} className={prefs[d].preferred ? "filled" : ""}>
                <td className="day">{DAY_NAMES[d]}</td>
                {SHIFTS.map((s) => {
                  const isPreferred = prefs[d].preferred === s;
                  const backupDisabled = !prefs[d].preferred || isPreferred;
                  return (
                    <td key={s} className={`cell ${isPreferred ? `chosen ${s}` : ""}`}>
                      <label className="opt">
                        <input type="radio" name={`pref-${d}`} id={`pref-${d}-${s}`}
                          checked={isPreferred} onChange={() => choosePreferred(d, s)} />
                        Preferred
                      </label>
                      <label className={`opt ${backupDisabled ? "disabled" : ""}`}>
                        <input type="checkbox" id={`backup-${d}-${s}`} disabled={backupDisabled}
                          checked={prefs[d].backups.includes(s)} onChange={() => toggleBackup(d, s)} />
                        Backup
                      </label>
                    </td>
                  );
                })}
                <td>
                  {prefs[d].preferred && (
                    <button type="button" className="link small" onClick={() => clearDay(d)}>Clear</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-foot">
        <span className="muted small">
          {filledDays === 0
            ? "No days chosen: you'll only be placed where a shift needs people."
            : `${filledDays} of 7 days chosen. You work at most 5 days.`}
        </span>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </form>
  );
}
