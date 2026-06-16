import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

/** Generic client-side sorting for table rows. */
export function useSortable(rows, initialKey = null, initialDir = 'desc') {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState(initialDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
    });
    if (sortDir === 'desc') copy.reverse();
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggle = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return { sorted, sortKey, sortDir, toggle };
}

/** Clickable sortable column label with direction indicator. */
export const SortLabel = ({ label, k, sortKey, sortDir, onClick, align = 'left' }) => (
  <button
    type="button"
    onClick={() => onClick(k)}
    className={`inline-flex items-center gap-1 hover:text-slate-900 transition-colors ${align === 'right' ? 'flex-row-reverse' : ''}`}
    data-testid={`sort-${k}`}
  >
    <span>{label}</span>
    {sortKey === k
      ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
      : <ArrowUpDown className="h-3 w-3 opacity-40" />}
  </button>
);
