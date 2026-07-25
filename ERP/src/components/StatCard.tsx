import type { DivideIcon as LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: typeof LucideIcon;
  accent: 'gold' | 'emerald' | 'red' | 'blue';
  /** 环比变化百分比，正数=涨 负数=跌 */
  change?: number;
  changeLabel?: string;
}

const accentMap = {
  gold:   { bg: 'bg-amber-50', text: 'text-amber-600',   icon: 'text-amber-500' },
  emerald:{ bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'text-emerald-500' },
  red:    { bg: 'bg-red-50', text: 'text-red-600',       icon: 'text-red-500' },
  blue:   { bg: 'bg-blue-50', text: 'text-blue-600',     icon: 'text-blue-500' },
};

export default function StatCard({ title, value, sub, icon: Icon, accent, change, changeLabel }: StatCardProps) {
  const c = accentMap[accent];
  const isUp = change !== undefined && change > 0;
  const isDown = change !== undefined && change < 0;

  return (
    <div className="bg-white rounded-lg border border-gray-100 px-4 md:px-5 py-3.5 md:py-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <span className="text-[11px] md:text-xs text-gray-400 font-medium uppercase tracking-wide">{title}</span>
        <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon size={15} className={c.icon} />
        </div>
      </div>
      <p className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <span className="text-[11px] md:text-xs text-gray-400">{sub}</span>}
        {change !== undefined && change !== 0 && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] md:text-xs font-medium ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
            {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
            {changeLabel && <span className="text-gray-400 font-normal ml-0.5">{changeLabel}</span>}
          </span>
        )}
      </div>
    </div>
  );
}