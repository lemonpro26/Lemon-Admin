import React from 'react';

// Text wordmark logo for Lemon Pros: a lemon icon + bold two-tone text.
// "Lemon" in dark navy, "PROS" in lemon yellow.
export const Logo = ({ className = '', size = 'md', light = false }) => {
  const dims = {
    sm: { icon: 26, t1: 'text-base', t2: 'text-[10px]' },
    md: { icon: 34, t1: 'text-xl sm:text-2xl', t2: 'text-[11px] sm:text-xs' },
    lg: { icon: 42, t1: 'text-2xl sm:text-3xl', t2: 'text-xs sm:text-sm' },
  }[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Lemon icon */}
      <svg
        width={dims.icon}
        height={dims.icon}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <ellipse cx="32" cy="34" rx="22" ry="18" fill="#FACC15" />
        <ellipse cx="32" cy="34" rx="22" ry="18" stroke="#E0A800" strokeWidth="2.5" />
        {/* highlight */}
        <ellipse cx="24" cy="27" rx="6" ry="4" fill="#FDE68A" />
        {/* leaf */}
        <path d="M40 16 C46 12 54 14 54 14 C54 14 52 22 46 24 C42 25 39 22 40 16 Z" fill="#4CAF50" />
        <path d="M32 18 C34 14 38 13 40 16" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      <span className="flex flex-col leading-none">
        <span className={`font-slab font-extrabold tracking-tight ${dims.t1}`}>
          <span className={light ? 'text-white' : 'text-slate-900'}>The Lemon</span>
          <span style={{ color: light ? '#FACC15' : '#E0A800' }}>Pros</span>
        </span>
        <span
          className={`font-slab font-bold tracking-[0.22em] uppercase ${dims.t2}`}
          style={{ color: light ? '#cbd5e1' : '#94a3b8' }}
        >
          Lemon Law Help
        </span>
      </span>
    </span>
  );
};
