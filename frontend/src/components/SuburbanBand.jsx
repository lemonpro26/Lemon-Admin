import React from 'react';

// Flat-illustration "car lot" band for Lemon Pros. A row of simple stylized
// cars sitting on a road. Pure inline SVG so it scales crisply and stays fixed
// at the bottom of the funnel shell.
export const SuburbanBand = ({ className = '' }) => {
  const Car = ({ x, body, roof = '#0f172a', s = 1 }) => (
    <g transform={`translate(${x}, ${200 - 70 * s})`}>
      {/* shadow */}
      <ellipse cx={60 * s} cy={64 * s} rx={52 * s} ry={6 * s} fill="#000" opacity="0.06" />
      {/* lower body */}
      <rect x={4 * s} y={34 * s} width={112 * s} height={26 * s} rx={10 * s} fill={body} />
      {/* cabin */}
      <path
        d={`M${28 * s},${34 * s} L${42 * s},${14 * s} L${82 * s},${14 * s} L${96 * s},${34 * s} Z`}
        fill={body}
      />
      {/* windows */}
      <path
        d={`M${36 * s},${32 * s} L${46 * s},${18 * s} L${60 * s},${18 * s} L${60 * s},${32 * s} Z`}
        fill="#cfe8f5"
      />
      <path
        d={`M${64 * s},${32 * s} L${64 * s},${18 * s} L${78 * s},${18 * s} L${88 * s},${32 * s} Z`}
        fill="#cfe8f5"
      />
      {/* wheels */}
      <circle cx={34 * s} cy={60 * s} r={11 * s} fill="#1f2937" />
      <circle cx={34 * s} cy={60 * s} r={4.5 * s} fill="#9ca3af" />
      <circle cx={88 * s} cy={60 * s} r={11 * s} fill="#1f2937" />
      <circle cx={88 * s} cy={60 * s} r={4.5 * s} fill="#9ca3af" />
      {/* headlight */}
      <rect x={111 * s} y={40 * s} width={5 * s} height={6 * s} rx={2 * s} fill="#FACC15" />
    </g>
  );

  return (
    <svg
      className={className}
      viewBox="0 0 1440 200"
      preserveAspectRatio="xMidYMax slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ overflow: 'hidden', maxWidth: '100%' }}
    >
      {/* road */}
      <rect x="0" y="184" width="1440" height="16" fill="#e2e8f0" />
      <rect x="0" y="180" width="1440" height="5" fill="#cbd5e1" />
      {/* lane dashes */}
      {Array.from({ length: 24 }).map((_, i) => (
        <rect key={i} x={i * 64 + 12} y="190" width="34" height="4" rx="2" fill="#FACC15" opacity="0.7" />
      ))}

      <Car x={40} body="#fbbf24" s={1.05} />
      <Car x={230} body="#60a5fa" />
      <Car x={420} body="#f87171" s={1.08} />
      <Car x={620} body="#34d399" />
      <Car x={810} body="#fbbf24" s={1.05} />
      <Car x={1000} body="#a78bfa" />
      <Car x={1200} body="#f472b6" s={1.08} />
    </svg>
  );
};
