import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

// Tiny inline copy-to-clipboard button. Stops click propagation so it never
// triggers a parent row's onClick (e.g. opening a detail dialog).
export const CopyButton = ({ value, label = 'Copied', testid, className = '' }) => {
  const [done, setDone] = useState(false);
  if (!value) return null;

  const copy = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const text = String(value);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts / older browsers.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setDone(true);
      toast.success(`${label} ${value}`);
      setTimeout(() => setDone(false), 1200);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <button
      onClick={copy}
      title={`Copy ${value}`}
      data-testid={testid}
      className={`inline-flex items-center text-slate-300 hover:text-[#0F1B3D] transition-colors align-middle ${className}`}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};
