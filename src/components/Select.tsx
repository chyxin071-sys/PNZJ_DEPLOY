import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

interface Option {
  value: string;
  label: string;
  description?: string;
}

interface SelectProps {
  value: string;
  onChange: (val: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
  sheetTitle?: string;
}

export default function Select({ value, onChange, options, placeholder = '请选择', className = '', disabled = false, searchable = false, sheetTitle = '' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    // Mobile options are rendered in a portal outside `ref`; the backdrop owns
    // dismissal there. Registering this listener on mobile closes the sheet on
    // pointer-down before an option can receive its click.
    if (open && !isMobile) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, isMobile]);

  const current = options.find((o) => o.value === value);
  const filteredOptions = searchable 
    ? options.filter(o => `${o.label} ${o.description || ''}`.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`erp-select flex items-center justify-between gap-2 text-left ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={`min-w-0 truncate whitespace-nowrap ${current ? 'text-gray-700' : 'text-gray-400'}`}>
          {current ? current.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Desktop: popover */}
      {open && !isMobile && (
        <div className="absolute z-[130] mt-1 left-0 min-w-full bg-white rounded-lg shadow-xl border border-gray-100 py-1.5 overflow-hidden">
          {searchable && (
            <div className="px-2 pb-1">
              <input
                type="text"
                autoFocus
                placeholder="搜索..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs border-b border-gray-100 px-2 py-1.5 outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400 text-center">暂无结果</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); setSearchTerm(''); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                    opt.value === value
                      ? 'bg-gold-50 text-gold-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.description && <span className="text-[11px] text-gray-400 shrink-0">{opt.description}</span>}
                  {opt.value === value && <Check size={14} className="text-gold-400 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Mobile: bottom sheet */}
      {open && isMobile && createPortal(
        <div className="fixed inset-0 z-[240] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-t-2xl w-full max-h-[50vh] flex flex-col shadow-2xl border border-gray-100">
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {sheetTitle && (
              <div className="flex items-center justify-between px-5 pb-3 pt-1 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">{sheetTitle}</h3>
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400">取消</button>
              </div>
            )}
            {searchable && (
              <div className="px-4 pb-2 shrink-0 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="搜索..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full text-sm bg-gray-50 rounded px-3 py-2 outline-none text-gray-700 placeholder-gray-400"
                />
              </div>
            )}
            <div className="px-2 py-1 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-400 text-center">暂无结果</div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); setSearchTerm(''); }}
                    className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left rounded transition-colors ${
                      opt.value === value
                        ? 'bg-gold-50 text-gold-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.description && <span className="text-xs text-gray-400 shrink-0">{opt.description}</span>}
                    {opt.value === value && <Check size={16} className="text-gold-400 shrink-0" />}
                  </button>
                ))
              )}
            </div>
            {/* Safe area bottom spacing */}
            <div className="h-6" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
