import React from 'react';
import { useNavigate } from 'react-router-dom';

const links = [
  { label: 'Terms of Use', to: '/terms', testid: 'footer-terms-link' },
  { label: 'Do Not Sell My Info', to: '/do-not-sell', testid: 'footer-dns-link' },
  { label: 'Privacy', to: '/privacy', testid: 'footer-privacy-link' },
  { label: 'Contact Us', to: '/contact', testid: 'footer-contact-link' },
];

// Single tiny line: legal links + copyright, all on one compact row.
export const SiteFooter = () => {
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  return (
    <footer
      className="shrink-0 bg-[#fdf3c9]"
      data-testid="site-footer"
    >
      <div className="max-w-6xl mx-auto px-3 h-[clamp(32px,4.5vh,42px)] flex items-center justify-center flex-wrap gap-x-3 gap-y-0 text-[11px] sm:text-xs text-yellow-800/80">
        {links.map((l) => (
          <button
            key={l.testid}
            type="button"
            onClick={() => navigate(l.to)}
            className="hover:text-yellow-900 transition-colors"
            data-testid={l.testid}
          >
            {l.label}
          </button>
        ))}
        <span className="text-yellow-700/40" aria-hidden="true">•</span>
        <span data-testid="footer-copyright">
          ©{year} Lemon Pros. All rights reserved. Attorney advertising.
        </span>
      </div>
    </footer>
  );
};
