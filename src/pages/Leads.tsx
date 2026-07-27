import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Filter, Phone, User, Calendar, Trash2, Edit3,
  ChevronDown, ChevronLeft, ChevronRight, Users, X, CheckCircle,
  AlertTriangle, Clock, FileText, PenTool, DollarSign, HardHat, TrendingDown,
} from 'lucide-react';
import { leadsAPI, usersAPI, followUpsAPI, projectsAPI, quotesAPI, contractsAPI, receiptsAPI, expensesAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { canViewFinancialData, hasRole, getHighestRole } from '@/store/authStore';
import { formatDate, formatDateTime, formatMoney, generateId } from '@/utils/format';
import dayjs from 'dayjs';
import DataTable from '@/components/DataTable';
import BottomDrawer from '@/components/BottomDrawer';
import Select from '@/components/Select';
import { useIncrementalList } from '@/hooks/useListViewportState';
import { useDialogStore } from '@/store/dialogStore';
import {
  createNotificationEventSafely,
  resolveUserIdsByNames,
  stableOperationId,
} from '@/services/notificationService';
import { syncLeadRelations } from '@/utils/syncLeadRelations';
import { addLeadAuditFollowUp, describeLeadChanges, namesText, notifyLeadAssignment, notifyLeadEvent } from '@/utils/leadAudit';

const STATUS_COLORS: Record<string, string> = {
  '跟进中': 'bg-blue-50 text-blue-600',
  '已签单': 'bg-emerald-50 text-emerald-600',
  '已流失': 'bg-gray-100 text-gray-500',
};
const RATING_COLORS: Record<string, string> = {
  'A': 'bg-red-50 text-red-600',
  'B': 'bg-orange-50 text-orange-600',
  'C': 'bg-blue-50 text-blue-600',
  'D': 'bg-gray-50 text-gray-500',
};
const SOURCE_OPTIONS = ['自然进店', '老介新', '抖音', '自有关系', '其他'];
const BUDGET_OPTIONS = ['暂无', '10-20万', '20-30万', '30-50万', '50万以上'];
const REQ_OPTIONS = ['毛坯', '旧改'];
const LOST_REASONS = ['价格太高', '选择其他公司', '预算不足', '方案不满意', '暂时不需要', '其他'];
const ROLE_DEPT: Record<string, string> = {
  admin: '管理组', sales: '销售部', designer: '设计部',
  manager: '工程部', finance: '财务部', employee: '普通',
};
const DEPT_ORDER = [ROLE_DEPT.sales, ROLE_DEPT.designer, ROLE_DEPT.manager, ROLE_DEPT.finance, ROLE_DEPT.admin, ROLE_DEPT.employee];
const ROLE_ORDER: Record<string, number> = { sales: 0, designer: 1, manager: 2, finance: 3, admin: 4, employee: 5 };

type StatFilter = 'all' | 'followUp' | 'signed' | 'lost';

const INIT_FORM = {
  name: '', phone: '', address: '', doorPassword: '', area: '',
  budget: '暂无', requirementType: '毛坯', rating: 'C',
  source: '自然进店', sourceCustom: '', sales: [] as string[], designer: [] as string[], manager: [] as string[], remark: '',
};

const toPersonArray = (val: string | string[] | undefined | null): string[] => {
  if (Array.isArray(val)) return val.flatMap(v => typeof v === 'string' ? v.split(/[,，、\s]+/).filter(Boolean) : []);
  if (val && val !== '未分配' && val !== '') return val.split(/[,，、\s]+/).filter(Boolean);
  return [];
};

function includesPerson(arr: string | string[] | undefined | null, name: string): boolean {
  return toPersonArray(arr).includes(name);
}

function useClickOutside(ref: React.RefObject<HTMLElement>, cb: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, cb]);
}

function SearchableSelect({
  options, value, onChange, placeholder = '请选择', searchPlaceholder = '搜索...',
  groups, className = '', compact = false,
}: {
  options: { value: string; label: string; group?: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string; searchPlaceholder?: string;
  groups?: { key: string; label: string }[];
  className?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => { setOpen(false); setSearch(''); });

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => {
        if (window.matchMedia('(max-width: 767px)').matches) setMobileOpen(true);
        else setOpen(!open);
      }}
        className={`w-full flex items-center justify-between border border-gray-200 rounded-lg bg-white transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gold-400 ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}>
        <span className={`truncate ${selected ? 'text-gray-700' : 'text-gray-400'}`}>{selected?.label || placeholder}</span>
        <ChevronDown size={compact ? 12 : 12} className={`shrink-0 ml-1 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* 桌面端下拉菜单 */}
      {open && (
        <div className="hidden md:block absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden" style={{ minWidth: 180 }}>
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={searchPlaceholder}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gold-400" autoFocus />
            </div>
          </div>
          <div className="max-h-52 overflow-auto">
            {groups ? groups.map(g => {
              const items = filtered.filter(o => o.group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key}>
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-50 sticky top-0">{g.label}</div>
                  {items.map(o => (
                    <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gold-50 transition-colors ${value === o.value ? 'bg-gold-50 text-gold-700 font-medium' : 'text-gray-700'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              );
            }) : filtered.map(o => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gold-50 transition-colors ${value === o.value ? 'bg-gold-50 text-gold-700 font-medium' : 'text-gray-700'}`}>
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-xs text-gray-400 text-center">无匹配结果</div>}
          </div>
        </div>
      )}
      {/* 移动端底部抽屉 */}
      <BottomDrawer open={mobileOpen} onClose={() => { setMobileOpen(false); setSearch(''); }} title={placeholder}>
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400" />
          </div>
          <div className="max-h-[52vh] overflow-auto space-y-1">
            {groups ? groups.map(g => {
              const items = filtered.filter(o => o.group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key}>
                  <div className="px-2 py-2 text-[11px] font-medium text-gray-400">{g.label}</div>
                  {items.map(o => (
                    <button key={o.value} type="button" onClick={() => { onChange(o.value); setMobileOpen(false); setSearch(''); }}
                      className={`w-full text-left px-4 py-3 text-sm rounded-lg transition-colors ${value === o.value ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              );
            }) : filtered.map(o => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setMobileOpen(false); setSearch(''); }}
                className={`w-full text-left px-4 py-3 text-sm rounded-lg transition-colors ${value === o.value ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-8 text-sm text-gray-400 text-center">无匹配结果</div>}
          </div>
        </div>
      </BottomDrawer>

      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes celebrateBounce {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function LinkBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:border-gold-400 hover:text-gold-600 hover:bg-gold-50 transition-colors whitespace-nowrap"
    >
      <Icon size={11} />
      <span>{label}</span>
    </button>
  );
}

function ProgressBar({ percent, color = 'bg-emerald-500' }: { percent: number; color?: string }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex items-center gap-1.5 min-w-[60px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-[11px] text-gray-500 w-8 text-right">{Math.round(p)}%</span>
    </div>
  );
}

function CustomDatePicker({ value, onChange, placeholder = '选择日期', compact = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value.replace(/-/g, '/')) : new Date());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => { setOpen(false); setShowYearPicker(false); setShowMonthPicker(false); });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const selectDay = (day: number) => {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(d);
    setOpen(false);
  };
  const goToday = () => { const t = new Date(); onChange(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`); setOpen(false); };

  const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(!open); setViewDate(value ? new Date(value.replace(/-/g, '/')) : new Date()); }}
        className={`w-full flex items-center justify-between border border-gray-200 rounded-lg bg-white transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gold-400 ${compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}>
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value || placeholder}</span>
        <Calendar size={compact ? 12 : 14} className="shrink-0 ml-1 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="hidden md:block absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3" style={{ width: 280 }}>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16} /></button>
              <div className="flex items-center gap-1 text-sm font-medium">
                <span className="cursor-pointer hover:text-gold-600 px-1" onClick={() => setShowYearPicker(!showYearPicker)}>{year}年</span>
                <span className="cursor-pointer hover:text-gold-600 px-1" onClick={() => setShowMonthPicker(!showMonthPicker)}>{month + 1}月</span>
              </div>
              <button type="button" onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16} /></button>
            </div>
            {/* 年份快速选择 */}
            {showYearPicker && (
              <div className="mb-2 p-1 border border-gray-100 rounded-lg bg-white max-h-[140px] overflow-y-auto grid grid-cols-4 gap-1">
                {Array.from({ length: 21 }, (_, i) => today.getFullYear() - 10 + i).map(y => (
                  <button key={y} type="button" onClick={() => { setViewDate(new Date(y, month, 1)); setShowYearPicker(false); }}
                    className={`text-xs py-1 rounded hover:bg-gray-100 ${y === year ? 'bg-gold-400 text-black font-bold' : ''}`}>{y}</button>
                ))}
              </div>
            )}
            {/* 月份快速选择 */}
            {showMonthPicker && (
              <div className="mb-2 p-1 border border-gray-100 rounded-lg bg-white grid grid-cols-4 gap-1">
                {MONTHS.map((m, i) => (
                  <button key={m} type="button" onClick={() => { setViewDate(new Date(year, i, 1)); setShowMonthPicker(false); }}
                    className={`text-xs py-1 rounded hover:bg-gray-100 ${i === month ? 'bg-gold-400 text-black font-bold' : ''}`}>{m}</button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
              {['日', '一', '二', '三', '四', '五', '六'].map(w => (
                <div key={w} className="text-xs text-gray-400 py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center" style={{ minHeight: 216 }}>
              {days.map((d, i) => {
                if (d === null) return <div key={`e${i}`} />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isToday = new Date(year, month, d).getTime() === today.getTime();
                const isSelected = value === dateStr;
                return (
                  <button key={d} type="button" onClick={() => selectDay(d)}
                    className={`w-8 h-8 rounded-full text-xs flex items-center justify-center transition-colors
                      ${isSelected ? 'bg-gold-400 text-black font-bold' : isToday ? 'bg-gold-50 text-gold-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs text-gray-400 hover:text-gray-600">清除</button>
              <button type="button" onClick={goToday} className="text-xs text-gold-500 hover:text-gold-600 font-medium">今天</button>
            </div>
          </div>
          {createPortal(<div className="md:hidden fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
            <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-[300px]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={18} /></button>
                <div className="flex items-center gap-1 text-base font-semibold">
                  <span className="cursor-pointer hover:text-gold-600 px-1" onClick={() => setShowYearPicker(!showYearPicker)}>{year}年</span>
                  <span className="cursor-pointer hover:text-gold-600 px-1" onClick={() => setShowMonthPicker(!showMonthPicker)}>{month + 1}月</span>
                </div>
                <button type="button" onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={18} /></button>
              </div>
              {showYearPicker && (
                <div className="mb-2 p-1 border border-gray-100 rounded-lg bg-white max-h-[140px] overflow-y-auto grid grid-cols-4 gap-1">
                  {Array.from({ length: 21 }, (_, i) => today.getFullYear() - 10 + i).map(y => (
                    <button key={y} type="button" onClick={() => { setViewDate(new Date(y, month, 1)); setShowYearPicker(false); }}
                      className={`text-xs py-1 rounded hover:bg-gray-100 ${y === year ? 'bg-gold-400 text-black font-bold' : ''}`}>{y}</button>
                  ))}
                </div>
              )}
              {showMonthPicker && (
                <div className="mb-2 p-1 border border-gray-100 rounded-lg bg-white grid grid-cols-4 gap-1">
                  {MONTHS.map((m, i) => (
                    <button key={m} type="button" onClick={() => { setViewDate(new Date(year, i, 1)); setShowMonthPicker(false); }}
                      className={`text-xs py-1 rounded hover:bg-gray-100 ${i === month ? 'bg-gold-400 text-black font-bold' : ''}`}>{m}</button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['日', '一', '二', '三', '四', '五', '六'].map(w => (
                  <div key={w} className="text-xs text-gray-400 py-1">{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center" style={{ minHeight: 216 }}>
                {days.map((d, i) => {
                  if (d === null) return <div key={`e${i}`} />;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const isToday = new Date(year, month, d).getTime() === today.getTime();
                  const isSelected = value === dateStr;
                  return (
                    <button key={d} type="button" onClick={() => selectDay(d)}
                      className={`w-9 h-9 rounded-full text-sm flex items-center justify-center transition-colors
                        ${isSelected ? 'bg-gold-400 text-black font-bold' : isToday ? 'bg-gold-50 text-gold-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-sm text-gray-400 hover:text-gray-600">清除</button>
                <button type="button" onClick={goToday} className="text-sm text-gold-500 hover:text-gold-600 font-medium">今天</button>
              </div>
            </div>
          </div>, document.body)}
        </>
      )}
    </div>
  );
}

function getDept(emp: any): string {
  if (emp.department) return emp.department;
  // 多角色支持：取最高权限角色对应的部门
  const primaryRole = (emp.roles && emp.roles.length > 0) ? getHighestRole(emp.roles) : emp.role;
  return ROLE_DEPT[primaryRole] || '普通';
}
function getPrimaryRole(emp: any): string {
  return (emp.roles && emp.roles.length > 0) ? getHighestRole(emp.roles) : (emp.role || 'employee');
}

function sortEmployeesForFilter(list: any[]) {
  return [...list].sort((a, b) => {
    const ar = ROLE_ORDER[getPrimaryRole(a)] ?? 99;
    const br = ROLE_ORDER[getPrimaryRole(b)] ?? 99;
    if (ar !== br) return ar - br;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
  });
}

async function generateCustomerNo(): Promise<string> {
  const year = new Date().getFullYear();
  const allLeads = await leadsAPI.toArray();
  const prefix = `P${year}`;
  let maxSeq = 0;
  allLeads.forEach((l: any) => {
    if (l.customerNo && l.customerNo.startsWith(prefix)) {
      const seqStr = l.customerNo.slice(prefix.length);
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

const ROLE_COLORS: Record<string, string> = {
  sales: 'bg-blue-50 text-blue-600',
  designer: 'bg-violet-50 text-violet-600',
  manager: 'bg-amber-50 text-amber-600',
};

export default function Leads() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const notifications = useNotificationStore((state) => state.notifications);
  const leadUnreadCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    notifications.forEach((notification) => {
      if (notification.isRead) return;
      const linkedLeadId = notification.relatedTo?.type === 'lead'
        ? notification.relatedTo.id
        : String((notification as any).link || '').match(/^\/(?:erp\/)?leads\/([^/?#]+)/)?.[1];
      if (linkedLeadId) {
        counts[linkedLeadId] = (counts[linkedLeadId] || 0) + 1;
      }
    });
    return counts;
  }, [notifications]);
  const myId = user?.id || '';
  const { showConfirm } = useDialogStore();
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);
  const canViewFinance = canViewFinancialData(user?.roles, user?.role);
  const myName = user?.name || '';
  const myRole = user?.role || '';

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [canViewFinance]);

  const [leads, setLeads] = useState<any[]>([]);
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [form, setForm] = useState(INIT_FORM);
  const [employees, setEmployees] = useState<any[]>([]);
  const [filterScope, setFilterScope] = useState<'all' | 'related'>(() => isAdmin ? 'all' : 'related');
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterRatings, setFilterRatings] = useState<string[]>([]);
  const [filterSources, setFilterSources] = useState<string[]>([]);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterMonthNew, setFilterMonthNew] = useState(false);
  const [statFilter, setStatFilter] = useState<StatFilter>('all');

  const isDesktopSignedView = statFilter === 'signed' && !isMobile && isAdmin;
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostLeadId, setLostLeadId] = useState('');
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [mobileStatusPicker, setMobileStatusPicker] = useState<{ id: string; current: string } | null>(null);
  const [ratingDropdownId, setRatingDropdownId] = useState<string | null>(null);
  const [mobileRatingPicker, setMobileRatingPicker] = useState<{ id: string; current: string } | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [lostReasonCustom, setLostReasonCustom] = useState('');
  const [showSignModal, setShowSignModal] = useState(false);
  const [signLeadId, setSignLeadId] = useState('');
  const [signer, setSigner] = useState('');
  const [signDate, setSignDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [pendingEditStatus, setPendingEditStatus] = useState<string>('');
  const [assignTarget, setAssignTarget] = useState<{ lead: any; role: string } | null>(null);
  const [assignSelected, setAssignSelected] = useState<string[]>([]);

  useEffect(() => {
    setFilterScope(isAdmin ? 'all' : 'related');
  }, [user?.id, isAdmin]);

  // --- 已签单列表（签单管理视图）---
  const [signedItems, setSignedItems] = useState<any[]>([]);
  const [signedLoading, setSignedLoading] = useState(false);
  // 签单专属筛选
  const [filterReceipt, setFilterReceipt] = useState('全部'); // 全部 | 未收完 | 已收全
  const [filterSite, setFilterSite] = useState('全部');       // 全部 | 未开工 | 进行中 | 已完工
  const [filterSignedSales, setFilterSignedSales] = useState('');
  const [filterSignedDesigner, setFilterSignedDesigner] = useState('');
  const [filterSignedManager, setFilterSignedManager] = useState('');
  const [filterSignedDateFrom, setFilterSignedDateFrom] = useState('');
  const [filterSignedDateTo, setFilterSignedDateTo] = useState('');

  const fetchSignedData = useCallback(async (silent = false) => {
    if (!silent) setSignedLoading(true);
    try {
      const [allLeads, allProjects, allQuotes, allContracts, allReceipts, allExpenses] = await Promise.all([
        leadsAPI.toArray(),
        projectsAPI.toArray(),
        quotesAPI.toArray(),
        contractsAPI.toArray(),
        receiptsAPI.toArray(),
        canViewFinance ? expensesAPI.toArray() : Promise.resolve([]),
      ]);

      const signedLeads = allLeads.filter((l: any) => l.status === '已签单');

      const merged = signedLeads.map((lead: any) => {
        const relatedProjects = allProjects.filter((p: any) =>
          p.leadId === lead._id || p.relatedCustomerId === lead._id
        );
        const relatedQuotes = allQuotes.filter((q: any) => q.leadId === lead._id);
        const relatedContracts = allContracts.filter((c: any) =>
          c.customerName === lead.name && c.customerPhone === lead.phone
        );

        const totalContractAmount = relatedContracts.reduce((sum: number, c: any) => sum + (c.contractAmount || 0), 0);
        const settledAmount = relatedContracts.reduce((sum: number, c: any) => {
          return sum + allReceipts.filter((r: any) => r.contractId === c.id).reduce((s: number, r: any) => s + (r.amount || 0), 0);
        }, 0);
        const receiptPercent = totalContractAmount > 0 ? (settledAmount / totalContractAmount) * 100 : 0;
        const totalExpense = canViewFinance ? relatedContracts.reduce((sum: number, c: any) => {
          return sum + allExpenses.filter((e: any) => e.contractId === c.id).reduce((s: number, e: any) => s + (e.amount || 0), 0);
        }, 0) : 0;
        const costRatio = settledAmount > 0 ? (totalExpense / settledAmount) * 100 : 0;

        const primaryProject = relatedProjects[0] || null;
        let constructionProgress = 0;
        let currentNodeName = '';
        if (primaryProject && primaryProject.nodes) {
          const nodesData = Array.isArray(primaryProject.nodes) ? primaryProject.nodes : [];
          const stageStatuses = nodesData.map((node: any) => {
            let stageTotal = 0;
            let stageCompleted = 0;
            (node.sections || []).forEach((sec: any) => {
              const subNodes = sec.subNodes || [];
              if (subNodes.length === 0) {
                stageTotal++;
                if (sec.status === 'completed' || sec.submitted) stageCompleted++;
              } else {
                subNodes.forEach((sn: any) => {
                  stageTotal++;
                  if (sn.status === 'completed' || sn.submitted) stageCompleted++;
                });
              }
            });
            return { name: node.name || '', completed: stageCompleted, total: stageTotal };
          });
          const totalSubNodes = stageStatuses.reduce((s: number, st: any) => s + st.total, 0);
          const completedSubNodes = stageStatuses.reduce((s: number, st: any) => s + st.completed, 0);
          constructionProgress = totalSubNodes > 0 ? Math.round((completedSubNodes / totalSubNodes) * 100) : 0;

          let found = false;
          for (const st of stageStatuses) {
            if (st.completed < st.total || st.total === 0) { currentNodeName = st.name; found = true; break; }
          }
          if (!found && stageStatuses.length > 0) {
            currentNodeName = stageStatuses[stageStatuses.length - 1].name;
          }
        }

        return {
          _id: lead._id,
          name: lead.name || '',
          phone: lead.phone || '',
          address: lead.address || '',
          sales: lead.sales || [],
          designer: lead.designer || [],
          manager: lead.manager || [],
          signDate: lead.signDate || lead.updatedAt || '',
          signer: lead.signer || '',
          contractAmount: totalContractAmount,
          settledAmount,
          receiptPercent,
          totalExpense,
          costRatio,
          constructionProgress,
          currentNodeName,
          projectId: primaryProject?._id || '',
          contractId: relatedContracts[0]?.id || '',
          quoteId: relatedQuotes[0]?.id || '',
          creatorName: lead.creatorName || '',
        };
      });

      setSignedItems(merged);
    } catch (e) {
      console.error('加载签单数据失败:', e);
    } finally {
      if (!silent) setSignedLoading(false);
    }
  }, []);

  // 当切换到已签单Tab时加载签单数据
  useEffect(() => {
    if (isDesktopSignedView) {
      fetchSignedData();
    }
  }, [isDesktopSignedView, fetchSignedData]);

  // 签单数据定时刷新
  useEffect(() => {
    if (!isDesktopSignedView) return;
    const t = setInterval(() => fetchSignedData(true), 10000);
    return () => clearInterval(t);
  }, [isDesktopSignedView, fetchSignedData]);

  const fetchLeads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await leadsAPI.toArray();
      // 静默清理脏数据：删除 manager 字段中的 "1"（遗留的测试账号Bug）
      if (!silent && isAdmin) {
        let hasDirty = false;
        for (const lead of data) {
          const mgr = lead.manager || '';
          if (mgr === '1' || (typeof mgr === 'string' && mgr.split(/[,，、\s]+/).some((p: string) => p.trim() === '1'))) {
            const cleaned = mgr.split(/[,，、\s]+/).filter((p: string) => p.trim() !== '1').join(', ');
            lead.manager = cleaned;
            hasDirty = true;
            leadsAPI.update(lead._id, { manager: cleaned }).catch(() => {});
          }
        }
        if (hasDirty) console.log('[Cleanup] Fixed dirty manager data');
      }
      setAllLeads([...data]);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAdmin]);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await usersAPI.toArray();
      setEmployees(data.filter((u: any) => u.status !== 'inactive'));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { fetchLeads(); fetchEmployees(); }, [fetchLeads, fetchEmployees]);
  // 每 5 秒静默刷新数据
  useEffect(() => { const t = setInterval(() => fetchLeads(true), 5000); return () => clearInterval(t); }, [fetchLeads]);

  // 从「常用功能/快捷入口」携带 ?action=new 进入时，自动弹出新建客户弹窗
  useEffect(() => {
    if (searchParams.get('action') !== 'new') return;
    const autoAssign: any = {};
    if (myRole === 'sales') autoAssign.sales = [myName];
    if (myRole === 'designer') autoAssign.designer = [myName];
    if (myRole === 'manager') autoAssign.manager = [myName];
    setForm({ ...INIT_FORM, ...autoAssign });
    setShowCreate(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, myRole, myName, setSearchParams]);

  // 从URL参数读取筛选条件
  useEffect(() => {
    const filter = searchParams.get('filter');
    const source = searchParams.get('source');
    const employee = searchParams.get('employee');
    
    if (filter === 'monthNew') {
      setFilterMonthNew(true);
      setShowFilter(true); // 自动打开筛选面板
    } else if (filter === 'followUp') {
      setStatFilter('followUp');
    } else if (filter === 'signed') {
      setStatFilter('signed');
    } else if (filter === 'lost') {
      setStatFilter('lost');
    }
    
    if (source) {
      setFilterSources([source]);
      setShowFilter(true); // 自动打开筛选面板
    }
    
    if (employee) {
      setFilterEmployee(employee);
      setShowFilter(true); // 自动打开筛选面板
    }
    
    // 清除URL参数，避免刷新后重复应用
  }, [searchParams]);

  // 一次性数据迁移：张小琴 → 张晓琴（用统一的同步逻辑）
  useEffect(() => {
    if (!allLeads.length || (window as any)._leadsMigrated) return;
    (window as any)._leadsMigrated = true;
    import('@/db/sync').then(({ syncEmployeeName }) => {
      syncEmployeeName('张小琴', '张晓琴');
    });
  }, [allLeads.length]);

  // 保存并恢复滚动位置
  const scrollPosKey = 'leads_scroll_pos';
  useEffect(() => {
    if (loading || signedLoading) return;
    const saved = sessionStorage.getItem(scrollPosKey);
    if (saved) {
      sessionStorage.removeItem(scrollPosKey);
      const container = document.querySelector('[data-scroll="main"]');
      if (container) {
        queueMicrotask(() => container.scrollTo(0, parseInt(saved, 10)));
      }
    }
  }, [loading, signedLoading]);
  const saveScroll = useCallback(() => {
    const container = document.querySelector('[data-scroll="main"]');
    if (container) {
      sessionStorage.setItem(scrollPosKey, String(container.scrollTop));
    }
  }, []);

  const handleRowClick = (row: any) => {
    // 打*的线索（非本人相关且非已签单）不可点击
    const isRelated = isAdmin || row.creatorName === myName || includesPerson(row.sales, myName) || includesPerson(row.designer, myName) || includesPerson(row.manager, myName) || row.signer === myName;
    const showFull = isRelated || row.status === '已签单';
    if (!showFull) return;
    saveScroll();
    const fromPath = isDesktopSignedView ? '/leads?filter=signed' : `${location.pathname}${location.search}`;
    navigate(`/leads/${(row as any)._id}`, {
      state: { from: fromPath },
    });
  };

  const scopeFiltered = allLeads.filter(l => {
    if (filterScope === 'related') {
      const isRelated = l.creatorName === myName || includesPerson(l.sales, myName) || includesPerson(l.designer, myName) || includesPerson(l.manager, myName) || l.signer === myName;
      if (!isRelated) return false;
    }
    return true;
  });

  const selectionFiltered = scopeFiltered.filter(l => {
    if (search) {
      const q = search.toLowerCase();
      if (!l.name?.toLowerCase().includes(q) && !l.phone?.includes(q) && !l.address?.toLowerCase().includes(q) && !l.customerNo?.toLowerCase().includes(q)) return false;
    }
    if (filterStatuses.length > 0 && !filterStatuses.includes(l.status)) return false;
    if (filterRatings.length > 0 && !filterRatings.includes(l.rating)) return false;
    if (filterSources.length > 0 && !filterSources.includes(l.source)) return false;
    if (filterEmployee && !includesPerson(l.sales, filterEmployee) && !includesPerson(l.designer, filterEmployee) && !includesPerson(l.manager, filterEmployee) && l.creatorName !== filterEmployee) return false;
    if (filterMonthNew) {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const leadMonth = l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 7) : '';
      if (leadMonth !== thisMonth) return false;
    }
    return true;
  });

  const stats = {
    total: selectionFiltered.length,
    followUp: selectionFiltered.filter(l => l.status === '跟进中').length,
    signed: selectionFiltered.filter(l => l.status === '已签单').length,
    lost: selectionFiltered.filter(l => l.status === '已流失').length,
  };

  const activeLeadFilters = [
    filterStatuses.length > 0,
    filterRatings.length > 0,
    filterSources.length > 0,
    !!filterEmployee,
    filterMonthNew,
  ].filter(Boolean).length;
  const clearLeadFilters = () => {
    setFilterStatuses([]);
    setFilterRatings([]);
    setFilterSources([]);
    setFilterEmployee('');
    setFilterMonthNew(false);
  };

  const filtered = selectionFiltered
    .filter(l => {
      if (statFilter === 'followUp' && l.status !== '跟进中') return false;
      if (statFilter === 'signed' && l.status !== '已签单') return false;
      if (statFilter === 'lost' && l.status !== '已流失') return false;
      return true;
    })
    .sort((a, b) => {
      if (!sortField || !sortOrder) {
        const aTime = Number(a.lastFollowUpAt || 0) || (a.updatedAt ? new Date(a.updatedAt).getTime() : 0) || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const bTime = Number(b.lastFollowUpAt || 0) || (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return bTime - aTime;
      }
      const getVal = (obj: any, field: string) => {
        if (field === 'lastFollowUp') return obj.lastFollowUpAt || '';
        return obj[field] || '';
      };
      const aVal = getVal(a, sortField);
      const bVal = getVal(b, sortField);
      let cmp = 0;
      if (typeof aVal === 'string') cmp = aVal.localeCompare(bVal, 'zh-CN');
      else cmp = (aVal as number) - (bVal as number);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  const leadListKey = [
    filterScope,
    filterStatuses.join(','),
    filterRatings.join(','),
    filterSources.join(','),
    filterEmployee,
    filterMonthNew ? 'month' : '',
    statFilter,
    search.trim().toLowerCase(),
    sortField || '',
    sortOrder || '',
    myName,
  ].join('|');
  const {
    visibleItems: visibleLeads,
    visibleCount: visibleLeadCount,
    hasMore: hasMoreLeads,
    loadMore: loadMoreLeads,
  } = useIncrementalList(filtered, 'leads_visible_count', leadListKey, 20, 20);

  // --- 已签单列表筛选与排序 ---
  const signedSalesOptions = employees
    .filter(e => hasRole(e.roles, 'sales', e.role))
    .map(e => ({ value: e.name, label: e.name }));
  const signedDesignerOptions = employees
    .filter(e => hasRole(e.roles, 'designer', e.role))
    .map(e => ({ value: e.name, label: e.name }));
  const signedManagerOptions = employees
    .filter(e => hasRole(e.roles, 'manager', e.role))
    .map(e => ({ value: e.name, label: e.name }));

  const signedFiltered = signedItems
    .filter(item => {
      if (!isAdmin && filterScope === 'related') {
        const isRelated = item.creatorName === myName || includesPerson(item.sales, myName) || includesPerson(item.designer, myName) || includesPerson(item.manager, myName) || item.signer === myName;
        if (!isRelated) return false;
      }
      return true;
    })
    .filter(item => {
      if (!search) return true;
      const q = search.toLowerCase();
      return item.name?.toLowerCase().includes(q) || item.phone?.includes(q) || item.address?.toLowerCase().includes(q);
    })
    .filter(item => {
      if (filterReceipt === '全部') return true;
      if (filterReceipt === '已收全') return item.receiptPercent >= 100;
      if (filterReceipt === '未收完') return item.receiptPercent < 100;
      return true;
    })
    .filter(item => {
      if (filterSite === '全部') return true;
      if (filterSite === '未开工') return item.constructionProgress === 0;
      if (filterSite === '已完工') return item.constructionProgress >= 100;
      if (filterSite === '进行中') return item.constructionProgress > 0 && item.constructionProgress < 100;
      return true;
    })
    .filter(item => {
      if (filterSignedSales && !toPersonArray(item.sales).some((n: string) => n.includes(filterSignedSales))) return false;
      if (filterSignedDesigner && !toPersonArray(item.designer).some((n: string) => n.includes(filterSignedDesigner))) return false;
      if (filterSignedManager && !toPersonArray(item.manager).some((n: string) => n.includes(filterSignedManager))) return false;
      return true;
    })
    .filter(item => {
      if (!filterSignedDateFrom && !filterSignedDateTo) return true;
      const d = item.signDate ? dayjs(item.signDate) : null;
      if (!d) return false;
      if (filterSignedDateFrom && d.isBefore(dayjs(filterSignedDateFrom), 'day')) return false;
      if (filterSignedDateTo && d.isAfter(dayjs(filterSignedDateTo), 'day')) return false;
      return true;
    })
    .sort((a, b) => {
      if (!sortField || !sortOrder) {
        return new Date(b.signDate || 0).getTime() - new Date(a.signDate || 0).getTime();
      }
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal, 'zh-CN') : (aVal as number) - (bVal as number);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  const signedListKey = [
    filterScope,
    filterReceipt,
    filterSite,
    filterSignedSales,
    filterSignedDesigner,
    filterSignedManager,
    filterSignedDateFrom,
    filterSignedDateTo,
    search.trim().toLowerCase(),
    sortField || '',
    sortOrder || '',
    myName,
  ].join('|');
  const {
    visibleItems: visibleSignedItems,
    visibleCount: visibleSignedCount,
    hasMore: hasMoreSigned,
    loadMore: loadMoreSigned,
  } = useIncrementalList(signedFiltered, 'signed_leads_visible_count', signedListKey, 20, 20);

  const activeSignedFilters = [filterReceipt !== '全部', filterSite !== '全部', !!filterSignedSales, !!filterSignedDesigner, !!filterSignedManager, !!(filterSignedDateFrom || filterSignedDateTo)].filter(Boolean).length;

  const signedStats = useMemo(() => {
    const count = signedFiltered.length;
    const totalContract = signedFiltered.reduce((s, i) => s + (i.contractAmount || 0), 0);
    const totalSettled = signedFiltered.reduce((s, i) => s + (i.settledAmount || 0), 0);
    const totalExpense = signedFiltered.reduce((s, i) => s + (i.totalExpense || 0), 0);
    const totalProfit = totalSettled - totalExpense;
    const profitMargin = totalSettled > 0 ? (totalProfit / totalSettled) * 100 : 0;
    return { count, totalContract, totalSettled, totalExpense, totalProfit, profitMargin };
  }, [signedFiltered]);

  const clearSignedFilters = () => {
    setFilterReceipt('全部'); setFilterSite('全部');
    setFilterSignedSales(''); setFilterSignedDesigner(''); setFilterSignedManager('');
    setFilterSignedDateFrom(''); setFilterSignedDateTo('');
  };

  const handleCreate = async () => {
    if (!form.name || !form.phone || creatingLead) return;
    setCreatingLead(true);
    try {
      const customerNo = await generateCustomerNo();
      const nowIso = new Date().toISOString();
      const now = formatDateTime(nowIso);
      const autoAssign: any = {};
      if (myRole === 'sales') autoAssign.sales = [myName];
      if (myRole === 'designer') autoAssign.designer = [myName];
      if (myRole === 'manager') autoAssign.manager = [myName];
      const newLead = {
        _id: generateId(),
        customerNo,
        ...form,
        ...autoAssign,
        status: '跟进中',
        creatorName: myName,
        createdAt: now,
        updatedAt: now,
        lastFollowUp: now,
        lastFollowUpAt: Date.now(),
        followUps: [],
      };
      await leadsAPI.add(newLead);
      await addLeadAuditFollowUp({
        leadId: newLead._id,
        lead: newLead,
        actorName: myName,
        content: `${myName}新建客户：${newLead.name}，电话 ${newLead.phone || '未填写'}，地址 ${newLead.address || '未填写'}；初始状态为跟进中。`,
        createdAt: nowIso,
      });

      await createNotificationEventSafely({
        operationId: stableOperationId('lead-created', newLead._id),
        eventType: 'LEAD_CREATED',
        actorUserId: myId,
        recipientRoles: ['admin'],
        category: 'lead',
        title: '新建客户',
        content: `${myName}新建了客户“${newLead.name}”`,
        link: `/leads/${newLead._id}`,
        relatedTo: { type: 'lead', id: newLead._id, name: newLead.name },
        channels: ['station', 'wechat'],
      });

      const assignedUserIds = await resolveUserIdsByNames(newLead.sales, newLead.designer, newLead.manager);
      if (assignedUserIds.length > 0) {
        await createNotificationEventSafely({
          operationId: stableOperationId('lead-assigned', newLead._id, nowIso),
          eventType: 'LEAD_ASSIGNED',
          actorUserId: myId,
          recipientUserIds: assignedUserIds,
          category: 'lead',
          title: '新客户分配',
          content: `${myName}将客户“${newLead.name}”分配给：${namesText([...toPersonArray(newLead.sales), ...toPersonArray(newLead.designer), ...toPersonArray(newLead.manager)])}`,
          link: `/leads/${newLead._id}`,
          relatedTo: { type: 'lead', id: newLead._id, name: newLead.name },
          channels: ['station', 'wechat'],
        });
      }

      setShowCreate(false);
      setForm(INIT_FORM);
      fetchLeads(true);
    } catch (error) {
      console.error('创建客户失败', error);
      alert('创建客户失败，请稍后重试');
    } finally {
      setCreatingLead(false);
    }
  };

  const handleUpdate = async () => {
    if (!showEdit || !showEdit._id) return;
    const { _id, ...rest } = showEdit;
    const originalLead = allLeads.find((l: any) => l._id === _id);
    const updateData = { ...rest, updatedAt: new Date().toISOString() };
    await leadsAPI.update(_id, updateData);
    const changes = describeLeadChanges(originalLead, updateData, [
      { key: 'name', label: '客户姓名' },
      { key: 'phone', label: '联系电话' },
      { key: 'address', label: '项目地址' },
      { key: 'status', label: '客户状态' },
      { key: 'rating', label: '客户评级' },
      { key: 'source', label: '客户来源' },
      { key: 'sales', label: '销售', type: 'people' },
      { key: 'designer', label: '设计', type: 'people' },
      { key: 'manager', label: '工程', type: 'people' },
      { key: 'remark', label: '备注' },
    ]);
    if (changes.length > 0) {
      const nextLead = { ...originalLead, ...updateData };
      await addLeadAuditFollowUp({
        leadId: _id,
        lead: nextLead,
        actorName: myName,
        content: `${myName}编辑客户资料：${changes.join('；')}。`,
        createdAt: updateData.updatedAt,
      });
      const recipientUserIds = await resolveUserIdsByNames(nextLead.sales, nextLead.designer, nextLead.manager);
      void notifyLeadEvent({
        operationParts: ['lead-profile-edited-detail', _id, updateData.updatedAt],
        eventType: 'LEAD_PROFILE_EDITED',
        actorUserId: myId,
        actorName: myName,
        lead: nextLead,
        title: '客户资料已编辑',
        content: `${myName}编辑了客户“${nextLead.name || '客户'}”：${changes.join('；')}。`,
        recipientUserIds,
        recipientRoles: ['admin'],
      });
    }

    try {
      await syncLeadRelations(_id, { ...originalLead, ...updateData }, originalLead);
    } catch (e) {
      console.error('同步关联数据失败:', e);
    }

    setShowEdit(null);
    // 静默更新：本地状态同步
    setAllLeads(prev => prev.map(l => l._id === _id ? { ...l, ...updateData } : l));
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    const lead = allLeads.find(l => l._id === id);
    const leadName = lead?.name || '未命名客户';
    const customerNo = lead?.customerNo || id;
    const customerPhone = lead?.phone || '';
    try {
      const [allProjects, allQuotes, allContracts, allFollowUps] = await Promise.all([
        projectsAPI.toArray(),
        quotesAPI.toArray(),
        contractsAPI.toArray(),
        followUpsAPI.toArray(),
      ]);
      const relatedProjects = allProjects.filter((p: any) =>
        p.leadId === id || p.relatedCustomerId === id || p.customerNo === customerNo
      );
      const relatedQuotes = allQuotes.filter((q: any) =>
        q.leadId === id || q.customerNo === customerNo
      );
      const relatedContracts = allContracts.filter((c: any) =>
        c.customerId === id
        || c.leadId === id
        || c.customerNo === customerNo
        || (customerPhone && c.customerName === lead?.name && c.customerPhone === customerPhone)
      );
      const leadKeys = new Set(
        [id, lead?._id, lead?.id, customerNo]
          .filter(Boolean)
          .map(String)
      );
      const relatedFollowUps = allFollowUps.filter((f: any) => leadKeys.has(String(f.leadId || '')));

      const confirmed = await showConfirm(
        [
          `客户：${leadName}`,
          '',
          '将同时删除：',
          `合同 ${relatedContracts.length} 个`,
          `工地 ${relatedProjects.length} 个`,
          `报价 ${relatedQuotes.length} 个`,
          `跟进记录 ${relatedFollowUps.length} 条`,
          '',
          '此操作不可恢复，请确认是否继续。'
        ].join('\n'),
        {
          title: '确认删除客户及关联数据？',
          confirmText: '删除',
          cancelText: '取消',
          confirmStyle: 'danger',
        }
      );
      if (!confirmed) return;

      await Promise.all([
        ...relatedContracts.map((c: any) => contractsAPI.delete(c.id || c._id)),
        ...relatedProjects.map((p: any) => projectsAPI.delete(p._id || p.id)),
        ...relatedQuotes.map((q: any) => quotesAPI.delete(q._id || q.id)),
        ...relatedFollowUps.map((f: any) => followUpsAPI.delete(f._id || f.id)),
      ]);
      await leadsAPI.delete(id);
    } catch (e) {
      console.error('删除客户及关联数据失败:', e);
      return;
    }
    setAllLeads(prev => prev.filter(l => l._id !== id));
  };
  const handleStatusChange = async (id: string, newStatus: string) => {
    if (newStatus === '已签单') {
      setSignLeadId(id);
      setSigner(myName);
      setSignDate(new Date().toISOString().slice(0, 10));
      setShowSignModal(true);
      return;
    }
    if (newStatus === '已流失') {
      setLostLeadId(id);
      setLostReason('');
      setLostReasonCustom('');
      setShowLostModal(true);
      return;
    }
    const lead = allLeads.find((item: any) => item._id === id);
    const updatedAt = new Date().toISOString();
    await leadsAPI.update(id, { status: newStatus, updatedAt });
    await addLeadAuditFollowUp({
      leadId: id,
      lead,
      actorName: myName,
      content: `${myName}将客户状态从“${lead?.status || '未设置'}”调整为“${newStatus}”。`,
      createdAt: updatedAt,
    });
    fetchLeads(true);
  };

  const handleRatingChange = async (id: string, newRating: string) => {
    const lead = allLeads.find((item: any) => item._id === id);
    const updatedAt = new Date().toISOString();
    await leadsAPI.update(id, { rating: newRating, updatedAt });
    await addLeadAuditFollowUp({
      leadId: id,
      lead,
      actorName: myName,
      content: `${myName}将客户评级从“${lead?.rating || '未设置'}”调整为“${newRating}”。`,
      createdAt: updatedAt,
    });
    fetchLeads(true);
  };

  const confirmSign = async () => {
    if (!signer) {
      alert('请选择签单人');
      return;
    }
    await leadsAPI.update(signLeadId, {
      status: '已签单',
      signer,
      signDate,
      updatedAt: new Date().toISOString(),
    });
    const signedAt = new Date().toISOString();
    const sigLead = allLeads.find((l: any) => l._id === signLeadId);
    await addLeadAuditFollowUp({
      leadId: signLeadId,
      lead: sigLead,
      actorName: myName,
      content: `${myName}将客户状态调整为“已签单”，签单人：${signer}，签单日期：${signDate}。`,
      createdAt: signedAt,
    });
    setShowSignModal(false);
    setShowCelebration(true);
    setTimeout(() => {
      setShowCelebration(false);
      setSignLeadId('');
      setSigner('');
      setSignDate('');
      fetchLeads(true);
    }, 2500);
    if (showEdit) {
      setShowEdit({ ...showEdit, status: '已签单', signer, signDate });
    }
  };

  const confirmLost = async () => {
    const reason = lostReasonCustom.trim();
    if (!reason) {
      alert('请填写流失原因');
      return;
    }
    await leadsAPI.update(lostLeadId, {
      status: '已流失',
      lostReason: reason,
      updatedAt: new Date().toISOString(),
    });
    const lostLead = allLeads.find((item: any) => item._id === lostLeadId);
    await addLeadAuditFollowUp({
      leadId: lostLeadId,
      lead: lostLead,
      actorName: myName,
      content: `${myName}将客户状态调整为“已流失”，流失原因：${reason}。`,
    });
    setShowLostModal(false);
    setLostLeadId('');
    setLostReason('');
    setLostReasonCustom('');
    fetchLeads(true);
  };

  const toggleFilter = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const salesOptions = employees
    .filter(e => hasRole(e.roles, 'sales', e.role))
    .map(e => ({ value: e.name, label: e.name, group: '销售部' }));
  const designerOptions = employees
    .filter(e => hasRole(e.roles, 'designer', e.role))
    .map(e => ({ value: e.name, label: e.name, group: '设计部' }));
  const managerOptions = employees
    .filter(e => hasRole(e.roles, 'manager', e.role))
    .map(e => ({ value: e.name, label: e.name, group: '工程部' }));

  const salesGroups = [{ key: '销售部', label: '销售部' }];
  const designerGroups = [{ key: '设计部', label: '设计部' }];
  const managerGroups = [{ key: '工程部', label: '工程部' }];

  const handleSort = (field: string) => {
    if (sortField !== field) {
      setSortField(field);
      setSortOrder('desc');
    } else if (sortOrder === 'desc') {
      setSortOrder('asc');
    } else if (sortOrder === 'asc') {
      setSortField(null);
      setSortOrder(null);
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleQuickAssign = async (leadId: string, role: string, persons: string[]) => {
    if (saving) return;
    setSaving(true);
    try {
      const originalLead = allLeads.find((lead: any) => lead._id === leadId);
      const updatedAt = new Date().toISOString();
      await leadsAPI.update(leadId, { [role]: persons, updatedAt });
      await addLeadAuditFollowUp({
        leadId,
        lead: originalLead,
        actorName: myName,
        content: `${myName}调整跟进人员：${role === 'sales' ? '销售' : role === 'designer' ? '设计' : '工程'}从“${namesText(originalLead?.[role])}”调整为“${namesText(persons)}”。`,
        createdAt: updatedAt,
      });
      await notifyLeadAssignment({
        lead: { ...originalLead, [role]: persons },
        actorUserId: myId,
        actorName: myName,
        field: role,
        previous: originalLead?.[role],
        next: persons,
        operationSuffix: updatedAt,
      });
      try {
        await syncLeadRelations(leadId, { ...originalLead, [role]: persons, updatedAt }, originalLead);
      } catch (e) {
        console.error('同步跟进人员到关联数据失败:', e);
      }
      setAssignTarget(null);
      fetchLeads(true);
    } finally {
      setSaving(false);
    }
  };

  const STAT_CARDS: { key: StatFilter; label: string; count: number; color: string; activeClass: string; icon: any }[] = [
    { key: 'all', label: '全部客户', count: stats.total, color: 'text-gray-900', activeClass: 'border-gray-400 bg-gray-50', icon: Users },
    { key: 'followUp', label: '跟进中', count: stats.followUp, color: 'text-blue-600', activeClass: 'border-blue-400 bg-blue-50', icon: Clock },
    { key: 'signed', label: '已签单', count: stats.signed, color: 'text-emerald-600', activeClass: 'border-emerald-400 bg-emerald-50', icon: CheckCircle },
    { key: 'lost', label: '已流失', count: stats.lost, color: 'text-gray-500', activeClass: 'border-gray-400 bg-gray-50', icon: AlertTriangle },
  ];

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">客户管理</h1>
          <p className="erp-page-subtitle">{isDesktopSignedView ? `${signedItems.length} 个已签单客户` : '管理客户线索与跟进'}</p>
        </div>
        <button onClick={() => {
          const autoAssign: any = {};
          if (myRole === 'sales') autoAssign.sales = [myName];
          if (myRole === 'designer') autoAssign.designer = [myName];
          if (myRole === 'manager') autoAssign.manager = [myName];
          setForm({ ...INIT_FORM, ...autoAssign });
          setShowCreate(true);
        }} className="erp-btn-primary">
          <Plus size={16} /> 新建客户
        </button>
      </div>

      <div className="flex overflow-x-auto gap-1.5 md:grid md:grid-cols-4 md:gap-3 mb-3 scrollbar-hide -mx-1 px-1">
        {STAT_CARDS.map(card => {
          const Icon = card.icon;
          const active = statFilter === card.key;
          return (
            <button key={card.key} type="button" onClick={() => setStatFilter(active && statFilter !== 'all' ? 'all' : card.key)}
              className={`flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded-xl p-2.5 md:p-4 border-2 text-left transition-all cursor-pointer ${active ? card.activeClass : 'border-transparent bg-white hover:bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] md:text-xs text-gray-400">{card.label}</span>
                <Icon size={14} className={active ? card.color : 'text-gray-300'} />
              </div>
              <p className={`text-xl md:text-2xl font-bold ${active ? card.color : 'text-gray-900'}`}>{card.count}</p>
            </button>
          );
        })}
      </div>

      {/* 已签单统计卡片 */}
      {isDesktopSignedView && (
        <div className="mb-3 grid grid-cols-3 gap-3">
          <div className="flex h-20 flex-col justify-center rounded-lg border border-gray-100 bg-white px-4 py-3">
            <div className="text-[10px] text-gray-400 mb-1">合同总额 · {signedStats.count} 单</div>
            <div className="text-sm md:text-base font-bold text-gray-900">{formatMoney(signedStats.totalContract)}</div>
          </div>
          <div className="flex h-20 flex-col justify-center rounded-lg border border-gray-100 bg-emerald-50/40 px-4 py-3">
            <div className="text-[10px] text-gray-400 mb-1">已收款</div>
            <div className="text-sm md:text-base font-bold text-emerald-600">{formatMoney(signedStats.totalSettled)}</div>
          </div>
          <div className={`flex h-20 flex-col justify-center rounded-lg border px-4 py-3 ${signedStats.totalProfit >= 0 ? 'border-gray-100 bg-emerald-50/40' : 'border-gray-100 bg-red-50/40'}`}>
            <div className="text-[10px] text-gray-400 mb-1">毛利</div>
            <div className={`text-sm md:text-base font-bold ${signedStats.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {formatMoney(signedStats.totalProfit)}
              <span className="text-[10px] font-normal ml-1">{signedStats.profitMargin.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="erp-surface">
        <div className="erp-search-row">
          <div className="erp-search-field">
            <Search size={14} className="erp-search-icon" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isDesktopSignedView ? "搜索客户姓名、电话、地址" : "搜索客户姓名、电话、地址、编号"}
              className="erp-search-input" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <>
                {/* 桌面端：双按钮 */}
                <div className="hidden md:flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                  <button type="button" onClick={() => setFilterScope('related')}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${filterScope === 'related' ? 'bg-gold-400 text-black' : 'text-gray-500 hover:bg-gray-50'}`}>
                    与我相关
                  </button>
                  <button type="button" onClick={() => setFilterScope('all')}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${filterScope === 'all' ? 'bg-gold-400 text-black' : 'text-gray-500 hover:bg-gray-50'}`}>
                    全部线索
                  </button>
                </div>
                {/* 移动端：单按钮切换 */}
                <button
                  type="button"
                  onClick={() => setFilterScope(s => s === 'related' ? 'all' : 'related')}
                  className={`md:hidden shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    filterScope === 'related'
                      ? 'border-gold-400 text-gold-600 bg-gold-50/60'
                      : 'border-gray-200 text-gray-600 bg-white'
                  }`}
                >
                  {filterScope === 'related' ? '我的' : '全部'}
                </button>
            </>
            <button onClick={() => setShowFilter(!showFilter)} className={`erp-filter-button ${showFilter ? 'erp-filter-button-active' : 'erp-filter-button-idle'} ${(activeLeadFilters > 0 || isDesktopSignedView && activeSignedFilters > 0) ? 'bg-gold-50 text-gold-600 border-gold-200' : ''}`}>
              <Filter size={13} /> <span>筛选</span>
              {(isDesktopSignedView ? activeSignedFilters : activeLeadFilters) > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold-400 text-white text-[10px] font-bold">{isDesktopSignedView ? activeSignedFilters : activeLeadFilters}</span>
              )}
            </button>
          </div>
        </div>

        {!isDesktopSignedView && activeLeadFilters > 0 && (
          <div className="md:hidden flex items-center justify-between gap-3 border-b border-gray-100 bg-gold-50/50 px-3 py-2">
            <span className="min-w-0 truncate text-xs text-gray-600">
              已筛选：{filterEmployee || `${activeLeadFilters} 项条件`}
            </span>
            <button type="button" onClick={clearLeadFilters} className="shrink-0 text-xs font-medium text-gold-600">清除筛选</button>
          </div>
        )}

        {statFilter !== 'signed' && showFilter && (
          <div className="erp-filter-panel">
            {/* 已筛选条件显示 */}
            {(filterMonthNew || filterSources.length > 0 || filterEmployee) && (
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">已筛选：</span>
                {filterMonthNew && (
                  <span className="text-xs bg-gold-400 text-black px-2 py-0.5 rounded-full">本月新增</span>
                )}
                {filterSources.map(s => (
                  <span key={s} className="text-xs bg-gold-400 text-black px-2 py-0.5 rounded-full">{s}</span>
                ))}
                {filterEmployee && (
                  <span className="text-xs bg-gold-400 text-black px-2 py-0.5 rounded-full">{filterEmployee}</span>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-2">客户评级</p>
                <div className="flex flex-wrap gap-2">
                  {['A', 'B', 'C', 'D'].map(r => (
                    <button key={r} onClick={() => toggleFilter(filterRatings, setFilterRatings, r)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterRatings.includes(r) ? 'bg-gold-400 text-black border-gold-400' : 'border-gray-200 text-gray-600 hover:bg-white'}`}>{r}级</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">客户来源</p>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_OPTIONS.map(s => (
                    <button key={s} onClick={() => toggleFilter(filterSources, setFilterSources, s)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterSources.includes(s) ? 'bg-gold-400 text-black border-gold-400' : 'border-gray-200 text-gray-600 hover:bg-white'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">跟进人员</p>
                <Select searchable
                  value={filterEmployee} onChange={(value) => { setFilterEmployee(value); if (value) setFilterScope('all'); }} placeholder="全部人员"
                  options={[{ value: '', label: '全部人员' }, ...sortEmployeesForFilter(employees).map(e => ({ value: e.name, label: e.name, description: getDept(e) }))]}
                />
              </div>
            </div>
            {(filterStatuses.length > 0 || filterRatings.length > 0 || filterSources.length > 0 || filterEmployee || filterMonthNew) && (
              <div className="flex justify-end mt-3">
                <button onClick={clearLeadFilters} className="text-xs text-gold-500 hover:text-gold-600 font-medium">清除筛选</button>
              </div>
            )}
          </div>
        )}

        {/* 已签单专属筛选面板 */}
        {isDesktopSignedView && showFilter && (
          <div className="pt-2 pb-1 px-1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">收款状态</label>
                <Select value={filterReceipt} onChange={setFilterReceipt} options={[
                  { value: '全部', label: '全部' },
                  { value: '未收完', label: '未收完' },
                  { value: '已收全', label: '已收全' },
                ]} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">工地进度</label>
                <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold-400">
                  <option value="全部">全部</option>
                  <option value="未开工">未开工</option>
                  <option value="进行中">进行中</option>
                  <option value="已完工">已完工</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">销售</label>
                <select value={filterSignedSales} onChange={e => setFilterSignedSales(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold-400">
                  <option value="">全部</option>
                  {signedSalesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">设计</label>
                <select value={filterSignedDesigner} onChange={e => setFilterSignedDesigner(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold-400">
                  <option value="">全部</option>
                  {signedDesignerOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">项目经理</label>
                <Select value={filterSignedManager} onChange={setFilterSignedManager} searchable
                  options={[{ value: '', label: '全部' }, ...signedManagerOptions.map(o => ({ value: o.value, label: o.label }))]} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">签单时间 从</label>
                <CustomDatePicker value={filterSignedDateFrom} onChange={setFilterSignedDateFrom} placeholder="起始日期" compact />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">签单时间 至</label>
                <CustomDatePicker value={filterSignedDateTo} onChange={setFilterSignedDateTo} placeholder="截止日期" compact />
              </div>
              <div className="flex items-end">
                <button onClick={clearSignedFilters}
                  className="w-full flex items-center justify-center gap-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors duration-150">
                  <X size={14} /> 清除
                </button>
              </div>
            </div>
          </div>
        )}

        {!isDesktopSignedView ? (
          <>
            {loading ? (
              <div className="py-20 text-center text-gray-400 text-sm">加载中...</div>
            ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-400 text-sm">暂无客户数据</div>
        ) : (
          <>
          <DataTable
            columns={[
              { key: 'name', title: '客户', width: '320px', render: (row: any) => {
                const isRelated = isAdmin || row.creatorName === myName || includesPerson(row.sales, myName) || includesPerson(row.designer, myName) || includesPerson(row.manager, myName) || row.signer === myName;
                const showFull = isRelated || row.status === '已签单';                const displayName = showFull ? row.name : (row.name ? row.name.charAt(0) + '**' : '-');
                const displayAddress = showFull ? (row.address || '') : (row.address ? '***' : '');
                return (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate" title={displayName}>{displayName}</span>
                  {leadUnreadCountById[row._id] > 0 && (
                    <span className="inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
                      {leadUnreadCountById[row._id] > 99 ? '99+' : leadUnreadCountById[row._id]}
                    </span>
                  )}
                  {displayAddress && <span className="hidden md:inline text-xs text-gray-400 shrink-0">-</span>}
                  {displayAddress && <span className="hidden md:inline text-xs text-gray-600 truncate" title={displayAddress}>{displayAddress}</span>}
                  {displayAddress && <span className="md:hidden text-sm font-medium text-gray-900 truncate" title={displayAddress}>- {displayAddress}</span>}
                </div>
              )}},
              { key: 'status', title: '状态', width: '90px', sortable: true, render: (row: any) => {
                const isOpen = statusDropdownId === row._id;
                return (
                  <>
                    {/* 桌面端：下拉菜单 */}
                    <div className="hidden md:relative md:block" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setStatusDropdownId(isOpen ? null : row._id)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-all hover:opacity-80 ${STATUS_COLORS[row.status] || ''}`}
                      >
                        {row.status}
                      </button>
                      {isOpen && (
                        <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-100 shadow-lg rounded-lg py-1 min-w-[100px]" onMouseLeave={() => setStatusDropdownId(null)}>
                          {['跟进中', '已签单', '已流失'].map(s => (
                            <button
                              key={s}
                              onClick={() => { setStatusDropdownId(null); handleStatusChange(row._id, s); }}
                              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                                row.status === s ? 'font-semibold' : ''
                              } ${STATUS_COLORS[s] || ''}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* 移动端：点击打开底部抽屉 */}
                    <div className="md:hidden" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setMobileStatusPicker({ id: row._id, current: row.status })}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-all hover:opacity-80 ${STATUS_COLORS[row.status] || ''}`}
                      >
                        {row.status}
                      </button>
                    </div>
                  </>
                );
              }},
              { key: 'rating', title: '评级', width: '70px', sortable: true, render: (row: any) => {
                const rOpen = ratingDropdownId === row._id;
                return (
                  <>
                    {/* 桌面端：下拉菜单 */}
                    <div className="hidden md:relative md:block" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setRatingDropdownId(rOpen ? null : row._id)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-all hover:opacity-80 ${RATING_COLORS[row.rating] || ''}`}
                      >
                        {row.rating}
                      </button>
                      {rOpen && (
                        <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-100 shadow-lg rounded-lg py-1 min-w-[80px]" onMouseLeave={() => setRatingDropdownId(null)}>
                          {['A', 'B', 'C', 'D'].map(r => (
                            <button
                              key={r}
                              onClick={() => { setRatingDropdownId(null); handleRatingChange(row._id, r); }}
                              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                                row.rating === r ? 'font-semibold' : ''
                              } ${RATING_COLORS[r] || ''}`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* 移动端：点击打开底部抽屉 */}
                    <div className="md:hidden" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setMobileRatingPicker({ id: row._id, current: row.rating })}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-all hover:opacity-80 ${RATING_COLORS[row.rating] || ''}`}
                      >
                        {row.rating}
                      </button>
                    </div>
                  </>
                );
              }},
              { key: 'source', title: '来源', hideOn: 'md', sortable: true, width: '210px', truncate: true, render: (row: any) => {
                const fullSource = row.source === '其他' && row.sourceCustom ? `其他：${row.sourceCustom}` : (row.source || '-');
                const displaySource = row.source === '其他' ? '其他' : (row.source || '-');
                return <span className="block max-w-[160px] truncate text-xs text-gray-500" title={fullSource}>{displaySource}</span>;
              }},
              { key: 'requirementType', title: '需求', hideOn: 'md', width: '110px', truncate: true, render: (row: any) => (
                <span className="block max-w-[80px] truncate text-xs text-gray-500" title={row.requirementType || '-'}>{row.requirementType || '-'}</span>
              )},
              { key: 'budget', title: '预算', hideOn: 'md', width: '120px', render: (row: any) => (
                <span className="text-xs text-gray-500">{row.budget && row.budget !== '暂无' ? row.budget : '-'}</span>
              )},
              { key: 'team', title: '跟进人员', width: '300px', render: (row: any) => {
                const isRelated2 = isAdmin || row.creatorName === myName || includesPerson(row.sales, myName) || includesPerson(row.designer, myName) || includesPerson(row.manager, myName) || row.signer === myName;
                const sf = isRelated2 || row.status === '已签单';
                if (!sf) return <span className="text-xs text-gray-300">-</span>;
                const canAssign = isAdmin || row.creatorName === myName || includesPerson(row.sales, myName) || includesPerson(row.designer, myName) || includesPerson(row.manager, myName);
                const roles = [
                  { role: 'sales', label: '销售', names: toPersonArray(row.sales), color: 'bg-blue-50 text-blue-600' },
                  { role: 'designer', label: '设计', names: toPersonArray(row.designer), color: 'bg-violet-50 text-violet-600' },
                  { role: 'manager', label: '工程', names: toPersonArray(row.manager), color: 'bg-amber-50 text-amber-600' },
                ];
                return (
                  <div className="flex flex-wrap gap-1" style={{ whiteSpace: 'normal', maxWidth: 310 }}>
                    {roles.map(r => (
                      r.names.length > 0 ? (
                        r.names.map(n => (
                          <span
                            key={r.role + n}
                            onClick={(e) => { e.stopPropagation(); if (canAssign) { setAssignSelected(r.names); setAssignTarget({ lead: row, role: r.role }); } }}
                            className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded ${r.color} ${canAssign ? 'cursor-pointer hover:opacity-80' : ''}`}
                            title={canAssign ? `点击编辑${r.label}` : n}
                          >{n}</span>
                        ))
                      ) : canAssign ? (
                        <button
                          key={r.role}
                          onClick={(e) => { e.stopPropagation(); setAssignSelected([]); setAssignTarget({ lead: row, role: r.role }); }}
                          className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gold-400 hover:text-gold-600 hover:bg-gold-50 transition-colors"
                          title={`分配${r.label}`}
                        >
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                          {r.label}
                        </button>
                      ) : null
                    ))}
                  </div>
                );
              }},
              { key: 'lastFollowUp', title: '最新跟进', width: '170px', sortable: true, hideOn: 'md', render: (row: any) => (
                <span className="text-xs text-gray-400 whitespace-nowrap">{row.lastFollowUp || '-'}</span>
              )},
              { key: 'actions', title: '', width: '70px', render: (row: any) => {
                const canEdit = isAdmin || row.creatorName === myName || includesPerson(row.sales, myName) || includesPerson(row.designer, myName) || includesPerson(row.manager, myName);
                return (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  {canEdit && <button onClick={() => setShowEdit({ ...row })} className="p-1 text-gray-400 hover:text-gold-500 rounded hover:bg-gold-50 transition-colors"><Edit3 size={13} /></button>}
                  {isAdmin && (
                    <button onClick={() => handleDelete(row._id)} className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                  )}
                </div>
              )}},
            ]}
            mobileCardColumns={[
              { key: 'mobileLead', title: '客户', render: (row: any) => {
                const isRelated = isAdmin || row.creatorName === myName || includesPerson(row.sales, myName) || includesPerson(row.designer, myName) || includesPerson(row.manager, myName) || row.signer === myName;
                const showFull = isRelated || row.status === '已签单';                const displayName = showFull ? row.name : (row.name ? row.name.charAt(0) + '**' : '-');
                const displayAddress = showFull ? (row.address || '无地址') : (row.address ? '***' : '无地址');
                return (
                  <div className="min-w-0 pr-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="min-w-0 truncate text-sm font-medium text-gray-900" title={displayName}>{displayName}</div>
                      {leadUnreadCountById[row._id] > 0 && (
                        <span className="inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
                          {leadUnreadCountById[row._id] > 99 ? '99+' : leadUnreadCountById[row._id]}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 truncate" title={displayAddress}>{displayAddress}</div>
                  </div>
                );
              }},
              { key: 'mobileStatus', title: '状态', render: (row: any) => (
                <div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMobileStatusPicker({ id: row._id, current: row.status }); }}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-all hover:opacity-80 ${STATUS_COLORS[row.status] || ''}`}
                  >
                    {row.status}
                  </button>
                </div>
              )},
              { key: 'mobileTeam', title: '跟进人员', render: (row: any) => {
                const isRelated3 = isAdmin || row.creatorName === myName || includesPerson(row.sales, myName) || includesPerson(row.designer, myName) || includesPerson(row.manager, myName) || row.signer === myName;
                const sf2 = isRelated3 || row.status === '已签单';
                if (!sf2) return <span className="text-xs text-gray-300">-</span>;
                const canAssign = isAdmin || row.creatorName === myName || includesPerson(row.sales, myName) || includesPerson(row.designer, myName) || includesPerson(row.manager, myName);
                const roles = [
                  { role: 'sales', label: '销售', names: toPersonArray(row.sales), color: 'bg-blue-50 text-blue-600' },
                  { role: 'designer', label: '设计', names: toPersonArray(row.designer), color: 'bg-violet-50 text-violet-600' },
                  { role: 'manager', label: '工程', names: toPersonArray(row.manager), color: 'bg-amber-50 text-amber-600' },
                ];
                const hasAnyPerson = roles.some(r => r.names.length > 0);
                return (
                  <div className="flex items-start pt-1">
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {roles.map(r => (
                        r.names.length > 0 ? (
                          r.names.map(n => (
                            <span
                              key={r.role + n}
                              onClick={(e) => { e.stopPropagation(); if (canAssign) { setAssignSelected(r.names); setAssignTarget({ lead: row, role: r.role }); } }}
                              className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded ${r.color} ${canAssign ? 'cursor-pointer hover:opacity-80' : ''}`}
                              title={canAssign ? `点击编辑${r.label}` : n}
                            >{n}</span>
                          ))
                        ) : canAssign ? (
                          <button
                            key={r.role}
                            onClick={(e) => { e.stopPropagation(); setAssignSelected([]); setAssignTarget({ lead: row, role: r.role }); }}
                            className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gold-400 hover:text-gold-600 hover:bg-gold-50 transition-colors"
                            title={`分配${r.label}`}
                          >
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                            {r.label}
                          </button>
                        ) : null
                      ))}
                      {!hasAnyPerson && !canAssign && <span className="text-xs text-gray-400 leading-6">暂无</span>}
                    </div>
                  </div>
                );
              }},
            ]}
            data={visibleLeads as unknown as Record<string, unknown>[]}
            onRowClick={handleRowClick}
            rowKey={(row) => (row as any)._id as string}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            horizontalScroll
          />
          {hasMoreLeads && (
            <div className="flex justify-center border-t border-gray-50 px-4 py-4">
              <button
                type="button"
                onClick={loadMoreLeads}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gold-300 hover:bg-gold-50 hover:text-gold-700 transition-colors"
              >
                加载更多（已显示 {visibleLeadCount} / 共 {filtered.length}）
              </button>
            </div>
          )}
          </>
        )}
          </>
        ) : (
          signedLoading ? (
            <div className="py-20 text-center text-gray-400 text-sm">加载中...</div>
          ) : signedFiltered.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">暂无签单数据</div>
          ) : (
            <>
            <DataTable
              columns={[
                { key: 'address', title: '项目地址', sortable: true, truncate: true, render: (row: any) => (
                  <span className="text-gray-900">{row.address || '-'}</span>
                )},
                { key: 'name', title: '客户姓名', render: (row: any) => (
                  <span className="text-gray-900">{row.name || '-'}</span>
                )},
                { key: 'phone', title: '联系方式', render: (row: any) => (
                  <span className="text-gray-600">{row.phone || '-'}</span>
                )},
                { key: 'contractAmount', title: '合同金额', sortable: true, render: (row: any) => (
                  <span className="font-medium text-gray-900 whitespace-nowrap">¥{row.contractAmount.toLocaleString()}</span>
                )},
                { key: 'settledAmount', title: '结算金额', sortable: true, render: (row: any) => (
                  <span className="text-gray-700 whitespace-nowrap">¥{row.settledAmount.toLocaleString()}</span>
                )},
                { key: 'receiptPercent', title: '收款进度', render: (row: any) => (
                  <ProgressBar percent={row.receiptPercent} color={row.receiptPercent >= 100 ? 'bg-emerald-500' : row.receiptPercent >= 50 ? 'bg-amber-400' : 'bg-red-400'} />
                )},
                ...(canViewFinance ? [
                  { key: 'grossProfit', title: '毛利润', sortable: true, render: (row: any) => {
                    const profit = row.settledAmount - row.totalExpense;
                    return <span className={`font-medium whitespace-nowrap ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>¥{profit.toLocaleString()}</span>;
                  }},
                  { key: 'totalExpense', title: '项目支出', sortable: true, render: (row: any) => (
                    <span className="text-gray-700 whitespace-nowrap">¥{row.totalExpense.toLocaleString()}</span>
                  )},
                  { key: 'costRatio', title: '成本分析', width: '100px', render: (row: any) => (
                    row.contractId ? (
                      <LinkBtn
                        icon={TrendingDown}
                        label={`${row.settledAmount > 0 ? Math.round(row.costRatio) + '%' : '-'}`}
                        onClick={() => { saveScroll(); navigate(`/projects?contractId=${row.contractId}`); }}
                      />
                    ) : <span className="text-[11px] text-gray-300">-</span>
                  )},
                ] : []),
                { key: 'constructionProgress', title: '工地进度', render: (row: any) => (
                  <div className="flex flex-col gap-0.5 min-w-[100px]">
                    <ProgressBar percent={row.constructionProgress} color="bg-blue-500" />
                    {row.currentNodeName && <span className="text-[10px] text-gray-400 truncate">{row.currentNodeName}</span>}
                  </div>
                )},
                { key: 'siteLink', title: '工地详情', width: '90px', render: (row: any) => (
                  row.projectId ? (
                    <LinkBtn icon={HardHat} label="工地详情" onClick={() => { saveScroll(); navigate(`/projects-biz/${row.projectId}`); }} />
                  ) : <span className="text-[11px] text-gray-300">-</span>
                )},
                { key: 'quoteLink', title: '报价', width: '80px', render: (row: any) => (
                  row.quoteId ? (
                    <LinkBtn icon={PenTool} label="报价" onClick={() => { saveScroll(); navigate(`/quotes-biz/${row.quoteId}`); }} />
                  ) : <span className="text-[11px] text-gray-300">-</span>
                )},
                { key: 'contractLink', title: '合同', width: '80px', render: (row: any) => (
                  row.contractId ? (
                    <LinkBtn icon={FileText} label="合同" onClick={() => { saveScroll(); navigate(`/contracts/${row.contractId}`); }} />
                  ) : <span className="text-[11px] text-gray-300">-</span>
                )},
                { key: 'incomeLink', title: '客户收款', width: '90px', render: (row: any) => (
                  row.contractId ? (
                    <LinkBtn icon={DollarSign} label="收款明细" onClick={() => { saveScroll(); navigate(`/income?contractId=${row.contractId}`); }} />
                  ) : <span className="text-[11px] text-gray-300">-</span>
                )},
                { key: 'unsettledAmount', title: '未收金额', sortable: true, render: (row: any) => {
                  const unsettled = row.contractAmount - row.settledAmount;
                  return <span className={`font-medium whitespace-nowrap ${unsettled > 0 ? 'text-red-500' : 'text-gray-400'}`}>¥{unsettled.toLocaleString()}</span>;
                }},
                { key: 'sales', title: '销售', render: (row: any) => {
                  const names: string[] = Array.isArray(row.sales) ? row.sales : toPersonArray(row.sales);
                  return (
                    <div className="flex items-center gap-1 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {names.length > 0 ? names.map((n: string) => (
                        <span key={n} onClick={() => { setAssignSelected(names); setAssignTarget({ lead: row, role: 'sales' }); }}
                          className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 cursor-pointer hover:opacity-80">{n}</span>
                      )) : (
                        <button onClick={() => { setAssignSelected([]); setAssignTarget({ lead: row, role: 'sales' }); }}
                          className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gold-400 hover:text-gold-600 hover:bg-gold-50 transition-colors">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>销售</button>
                      )}
                    </div>
                  );
                }},
                { key: 'designer', title: '设计', render: (row: any) => {
                  const names: string[] = Array.isArray(row.designer) ? row.designer : toPersonArray(row.designer);
                  return (
                    <div className="flex items-center gap-1 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {names.length > 0 ? names.map((n: string) => (
                        <span key={n} onClick={() => { setAssignSelected(names); setAssignTarget({ lead: row, role: 'designer' }); }}
                          className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 cursor-pointer hover:opacity-80">{n}</span>
                      )) : (
                        <button onClick={() => { setAssignSelected([]); setAssignTarget({ lead: row, role: 'designer' }); }}
                          className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gold-400 hover:text-gold-600 hover:bg-gold-50 transition-colors">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>设计</button>
                      )}
                    </div>
                  );
                }},
                { key: 'manager', title: '项目经理', render: (row: any) => {
                  const names: string[] = Array.isArray(row.manager) ? row.manager : toPersonArray(row.manager);
                  return (
                    <div className="flex items-center gap-1 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {names.length > 0 ? names.map((n: string) => (
                        <span key={n} onClick={() => { setAssignSelected(names); setAssignTarget({ lead: row, role: 'manager' }); }}
                          className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 cursor-pointer hover:opacity-80">{n}</span>
                      )) : (
                        <button onClick={() => { setAssignSelected([]); setAssignTarget({ lead: row, role: 'manager' }); }}
                          className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gold-400 hover:text-gold-600 hover:bg-gold-50 transition-colors">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>工程</button>
                      )}
                    </div>
                  );
                }},
                { key: 'signDate', title: '签单时间', sortable: true, width: '90px', render: (row: any) => (
                  <span className="text-gray-500 whitespace-nowrap">{formatDate(row.signDate)}</span>
                )},
              ]}
              data={visibleSignedItems as unknown as Record<string, unknown>[]}
              rowKey={(row) => (row as any)._id as string}
              mobileFixedLeft={0}
              horizontalScroll
              sortField={sortField}
              sortOrder={sortOrder}
              onSort={handleSort}
              emptyText="暂无签单数据"
            />
            {hasMoreSigned && (
              <div className="flex justify-center border-t border-gray-50 px-4 py-4">
                <button
                  type="button"
                  onClick={loadMoreSigned}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gold-300 hover:bg-gold-50 hover:text-gold-700 transition-colors"
                >
                  加载更多（已显示 {visibleSignedCount} / 共 {signedFiltered.length}）
                </button>
              </div>
            )}
            </>
          )
        )}
      </div>

      {showCreate && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg [&_input]:text-[13px] [&_input]:md:text-sm [&_textarea]:text-[13px] [&_textarea]:md:text-sm" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100"><h2 className="text-base md:text-lg font-bold">新建客户</h2></div>
            <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto scrollbar-hide">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">客户姓名 *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">联系电话 *</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">小区地址</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">房屋面积(㎡)</label><input value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">装修预算</label>
                  <input value={form.budget || ''} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="例：15万"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">需求类型</label>
                  <SearchableSelect
                    options={REQ_OPTIONS.map(r => ({ value: r, label: r }))}
                    value={form.requirementType} onChange={v => setForm({ ...form, requirementType: v })} placeholder="选择类型"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">客户来源</label>
                  <SearchableSelect
                    options={SOURCE_OPTIONS.map(s => ({ value: s, label: s }))}
                    value={form.source} onChange={v => setForm({ ...form, source: v })} placeholder="选择来源"
                  />
                  {form.source === '其他' && (
                    <input value={form.sourceCustom || ''} onChange={e => setForm({ ...form, sourceCustom: e.target.value })} placeholder="请输入具体来源"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 mt-2"
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">客户评级</label>
                  <SearchableSelect
                    options={['A', 'B', 'C', 'D'].map(r => ({ value: r, label: `${r}级` }))}
                    value={form.rating} onChange={v => setForm({ ...form, rating: v })} placeholder="选择评级"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">销售</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {form.sales.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                      {s}
                      <button type="button" onClick={() => setForm({ ...form, sales: form.sales.filter((x: string) => x !== s) })} className="hover:text-blue-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect
                  compact
                  options={salesOptions}
                  value="" onChange={v => { if (v && !form.sales.includes(v)) setForm({ ...form, sales: [...form.sales, v] }); }}
                  placeholder="添加销售" searchPlaceholder="搜索姓名..." groups={salesGroups}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">设计师</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {form.designer.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-violet-50 text-violet-600">
                      {s}
                      <button type="button" onClick={() => setForm({ ...form, designer: form.designer.filter((x: string) => x !== s) })} className="hover:text-violet-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect
                  compact
                  options={designerOptions}
                  value="" onChange={v => { if (v && !form.designer.includes(v)) setForm({ ...form, designer: [...form.designer, v] }); }}
                  placeholder="添加设计师" searchPlaceholder="搜索姓名..." groups={designerGroups}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">工程</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {form.manager.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600">
                      {s}
                      <button type="button" onClick={() => setForm({ ...form, manager: form.manager.filter((x: string) => x !== s) })} className="hover:text-amber-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect
                  compact
                  options={managerOptions}
                  value="" onChange={v => { if (v && !form.manager.includes(v)) setForm({ ...form, manager: [...form.manager, v] }); }}
                  placeholder="添加工程" searchPlaceholder="搜索姓名..." groups={managerGroups}
                />
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">备注</label><textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" /></div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate} disabled={creatingLead} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-50">{creatingLead ? '创建中...' : '创建'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showEdit && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowEdit(null)}>
          <div className="bg-white rounded-xl w-full max-w-lg [&_input]:text-[13px] [&_input]:md:text-sm [&_textarea]:text-[13px] [&_textarea]:md:text-sm" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100"><h2 className="text-base md:text-lg font-bold">编辑客户</h2></div>
            <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto scrollbar-hide">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">客户姓名</label><input value={showEdit.name || ''} onChange={e => setShowEdit({ ...showEdit, name: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">联系电话</label><input value={showEdit.phone || ''} onChange={e => setShowEdit({ ...showEdit, phone: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">小区地址</label><input value={showEdit.address || ''} onChange={e => setShowEdit({ ...showEdit, address: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">房屋面积(㎡)</label><input value={showEdit.area || ''} onChange={e => setShowEdit({ ...showEdit, area: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">装修预算</label>
                  <input value={showEdit.budget || ''} onChange={e => setShowEdit({ ...showEdit, budget: e.target.value })} placeholder="例：15万"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">需求类型</label>
                  <SearchableSelect
                    options={REQ_OPTIONS.map(r => ({ value: r, label: r }))}
                    value={showEdit.requirementType || '毛坯'} onChange={v => setShowEdit({ ...showEdit, requirementType: v })} placeholder="选择类型"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">客户状态</label>
                  <SearchableSelect
                    options={['跟进中', '已签单', '已流失'].map(s => ({ value: s, label: s }))}
                    value={showEdit.status || '跟进中'} onChange={v => {
                      if (v === '已签单') {
                        setSignLeadId(showEdit._id);
                        setSigner('');
                        setSignDate(new Date().toISOString().slice(0, 10));
                        setShowSignModal(true);
                        setPendingEditStatus(v);
                      } else if (v === '已流失') {
                        setLostLeadId(showEdit._id);
                        setLostReason('');
                        setLostReasonCustom('');
                        setShowLostModal(true);
                        setPendingEditStatus(v);
                      } else {
                        setShowEdit({ ...showEdit, status: v });
                      }
                    }} placeholder="选择状态"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">客户评级</label>
                  <SearchableSelect
                    options={['A', 'B', 'C', 'D'].map(r => ({ value: r, label: `${r}级` }))}
                    value={showEdit.rating || 'C'} onChange={v => setShowEdit({ ...showEdit, rating: v })} placeholder="选择评级"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">客户来源</label>
                  <SearchableSelect
                    options={SOURCE_OPTIONS.map(s => ({ value: s, label: s }))}
                    value={showEdit.source || '自然进店'} onChange={v => setShowEdit({ ...showEdit, source: v })} placeholder="选择来源"
                  />
                  {(showEdit.source || '自然进店') === '其他' && (
                    <input value={showEdit.sourceCustom || ''} onChange={e => setShowEdit({ ...showEdit, sourceCustom: e.target.value })} placeholder="请输入具体来源"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 mt-2"
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">客户编号</label>
                  <input value={showEdit.customerNo || ''} readOnly className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">销售</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {toPersonArray(showEdit.sales).map(s => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                      {s}
                      <button type="button" onClick={() => setShowEdit({ ...showEdit, sales: toPersonArray(showEdit.sales).filter((x: string) => x !== s) })} className="hover:text-blue-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect
                  compact
                  options={salesOptions}
                  value="" onChange={v => { if (v && !toPersonArray(showEdit.sales).includes(v)) setShowEdit({ ...showEdit, sales: [...toPersonArray(showEdit.sales), v] }); }}
                  placeholder="添加销售" searchPlaceholder="搜索姓名..." groups={salesGroups}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">设计师</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {toPersonArray(showEdit.designer).map(s => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-violet-50 text-violet-600">
                      {s}
                      <button type="button" onClick={() => setShowEdit({ ...showEdit, designer: toPersonArray(showEdit.designer).filter((x: string) => x !== s) })} className="hover:text-violet-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect
                  compact
                  options={designerOptions}
                  value="" onChange={v => { if (v && !toPersonArray(showEdit.designer).includes(v)) setShowEdit({ ...showEdit, designer: [...toPersonArray(showEdit.designer), v] }); }}
                  placeholder="添加设计师" searchPlaceholder="搜索姓名..." groups={designerGroups}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">工程</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {toPersonArray(showEdit.manager).map(s => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600">
                      {s}
                      <button type="button" onClick={() => setShowEdit({ ...showEdit, manager: toPersonArray(showEdit.manager).filter((x: string) => x !== s) })} className="hover:text-amber-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect
                  compact
                  options={managerOptions}
                  value="" onChange={v => { if (v && !toPersonArray(showEdit.manager).includes(v)) setShowEdit({ ...showEdit, manager: [...toPersonArray(showEdit.manager), v] }); }}
                  placeholder="添加工程" searchPlaceholder="搜索姓名..." groups={managerGroups}
                />
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">备注</label><textarea value={showEdit.remark || ''} onChange={e => setShowEdit({ ...showEdit, remark: e.target.value })} rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" /></div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowEdit(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleUpdate} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500">保存</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSignModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setShowSignModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100"><h2 className="text-lg font-bold">签单确认</h2></div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-600">确认该客户已签单，请填写签单信息。</p>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">签单人 *</label>
                <SearchableSelect
                  options={employees.map(e => ({ value: e.name, label: e.name, group: getDept(e) }))}
                  value={signer} onChange={setSigner} placeholder="选择签单人"
                  searchPlaceholder="搜索姓名..."
                  groups={DEPT_ORDER.filter(d => employees.some(e => getDept(e) === d)).map(d => ({ key: d, label: d }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">签单日期</label>
                <CustomDatePicker value={signDate} onChange={setSignDate} />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowSignModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={confirmSign} className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600">确认签单</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLostModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setShowLostModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100"><h2 className="text-lg font-bold">客户流失确认</h2></div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-600">请记录该客户流失的详细原因，以便后续分析和改进。</p>
              <div><label className="text-xs text-gray-500 mb-1 block">流失原因</label><textarea value={lostReasonCustom} onChange={e => setLostReasonCustom(e.target.value)} placeholder="请输入详细的流失原因..." rows={3} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" /></div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowLostModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={confirmLost} className="px-4 py-2 text-sm bg-rose-500 text-white rounded-lg font-medium hover:bg-rose-600">确认流失</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showCelebration && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none" style={{ animation: 'fadeIn 0.3s ease' }}>
          <div className="absolute inset-0 bg-black/50" />
          {Array.from({ length: 40 }).map((_, i) => {
            const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
            const color = colors[i % colors.length];
            const left = Math.random() * 100;
            const delay = Math.random() * 1.5;
            const size = 6 + Math.random() * 8;
            const duration = 2 + Math.random() * 2;
            return (
              <div key={i} style={{
                position: 'absolute', left: `${left}%`, top: '-20px',
                width: `${size}px`, height: `${size}px`,
                backgroundColor: color, borderRadius: i % 3 === 0 ? '50%' : '2px',
                animation: `confettiFall ${duration}s ${delay}s ease-in forwards`,
                opacity: 0,
              }} />
            );
          })}
          <div className="relative z-10 text-center" style={{ animation: 'celebrateBounce 0.5s ease' }}>
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-3xl font-bold text-white mb-2">恭喜签单！</h2>
            <p className="text-white/70 text-lg">客户已成功签单</p>
            <p className="text-white/50 text-sm mt-1">签单人：{signer} · {signDate}</p>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Assign Modal */}
      {assignTarget && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAssignTarget(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                {assignTarget.role
                  ? `分配${assignTarget.role === 'sales' ? '销售' : assignTarget.role === 'designer' ? '设计师' : '工程'} — ${assignTarget.lead.name}`
                  : `分配跟进人员 — ${assignTarget.lead.name}`}
              </h3>
            </div>
            <div className="p-3 max-h-64 overflow-y-auto scrollbar-hide space-y-1">
              {(() => {
                const opts = assignTarget.role
                  ? (assignTarget.role === 'sales' ? salesOptions : assignTarget.role === 'designer' ? designerOptions : managerOptions)
                  : [...salesOptions, ...designerOptions, ...managerOptions];
                return opts.length > 0 ? opts.map(opt => {
                  const checked = assignSelected.includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gold-50 cursor-pointer transition-colors">
                      <input type="checkbox" checked={checked} onChange={() => {
                        setAssignSelected(prev => checked ? prev.filter(x => x !== opt.value) : [...prev, opt.value]);
                      }} className="w-4 h-4 text-gold-400 border-gray-300 rounded focus:ring-gold-400" />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  );
                }) : <div className="text-sm text-gray-400 text-center py-6">暂无可分配人员</div>;
              })()}
            </div>
            <div className="p-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setAssignTarget(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700" disabled={saving}>取消</button>
              <button onClick={() => handleQuickAssign(assignTarget.lead._id, assignTarget.role || 'sales', assignSelected)} disabled={saving} className="px-4 py-1.5 text-xs bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 disabled:opacity-50">
                {saving ? '保存中...' : '确认'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 移动端状态选择器 - 底部抽屉 */}
      <BottomDrawer
        open={!!mobileStatusPicker}
        onClose={() => setMobileStatusPicker(null)}
        title="更改客户状态"
      >
        <div className="space-y-1">
          {['跟进中', '已签单', '已流失'].map(s => (
            <button
              key={s}
              onClick={() => {
                const picker = mobileStatusPicker;
                setMobileStatusPicker(null);
                if (picker) handleStatusChange(picker.id, s);
              }}
              className={`w-full text-left px-4 py-3 text-sm rounded-lg transition-colors ${
                mobileStatusPicker?.current === s
                  ? 'font-semibold bg-gray-50 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`inline-block ${STATUS_COLORS[s] || ''}`}>{s}</span>
            </button>
          ))}
        </div>
      </BottomDrawer>

      {/* 移动端评级选择器 - 底部抽屉 */}
      <BottomDrawer
        open={!!mobileRatingPicker}
        onClose={() => setMobileRatingPicker(null)}
        title="更改客户评级"
      >
        <div className="space-y-1">
          {['A', 'B', 'C', 'D'].map(r => (
            <button
              key={r}
              onClick={() => {
                const picker = mobileRatingPicker;
                setMobileRatingPicker(null);
                if (picker) handleRatingChange(picker.id, r);
              }}
              className={`w-full text-left px-4 py-3 text-sm rounded-lg transition-colors ${
                mobileRatingPicker?.current === r
                  ? 'font-semibold bg-gray-50 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${RATING_COLORS[r] || ''}`}>{r}级</span>
            </button>
          ))}
        </div>
      </BottomDrawer>
    </div>
  );
}
