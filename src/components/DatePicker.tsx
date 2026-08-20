import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { createPortal } from 'react-dom';

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  dropUp?: boolean;
  mode?: 'single' | 'range' | 'month';
  /** range 模式下的第二个值 */
  valueEnd?: string;
  onChangeEnd?: (val: string) => void;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function firstDayOfMonth(y: number, m: number) {
  const d = new Date(y, m, 1).getDay();
  return d === 0 ? 6 : d - 1; // 周一=0 ... 周日=6
}

function fmt(v: string) {
  if (!v) return '';
  if (v.length === 4) return v; // just year from month mode
  if (v.length === 7) {
    const [y, m] = v.split('-');
    return `${y}年${parseInt(m)}月`;
  }
  return v;
}

function isToday(y: number, m: number, d: number) {
  const t = new Date();
  return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
}

export default function DatePicker({
  value, onChange, placeholder = '选择日期', className = '',
  dropUp = false,
  mode = 'single', valueEnd, onChangeEnd,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pickerView, setPickerView] = useState<'day' | 'month' | 'year'>('day');
  const [desktopPosition, setDesktopPosition] = useState({ top: 0, left: 0, width: 0, placement: 'bottom' as 'top' | 'bottom' });
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 打开时同步视图到已选日期
  useEffect(() => {
    if (open) {
      setPickerView('day');
      if (mode === 'month' && value) {
        const [y, m] = value.split('-').map(Number);
        setViewYear(y); setViewMonth(m - 1);
      } else if (value) {
        const [y, m] = value.split('-').map(Number);
        setViewYear(y); setViewMonth(m - 1);
      }
    }
  }, [open, value, mode]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    // The mobile calendar is rendered through a portal, so it is outside `ref`.
    // Its own backdrop handles closing; the desktop outside-click listener would
    // otherwise close it on mousedown before a day button receives its click.
    if (open && !isMobile) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, isMobile]);

  const updateDesktopPosition = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = window.innerWidth >= 768 ? 288 : 256;
    const panelHeight = 360;
    const gap = 6;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - panelWidth - 12));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement = dropUp || (spaceBelow < panelHeight && spaceAbove > spaceBelow) ? 'top' : 'bottom';
    const top = placement === 'top'
      ? Math.max(12, rect.top - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - 12);
    setDesktopPosition({ top, left, width: rect.width, placement });
  }, [dropUp]);

  useEffect(() => {
    if (!open || isMobile) return;
    updateDesktopPosition();
    window.addEventListener('resize', updateDesktopPosition);
    window.addEventListener('scroll', updateDesktopPosition, true);
    return () => {
      window.removeEventListener('resize', updateDesktopPosition);
      window.removeEventListener('scroll', updateDesktopPosition, true);
    };
  }, [isMobile, open, updateDesktopPosition]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const handleDayClick = useCallback((d: number) => {
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (mode === 'range') {
      if (!value || (value && valueEnd)) {
        onChange(ds);
        onChangeEnd?.('');
        setSelectingEnd(true);
      } else {
        if (ds < value) {
          onChange(ds);
          onChangeEnd?.(value);
        } else {
          onChangeEnd?.(ds);
        }
        setSelectingEnd(false);
        setOpen(false);
      }
    } else {
      onChange(ds);
      setOpen(false);
    }
  }, [viewYear, viewMonth, mode, value, valueEnd, onChange, onChangeEnd]);

  const handleMonthClick = useCallback((m: number) => {
    if (pickerView === 'month' && mode !== 'month') {
      setViewMonth(m);
      setPickerView('day');
      return;
    }
    onChange(`${viewYear}-${String(m + 1).padStart(2, '0')}`);
    setOpen(false);
  }, [mode, onChange, pickerView, viewYear]);

  const inRange = (d: number) => {
    if (mode !== 'range' || !value || !valueEnd) return false;
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return ds > value && ds < valueEnd;
  };
  const isStart = (d: number) => {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` === value;
  };
  const isEnd = (d: number) => {
    return valueEnd && `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` === valueEnd;
  };

  // ---- Trigger text ----
  let triggerText = placeholder;
  if (mode === 'range') {
    if (value && valueEnd) triggerText = `${value} 至 ${valueEnd}`;
    else if (value && selectingEnd) triggerText = `${value} 至 ...`;
    else if (value) triggerText = value;
  } else if (mode === 'month') {
    if (value) triggerText = fmt(value);
  } else {
    if (value) triggerText = value;
  }

  // ---- Calendar body ----
  const renderCalendar = () => {
    if (pickerView === 'year') {
      const startYear = Math.floor(viewYear / 12) * 12;
      return (
        <div className="p-4">
          <div className="grid grid-cols-[32px_1fr_32px] items-center mb-3">
            <button type="button" onClick={() => setViewYear(viewYear - 12)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-center text-sm font-semibold text-gray-800">{startYear} - {startYear + 11}</span>
            <button type="button" onClick={() => setViewYear(viewYear + 12)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, i) => startYear + i).map((year) => (
              <button
                type="button"
                key={year}
                onClick={() => { setViewYear(year); setPickerView('month'); }}
                className={`py-2 text-xs rounded transition-colors font-medium ${year === viewYear ? 'bg-gold-400 text-white' : 'text-gray-600 hover:bg-gold-50 hover:text-gold-600'}`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Month picker
    if (mode === 'month' || pickerView === 'month') {
      return (
        <div className="p-4">
          <div className="grid grid-cols-[32px_1fr_32px] items-center mb-3">
            <button type="button" onClick={() => setViewYear(viewYear - 1)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => setPickerView('year')} className="text-sm font-semibold text-gray-800 hover:text-gold-600">{viewYear}</button>
            <button type="button" onClick={() => setViewYear(viewYear + 1)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((label, i) => {
              const isSel = value === `${viewYear}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => handleMonthClick(i)}
                  className={`py-2 text-xs rounded transition-colors font-medium ${
                    isSel
                      ? 'bg-gold-400 text-white'
                      : 'text-gray-600 hover:bg-gold-50 hover:text-gold-600'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // Day picker
    const days = daysInMonth(viewYear, viewMonth);
    const fdom = firstDayOfMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < fdom; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length < 42) cells.push(null);

    return (
      <div className="p-4">
        {/* Header */}
        <div className="grid grid-cols-[32px_1fr_32px] items-center mb-4">
          <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => setPickerView('month')} className="text-sm font-semibold text-gray-800 hover:text-gold-600">{viewYear}年 {viewMonth + 1}月</button>
          <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="text-center text-[11px] text-gray-400 font-medium py-1">
              {w}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((d, idx) => {
            if (d === null) return <div key={`e${idx}`} className="h-10" />;
            const isT = isToday(viewYear, viewMonth, d);
            const isS = isStart(d);
            const isE = isEnd(d);
            const isR = inRange(d);

            let cls = 'text-center text-xs py-1.5 rounded transition-colors font-medium ';
            if (isS || isE) {
              cls += 'bg-gold-400 text-white ';
            } else if (isR) {
              cls += 'bg-gold-50 text-gold-600 ';
            } else {
              cls += 'text-gray-700 hover:bg-gold-50 hover:text-gold-600 ';
            }

            return (
              <button
                type="button"
                key={idx}
                onClick={() => handleDayClick(d)}
                className={`${cls} h-10`}
              >
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded ${isT && !(isS || isE) ? 'border border-gold-300' : ''}`}>
                  {d}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ---- Desktop popover ----
  const panel = (
    <div className="bg-white rounded-lg shadow-xl border border-gray-100 w-64 md:w-72 overflow-hidden">
      {renderCalendar()}
    </div>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="erp-date flex items-center gap-2 justify-between text-left"
      >
        <span className={value ? 'text-gray-700' : 'text-gray-400'}>
          {triggerText}
        </span>
        <Calendar size={14} className="text-gray-400 shrink-0" />
      </button>

      {/* Desktop: portal popover. Keep it out of modal scroll containers so it is never clipped. */}
      {open && !isMobile && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[240]"
          style={{
            left: desktopPosition.left,
            top: desktopPosition.top,
            minWidth: Math.max(desktopPosition.width, 256),
            transform: desktopPosition.placement === 'top' ? 'translateY(-100%)' : undefined,
          }}
        >
          {panel}
        </div>,
        document.body
      )}

      {/* Mobile: bottom drawer */}
      {open && isMobile && createPortal(
        <div
          className="fixed inset-0 z-[240] flex items-end"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-h-[86vh] overflow-auto rounded-t-2xl border border-gray-100 bg-white shadow-2xl">
            {/* Mobile drag handle */}
            <div className="md:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {renderCalendar()}
            {/* Footer close button for mobile */}
            <div className="md:hidden px-4 pb-4 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-2.5 bg-gold-400 text-white text-sm font-medium rounded hover:bg-gold-500 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
