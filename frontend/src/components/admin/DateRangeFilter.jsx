import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const toISO = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const parse = (s) => {
  const [y, m, d] = (s || '').split('-').map(Number);
  return y ? new Date(y, m - 1, d) : new Date();
};
const pretty = (s) => {
  if (!s) return '';
  const d = parse(s);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const todayRange = () => {
  const t = toISO(new Date());
  return { start: t, end: t };
};

const presets = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: 'Last 7 days', days: 6 },
  { key: '30d', label: 'Last 30 days', days: 29 },
  { key: '90d', label: 'Last 90 days', days: 89 },
];

/** Reusable date-range filter. value={start,end} (YYYY-MM-DD). */
export const DateRangeFilter = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ from: parse(value.start), to: parse(value.end) });

  const applyPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setRange({ from: start, to: end });
    onChange({ start: toISO(start), end: toISO(end) });
    setOpen(false);
  };

  const onSelect = (r) => {
    // Just stage the selection — don't apply until the user clicks Apply.
    setRange(r || {});
  };

  const applyRange = () => {
    const from = range?.from;
    const to = range?.to || range?.from; // single date → same day range
    if (!from) return;
    onChange({ start: toISO(from), end: toISO(to) });
    setOpen(false);
  };

  // Keep the staged selection in sync whenever the popover (re)opens.
  const handleOpenChange = (next) => {
    if (next) setRange({ from: parse(value.start), to: parse(value.end) });
    setOpen(next);
  };

  const isToday = value.start === value.end && value.start === toISO(new Date());
  const label = value.start === value.end
    ? (isToday ? 'Today' : pretty(value.start))
    : `${pretty(value.start)} \u2013 ${pretty(value.end)}`;

  const stagedLabel = range?.from
    ? (range?.to && toISO(range.to) !== toISO(range.from)
        ? `${pretty(toISO(range.from))} \u2013 ${pretty(toISO(range.to))}`
        : pretty(toISO(range.from)))
    : 'Pick a date';

  // ◀ ▶ : step the selected day back / forward by one (collapses any range to a single day).
  const stepDay = (delta) => {
    const base = parse(value.start);
    base.setDate(base.getDate() + delta);
    const iso = toISO(base);
    onChange({ start: iso, end: iso });
  };
  const nextDisabled = toISO(parse(value.start)) >= toISO(new Date());

  return (
    <div className="flex items-center gap-1" data-testid="date-range-filter">
      <Button
        variant="outline"
        size="icon"
        onClick={() => stepDay(-1)}
        className="h-10 w-10 rounded-xl border-slate-200 shrink-0"
        data-testid="date-prev-day"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-10 rounded-xl border-slate-200 gap-2 font-medium" data-testid="date-range-trigger">
            <CalendarIcon className="h-4 w-4 text-slate-500" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[200]" align="end">
          <div className="flex">
            <div className="flex flex-col gap-1 p-3 border-r border-slate-100 min-w-[140px]">
              {presets.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.days)}
                  className="text-left text-sm px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  data-testid={`date-preset-${p.key}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col">
              <Calendar
                mode="range"
                selected={range}
                onSelect={onSelect}
                numberOfMonths={1}
                initialFocus
              />
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-3">
                <span className="text-xs text-slate-500" data-testid="date-staged-label">{stagedLabel}</span>
                <Button
                  size="sm"
                  onClick={applyRange}
                  disabled={!range?.from}
                  className="rounded-lg"
                  data-testid="date-apply-button"
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon"
        onClick={() => stepDay(1)}
        disabled={nextDisabled}
        className="h-10 w-10 rounded-xl border-slate-200 shrink-0"
        data-testid="date-next-day"
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
