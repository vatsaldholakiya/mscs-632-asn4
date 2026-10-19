import { DAYS, SHIFTS } from "./api.js";

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const HOW_LABEL = {
  preferred: "Preferred",
  backup: "Backup",
  moved: "Moved",
  carried: "Carried",
  random: "Random",
};
const HOW_HELP = {
  preferred: "got their preferred shift",
  backup: "got one of their backups",
  moved: "preferred shift was full, moved to another shift the same day",
  carried: "the day was full, carried to the next day",
  random: "added at random so the shift has 2 people",
};

function DemandCell({ n, cap: limit }) {
  let cls = "fit", tag = "fits";
  if (n > limit) { cls = "over"; tag = `+${n - limit} over`; }
  else if (n < limit) { cls = "short"; tag = `${limit - n} short`; }
  return (
    <td className={`demand-cell ${cls}`}>
      <span className="n">{n}</span>
      <span className="tag">{tag}</span>
    </td>
  );
}

export default function Results({ result, backendLabel }) {
  if (result.error) {
    return <div className="banner error">{result.error}</div>;
  }
  const { demand, schedule, summary, warnings, seed } = result;

  return (
    <div className="results">
      <section className="card">
        <div className="sec-head">
          <h2>Final schedule</h2>
          <span className="muted small">Computed by the {backendLabel} backend · seed {seed}</span>
        </div>
        <div className="legend">
          {Object.keys(HOW_LABEL).map((k) => (
            <span key={k} title={HOW_HELP[k]}><span className={`how ${k}`}>{HOW_LABEL[k]}</span> {HOW_HELP[k]}</span>
          ))}
        </div>
        <div className="frame">
          <table className="schedule">
            <thead>
              <tr>
                <th>Day</th>
                {SHIFTS.map((s) => <th key={s}><span className={`dot ${s}`} />{cap(s)}</th>)}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <td className="day">{d}</td>
                  {SHIFTS.map((s) => (
                    <td key={s}>
                      <div className="people">
                        {schedule[d][s].map((a) => (
                          <span key={a.id} className="person" title={`${a.id}: ${HOW_HELP[a.how]}`}>
                            {a.firstName} {a.lastName[0]}.
                            <span className={`how ${a.how}`}>{HOW_LABEL[a.how]}</span>
                          </span>
                        ))}
                        {schedule[d][s].length < 2 && <span className="person missing">Unfilled</span>}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {warnings.length > 0 && (
          <div className="notes">
            <h3>Notes</h3>
            <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
      </section>

      <section className="card">
        <div className="sec-head">
          <h2>How each employee did</h2>
          <span className="muted small">Score: preferred = 2, backup = 1, anything else = 0</span>
        </div>
        <div className="frame">
          <table className="summary">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th className="num">Days chosen</th>
                <th className="num">Preferred</th><th className="num">Backup</th><th className="num">Moved</th>
                <th className="num">Carried</th><th className="num">Random</th>
                <th className="num">Days worked</th><th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.id}>
                  <td className="mono muted">{r.id}</td>
                  <td>{r.firstName} {r.lastName}</td>
                  <td className="num">{r.requested}</td>
                  <td className="num">{r.preferred}</td>
                  <td className="num">{r.backup}</td>
                  <td className="num">{r.moved}</td>
                  <td className="num">{r.carried}</td>
                  <td className="num">{r.random}</td>
                  <td className="num">{r.daysWorked} / 5</td>
                  <td className="num strong">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="sec-head">
          <h2>Preferred-shift demand vs. capacity</h2>
          <span className="muted small">How many picked each shift as preferred, against the cap of 2. "Days listed" is against 6 slots per day.</span>
        </div>
        <div className="frame">
          <table className="demand">
            <thead>
              <tr>
                <th>Day</th>
                {SHIFTS.map((s) => <th key={s}><span className={`dot ${s}`} />{cap(s)}</th>)}
                <th>Days listed</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <td className="day">{d}</td>
                  {SHIFTS.map((s) => <DemandCell key={s} n={demand[d][s]} cap={2} />)}
                  <DemandCell n={demand[d].listed} cap={6} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
