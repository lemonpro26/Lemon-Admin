import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFunnel } from '@/context/FunnelContext';
import { tr } from '@/lib/i18n';

// Navy footer matching the bindright-style design: legal links + copyright.
export const SiteFooter = () => {
  const navigate = useNavigate();
  const { lang } = useFunnel();
  const t = tr(lang);
  const year = new Date().getFullYear();

  const links = [
    { label: t.footer.terms, to: '/terms', testid: 'footer-terms-link' },
    { label: t.footer.dns, to: '/do-not-sell', testid: 'footer-dns-link' },
    { label: t.footer.privacy, to: '/privacy', testid: 'footer-privacy-link' },
    { label: t.footer.contact, to: '/contact', testid: 'footer-contact-link' },
  ];

  return (
    <footer className="shrink-0 bg-[#0F1B3D] text-slate-300" data-testid="site-footer">
      <div className="max-w-6xl mx-auto px-3 min-h-[clamp(34px,5vh,46px)] py-1.5 flex items-center justify-center flex-wrap gap-x-4 gap-y-0.5 text-[11px] sm:text-xs">
        {links.map((l) => (
          <button
            key={l.testid}
            type="button"
            onClick={() => navigate(l.to)}
            className="hover:text-white transition-colors"
            data-testid={l.testid}
          >
            {l.label}
          </button>
        ))}
        <span className="text-slate-600" aria-hidden="true">•</span>
        <span className="text-slate-400" data-testid="footer-copyright">
          ©{year} The Lemon Pros. {t.footer.rights}
        </span>
      </div>
    </footer>
  );
};
