export default function OrbitsLogo({ className = '' }) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <div className="h-8 w-8 rounded-xl bg-obsidian-surface shadow-glow ring-1 ring-obsidian-border grid place-items-center">
        <div className="h-3.5 w-3.5 rotate-45 rounded-[6px] bg-obsidian-accent opacity-90" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-obsidian-text">Orbits Titan</div>
        <div className="text-[11px] text-obsidian-muted">Phase 1</div>
      </div>
    </div>
  );
}

