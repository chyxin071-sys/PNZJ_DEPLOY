import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Filter, Calendar, Clock, CheckCircle, Circle,
  Trash2, Edit3, Users, ChevronRight, ChevronDown,
  ChevronLeft, X, Paperclip, RotateCcw, UserCheck, AlertTriangle,
  Download, Eye, Upload, Loader2
} from 'lucide-react';
import { todosAPI, usersAPI, leadsAPI, projectsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';
import { formatDate, formatDateTime, generateId } from '@/utils/format';
import BottomDrawer from '@/components/BottomDrawer';
import DataTable from '@/components/DataTable';
import FormAttachmentList from '@/components/FormAttachmentList';
import {
  downloadAttachment,
  normalizeAttachments,
  openAttachment,
  uploadFinanceAttachments,
} from '@/utils/financeAttachments';
import { createNotificationEventSafely, stableOperationId, TODO_NOTIFICATION_TEMPLATE_ID } from '@/services/notificationService';

const PRIORITY_MAP: Record<string, string> = { high: '紧急', medium: '重要', low: '普通' };
const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-50 text-red-600', medium: 'bg-orange-50 text-orange-600', low: 'bg-blue-50 text-blue-600',
};
const ROLE_DEPT: Record<string, string> = {
  admin: '管理组', sales: '销售部', designer: '设计部',
  manager: '工程部', finance: '财务部', employee: '普通',
};
const DEPT_ORDER = [ROLE_DEPT.sales, ROLE_DEPT.designer, ROLE_DEPT.manager, ROLE_DEPT.finance, ROLE_DEPT.admin, ROLE_DEPT.employee];
const ROLE_ORDER: Record<string, number> = { sales: 0, designer: 1, manager: 2, finance: 3, admin: 4, employee: 5 };
const RELATED_TYPE_MAP: Record<string, string> = { none: '无', lead: '客户', project: '工地' };
const TODO_USER_FIELDS = { _id: true, id: true, name: true, role: true, roles: true, department: true, status: true };
const TODO_LEAD_FIELDS = { _id: true, name: true };
const TODO_PROJECT_FIELDS = { _id: true, address: true, customer: true, manager: true, sales: true, designer: true, creatorName: true };

type StatFilter = 'all' | 'pending' | 'completed' | 'overdue';

const INIT_FORM = {
  title: '', description: '', priority: 'medium' as string, dueDate: '',
  relatedType: 'none' as string, relatedId: '', relatedName: '',
  assignees: [] as { id: string; name: string }[],
  attachments: [] as any[],
};

function getDept(emp: any): string {
  if (emp.department) return emp.department;
  return ROLE_DEPT[emp.role] || '普通';
}
function getPrimaryRole(emp: any): string {
  const roles = Array.isArray(emp.roles) ? emp.roles : [];
  return roles.find((role: string) => role in ROLE_ORDER) || emp.role || 'employee';
}

function sortEmployeesForFilter(list: any[]) {
  return [...list].sort((a, b) => {
    const ar = ROLE_ORDER[getPrimaryRole(a)] ?? 99;
    const br = ROLE_ORDER[getPrimaryRole(b)] ?? 99;
    if (ar !== br) return ar - br;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
  });
}

function getDueStatus(dueDate: string) {
  if (!dueDate) return { label: '', color: '' };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate.replace(/-/g, '/')); due.setHours(0, 0, 0, 0);
  const diff = due.getTime() - now.getTime();
  if (diff < 0) return { label: '已逾期', color: 'text-red-500' };
  if (diff === 0) return { label: '今天到期', color: 'text-orange-500' };
  if (diff <= 2 * 86400000) return { label: '即将到期', color: 'text-amber-500' };
  return { label: '', color: '' };
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

// ============ SearchableSelect ============
function SearchableSelect({
  options, value, onChange, placeholder = '请选择', searchPlaceholder = '搜索...',
  groups, className = '', compact = false, direction = 'down',
}: {
  options: { value: string; label: string; group?: string; description?: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string; searchPlaceholder?: string;
  groups?: { key: string; label: string }[];
  className?: string; compact?: boolean; direction?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => { setOpen(false); setSearch(''); });

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => `${o.label} ${o.description || ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between border border-gray-200 rounded-lg bg-white transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gold-400 ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}>
        <span className={`truncate ${selected ? 'text-gray-700' : 'text-gray-400'}`}>{selected?.label || placeholder}</span>
        <ChevronDown size={compact ? 12 : 12} className={`shrink-0 ml-1 text-gray-400 transition-transform ${open ? (direction === 'up' ? '' : 'rotate-180') : (direction === 'up' ? 'rotate-180' : '')}`} />
      </button>
      {open && (
        <div className={`absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden ${direction === 'up' ? 'bottom-full mb-1' : 'mt-1'}`} style={{ minWidth: 180 }}>
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
                      className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:bg-gold-50 transition-colors ${value === o.value ? 'bg-gold-50 text-gold-700 font-medium' : 'text-gray-700'}`}>
                      <span className="flex-1 truncate">{o.label}</span>
                      {o.description && <span className="text-[11px] text-gray-400 shrink-0">{o.description}</span>}
                    </button>
                  ))}
                </div>
              );
            }) : filtered.map(o => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:bg-gold-50 transition-colors ${value === o.value ? 'bg-gold-50 text-gold-700 font-medium' : 'text-gray-700'}`}>
                <span className="flex-1 truncate">{o.label}</span>
                {o.description && <span className="text-[11px] text-gray-400 shrink-0">{o.description}</span>}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-xs text-gray-400 text-center">无匹配结果</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ CustomDatePicker ============
function CustomDatePicker({ value, onChange, placeholder = '选择日期', compact = false, direction = 'down' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; compact?: boolean; direction?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value.replace(/-/g, '/')) : new Date());
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

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
    setMobileOpen(false);
  };

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const calendarView = (inDrawer = false) => (
    <div className={inDrawer ? '' : 'bg-white border border-gray-200 rounded-lg shadow-xl p-3'} style={inDrawer ? {} : { width: 280 }}>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded"><ChevronLeft size={18} /></button>
        <span className="text-sm font-medium text-gray-800">{year}年 {month + 1}月</span>
        <button type="button" onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {['日', '一', '二', '三', '四', '五', '六'].map(w => (
          <div key={w} className="text-[11px] text-gray-400 py-1 font-medium">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = new Date(year, month, d).getTime() === today.getTime();
          const isSelected = value === dateStr;
          return (
            <button key={d} type="button" onClick={() => selectDay(d)}
              className={`w-9 h-9 rounded-full text-xs flex items-center justify-center transition-colors
                ${isSelected ? 'bg-gold-400 text-black font-bold' : isToday ? 'bg-gold-50 text-gold-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
              {d}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <button type="button" onClick={() => { onChange(''); setOpen(false); setMobileOpen(false); }} className="text-xs text-gray-400 hover:text-gray-600">清除</button>
        <button type="button" onClick={() => { const t = new Date(); selectDay(t.getDate()); setViewDate(t); }} className="text-xs text-gold-500 hover:text-gold-600 font-medium">今天</button>
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => {
        setViewDate(value ? new Date(value.replace(/-/g, '/')) : new Date());
        if (window.matchMedia('(max-width: 767px)').matches) setMobileOpen(true);
        else setOpen(!open);
      }}
        className={`w-full flex items-center justify-between border border-gray-200 rounded-lg bg-white transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gold-400 ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}>
        <span className={value ? 'text-gray-700' : 'text-gray-400'}>{value || placeholder}</span>
        <Calendar size={compact ? 10 : 12} className="shrink-0 ml-1 text-gray-400" />
      </button>

      {/* 桌面端 popover */}
      {open && (
        <div className={`hidden md:block absolute z-50 ${direction === 'up' ? 'bottom-full mb-1' : 'mt-1'}`}>
          {calendarView()}
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <BottomDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} title="选择日期">
        {calendarView(true)}
      </BottomDrawer>
    </div>
  );
}

// ============ AssigneePicker ============
function AssigneePicker({ employees, value, onChange, myName, myId, direction = 'up' }: {
  employees: any[]; value: { id: string; name: string }[];
  onChange: (v: { id: string; name: string }[]) => void; myName: string; myId: string; direction?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => { setOpen(false); setSearch(''); });

  const activeEmps = employees.filter(e => e.status !== 'inactive');
  const filtered = activeEmps.filter(e => (e.name || '').toLowerCase().includes(search.toLowerCase()));
  const grouped = DEPT_ORDER.map(dept => ({
    dept,
    members: filtered.filter(e => getDept(e) === dept),
  })).filter(g => g.members.length > 0);

  const toggle = (emp: any) => {
    const eid = emp._id || emp.id;
    if (value.some(a => a.id === eid)) {
      onChange(value.filter(a => a.id !== eid));
    } else {
      onChange([...value, { id: eid, name: emp.name }]);
    }
  };

  const assignToMe = () => {
    if (!value.some(a => a.id === myId)) {
      onChange([...value, { id: myId, name: myName }]);
    }
    setOpen(false);
    setMobileOpen(false);
    setSearch('');
  };

  const handleOpen = () => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMobileOpen(true);
    } else {
      setOpen(!open);
    }
  };

  const assigneeList = (
    <>
      <div className="p-2 border-b border-gray-100 space-y-2">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索姓名..."
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gold-400" autoFocus />
        </div>
        <button type="button" onClick={assignToMe}
          className="flex items-center gap-1.5 text-xs text-gold-600 hover:text-gold-700 font-medium px-1">
          <UserCheck size={12} /> 分配给我
        </button>
      </div>
      <div className="max-h-56 overflow-auto">
        {grouped.map(g => (
          <div key={g.dept}>
            <div className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-50 sticky top-0">{g.dept}</div>
            {g.members.map(emp => {
              const eid = emp._id || emp.id;
              const selected = value.some(a => a.id === eid);
              return (
                <button key={eid} type="button" onClick={() => toggle(emp)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${selected ? 'bg-gold-50 text-gold-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-gold-400 border-gold-400' : 'border-gray-300'}`}>
                    {selected && <CheckCircle size={10} className="text-black" />}
                  </span>
                  {emp.name}
                  <span className="text-gray-400 ml-auto">{ROLE_DEPT[emp.role] || ''}</span>
                </button>
              );
            })}
          </div>
        ))}
        {grouped.length === 0 && <div className="px-3 py-4 text-xs text-gray-400 text-center">无匹配结果</div>}
      </div>
    </>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={handleOpen}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gold-400">
        <span className="text-gray-400">{value.length > 0 ? `已选 ${value.length} 人` : '选择执行人'}</span>
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? (direction === 'up' ? '' : 'rotate-180') : (direction === 'up' ? 'rotate-180' : '')}`} />
      </button>
      {open && (
        <div className={`absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden ${direction === 'up' ? 'bottom-full mb-1' : 'mt-1'}`} style={{ minWidth: 260 }}>
          {assigneeList}
        </div>
      )}
      {/* 移动端底部抽屉 */}
      <BottomDrawer open={mobileOpen} onClose={() => { setMobileOpen(false); setSearch(''); }} title="选择执行人">
        {assigneeList}
      </BottomDrawer>
    </div>
  );
}

// ============ TodoDetailModal ============
function TodoDetailModal({ todo, onClose, onToggle, onDelete, onUpdate, employees, leads, projects, myName, myId, isAdmin }: {
  todo: any; onClose: () => void; onToggle: (t: any) => void; onDelete: (id: string) => void;
  onUpdate: (id: string, data: any) => void;
  employees: any[]; leads: any[]; projects: any[]; myName: string; myId: string; isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [form, setForm] = useState({
    title: todo.title || '',
    description: todo.description || '',
    priority: todo.priority || 'medium',
    dueDate: todo.dueDate || '',
    relatedType: todo.relatedTo?.type || 'none',
    relatedId: todo.relatedTo?.id || '',
    relatedName: todo.relatedTo?.name || '',
    assignees: todo.assignees || [],
    attachments: normalizeAttachments(todo.attachments),
  });
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  const isRelated = isAdmin || todo.creatorName === myName || todo.assignees?.some((a: any) => a.id === myId || a.name === myName);
  const dueStatus = getDueStatus(todo.dueDate);

  const handleSave = async () => {
    if (!form.title) return;
    const updateData: any = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      dueDate: form.dueDate,
      assignees: form.assignees,
      attachments: form.attachments,
      relatedTo: form.relatedId ? { type: form.relatedType, id: form.relatedId, name: form.relatedName } : null,
      updatedAt: new Date().toISOString(),
    };
    await onUpdate(todo._id, updateData);
    setMode('view');
  };

  const handleAttachmentUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingAttachments(true);
    try {
      const uploaded = await uploadFinanceAttachments(
        Array.from(files),
        `todos/${todo._id || 'draft'}`,
        myName,
      );
      setForm(prev => ({ ...prev, attachments: [...prev.attachments, ...uploaded] }));
    } catch (error) {
      console.error('待办附件上传失败', error);
    } finally {
      setUploadingAttachments(false);
    }
  };

  const handleRelatedSelect = (type: string, id: string) => {
    if (type === 'lead') {
      const l = leads.find(x => x._id === id);
      setForm({ ...form, relatedType: 'lead', relatedId: id, relatedName: l?.name || '' });
    } else if (type === 'project') {
      const p = projects.find(x => x._id === id);
      setForm({ ...form, relatedType: 'project', relatedId: id, relatedName: p?.customer + (p?.address ? ' - ' + p.address : '') });
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10 rounded-t-xl">
          <div className="flex items-center gap-2">
            {mode === 'view' ? (
              <>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[todo.priority] || ''}`}>{PRIORITY_MAP[todo.priority] || '普通'}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${todo.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  {todo.status === 'completed' ? '已完成' : '待处理'}
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-gray-500">编辑待办</span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {mode === 'view' ? (
            <>
              <h2 className={`text-lg font-bold ${todo.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{todo.title}</h2>
              {todo.description && <p className="text-sm text-gray-600 whitespace-pre-wrap">{todo.description}</p>}

              {todo.relatedTo && todo.relatedTo.type !== 'none' && todo.relatedTo.id && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">关联{todo.relatedTo.type === 'lead' ? '客户' : '工地'}:</span>
                  <button type="button" onClick={() => navigate(todo.relatedTo.type === 'lead' ? `/leads/${todo.relatedTo.id}` : `/projects-biz/${todo.relatedTo.id}`)}
                    className="text-xs text-gold-500 hover:text-gold-600 font-medium">
                    {todo.relatedTo.name} →
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">执行人:</span>
                {todo.assignees?.map((a: any, i: number) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{a.name}</span>
                )) || <span className="text-xs text-gray-400">未分配</span>}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-gray-400 block mb-0.5">截止日期</span>
                  <span className={dueStatus.color || 'text-gray-700'}>{todo.dueDate || '未设置'}{dueStatus.label && ` (${dueStatus.label})`}</span>
                </div>
                <div><span className="text-xs text-gray-400 block mb-0.5">创建时间</span><span className="text-gray-700">{formatDateTime(todo.createdAt)}</span></div>
                <div><span className="text-xs text-gray-400 block mb-0.5">创建人</span><span className="text-gray-700">{todo.creatorName || '未知'}</span></div>
                {todo.completedAt && (
                  <div><span className="text-xs text-gray-400 block mb-0.5">完成时间</span><span className="text-emerald-600">{todo.completedAt}</span></div>
                )}
              </div>

              {todo.attachments && todo.attachments.length > 0 && (
                <div>
                  <span className="text-xs text-gray-400 block mb-2">附件 ({todo.attachments.length})</span>
                  <div className="space-y-2">
                    {normalizeAttachments(todo.attachments).map((att, i) => (
                      <div key={`${att.fileID}-${i}`} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                        <Paperclip size={13} className="text-gray-400 shrink-0" />
                        <button
                          type="button"
                          onClick={() => void openAttachment(att)}
                          className="text-gray-700 truncate flex-1 text-left hover:text-gold-600"
                          title={att.name}
                        >
                          {att.name}
                        </button>
                        <button type="button" onClick={() => void openAttachment(att)} className="text-gray-500 hover:text-gold-600 flex items-center gap-1 shrink-0">
                          <Eye size={12} /> 打开
                        </button>
                        <button type="button" onClick={() => void downloadAttachment(att)} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 shrink-0">
                          <Download size={12} /> 下载
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">标题 *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">描述</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">优先级</label>
                  <SearchableSelect
                    options={Object.entries(PRIORITY_MAP).map(([k, v]) => ({ value: k, label: v }))}
                    value={form.priority} onChange={v => setForm({ ...form, priority: v })} placeholder="选择优先级"
                    direction="down"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">截止日期</label>
                  <CustomDatePicker value={form.dueDate} onChange={v => setForm({ ...form, dueDate: v })} direction="up" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">关联类型</label>
                <SearchableSelect
                  options={Object.entries(RELATED_TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))}
                  value={form.relatedType} onChange={v => setForm({ ...form, relatedType: v, relatedId: '', relatedName: '' })}
                  placeholder="选择关联类型"
                  direction="up"
                />
              </div>
              {form.relatedType === 'lead' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">关联客户</label>
                  <SearchableSelect
                    options={leads.map(l => ({ value: l._id, label: l.name }))}
                    value={form.relatedId} onChange={v => handleRelatedSelect('lead', v)}
                    placeholder="搜索客户..." searchPlaceholder="输入客户名称搜索..."
                    direction="up"
                  />
                </div>
              )}
              {form.relatedType === 'project' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">关联工地</label>
                  <SearchableSelect
                    options={projects.map(p => ({ value: p._id, label: `${p.customer}${p.address ? ' - ' + p.address : ''}` }))}
                    value={form.relatedId} onChange={v => handleRelatedSelect('project', v)}
                    placeholder="搜索工地..." searchPlaceholder="输入客户名或地址搜索..."
                    direction="up"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">执行人</label>
                <AssigneePicker employees={employees} value={form.assignees}
                  onChange={v => setForm({ ...form, assignees: v })} myName={myName} myId={myId} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">附件</label>
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-500 cursor-pointer hover:border-gold-300 hover:text-gold-600">
                  {uploadingAttachments ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploadingAttachments ? '上传中…' : '上传图片或文件'}
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={uploadingAttachments}
                    onChange={(e) => {
                      void handleAttachmentUpload(e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <FormAttachmentList
                  attachments={form.attachments}
                  onRemove={(idx) => setForm(prev => ({
                    ...prev,
                    attachments: prev.attachments.filter((_: any, i: number) => i !== idx),
                  }))}
                />
              </div>
            </>
          )}
        </div>

        {isRelated && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {mode === 'view' ? (
                <>
                  <button type="button" onClick={() => onToggle(todo)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      todo.status === 'completed'
                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}>
                    {todo.status === 'completed' ? <><RotateCcw size={14} /> 重新打开</> : <><CheckCircle size={14} /> 完成待办</>}
                  </button>
                  <button type="button" onClick={() => setMode('edit')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                    <Edit3 size={14} /> 编辑
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setMode('view')}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
                  <button type="button" onClick={handleSave}
                    className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500">保存</button>
                </>
              )}
            </div>
            <button type="button" onClick={() => { if (confirm('确定删除该待办吗？')) onDelete(todo._id); }}
              className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
      </div>
    </div>,
    document.body
  );
}

// ============ Main Component ============
export default function Todos() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const myName = user?.name || '';
  const myId = user?.id || '';
  const isAdmin = user?.role === 'admin';

  const [todos, setTodos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'related' | 'all'>('related');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [timeFilter, setTimeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [leadFilter, setLeadFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'priority' | 'assignee'>('none');
  const [mobileFilterDrawer, setMobileFilterDrawer] = useState<null | 'assignee' | 'lead' | 'project' | 'group'>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [showCreate, setShowCreate] = useState(false);
  const projectPrefillAppliedRef = useRef(false);

  useEffect(() => {
    if (searchParams.get('action') === 'new') setShowCreate(true);
  }, [searchParams]);
  const [form, setForm] = useState(INIT_FORM);
  const [detailTodo, setDetailTodo] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCreateAttachments, setUploadingCreateAttachments] = useState(false);

  useEffect(() => {
    const todoId = searchParams.get('todoId');
    if (!todoId || todos.length === 0) return;
    const matchedTodo = todos.find(todo => (todo._id || todo.id) === todoId);
    if (matchedTodo) setDetailTodo(matchedTodo);
  }, [searchParams, todos]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [todoData, userData, leadData, projData] = await Promise.all([
        todosAPI.toArray(), usersAPI.toArray(TODO_USER_FIELDS), leadsAPI.toArray(TODO_LEAD_FIELDS), projectsAPI.toArray(TODO_PROJECT_FIELDS),
      ]);
      setTodos(todoData);
      setEmployees(userData.filter((u: any) => u.status !== 'inactive'));
      setLeads(leadData);
      setProjects(projData);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchData(); 
    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchData(true);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchData]);

  useEffect(() => {
    const projectId = searchParams.get('projectId');
    if (!projectId || projects.length === 0 || projectPrefillAppliedRef.current) return;
    const linkedProject = projects.find(project => (project._id || project.id) === projectId);
    if (!linkedProject) return;
    const managerNames = Array.isArray(linkedProject.manager)
      ? linkedProject.manager
      : String(linkedProject.manager || '').split(/[、,，]/).map(name => name.trim()).filter(Boolean);
    const defaultAssignees = managerNames.map(name => {
      const employee = employees.find(item => item.name === name);
      return employee ? { id: employee._id || employee.id, name: employee.name } : null;
    }).filter(Boolean) as { id: string; name: string }[];
    setForm(current => ({
      ...current,
      relatedType: 'project',
      relatedId: projectId,
      relatedName: `${linkedProject.customer || ''}${linkedProject.address ? ` - ${linkedProject.address}` : ''}`.replace(/^\s*-\s*/, ''),
      assignees: current.assignees.length > 0 ? current.assignees : defaultAssignees,
    }));
    setShowCreate(true);
    projectPrefillAppliedRef.current = true;
  }, [searchParams, projects, employees]);

  const baseFiltered = todos.filter(t => {
    if (!isAdmin && filterScope === 'related') {
      const linkedProject = t.relatedTo?.type === 'project'
        ? projects.find(project => (project._id || project.id) === t.relatedTo?.id)
        : null;
      const participantNames = linkedProject
        ? [linkedProject.manager, linkedProject.sales, linkedProject.designer, linkedProject.creatorName]
          .flatMap(value => Array.isArray(value) ? value : String(value || '').split(/[、,，]/))
          .map(name => String(name).trim())
          .filter(Boolean)
        : [];
      const isRelated = t.assignees?.some((a: any) => a.id === myId || a.name === myName)
        || t.creatorName === myName
        || participantNames.includes(myName);
      if (!isRelated) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!t.title?.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q) && !t.relatedTo?.name?.toLowerCase().includes(q)) return false;
    }
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (assigneeFilter && !t.assignees?.some((a: any) => a.id === assigneeFilter || a.name === assigneeFilter)) return false;
    if (leadFilter && (t.relatedTo?.type !== 'lead' || t.relatedTo?.id !== leadFilter)) return false;
    if (projectFilter && (t.relatedTo?.type !== 'project' || t.relatedTo?.id !== projectFilter)) return false;
    if (timeFilter !== 'all') {
      const targetDate = t.dueDate || t.createdAt;
      if (targetDate) {
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const targetObj = new Date(typeof targetDate === 'string' ? targetDate.replace(/-/g, '/') : targetDate);
        targetObj.setHours(0, 0, 0, 0);
        const diff = now.getTime() - targetObj.getTime();
        if (timeFilter === 'today' && diff !== 0) return false;
        if (timeFilter === 'week' && Math.abs(diff) > 7 * 86400000) return false;
        if (timeFilter === 'month' && Math.abs(diff) > 30 * 86400000) return false;
      }
    }
    return true;
  });

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const stats = {
    pending: baseFiltered.filter(t => t.status !== 'completed').length,
    completed: baseFiltered.filter(t => t.status === 'completed').length,
    overdue: baseFiltered.filter(t => {
      if (t.status === 'completed') return false;
      if (!t.dueDate) return false;
      return new Date(t.dueDate.replace(/-/g, '/')).getTime() < now.getTime();
    }).length,
    total: baseFiltered.length,
  };

  const filtered = baseFiltered.filter(t => {
    if (statFilter === 'pending') return t.status !== 'completed';
    if (statFilter === 'completed') return t.status === 'completed';
    if (statFilter === 'overdue') return t.status !== 'completed' && t.dueDate && new Date(t.dueDate.replace(/-/g, '/')).getTime() < now.getTime();
    return true;
  }).sort((a, b) => {
    const aTime = a.dueDate ? new Date(a.dueDate.replace(/-/g, '/')).getTime() : new Date(a.createdAt || 0).getTime();
    const bTime = b.dueDate ? new Date(b.dueDate.replace(/-/g, '/')).getTime() : new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const getGroupedData = () => {
    if (groupBy === 'none') return { none: filtered };
    const groups: Record<string, any[]> = {};
    filtered.forEach(t => {
      let key: string;
      if (groupBy === 'priority') key = PRIORITY_MAP[t.priority] || '普通';
      else if (groupBy === 'assignee') key = t.assignees?.length > 0 ? t.assignees.map((a: any) => a.name).join('、') : '未分配';
      else key = 'none';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  };

  const toggleGroup = (key: string) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    if (form.assignees.length === 0) return;
    setSubmitting(true);
    try {
      const newTodo = {
        _id: generateId(),
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        dueDate: form.dueDate,
        status: 'pending',
        assignees: form.assignees,
        creatorId: myId,
        creatorName: myName,
        createdAt: new Date().toISOString(),
        relatedTo: form.relatedId ? { type: form.relatedType, id: form.relatedId, name: form.relatedName } : null,
        attachments: form.attachments,
      };
      await todosAPI.add(newTodo);
      void createNotificationEventSafely({
        operationId: stableOperationId('todo-assigned', newTodo._id),
        eventType: 'TODO_ASSIGNED',
        actorUserId: myId,
        recipientUserIds: newTodo.assignees.map(assignee => assignee.id),
        category: 'todo',
        title: '新待办指派',
        content: `${myName}指派了待办“${newTodo.title}”`,
        link: '/todos',
        relatedTo: { type: 'todo', id: newTodo._id, name: newTodo.title },
        channels: ['station', 'wechat'],
        templateId: TODO_NOTIFICATION_TEMPLATE_ID,
        templateData: {
          thing1: { value: newTodo.title.slice(0, 20) },
          time2: { value: newTodo.dueDate || formatDate(new Date().toISOString()) },
          thing3: { value: myName.slice(0, 20) },
          thing4: { value: newTodo.assignees.map(assignee => assignee.name).join('、').slice(0, 20) },
        },
      });
      setShowCreate(false);
      setForm(INIT_FORM);
      setTodos(prev => [newTodo, ...prev]);
      fetchData(true);
      const returnTo = searchParams.get('returnTo');
      if (returnTo?.startsWith('/') && !returnTo.startsWith('//')) navigate(returnTo);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAttachmentUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingCreateAttachments(true);
    try {
      const uploaded = await uploadFinanceAttachments(
        Array.from(files),
        `todos/drafts/${Date.now()}`,
        myName,
      );
      setForm(prev => ({ ...prev, attachments: [...prev.attachments, ...uploaded] }));
    } catch (error) {
      console.error('待办附件上传失败', error);
    } finally {
      setUploadingCreateAttachments(false);
    }
  };

  const handleToggleStatus = async (todo: any) => {
    const newStatus = todo.status === 'completed' ? 'pending' : 'completed';
    const previousVersion = todo.updatedAt || todo.completedAt || todo.createdAt || todo._id;
    const updateData: any = { status: newStatus, updatedAt: new Date().toISOString() };
    if (newStatus === 'completed') {
      updateData.completedAt = formatDateTime(new Date().toISOString());
    } else {
      updateData.completedAt = '';
    }
    await todosAPI.update(todo._id, updateData);
    setTodos(prev => prev.map(t => t._id === todo._id ? { ...t, ...updateData } : t));
    if (detailTodo?._id === todo._id) {
      setDetailTodo({ ...todo, ...updateData });
    }
    if (newStatus === 'completed') {
      const relatedUserIds = [
        todo.creatorId,
        ...(todo.assignees || []).map((assignee: any) => assignee.id),
      ].filter(Boolean);
      void createNotificationEventSafely({
        operationId: stableOperationId('todo-completed', todo._id, previousVersion),
        eventType: 'TODO_COMPLETED',
        actorUserId: myId,
        recipientUserIds: relatedUserIds,
        recipientRoles: ['admin'],
        category: 'todo',
        title: '待办已完成',
        content: `${myName}完成了待办“${todo.title}”`,
        link: '/todos',
        relatedTo: { type: 'todo', id: todo._id, name: todo.title },
        channels: ['station', 'wechat'],
        templateId: TODO_NOTIFICATION_TEMPLATE_ID,
        templateData: {
          thing1: { value: String(todo.title || '待办任务').slice(0, 20) },
          time2: { value: String(updateData.completedAt || '').slice(0, 16) },
          thing3: { value: myName.slice(0, 20) },
          thing4: { value: '管理员' },
        },
      });
    }
    fetchData(true);
  };

  const handleDelete = async (id: string) => {
    await todosAPI.delete(id);
    setTodos(prev => prev.filter(t => t._id !== id));
    setDetailTodo(null);
    fetchData(true);
  };

  const handleUpdate = async (id: string, data: any) => {
    await todosAPI.update(id, data);
    setTodos(prev => prev.map(t => t._id === id ? { ...t, ...data } : t));
    fetchData(true);
    const updated = await todosAPI.doc(id).get();
    if (updated) setDetailTodo(Array.isArray(updated) ? updated[0] : updated);
  };

  const handleRelatedSelect = (type: string, id: string) => {
    if (type === 'lead') {
      const l = leads.find(x => x._id === id);
      setForm({ ...form, relatedType: 'lead', relatedId: id, relatedName: l?.name || '' });
    } else if (type === 'project') {
      const p = projects.find(x => x._id === id);
      setForm({ ...form, relatedType: 'project', relatedId: id, relatedName: p?.customer + (p?.address ? ' - ' + p.address : '') });
    }
  };

  const clearFilters = () => {
    setTimeFilter('all'); setPriorityFilter('all'); setAssigneeFilter('');
    setLeadFilter(''); setProjectFilter('');
  };
  const hasActiveFilters = timeFilter !== 'all' || priorityFilter !== 'all' || assigneeFilter || leadFilter || projectFilter;

  const STAT_CARDS: { key: StatFilter; label: string; count: number; color: string; activeClass: string; icon: any }[] = [
    { key: 'pending', label: '待处理', count: stats.pending, color: 'text-blue-600', activeClass: 'border-blue-400 bg-blue-50', icon: Circle },
    { key: 'completed', label: '已完成', count: stats.completed, color: 'text-emerald-600', activeClass: 'border-emerald-400 bg-emerald-50', icon: CheckCircle },
    { key: 'overdue', label: '已逾期', count: stats.overdue, color: 'text-red-500', activeClass: 'border-red-400 bg-red-50', icon: AlertTriangle },
    { key: 'all', label: '总计', count: stats.total, color: 'text-gray-900', activeClass: 'border-gray-400 bg-gray-50', icon: Clock },
  ];

  const assigneeOptions = sortEmployeesForFilter(employees).map(e => ({ value: e._id || e.id, label: e.name, group: getDept(e), description: getDept(e) }));
  const assigneeGroups = DEPT_ORDER.filter(d => employees.some(e => getDept(e) === d)).map(d => ({ key: d, label: d }));

  // 移动端待办卡片列：复选框+标题为主区，优先级在右上，执行人/时间/关联堆在下方，避免大段空白
  const mobileTodoCardColumns = [
    { key: 'mobileMain', title: '待办', render: (row: any) => (
      <div className="flex items-start gap-2 min-w-0">
        <button onClick={e => { e.stopPropagation(); handleToggleStatus(row); }} className="mt-0.5 shrink-0">
          {row.status === 'completed'
            ? <CheckCircle size={18} className="text-emerald-500" />
            : <Circle size={18} className="text-gray-300" />}
        </button>
        <div className="min-w-0 flex-1">
          <span className={`block text-sm font-medium leading-snug ${row.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{row.title}</span>
          {row.description && <p className="text-xs text-gray-400 truncate mt-0.5">{row.description}</p>}
        </div>
      </div>
    )},
    { key: 'mobilePriority', title: '优先级', render: (row: any) => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PRIORITY_BADGE[row.priority] || ''}`}>{PRIORITY_MAP[row.priority] || '普通'}</span>
    )},
    { key: 'mobileMeta', title: '信息', render: (row: any) => {
      const names = row.assignees?.map((a: any) => a.name) || [];
      const assigneeText = names.length === 0 ? '未分配' : names.length <= 2 ? names.join('、') : `${names.slice(0, 2).join('、')} 等${names.length}人`;
      let timeNode: any = null;
      if (row.status === 'completed' && row.completedAt) {
        timeNode = <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle size={11} />{formatDate(row.completedAt)}</span>;
      } else if (row.dueDate) {
        const ds = getDueStatus(row.dueDate);
        timeNode = <span className={ds.color || 'text-gray-500'}>{row.dueDate}{ds.label ? ` (${ds.label})` : ''}</span>;
      }
      return (
        <div className="pl-7 mt-1 space-y-1 text-xs text-gray-500">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 min-w-0 truncate"><UserCheck size={11} className="text-gray-400 shrink-0" />{assigneeText}</span>
            {timeNode && <span className="flex items-center gap-1 shrink-0"><Clock size={11} className="text-gray-400" />{timeNode}</span>}
          </div>
          {row.relatedTo?.name && row.relatedTo.type !== 'none' && (
            <div className="truncate">{row.relatedTo.type === 'lead' ? '客户' : '工地'}: {row.relatedTo.name}</div>
          )}
        </div>
      );
    }},
  ];

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">待办看板</h1>
          <p className="erp-page-subtitle">管理团队任务与工作安排</p>
        </div>
        <button onClick={() => { setForm(INIT_FORM); setShowCreate(true); }}
          className="erp-btn-primary">
          <Plus size={16} /> 新建待办
        </button>
      </div>

      <div className="flex overflow-x-auto gap-1.5 md:grid md:grid-cols-4 md:gap-3 mb-4">
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

      <div className="erp-surface">
        <div className="erp-search-row erp-search-row-compact">
          <div className="erp-search-field">
            <Search size={14} className="erp-search-icon" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索待办标题、描述、关联客户"
              className="erp-search-input" />
          </div>
          <div className="flex items-center gap-2 justify-between w-auto shrink-0">
            {!isAdmin && (
              <>
                {/* 桌面端：双按钮 */}
                <div className="hidden md:flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                  <button type="button" onClick={() => setFilterScope('related')}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${filterScope === 'related' ? 'bg-gold-400 text-black' : 'text-gray-500 hover:bg-gray-50'}`}>
                    与我相关
                  </button>
                  <button type="button" onClick={() => setFilterScope('all')}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${filterScope === 'all' ? 'bg-gold-400 text-black' : 'text-gray-500 hover:bg-gray-50'}`}>
                    全部待办
                  </button>
                </div>
                {/* 移动端：单按钮切换 */}
                <button
                  type="button"
                  onClick={() => setFilterScope(s => s === 'related' ? 'all' : 'related')}
                  className={`md:hidden shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${filterScope === 'related' ? 'border-gold-400 text-gold-600 bg-gold-50/60' : 'border-gray-200 text-gray-600 bg-white'}`}
                >
                  {filterScope === 'related' ? '我的' : '全部'}
                </button>
              </>
            )}
            <button onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`erp-filter-button ${showFilterPanel ? 'erp-filter-button-active' : 'erp-filter-button-idle'} ${hasActiveFilters ? 'bg-gold-50 text-gold-600 border-gold-200' : ''}`}>
              <Filter size={13} /> <span>筛选</span>
              {hasActiveFilters && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold-400 text-white text-[10px] font-bold">{[timeFilter !== 'all', priorityFilter !== 'all', !!assigneeFilter, !!leadFilter, !!projectFilter].filter(Boolean).length}</span>
              )}
            </button>
          </div>
        </div>

        {showFilterPanel && (
          <div className="erp-filter-panel">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-2">时间范围</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all', label: '全部时间' },
                    { value: 'today', label: '今天' },
                    { value: 'week', label: '一周' },
                    { value: 'month', label: '一月' },
                  ].map(item => (
                    <button key={item.value} type="button" onClick={() => setTimeFilter(item.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${timeFilter === item.value ? 'bg-gold-400 text-black border-gold-400' : 'border-gray-200 text-gray-600 hover:bg-white'}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">优先级</p>
                <div className="flex flex-wrap gap-2">
                  {[{ value: 'all', label: '全部' }, ...Object.entries(PRIORITY_MAP).map(([value, label]) => ({ value, label }))].map(item => (
                    <button key={item.value} type="button" onClick={() => setPriorityFilter(item.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${priorityFilter === item.value ? 'bg-gold-400 text-black border-gold-400' : 'border-gray-200 text-gray-600 hover:bg-white'}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">更多条件</p>
                <div className="grid grid-cols-2 gap-2 md:hidden">
                  {[
                    { key: 'assignee' as const, label: assigneeFilter ? assigneeOptions.find(o => o.value === assigneeFilter)?.label || '执行人' : '执行人' },
                    { key: 'lead' as const, label: leadFilter ? leads.find(l => l._id === leadFilter)?.name || '客户' : '客户' },
                    { key: 'project' as const, label: projectFilter ? projects.find(p => p._id === projectFilter)?.customer || '工地' : '工地' },
                    { key: 'group' as const, label: groupBy === 'none' ? '不分组' : groupBy === 'priority' ? '按优先级' : '按执行人' },
                  ].map(item => (
                    <button key={item.key} type="button" onClick={() => setMobileFilterDrawer(item.key)}
                      className="h-9 px-3 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gold-300 hover:text-gold-600 truncate">
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="hidden md:grid md:grid-cols-4 gap-2">
                  <SearchableSelect compact
                    options={[{ value: '', label: '全部执行人' }, ...assigneeOptions]}
                    value={assigneeFilter} onChange={setAssigneeFilter} placeholder="全部执行人"
                    searchPlaceholder="搜索姓名..." groups={assigneeGroups}
                  />
                  <SearchableSelect compact
                    options={[{ value: '', label: '全部客户' }, ...leads.map(l => ({ value: l._id, label: l.name }))]}
                    value={leadFilter} onChange={setLeadFilter} placeholder="全部客户"
                    searchPlaceholder="搜索客户..."
                  />
                  <SearchableSelect compact
                    options={[{ value: '', label: '全部工地' }, ...projects.map(p => ({ value: p._id, label: `${p.customer}${p.address ? ' - ' + p.address : ''}` }))]}
                    value={projectFilter} onChange={setProjectFilter} placeholder="全部工地"
                    searchPlaceholder="搜索工地..."
                  />
                  <SearchableSelect compact
                    options={[{ value: 'none', label: '不分组' }, { value: 'priority', label: '按优先级' }, { value: 'assignee', label: '按执行人' }]}
                    value={groupBy} onChange={v => setGroupBy(v as any)} placeholder="不分组"
                  />
                </div>
              </div>
            </div>
            {hasActiveFilters && (
              <div className="flex justify-end mt-3">
                <button onClick={clearFilters} className="text-xs text-gold-500 hover:text-gold-600 font-medium whitespace-nowrap">清除筛选</button>
              </div>
            )}
          </div>
        )}

        {mobileFilterDrawer && createPortal(
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileFilterDrawer(null)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[72vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl border border-gray-100">
              <div className="flex justify-center pt-3 pb-2 sticky top-0 bg-white">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="px-4 pb-5">
                {mobileFilterDrawer === 'assignee' && (
                  <div className="grid gap-2">
                    {[{ value: '', label: '全部执行人', description: '' }, ...assigneeOptions].map(item => (
                      <button key={item.value || 'all'} type="button" onClick={() => { setAssigneeFilter(item.value); setMobileFilterDrawer(null); }}
                        className={`h-11 px-3 rounded-lg border text-sm text-left flex items-center gap-2 ${assigneeFilter === item.value ? 'bg-gold-50 border-gold-400 text-gold-700 font-medium' : 'border-gray-200 text-gray-700'}`}>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.description && <span className="text-xs text-gray-400 shrink-0">{item.description}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {mobileFilterDrawer === 'lead' && (
                  <div className="grid gap-2">
                    {[{ _id: '', name: '全部客户' }, ...leads].map(item => (
                      <button key={item._id || 'all'} type="button" onClick={() => { setLeadFilter(item._id); setMobileFilterDrawer(null); }}
                        className={`h-11 px-3 rounded-lg border text-sm text-left truncate ${leadFilter === item._id ? 'bg-gold-50 border-gold-400 text-gold-700 font-medium' : 'border-gray-200 text-gray-700'}`}>
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
                {mobileFilterDrawer === 'project' && (
                  <div className="grid gap-2">
                    {[{ _id: '', customer: '全部工地', address: '' }, ...projects].map(item => (
                      <button key={item._id || 'all'} type="button" onClick={() => { setProjectFilter(item._id); setMobileFilterDrawer(null); }}
                        className={`h-11 px-3 rounded-lg border text-sm text-left truncate ${projectFilter === item._id ? 'bg-gold-50 border-gold-400 text-gold-700 font-medium' : 'border-gray-200 text-gray-700'}`}>
                        {item.customer}{item.address ? ` - ${item.address}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                {mobileFilterDrawer === 'group' && (
                  <div className="grid gap-2">
                    {[{ value: 'none', label: '不分组' }, { value: 'priority', label: '按优先级' }, { value: 'assignee', label: '按执行人' }].map(item => (
                      <button key={item.value} type="button" onClick={() => { setGroupBy(item.value as any); setMobileFilterDrawer(null); }}
                        className={`h-11 px-3 rounded-lg border text-sm text-left ${groupBy === item.value ? 'bg-gold-50 border-gold-400 text-gold-700 font-medium' : 'border-gray-200 text-gray-700'}`}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
        {loading ? (
          <div className="py-20 text-center text-gray-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-400 text-sm">暂无待办数据</div>
        ) : groupBy === 'none' ? (
          <DataTable
            columns={[
              { key: 'status', title: '', width: '40px', render: (row: any) => (
                <button onClick={e => { e.stopPropagation(); handleToggleStatus(row); }} className="mt-0.5">
                  {row.status === 'completed'
                    ? <CheckCircle size={18} className="text-emerald-500" />
                    : <Circle size={18} className="text-gray-300 hover:text-gold-400" />}
                </button>
              )},
              { key: 'title', title: '待办', render: (row: any) => (
                <div>
                  <span className={`text-sm font-medium ${row.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{row.title}</span>
                  {row.description && <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[280px] md:max-w-[400px] xl:max-w-[600px]">{row.description}</p>}
                </div>
              )},
              { key: 'priority', title: '优先级', width: '80px', render: (row: any) => (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[row.priority] || ''}`}>{PRIORITY_MAP[row.priority] || '普通'}</span>
              )},
              { key: 'assignees', title: '执行人', width: '140px', render: (row: any) => {
                const names = row.assignees?.map((a: any) => a.name) || [];
                if (names.length === 0) return <span className="text-xs text-gray-400">未分配</span>;
                if (names.length <= 2) return <span className="text-xs text-gray-600">{names.join('、')}</span>;
                return <span className="text-xs text-gray-600">{names.slice(0, 2).join('、')}<span className="text-gray-400"> 等{names.length}人</span></span>;
              }},
              { key: 'relatedTo', title: '关联', width: '200px', render: (row: any) => (
                row.relatedTo?.name && row.relatedTo.type !== 'none'
                  ? <span className="text-xs text-gray-500 truncate block max-w-[180px]">{row.relatedTo.type === 'lead' ? '客户' : '工地'}: {row.relatedTo.name}</span>
                  : <span className="text-xs text-gray-300">-</span>
              )},
              { key: 'dueDate', title: '时间', width: '140px', render: (row: any) => {
                if (row.status === 'completed' && row.completedAt) {
                  return <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={11} />{formatDate(row.completedAt)}</span>;
                }
                if (!row.dueDate) return <span className="text-xs text-gray-300">-</span>;
                const ds = getDueStatus(row.dueDate);
                return <span className={`text-xs ${ds.color || 'text-gray-500'}`}>{row.dueDate}{ds.label ? ` (${ds.label})` : ''}</span>;
              }},
              { key: 'actions', title: '', width: '60px', align: 'right', render: (row: any) => (
                <button onClick={e => { e.stopPropagation(); if (confirm('确定删除该待办吗？')) handleDelete(row._id); }}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors inline-block"><Trash2 size={14} /></button>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
            onRowClick={(row) => setDetailTodo(row as any)}
            rowKey={(row) => (row as any)._id as string}
            mobileCardColumns={mobileTodoCardColumns}
          />
        ) : (
          <div>
            {Object.entries(getGroupedData()).map(([groupName, items]) => (
              <div key={groupName} className="border-b border-gray-100 last:border-b-0">
                <button onClick={() => toggleGroup(groupName)} className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-2">
                    {expandedGroups[groupName] ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
                    <span className="text-sm font-medium text-gray-700">{groupName}</span>
                    <span className="text-xs text-gray-400">({items.length})</span>
                  </div>
                </button>
                {expandedGroups[groupName] && (
                  <DataTable
                    columns={[
                      { key: 'status', title: '', width: '40px', render: (row: any) => (
                        <button onClick={e => { e.stopPropagation(); handleToggleStatus(row); }} className="mt-0.5">
                          {row.status === 'completed'
                            ? <CheckCircle size={18} className="text-emerald-500" />
                            : <Circle size={18} className="text-gray-300 hover:text-gold-400" />}
                        </button>
                      )},
                      { key: 'title', title: '待办', render: (row: any) => (
                        <div>
                          <span className={`text-sm font-medium ${row.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{row.title}</span>
                          {row.description && <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[280px] md:max-w-[400px] xl:max-w-[600px]">{row.description}</p>}
                        </div>
                      )},
                      { key: 'priority', title: '优先级', width: '80px', render: (row: any) => (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[row.priority] || ''}`}>{PRIORITY_MAP[row.priority] || '普通'}</span>
                      )},
                      { key: 'assignees', title: '执行人', width: '140px', render: (row: any) => {
                        const names = row.assignees?.map((a: any) => a.name) || [];
                        if (names.length === 0) return <span className="text-xs text-gray-400">未分配</span>;
                        if (names.length <= 2) return <span className="text-xs text-gray-600">{names.join('、')}</span>;
                        return <span className="text-xs text-gray-600">{names.slice(0, 2).join('、')}<span className="text-gray-400"> 等{names.length}人</span></span>;
                      }},
                      { key: 'relatedTo', title: '关联', width: '200px', render: (row: any) => (
                        row.relatedTo?.name && row.relatedTo.type !== 'none'
                          ? <span className="text-xs text-gray-500 truncate block max-w-[180px]">{row.relatedTo.type === 'lead' ? '客户' : '工地'}: {row.relatedTo.name}</span>
                          : <span className="text-xs text-gray-300">-</span>
                      )},
                      { key: 'dueDate', title: '时间', width: '140px', render: (row: any) => {
                        if (row.status === 'completed' && row.completedAt) {
                          return <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={11} />{formatDate(row.completedAt)}</span>;
                        }
                        if (!row.dueDate) return <span className="text-xs text-gray-300">-</span>;
                        const ds = getDueStatus(row.dueDate);
                        return <span className={`text-xs ${ds.color || 'text-gray-500'}`}>{row.dueDate}{ds.label ? ` (${ds.label})` : ''}</span>;
                      }},
                      { key: 'actions', title: '', width: '60px', align: 'right', render: (row: any) => (
                        <button onClick={e => { e.stopPropagation(); if (confirm('确定删除该待办吗？')) handleDelete(row._id); }}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors inline-block"><Trash2 size={14} /></button>
                      )},
                    ]}
                    data={items as unknown as Record<string, unknown>[]}
                    onRowClick={(row) => setDetailTodo(row as any)}
                    rowKey={(row) => (row as any)._id as string}
                    mobileCardColumns={mobileTodoCardColumns}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto" onClick={() => setShowCreate(false)}>
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-bold">新建待办</h2>
                <button type="button" onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
              </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">标题 *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="输入待办标题"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">描述</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="详细描述..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">优先级</label>
                  <SearchableSelect
                    options={Object.entries(PRIORITY_MAP).map(([k, v]) => ({ value: k, label: v }))}
                    value={form.priority} onChange={v => setForm({ ...form, priority: v })} placeholder="选择优先级"
                    direction="down"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">截止日期</label>
                  <CustomDatePicker value={form.dueDate} onChange={v => setForm({ ...form, dueDate: v })} direction="up" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">关联类型</label>
                <SearchableSelect
                  options={Object.entries(RELATED_TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))}
                  value={form.relatedType} onChange={v => setForm({ ...form, relatedType: v, relatedId: '', relatedName: '' })}
                  placeholder="选择关联类型"
                  direction="up"
                />
              </div>
              {form.relatedType === 'lead' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">关联客户</label>
                  <SearchableSelect
                    options={leads.map(l => ({ value: l._id, label: l.name }))}
                    value={form.relatedId} onChange={v => handleRelatedSelect('lead', v)}
                    placeholder="搜索客户..." searchPlaceholder="输入客户名称搜索..."
                    direction="up"
                  />
                </div>
              )}
              {form.relatedType === 'project' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">关联工地</label>
                  <SearchableSelect
                    options={projects.map(p => ({ value: p._id, label: `${p.customer}${p.address ? ' - ' + p.address : ''}` }))}
                    value={form.relatedId} onChange={v => handleRelatedSelect('project', v)}
                    placeholder="搜索工地..." searchPlaceholder="输入客户名或地址搜索..."
                    direction="up"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">执行人 *</label>
                <AssigneePicker employees={employees} value={form.assignees}
                  onChange={v => setForm({ ...form, assignees: v })} myName={myName} myId={myId} />
                {form.assignees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.assignees.map(a => (
                      <span key={a.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 border border-gold-200">
                        {a.name}
                        <button type="button" onClick={() => setForm({ ...form, assignees: form.assignees.filter(x => x.id !== a.id) })}
                          className="hover:text-gold-900"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">附件</label>
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-500 cursor-pointer hover:border-gold-300 hover:text-gold-600">
                  {uploadingCreateAttachments ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploadingCreateAttachments ? '上传中…' : '上传图片或文件'}
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={uploadingCreateAttachments}
                    onChange={(e) => {
                      void handleCreateAttachmentUpload(e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <FormAttachmentList
                  attachments={form.attachments}
                  onRemove={(idx) => setForm(prev => ({
                    ...prev,
                    attachments: prev.attachments.filter((_: any, i: number) => i !== idx),
                  }))}
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate} disabled={submitting || !form.title.trim() || form.assignees.length === 0}
                className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
        </div>,
        document.body
      )}

      {detailTodo && (
        <TodoDetailModal
          todo={detailTodo} onClose={() => setDetailTodo(null)}
          onToggle={handleToggleStatus} onDelete={handleDelete} onUpdate={handleUpdate}
          employees={employees} leads={leads} projects={projects}
          myName={myName} myId={myId} isAdmin={isAdmin}
        />
      )}
    </div>
  );
}


