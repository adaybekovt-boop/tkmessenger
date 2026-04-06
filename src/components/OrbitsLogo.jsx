import { useState } from 'react';

export default function OrbitsLogo({ className = '', variant = 'inline' }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className={`${variant === 'stack' ? 'flex flex-col items-center gap-2' : 'inline-flex items-center gap-2'} ${className}`.trim()}>
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/70 shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] ring-1 ring-[rgb(var(--orb-border-rgb))] overflow-hidden">
        {imgOk ? (
          <img
            src="./orbits-logo.svg"
            alt="ORBITS P2P"
            className="h-7 w-7"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="h-4 w-4 rotate-45 rounded-[8px] bg-[rgb(var(--orb-accent-rgb))] opacity-90" />
        )}
      </div>
      <div className={variant === 'stack' ? 'text-center leading-tight' : 'leading-tight'}>
        <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">ORBITS P2P</div>
        <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Децентрализованный мессенджер</div>
      </div>
    </div>
  );
}
