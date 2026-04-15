import { useState } from 'react';

export default function OrbitsLogo({ className = '', variant = 'inline', showText = true }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className={`${variant === 'stack' ? 'flex flex-col items-center gap-2' : 'inline-flex items-center gap-2'} ${className}`.trim()}>
      <div className="grid h-10 w-10 place-items-center rounded-2xl orb-gradient shadow-lg shadow-indigo-500/20 overflow-hidden">
        {imgOk ? (
          <img
            src="./orbits-logo.svg"
            alt="ORBITS P2P"
            className="h-7 w-7"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="h-4 w-4 rotate-45 rounded-[8px] bg-white/90" />
        )}
      </div>
      {showText ? (
        <div className={variant === 'stack' ? 'text-center leading-tight' : 'leading-tight'}>
          <div className="text-sm font-semibold orb-gradient-text">ORBITS P2P</div>
          <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Децентрализованный мессенджер</div>
        </div>
      ) : null}
    </div>
  );
}
