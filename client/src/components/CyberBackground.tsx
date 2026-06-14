// Page-level animated cyan conic gradient + faint grid. One animation total —
// motion reads in the gutters and header, never through the opaque cards.
// All styling lives in index.css (.cyber-bg + ::before/::after).
export function CyberBackground() {
  return <div className="cyber-bg" aria-hidden="true" />;
}
