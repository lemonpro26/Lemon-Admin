import React, { useEffect } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { LEGAL_DOCS } from '@/lib/siteContent';

export default function LegalPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const doc = location.pathname.replace(/^\//, '');
  const data = LEGAL_DOCS[doc];

  useEffect(() => { window.scrollTo(0, 0); }, [doc]);

  if (!data) return <Navigate to="/" replace />;

  const renderBlock = (b, i) => {
    if (b.type === 'h') return <h2 key={i} className="font-slab font-bold text-lg text-slate-900 mt-7 mb-2">{b.text}</h2>;
    if (b.type === 'p') return <p key={i} className="text-slate-600 leading-relaxed mb-3">{b.text}</p>;
    if (b.type === 'ul') return (
      <ul key={i} className="list-disc pl-5 space-y-1.5 text-slate-600 mb-3">
        {b.items.map((it, j) => <li key={j}>{it}</li>)}
      </ul>
    );
    if (b.type === 'email') return (
      <a key={i} href={`mailto:${b.text}`} className="inline-block text-[#EF4444] font-semibold hover:underline mb-2">{b.text}</a>
    );
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SiteHeader />
      <main className="flex-1" data-testid={`page-legal-${doc}`}>
        <div className="bg-[#E8F4F7] border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4" data-testid="legal-back">
              <ArrowLeft className="h-4 w-4" /> Back to home
            </button>
            <h1 className="font-slab font-extrabold text-3xl sm:text-4xl text-slate-900" data-testid="legal-title">{data.title}</h1>
            <p className="mt-2 text-sm text-slate-500">Effective Date: {data.effective}</p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <p className="text-slate-700 leading-relaxed text-[15px] mb-2">{data.intro}</p>
          {data.blocks.map(renderBlock)}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
