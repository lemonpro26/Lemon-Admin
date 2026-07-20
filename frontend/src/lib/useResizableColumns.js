import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook: resizable table columns with per-browser persistence.
 *
 * Usage:
 *   const { widths, startResize, resetAll } = useResizableColumns({
 *     storageKey: 'lp_calls_col_widths_v1',
 *     defaults: { caller: 180, number: 140, ... },
 *     min: 60, max: 700,
 *   });
 *
 * Then in the table:
 *   <colgroup>
 *     {visibleKeys.map((k) => <col key={k} style={{ width: widths[k] + 'px' }} />)}
 *   </colgroup>
 *   ...
 *   <th style={{ position: 'relative' }}>
 *     Header text
 *     <span onMouseDown={(e) => startResize(k, e)} className="col-resize-handle" />
 *   </th>
 *
 * The handle is a thin, absolutely-positioned strip on the right edge of the
 * header cell. Dragging it updates that column's width and persists it.
 */
export function useResizableColumns({ storageKey, defaults, min = 60, max = 900 }) {
  const [widths, setWidths] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        // Merge defaults so newly-added columns pick up the default width
        // even for users who already have a saved layout.
        return { ...defaults, ...saved };
      }
    } catch (e) { /* ignore corrupt localStorage */ }
    return { ...defaults };
  });

  // Persist whenever widths change. Debounced-ish (writes on every change but
  // localStorage is fast and updates are throttled by mousemove itself).
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(widths)); } catch (e) { /* ignore */ }
  }, [widths, storageKey]);

  const dragRef = useRef(null);

  const onMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const next = Math.max(min, Math.min(max, d.startW + dx));
    setWidths((prev) => (prev[d.key] === next ? prev : { ...prev, [d.key]: next }));
  }, [min, max]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }, [onMove]);

  const startResize = useCallback((key, e) => {
    e.preventDefault();
    e.stopPropagation();
    // Measure the current rendered width of the <th> that owns this handle so
    // dragging starts from the visible width even when widths[key] is stale
    // (initial render, responsive layout, etc).
    const th = e.currentTarget.closest('th');
    const startW = th ? th.getBoundingClientRect().width : (widths[key] || 100);
    dragRef.current = { key, startX: e.clientX, startW };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onMove, onUp, widths]);

  const resetAll = useCallback(() => setWidths({ ...defaults }), [defaults]);

  return { widths, startResize, resetAll };
}

/** Reusable drag handle. Renders a thin transparent strip on the header's
 *  right edge; the parent <th> must be `position: relative`. */
export function ColResizeHandle({ onMouseDown, testid }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      title="Drag to resize column"
      data-testid={testid}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none group"
      style={{ touchAction: 'none' }}
    >
      <span className="absolute right-0 top-1/4 h-1/2 w-px bg-slate-200 group-hover:bg-sky-500 group-hover:w-0.5 transition-colors" />
    </span>
  );
}
