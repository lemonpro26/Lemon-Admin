import React, { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
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
    setRange(r || {});
    if (r?.from && r?.to) {
      onChange({ start: toISO(r.from), end: toISO(r.to) });
    }
  };

  const isToday = value.start === value.end && value.start === toISO(new Date());
  const label = value.start === value.end
    ? (isToday ? 'Today' : pretty(value.start))
    : `${pretty(value.start)} \u2013 ${pretty(value.end)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          <Calendar
            mode="range"
            selected={range}
            onSelect={onSelect}
            numberOfMonths={1}
            initialFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
