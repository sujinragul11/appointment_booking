/** KPI stat tile: sentence-case label, value (proportional figures), optional sub line. */
export default function StatTile({ label, value, sub, tone, icon }) {
  return (
    <div className={`pp-tile${tone ? ` pp-tile-${tone}` : ''}`}>
      <span className="pp-tile-label">
        {icon ? <span className="pp-tile-ico" aria-hidden="true">{icon}</span> : null}
        {label}
      </span>
      <span className="pp-tile-value">{value}</span>
      {sub ? <span className="pp-tile-sub">{sub}</span> : null}
    </div>
  );
}

/** Row of tiles; `label` names the group for assistive tech. */
export function StatRow({ label, children }) {
  return (
    <div className="pp-tiles" role="group" aria-label={label}>
      {children}
    </div>
  );
}
