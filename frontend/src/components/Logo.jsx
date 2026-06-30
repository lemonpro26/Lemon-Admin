import React from 'react';

// Brand wordmark for The Lemon Pros (uploaded logo). Transparent PNG so it sits
// cleanly in the header with no box. White variant is used on dark backgrounds.
export const Logo = ({ className = '', size = 'md', light = false }) => {
  const heights = { xs: 18, sm: 28, md: 36, lg: 48 };
  const h = heights[size] || heights.md;
  const src = light ? '/lemon-pros-logo-white.png' : '/lemon-pros-logo.png';
  return (
    <img
      src={src}
      alt="The Lemon Pros — Lemon Law Attorneys"
      style={{ height: h, width: 'auto' }}
      className={`shrink-0 select-none ${className}`}
      draggable="false"
    />
  );
};
