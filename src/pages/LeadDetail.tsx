import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { leadsAPI, followUpsAPI, projectsAPI, usersAPI, contractsAPI, systemConfigsAPI } from '@/db/api';
import { cloudDB } from '@/db/cloudbase';
import { useFinanceStore } from '@/store/financeStore';
import { uploadFile as uploadToCloud, getTempFileURL, getFileDataURL, downloadFile as cloudDownloadFile } from '@/utils/cloudStorage';
import DatePicker from '@/components/DatePicker';
import BottomDrawer from '@/components/BottomDrawer';
import ContractDrawer from '@/components/ContractDrawer';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import ReceiptFormModal from '@/components/ReceiptFormModal';
import ExpenseFormModal from '@/components/ExpenseFormModal';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { canManageAllCustomers, canViewFinancialData, hasRole, getHighestRole } from '@/store/authStore';
import { useBizStore } from '@/store/bizStore';
import { useDialogStore } from '@/store/dialogStore';
import { useUploadQueueStore } from '@/store/uploadQueueStore';
import { formatDate, formatDateTime, generateId } from '@/utils/format';
import { getCurrentReturnPath, useSmartBack } from '@/hooks/useSmartBack';
import { downloadAttachment, openAttachment } from '@/utils/financeAttachments';
import { openCustomerShare } from '@/utils/customerShare';
import {
  createNotificationEventSafely,
  resolveUserIdsByNames,
  stableOperationId,
} from '@/services/notificationService';
import { addLeadAuditFollowUp, describeLeadChanges, namesText, notifyLeadAssignment } from '@/utils/leadAudit';
import { syncLeadRelations } from '@/utils/syncLeadRelations';
import {
  ArrowLeft, Phone, MapPin, Edit3, Plus, Trash2, X, Calendar, Clock,
  ChevronDown, ChevronRight, ChevronUp, FileText, Building, UserCheck, Tag,
  Eye, EyeOff, FolderPlus, Image as ImageIcon, Video, File, Upload,
  Folder, Lock, Camera, MoreHorizontal,
  CheckCircle2, Circle, AlertCircle, Play, PlusCircle,
  HardHat, ExternalLink, Download, DollarSign, Receipt, BarChart3, Link, Share2,
} from 'lucide-react';

const FOLLOW_METHODS = ['电话沟通', '微信沟通', '客户到店', '上门量房', '其他'];
const LOST_REASONS = ['价格太高', '选择其他公司', '预算不足', '方案不满意', '暂时不需要', '其他'];
const ROLE_DEPT: Record<string, string> = { admin: '管理组', operations: '运营', sales: '销售部', designer: '设计部', manager: '工程部', finance: '财务部', employee: '普通' };
const SOURCE_OPTIONS = ['自然进店', '老介新', '抖音', '自有关系', '其他'];
const BUDGET_OPTIONS = ['暂无', '10-20万', '20-30万', '30-50万', '50万以上'];
const REQ_OPTIONS = ['毛坯', '旧改'];
const DESIGN_NODE_OPTIONS = ['平面布局', '效果图渲染', '施工图深化', '定制图纸绘制', '自定义'];
const MATERIAL_CATEGORIES = ['瓷砖/木地板', '木门/金属门', '壁布/乳胶漆/护墙板', '集成吊顶/电器', '全屋定制衣柜', '全屋定制橱柜', '其他'];
const REGION_OPTIONS: Record<string, string[]> = {
  '瓷砖/木地板': ['客餐厅', '主卫墙面', '主卫地面', '客卫墙面', '客卫地面', '干区墙面', '厨房墙面'],
  '木门/金属门': ['卫生间', '厨房', '卧室', '窗套', '入户门套'],
  '壁布/乳胶漆/护墙板': ['客餐厅', '主卧', '次卧', '儿童房', '走廊'],
  '集成吊顶/电器': ['厨房', '卫生间'],
  '全屋定制衣柜': ['主卧', '次卧', '儿童房', '入户'],
  '全屋定制橱柜': ['厨房'],
};
const MATERIAL_NAME_OPTIONS = ['窗台石', '踢脚线', '橱柜台面', '水槽', '开关插座'];
const ITEM_CATEGORY_OPTIONS = ['壁布', '乳胶漆', '护墙板'];

const toPersonArray = (val: string | string[] | undefined | null): string[] => {
  if (Array.isArray(val)) return val.flatMap(v => typeof v === 'string' ? v.split(/[,，、\s]+/).filter(Boolean) : []);
  if (val && val !== '未分配' && val !== '') return val.split(/[,，、\s]+/).filter(Boolean);
  return [];
};

const includesPerson = (arr: string | string[] | undefined | null, name: string): boolean => {
  return toPersonArray(arr).includes(name);
};

const INIT_MATERIAL: Record<string, any> = {
  category: '瓷砖/木地板', region: '', brand: '', model: '', spec: '',
  quantity: '', remark: '', frameColor: '', coreColor: '', doorModel: '',
  itemCategory: '', name: '', cabinetBody: '', cabinetDoor: '', handle: '', images: [],
};

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}

function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'doc';
  return 'file';
}

function FileTy({ type, size = 14 }: { type: string; size?: number }) {
  switch (type) {
    case 'image': return <ImageIcon size={size} className="text-blue-400" />;
    case 'video': return <Video size={size} className="text-purple-400" />;
    case 'doc': return <FileText size={size} className="text-orange-400" />;
    default: return <File size={size} className="text-gray-400" />;
  }
}

function UploadingMediaThumb({ type, src, alt, className }: { type: string; src?: string; alt?: string; className?: string }) {
  if (!src) return <FileTy type={type} size={18} />;
  if (type === 'image' || src.startsWith('data:image/')) {
    return <img src={src} alt={alt || '上传中'} className={className} />;
  }
  if (type === 'video') {
    return (
      <video
        src={src}
        className={className}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < 0.1) {
            video.currentTime = Math.min(0.1, video.duration / 2);
          }
        }}
      />
    );
  }
  return <FileTy type={type} size={18} />;
}

function uploadPosterFromTask(task: { file?: File; previewUrl?: string }) {
  return task.file?.type?.startsWith('video/') && task.previewUrl?.startsWith('data:image/')
    ? task.previewUrl
    : '';
}

function UploadingItemOverlay({
  item,
  onRetry,
  onRemove,
}: {
  item: any;
  onRetry: (taskId: string) => void;
  onRemove: (taskId: string) => void;
}) {
  if (!item?.isUploading) return null;
  const isError = item.uploadStatus === 'error';
  const progress = Math.max(0, Math.min(100, item.uploadProgress || 0));
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end rounded-xl bg-white/70 p-2 backdrop-blur-[1px]">
      <div className="rounded-lg bg-white/95 p-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-[11px] font-semibold ${isError ? 'text-red-600' : 'text-gray-700'}`}>
            {isError ? '上传失败' : item.uploadStatus === 'queued' ? '等待上传' : '上传中'}
          </span>
          {isError && (
            <span className="flex shrink-0 items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); onRetry(item.uploadTaskId); }} className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white">重试</button>
              <button onClick={(e) => { e.stopPropagation(); onRemove(item.uploadTaskId); }} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">删除</button>
            </span>
          )}
        </div>
        {!isError && (
          <>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-0.5 text-right text-[10px] font-medium text-gray-400">{progress}%</div>
          </>
        )}
      </div>
    </div>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
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
  groups, className = '', compact = false, menuWidth,
}: {
  options: { value: string; label: string; group?: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string; searchPlaceholder?: string;
  groups?: { key: string; label: string }[];
  className?: string; compact?: boolean; menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, () => { setOpen(false); setSearch(''); });
  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => {
        if (window.matchMedia('(max-width: 767px)').matches) setMobileOpen(true);
        else setOpen(!open);
      }}
        className={`w-full flex items-center justify-between border border-gray-200 rounded-lg bg-white transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gold-400 ${compact ? 'px-1.5 py-1 text-[11px]' : 'px-3 py-2 text-xs'}`}>
        <span className={`truncate ${selected ? 'text-gray-700' : 'text-gray-400'}`}>{selected?.label || placeholder}</span>
        <ChevronDown size={compact ? 10 : 12} className="shrink-0 ml-0.5 text-gray-400" />
      </button>
      {open && (
        <div
          className="hidden md:block absolute z-[100] mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
          style={{ width: menuWidth ?? (compact ? 128 : 180) }}
        >
          <div className="p-2 border-b border-gray-100">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={searchPlaceholder}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gold-400" autoFocus />
          </div>
          <div className="max-h-52 overflow-auto">
            {groups ? groups.map(g => {
              const items = filtered.filter(o => o.group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key}>
                  <div className="px-3 py-1.5 text-[11px] font-medium text-gray-400 bg-gray-50 sticky top-0">{g.label}</div>
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
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gold-50 transition-colors ${value === o.value ? 'bg-gold-50 text-gold-700 font-medium' : 'text-gray-700'}`}>
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-xs text-gray-400 text-center">无匹配结果</div>}
          </div>
        </div>
      )}
      <BottomDrawer open={mobileOpen} onClose={() => { setMobileOpen(false); setSearch(''); }} title={placeholder}>
        <div className="space-y-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={searchPlaceholder}
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400" />
          <div className="max-h-[52vh] overflow-auto space-y-1">
            {groups ? groups.map(g => {
              const items = filtered.filter(o => o.group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key}>
                  <div className="px-2 py-2 text-[11px] font-medium text-gray-400">{g.label}</div>
                  {items.map(o => (
                    <button key={o.value} type="button" onClick={() => { onChange(o.value); setMobileOpen(false); setSearch(''); }}
                      className={`w-full text-left px-4 py-2.5 text-xs rounded-lg transition-colors ${value === o.value ? 'bg-gray-50 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              );
            }) : filtered.map(o => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setMobileOpen(false); setSearch(''); }}
                className={`w-full text-left px-4 py-2.5 text-xs rounded-lg transition-colors ${value === o.value ? 'bg-gray-50 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-8 text-xs text-gray-400 text-center">无匹配结果</div>}
          </div>
        </div>
      </BottomDrawer>
    </div>
  );
}

function CustomDatePicker({ value, onChange, placeholder = '选择日期', compact = false, dropUp = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; compact?: boolean; dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value.replace(/-/g, '/')) : new Date());
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const updatePopupPosition = useCallback(() => {
    const trigger = ref.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const popupWidth = popupRef.current?.offsetWidth || 260;
    const popupHeight = popupRef.current?.offsetHeight || 330;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = dropUp || (spaceBelow < popupHeight + gap && rect.top > spaceBelow);
    const maxTop = Math.max(8, window.innerHeight - popupHeight - 8);

    setPopupPosition({
      top: Math.min(Math.max(8, openAbove ? rect.top - popupHeight - gap : rect.bottom + gap), maxTop),
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - popupWidth - 8)),
    });
  }, [dropUp]);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const frame = window.requestAnimationFrame(updatePopupPosition);
    updatePopupPosition();
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', updatePopupPosition);
    window.addEventListener('scroll', updatePopupPosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', updatePopupPosition);
      window.removeEventListener('scroll', updatePopupPosition, true);
    };
  }, [open, updatePopupPosition]);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const selectDate = (date: Date) => {
    onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
    setOpen(false);
    setMobileOpen(false);
  };
  const selectDay = (day: number) => {
    selectDate(new Date(year, month, day));
  };
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const renderCalendar = (isMobile: boolean) => (
    <div className={isMobile ? '' : 'p-3'}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={isMobile ? 18 : 14} className="rotate-180" /></button>
        <span className={`font-medium ${isMobile ? 'text-base' : 'text-sm'}`}>{year}年{month + 1}月</span>
        <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={isMobile ? 18 : 14} /></button>
      </div>
      <div className={`grid grid-cols-7 gap-0.5 text-center mb-2 ${isMobile ? 'text-sm' : 'text-xs mb-1'}`}>
        {['日', '一', '二', '三', '四', '五', '六'].map(w => (<div key={w} className={`text-gray-400 py-1 ${isMobile ? 'text-xs' : ''}`}>{w}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {days.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = new Date(year, month, d).getTime() === today.getTime();
          const isSelected = value === ds;
          return (
            <button key={d} type="button" onClick={() => selectDay(d)}
              className={`${isMobile ? 'w-10 h-10' : 'w-8 h-8'} rounded-full flex items-center justify-center transition-colors text-sm
                ${isSelected ? 'bg-gold-400 text-black font-bold' : isToday ? 'bg-gold-50 text-gold-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
              {d}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={() => { onChange(''); setOpen(false); setMobileOpen(false); }} className={`text-gray-400 hover:text-gray-600 ${isMobile ? 'text-sm' : 'text-xs'}`}>清除</button>
        <button type="button" onClick={() => { const t = new Date(); setViewDate(t); selectDate(t); }} className={`text-gold-500 hover:text-gold-600 font-medium ${isMobile ? 'text-sm' : 'text-xs'}`}>今天</button>
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
          setMobileOpen(true);
          setViewDate(value ? new Date(value.replace(/-/g, '/')) : new Date());
        } else {
          setOpen(!open);
          setViewDate(value ? new Date(value.replace(/-/g, '/')) : new Date());
        }
      }}
        className={`w-full flex items-center justify-between border border-gray-200 rounded-lg bg-white transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gold-400 ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}>
        <span className={value ? 'text-gray-700' : 'text-gray-400'}>{value || placeholder}</span>
        <Calendar size={compact ? 10 : 12} className="shrink-0 ml-1 text-gray-400" />
      </button>
      {/* 桌面端弹窗 */}
      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[160] hidden rounded-xl border border-gray-200 bg-white shadow-xl md:block"
          style={{ width: 260, top: popupPosition.top, left: popupPosition.left }}
        >
          {renderCalendar(false)}
        </div>,
        document.body,
      )}
      {/* 移动端底部抽屉 */}
      <BottomDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={placeholder || '选择日期'}>
        {renderCalendar(true)}
      </BottomDrawer>
    </div>
  );
}

const INIT_FOLLOW = { content: '', method: '跟进' };
type TabKey = 'follow' | 'design' | 'material' | 'quote' | 'project' | 'files';

function InfoBlock({ label, value, secondary = false, className = '' }: { label: string, value: React.ReactNode, secondary?: boolean, className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className="text-[12px] text-gray-400 font-medium">{label}</span>
      <div className={`text-[14px] font-medium ${secondary ? 'text-gray-500' : 'text-gray-900'} break-words`} title={typeof value === 'string' ? value : ''}>
        {value || '-'}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-b-0">
      <span className="text-[13px] text-gray-400 shrink-0">{label}</span>
      <span className="text-[13px] text-gray-900 font-medium text-right leading-relaxed break-words min-w-0">{value || '-'}</span>
    </div>
  );
}

function PersonnelValue({ names }: { names: string | string[] }) {
  const arr = toPersonArray(names);
  if (arr.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-amber-500 bg-amber-50/80 px-2 py-0.5 rounded-md font-medium">
        未分配
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-sm">{arr.join('、')}</span>
    </div>
  );
}

// 计算施工阶段状态
function getStageStatuses(nodesData: any[] = []) {
  const nodeStatuses = nodesData.map((node: any) => {
    let stageTotal = 0;
    let stageCompleted = 0;
    (node.sections || []).forEach((sec: any) => {
      (sec.subNodes || []).forEach((sn: any) => {
        stageTotal++;
        if (sn.status === 'completed') stageCompleted++;
      });
    });
    let status = 'pending';
    if (stageTotal > 0) {
      if (stageCompleted === stageTotal) status = 'completed';
      else if (stageCompleted > 0) status = 'current';
    }
    return { node, status, stageCompleted, stageTotal };
  });
  const firstPendingIndex = nodeStatuses.findIndex((n: any) => n.status === 'pending');
  if (firstPendingIndex !== -1 && !nodeStatuses.some((n: any) => n.status === 'current')) {
    nodeStatuses[firstPendingIndex].status = 'current';
  }
  return nodeStatuses;
}

// 构建项目进度摘要
function buildProjectProgressSummary(nodesData: any[] = []) {
  const nodeStatuses = getStageStatuses(nodesData);
  const nodesList = nodeStatuses.map((item: any) => item.node?.name || '').filter(Boolean);
  let completedSubNodes = 0;
  let totalSubNodes = 0;
  nodeStatuses.forEach((item: any) => {
    completedSubNodes += item.stageCompleted || 0;
    totalSubNodes += item.stageTotal || 0;
  });
  let currentIndex = nodeStatuses.findIndex((item: any) => item.status === 'current');
  if (currentIndex < 0) {
    currentIndex = nodeStatuses.reduce((last: number, item: any, idx: number) => item.status === 'completed' ? idx : last, -1);
  }
  if (currentIndex < 0 && nodeStatuses.length > 0) currentIndex = 0;
  const nodesCount = nodesList.length;
  const currentNode = nodesCount > 0 ? Math.min(nodesCount, currentIndex + 1) : 0;
  const currentProgress = nodesCount > 1 ? Math.max(0, currentNode - 1) / (nodesCount - 1) : (nodesCount === 1 ? 1 : 0);
  return {
    currentNode,
    currentNodeName: nodesList[currentNode - 1] || '',
    nodeName: nodesList[currentNode - 1] || '',
    nodesCount,
    nodesList,
    stageStatuses: nodeStatuses.map((item: any) => ({ name: item.node?.name || '', status: item.status })),
    currentProgress,
    progressPercent: totalSubNodes > 0 ? Math.round((completedSubNodes / totalSubNodes) * 100) : Math.round(currentProgress * 100),
    completedSubNodes,
    totalSubNodes,
    updatedAt: Date.now(),
  };
}

export default function LeadDetail() {
  const { id, section } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getCurrentReturnPath(location.pathname, location.search);
  const smartBack = useSmartBack('/leads');
  const { user } = useAuthStore();
  const notifications = useNotificationStore((state) => state.notifications);
  const markRelatedAsRead = useNotificationStore((state) => state.markRelatedAsRead);
  const hasLeadActionUnread = (actionKey: string) => notifications.some((item: any) => {
    if (item.isRead || item.relatedTo?.type !== 'lead' || item.relatedTo?.id !== id) return false;
    const text = `${item.title || ''} ${item.content || ''} ${item.link || ''}`;
    if (actionKey === 'design') return /设计|\/design(?:\?|$)/.test(text);
    if (actionKey === 'material') return /主材|材料|\/material(?:\?|$)/.test(text);
    if (actionKey === 'quote') return /报价|\/quote(?:\?|$)/.test(text);
    if (actionKey === 'files') return /资料|附件|上传|\/files(?:\?|$)/.test(text);
    if (actionKey === 'share-access') return /查看申请|访问申请|\/share-access(?:\?|$)/.test(text);
    return /合同|收款|报销|成本|保险|跟进|客户资料/.test(text);
  });
  const { currentBizType } = useBizStore();
  const { showAlert, showConfirm } = useDialogStore();
  const addUploadTasks = useUploadQueueStore(s => s.addTasks);
  const uploadTasks = useUploadQueueStore(s => s.tasks);
  const retryUploadTask = useUploadQueueStore(s => s.retryTask);
  const removeUploadTask = useUploadQueueStore(s => s.removeTask);
  const myName = user?.name || '';
  const myId = user?.id || '';
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);
  const canManageAll = canManageAllCustomers(user?.roles, user?.role);
  const canViewFinance = canViewFinancialData(user?.roles, user?.role);

  // 移动端检测
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const defaultFolders = currentBizType === '工装' ? ['合同资料', '默认文件夹'] : ['设计图纸', '合同资料', '现场照片', '报价单', '主材清单', '默认文件夹'];
  const isContractFolder = (folderName?: string) => ['合同资料', '合同文件夹'].includes(String(folderName || '').trim());


  const [lead, setLead] = useState<any>(null);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('follow');
  const standaloneSection = (['design', 'material', 'quote', 'files'] as TabKey[]).includes(section as TabKey) ? section as TabKey : null;
  const [mobileStatusPicker, setMobileStatusPicker] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFollowForm, setShowFollowForm] = useState(false);
  const [followForm, setFollowForm] = useState(INIT_FOLLOW);
  const [isSubmittingFollow, setIsSubmittingFollow] = useState(false);
  const [hasProject, setHasProject] = useState(false);
  const [projectInfo, setProjectInfo] = useState<any>(null);
  const [pendingAccessCount, setPendingAccessCount] = useState(0);
  const [contractDrawerOpen, setContractDrawerOpen] = useState(false);
  const [hasContract, setHasContract] = useState(false);
  const [contractInfo, setContractInfo] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const { quotations } = useFinanceStore();
  const quoteInfo = useMemo(() => {
    const qs = quotations.filter(q => q.leadId === id);
    if (qs.length > 0) return qs[qs.length - 1]; // Return the latest one
    return null;
  }, [quotations, id]);
  const quoteList = useMemo(
    () => quotations.filter(q => q.leadId === id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [quotations, id]
  );
  const hasQuote = !!quoteInfo;
  const [showLostModal, setShowLostModal] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(true);
  const [lostReason, setLostReason] = useState('');
  const [lostReasonCustom, setLostReasonCustom] = useState('');
  const isRelated = canManageAll || includesPerson(lead?.sales, myName) || includesPerson(lead?.designer, myName) || includesPerson(lead?.manager, myName) || lead?.creatorName === myName || lead?.signer === myName;
  const showFullInfo = isRelated || lead?.status === '已签单' || lead?.status === '已流失';
  const canEdit = isRelated;
  const displayName = showFullInfo ? (lead?.name || '') : (lead?.name ? lead.name.charAt(0) + '**' : '');
  const displayAddress = showFullInfo ? (lead?.address || '') : (lead?.address ? '***' : '');
  const titleString = displayName + (displayAddress ? ` - ${displayAddress}` : '');
  const displayPhone = showFullInfo ? (lead?.phone || '') : (lead?.phone ? lead.phone.substring(0, 3) + '****' + lead.phone.substring(7) : '');

  const [showSignModal, setShowSignModal] = useState(false);
  const [signForm, setSignForm] = useState({ signer: '', signDate: '' });
  const [showCelebration, setShowCelebration] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [editFollow, setEditFollow] = useState<any>(null);
  const [fuEditForm, setFuEditForm] = useState({ method: '', content: '' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [personnelModal, setPersonnelModal] = useState<null | { field: 'sales' | 'designer' | 'manager'; title: string }>(null);
  const [personnelForm, setPersonnelForm] = useState<string[]>([]);
  const [showDesignSetup, setShowDesignSetup] = useState(false);
  const [designSetupMode, setDesignSetupMode] = useState<'create' | 'manage'>('create');
    const [customDesignNodeName, setCustomDesignNodeName] = useState('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState({ customer: '', phone: '', address: '', manager: '', designer: '', startDate: '', endDate: '', remark: '' });
  const [delayModal, setDelayModal] = useState<{ nodeId: number; name: string } | null>(null);
  const [delayReason, setDelayReason] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<number, boolean>>({});
  const [nodeLoading, setNodeLoading] = useState<Record<number, boolean>>({});
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [nodeFileLoading, setNodeFileLoading] = useState<Record<number, boolean>>({});
  const nodeFileInputRef = useRef<HTMLInputElement>(null);
  const nodeFileTargetRef = useRef<number | null>(null);
  const [nodeFileTarget, setNodeFileTarget] = useState<number | null>(null);

  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [materialForm, setMaterialForm] = useState<any>({ ...INIT_MATERIAL });
  const [editMaterialIndex, setEditMaterialIndex] = useState(-1);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [customRegion, setCustomRegion] = useState('');
  const [isCustomRegionMode, setIsCustomRegionMode] = useState(false);
  const [matLocalImages, setMatLocalImages] = useState<{ file: File; preview: string }[]>([]);
  const [matExistingImages, setMatExistingImages] = useState<string[]>([]);
  const [matImageUrls, setMatImageUrls] = useState<Record<string, string>>({});
  const [matImageLoading, setMatImageLoading] = useState(false);
  const [swipedMaterialId, setSwipedMaterialId] = useState<string | null>(null);
  const [swipedFollowId, setSwipedFollowId] = useState<string | null>(null);
  const [swipedDesignFileKey, setSwipedDesignFileKey] = useState<string | null>(null);
  const [showShareCategoryModal, setShowShareCategoryModal] = useState(false);
  const [selectedShareCategories, setSelectedShareCategories] = useState<string[]>([]);
  const matImgInputRef = useRef<HTMLInputElement>(null);
  const materialTouchStartX = useRef(0);
  const materialTouchStartY = useRef(0);
  const designFileTouchStartX = useRef(0);
  const designFileTouchStartY = useRef(0);

  const [selectedFolder, setSelectedFolder] = useState('默认文件夹');
  const [expandedFileFolders, setExpandedFileFolders] = useState<Record<string, boolean>>({});
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadFolder, setUploadFolder] = useState('默认文件夹');
  const [uploadVisibility, setUploadVisibility] = useState<'public' | 'internal'>('internal');
  const [uploading, setUploading] = useState(false);
  
  const [nodeUploadModal, setNodeUploadModal] = useState<{ isOpen: boolean; files: File[]; targetNodeId: number | null }>({
    isOpen: false,
    files: [],
    targetNodeId: null
  });
  const [nodeUploadConfig, setNodeUploadConfig] = useState({
    syncToProject: true,
    folder: '',
    visibility: 'internal' as 'public' | 'internal'
  });
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showMoveFileModal, setShowMoveFileModal] = useState(false);
  const [moveFileId, setMoveFileId] = useState('');
  const [moveTargetFolder, setMoveTargetFolder] = useState('');
  const [showRenameFolderModal, setShowRenameFolderModal] = useState(false);
  const [renameFolderOld, setRenameFolderOld] = useState('');
  const [renameFolderNew, setRenameFolderNew] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewImageList, setPreviewImageList] = useState<string[]>([]);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [fileImgUrls, setFileImgUrls] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMaterialTouchStart = (e: React.TouchEvent) => {
    materialTouchStartX.current = e.touches[0].clientX;
    materialTouchStartY.current = e.touches[0].clientY;
  };

  const handleMaterialTouchEnd = (e: React.TouchEvent, itemId: string) => {
    const deltaX = materialTouchStartX.current - e.changedTouches[0].clientX;
    const deltaY = Math.abs(materialTouchStartY.current - e.changedTouches[0].clientY);
    materialTouchStartX.current = 0;
    materialTouchStartY.current = 0;
    if (deltaX > 48 && deltaX > deltaY) {
      setSwipedMaterialId(prev => prev === itemId ? null : itemId);
    } else if (deltaX < -24 || deltaY > deltaX) {
      setSwipedMaterialId(null);
    }
  };

  const handleDesignFileTouchStart = (e: React.TouchEvent) => {
    designFileTouchStartX.current = e.touches[0].clientX;
    designFileTouchStartY.current = e.touches[0].clientY;
  };

  const handleDesignFileTouchEnd = (e: React.TouchEvent, fileKey: string) => {
    const deltaX = designFileTouchStartX.current - e.changedTouches[0].clientX;
    const deltaY = Math.abs(designFileTouchStartY.current - e.changedTouches[0].clientY);
    designFileTouchStartX.current = 0;
    designFileTouchStartY.current = 0;
    if (deltaX > 48 && deltaX > deltaY) {
      setSwipedDesignFileKey(prev => prev === fileKey ? null : fileKey);
    } else if (deltaX < -24 || deltaY > deltaX) {
      setSwipedDesignFileKey(null);
    }
  };

  // 跟进记录左滑操作
  const followTouchStartX = useRef(0);
  const followTouchStartY = useRef(0);
  const followTouchCurrentX = useRef(0);
  const followIsDraggingRef = useRef(false);
  const [followIsDragging, setFollowIsDragging] = useState(false);
  const [followSwipeOffset, setFollowSwipeOffset] = useState(0);
  const [activeSwipeFollowId, setActiveSwipeFollowId] = useState<string | null>(null);
  const FOLLOW_ACTION_WIDTH = 144;

  const handleFollowTouchStart = (e: React.TouchEvent, followId: string) => {
    followTouchStartX.current = e.touches[0].clientX;
    followTouchStartY.current = e.touches[0].clientY;
    followTouchCurrentX.current = e.touches[0].clientX;
    followIsDraggingRef.current = false;
    setFollowIsDragging(false);
    setActiveSwipeFollowId(followId);
    if (swipedFollowId === followId) {
      setFollowSwipeOffset(-FOLLOW_ACTION_WIDTH);
    } else {
      setFollowSwipeOffset(0);
    }
  };

  const handleFollowTouchMove = (e: React.TouchEvent) => {
    const deltaX = followTouchStartX.current - e.touches[0].clientX;
    const deltaY = Math.abs(followTouchStartY.current - e.touches[0].clientY);
    
    if (!followIsDraggingRef.current && Math.abs(deltaX) > 8 && deltaX > deltaY) {
      followIsDraggingRef.current = true;
      setFollowIsDragging(true);
    }
    
    if (followIsDraggingRef.current) {
      followTouchCurrentX.current = e.touches[0].clientX;
      
      const currentOpenOffset = swipedFollowId === activeSwipeFollowId ? -FOLLOW_ACTION_WIDTH : 0;
      let newOffset = currentOpenOffset - deltaX;
      
      if (newOffset > 0) newOffset = 0;
      if (newOffset < -FOLLOW_ACTION_WIDTH - 20) {
        newOffset = -FOLLOW_ACTION_WIDTH - 20 + (newOffset + FOLLOW_ACTION_WIDTH + 20) * 0.3;
      }
      
      setFollowSwipeOffset(newOffset);
    }
  };

  const handleFollowTouchEnd = (e: React.TouchEvent, followId: string) => {
    const deltaX = followTouchStartX.current - e.changedTouches[0].clientX;
    const deltaY = Math.abs(followTouchStartY.current - e.changedTouches[0].clientY);
    
    const wasOpen = swipedFollowId === followId;
    const effectiveDelta = wasOpen ? deltaX + FOLLOW_ACTION_WIDTH : deltaX;
    
    if (followIsDraggingRef.current) {
      if (effectiveDelta > FOLLOW_ACTION_WIDTH / 2) {
        setSwipedFollowId(followId);
      } else {
        setSwipedFollowId(null);
      }
    } else {
      if (deltaX > 48 && deltaX > deltaY) {
        setSwipedFollowId(prev => prev === followId ? null : followId);
      } else if (deltaX < -24 || deltaY > deltaX) {
        setSwipedFollowId(null);
      }
    }
    
    setFollowSwipeOffset(0);
    setActiveSwipeFollowId(null);
    setFollowIsDragging(false);
    followIsDraggingRef.current = false;
  };

  useEffect(() => {
    if (showEditModal) {
      const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
  }, [showEditModal]);

  useEffect(() => {
    setActiveTab(standaloneSection || 'follow');
  }, [standaloneSection]);

  useEffect(() => {
    if (!id) return;
    void markRelatedAsRead('lead', id);
  }, [id, markRelatedAsRead]);

  useEffect(() => {
    const projectId = projectInfo?._id || projectInfo?.id;
    if (!projectId) {
      setPendingAccessCount(0);
      return;
    }
    cloudDB.collection('shareAccess')
      .where({ projectId, status: 'pending' })
      .count()
      .then((res: any) => setPendingAccessCount(res.total || 0))
      .catch(() => setPendingAccessCount(0));
  }, [projectInfo?._id, projectInfo?.id]);

  useEffect(() => {
    if (!previewUrl || previewImageList.length <= 1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newIdx = previewImageIndex > 0 ? previewImageIndex - 1 : previewImageList.length - 1;
        setPreviewImageIndex(newIdx);
        setPreviewUrl(previewImageList[newIdx]);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newIdx = previewImageIndex < previewImageList.length - 1 ? previewImageIndex + 1 : 0;
        setPreviewImageIndex(newIdx);
        setPreviewUrl(previewImageList[newIdx]);
      } else if (e.key === 'Escape') {
        setPreviewUrl(null);
        setPreviewImageList([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewUrl, previewImageList, previewImageIndex]);

  const fetchData = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const leadData = await leadsAPI.doc(id).get();
      let leadObj = Array.isArray(leadData) ? leadData[0] : leadData;
      const leadKeys = Array.from(new Set([
        id,
        leadObj?._id,
        leadObj?.id,
        leadObj?.customerNo,
      ].filter(Boolean).map(String)));
      const followUpLists = await Promise.all(
        leadKeys.map((key) => followUpsAPI.where({ leadId: key }).orderBy('createdAt', 'desc').toArray())
      );
      const seenFollowUps = new Set<string>();
      const fuRes = followUpLists
        .flat()
        .filter((item: any) => {
          const itemKey = String(item?._id || item?.id || `${item?.leadId || ''}-${item?.createdAt || ''}-${item?.content || ''}`);
          if (seenFollowUps.has(itemKey)) return false;
          seenFollowUps.add(itemKey);
          return true;
        })
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setFollowUps(fuRes);
      const [projRes, userData, directContracts] = await Promise.all([
        projectsAPI.where({ leadId: id }).toArray(),
        usersAPI.toArray(),
        contractsAPI.where({ customerId: id }).toArray(),
      ]);
      const primaryProject = projRes.find((project: any) => toPersonArray(project?.manager).length > 0) || projRes[0] || null;
      const leadManagers = toPersonArray(leadObj?.manager);
      const projectManagers = toPersonArray(primaryProject?.manager);
      if (leadObj && leadManagers.length === 0 && projectManagers.length > 0) {
        const updatedAt = new Date().toISOString();
        leadObj = { ...leadObj, manager: projectManagers, updatedAt };
        leadsAPI.update(id, { manager: projectManagers, updatedAt }).catch((err) => {
          console.error('同步工地项目经理到客户失败', err);
        });
      }
      setLead(leadObj);
      setHasProject(projRes.length > 0);
      setProjectInfo(primaryProject);
      
      let relatedContracts = directContracts;
      if (relatedContracts.length === 0 && leadObj?.name) {
        relatedContracts = (await contractsAPI.where({ customerName: leadObj.name }).toArray())
          .filter((contract: any) => !leadObj.phone || contract.customerPhone === leadObj.phone);
      }
      setHasContract(relatedContracts.length > 0);
      setContractInfo(relatedContracts.length > 0 ? relatedContracts[0] : null);
      
      setEmployees(userData.filter((u: any) => u.status !== 'inactive'));
    } catch (e) { console.error(e); }
    finally { if (!silent) setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const persistLeadPartial = useCallback(async (updates: Record<string, any>) => {
    if (!id) return;
    const updatedAt = new Date().toISOString();
    setLead((prev: any) => (prev ? { ...prev, ...updates, updatedAt } : prev));
    await leadsAPI.update(id, { ...updates, updatedAt });
  }, [id]);

  const persistDesignNodes = useCallback(async (nextNodes: any[], extraUpdates?: Record<string, any>) => {
    await persistLeadPartial({ designNodes: nextNodes, ...(extraUpdates || {}) });
  }, [persistLeadPartial]);

  const loadMaterialImageUrls = async (materials: any[]) => {
    const allImgIds: string[] = [];
    materials.forEach(m => { if (m.images?.length) allImgIds.push(...m.images); });
    if (!allImgIds.length) return;
    const ids = Array.from(new Set(allImgIds.filter(Boolean)));
    const entries = await Promise.all(ids.map(async (fileID) => {
      if (/^(https?:|data:|blob:)/i.test(fileID)) return [fileID, fileID] as const;
      try {
        return [fileID, await getFileDataURL(fileID, 'thumbnail')] as const;
      } catch {
        const urls = await getTempFileURL([fileID]);
        return [fileID, urls[fileID]] as const;
      }
    }));
    setMatImageUrls(prev => ({ ...prev, ...Object.fromEntries(entries.filter(([, url]) => !!url)) }));
  };

  useEffect(() => {
    if (lead?.materialList?.length) loadMaterialImageUrls(lead.materialList);
  }, [lead?.materialList]);

  const loadFileThumbUrls = async (files: any[]) => {
    const imgFiles = files.filter((f: any) => (f.type || getFileType(f.name)) === 'image');
    if (!imgFiles.length) return;
    const ids = Array.from(new Set(imgFiles.map((f: any) => f.fileID).filter(Boolean)));
    const entries = await Promise.all(ids.map(async (fileID) => {
      if (/^(https?:|data:|blob:)/i.test(fileID)) return [fileID, fileID] as const;
      try {
        return [fileID, await getFileDataURL(fileID, 'thumbnail')] as const;
      } catch {
        const urls = await getTempFileURL([fileID]);
        return [fileID, urls[fileID]] as const;
      }
    }));
    setFileImgUrls(prev => ({ ...prev, ...Object.fromEntries(entries.filter(([, url]) => !!url)) }));
  };

  useEffect(() => {
    if (lead?.files?.length) loadFileThumbUrls(lead.files);
  }, [lead?.files]);

  const handleAddFollow = async () => {
    if (!followForm.content.trim() || !id || isSubmittingFollow) return;
    setIsSubmittingFollow(true);
    try {
      const now = new Date().toISOString();
      const followId = generateId();
      await followUpsAPI.add({
        _id: followId, leadId: id, content: followForm.content, method: followForm.method,
        createdBy: myName, createdAt: now, displayTime: formatDateTime(now), editedAt: '', editedBy: '',
      });
      await leadsAPI.update(id, { lastFollowUp: formatDateTime(now), lastFollowUpAt: Date.now(), updatedAt: now });
      const recipientUserIds = await resolveUserIdsByNames(lead?.sales, lead?.designer, lead?.manager);
      void createNotificationEventSafely({
        operationId: stableOperationId('lead-follow-created', id, followId),
        eventType: 'LEAD_FOLLOW_CREATED',
        actorUserId: myId,
        recipientUserIds,
        recipientRoles: ['admin'],
        category: 'lead',
        title: '新增客户跟进',
        content: `${myName}为客户“${lead?.name || '客户'}”新增了${followForm.method}记录：${followForm.content.trim().slice(0, 80)}`,
        link: `/leads/${id}`,
        relatedTo: { type: 'lead', id, name: lead?.name || '客户' },
        channels: ['station', 'wechat'],
      });
      setFollowForm(INIT_FOLLOW); setShowFollowForm(false);
      fetchData(true);
    } finally {
      setIsSubmittingFollow(false);
    }
  };

  const handleDeleteFollow = async (fuId: string) => {
    const confirmed = await showConfirm('确定删除该跟进记录吗？', { confirmStyle: 'danger' });
    if (!confirmed) return;
    await followUpsAPI.delete(fuId);
    fetchData(true);
  };

  const handleEditFollow = (fu: any) => {
    if ((fu.method || fu.type) === '系统记录') return;
    if ((fu.createdBy || fu.creatorName) !== myName) return;
    setEditFollow(fu);
    setFuEditForm({ method: fu.method || '', content: fu.content || '' });
  };

  const handleSaveEditFollow = async () => {
    if (!editFollow || !fuEditForm.content.trim()) return;
    await followUpsAPI.update(editFollow._id, {
      method: fuEditForm.method, content: fuEditForm.content.trim(),
      editedAt: formatDateTime(new Date().toISOString()), editedBy: myName,
    });
    setEditFollow(null); setFuEditForm({ method: '', content: '' });
    fetchData(true);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    setMobileStatusPicker(false);
    if (newStatus === '已签单') { setSignForm({ signer: '', signDate: '' }); setShowSignModal(true); return; }
    if (newStatus === '已流失') { setLostReason(''); setLostReasonCustom(''); setShowLostModal(true); return; }
    setLead((prev: any) => prev ? { ...prev, status: newStatus } : prev);
    const updatedAt = new Date().toISOString();
    await leadsAPI.update(id, { status: newStatus, updatedAt });
    await addLeadAuditFollowUp({
      leadId: id,
      lead,
      actorName: myName,
      content: `${myName}将客户状态从“${lead?.status || '未设置'}”调整为“${newStatus}”。`,
      createdAt: updatedAt,
    });
    const recipientUserIds = await resolveUserIdsByNames(lead?.sales, lead?.designer);
    void createNotificationEventSafely({
      operationId: stableOperationId('lead-status-changed', id, newStatus, updatedAt),
      eventType: 'LEAD_STATUS_CHANGED',
      actorUserId: myId,
      recipientUserIds,
      recipientRoles: ['admin'],
      category: 'lead',
      title: '客户状态变化',
      content: `${myName}将客户“${lead?.name || '客户'}”状态改为${newStatus}`,
      link: `/leads/${id}`,
      relatedTo: { type: 'lead', id, name: lead?.name || '客户' },
      channels: ['station', 'wechat'],
    });
  };

  const startEdit = () => {
    if (!lead) return;
    setEditForm({
      name: lead.name || '', phone: lead.phone || '', address: lead.address || '',
      doorPassword: lead.doorPassword || '', area: lead.area || '', budget: lead.budget || '暂无',
      requirementType: lead.requirementType || '毛坯', rating: lead.rating || 'C',
      source: lead.source || '自然进店', sourceCustom: lead.sourceCustom || '',
      sales: toPersonArray(lead.sales), designer: toPersonArray(lead.designer),
      manager: toPersonArray(lead.manager), remark: lead.remark || lead.notes || '',
    });
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!id) return;
    setLead((prev: any) => prev ? { ...prev, ...editForm } : prev);
    setShowEditModal(false);
    const updatedAt = new Date().toISOString();
    await leadsAPI.update(id, { ...editForm, updatedAt });
    const changes = describeLeadChanges(lead, editForm, [
      { key: 'name', label: '客户姓名' },
      { key: 'phone', label: '联系电话' },
      { key: 'address', label: '项目地址' },
      { key: 'area', label: '面积' },
      { key: 'budget', label: '预算' },
      { key: 'requirementType', label: '需求类型' },
      { key: 'rating', label: '客户评级' },
      { key: 'source', label: '客户来源' },
      { key: 'sales', label: '销售', type: 'people' },
      { key: 'designer', label: '设计', type: 'people' },
      { key: 'manager', label: '工程', type: 'people' },
      { key: 'remark', label: '备注' },
    ]);
    if (changes.length > 0) {
      await addLeadAuditFollowUp({
        leadId: id,
        lead: { ...lead, ...editForm },
        actorName: myName,
        content: `${myName}编辑客户资料：${changes.join('；')}。`,
        createdAt: updatedAt,
      });
    }
    try {
      await syncLeadRelations(id, { ...lead, ...editForm, updatedAt }, lead);
    } catch (e) {
      console.error('同步关联数据失败:', e);
    }
    const recipientUserIds = await resolveUserIdsByNames(editForm.sales, editForm.designer, editForm.manager);
    void createNotificationEventSafely({
      operationId: stableOperationId('lead-profile-edited', id, updatedAt),
      eventType: 'LEAD_PROFILE_EDITED',
      actorUserId: myId,
      recipientUserIds,
      recipientRoles: ['admin'],
      category: 'lead',
      title: '客户资料已编辑',
      content: changes.length > 0
        ? `${myName}编辑了客户“${editForm.name || lead?.name || '客户'}”：${changes.join('；')}。`
        : `${myName}修改了客户“${editForm.name || lead?.name || '客户'}”的资料`,
      link: `/leads/${id}`,
      relatedTo: { type: 'lead', id, name: editForm.name || lead?.name || '客户' },
      channels: ['station', 'wechat'],
    });
  };

  const openPersonnelModal = (field: 'sales' | 'designer' | 'manager', title: string) => {
    if (!canEdit) return;
    setPersonnelModal({ field, title });
    setPersonnelForm(toPersonArray(lead?.[field]));
  };

  const savePersonnelAssignment = async () => {
    if (!id || !personnelModal) return;
    const { field } = personnelModal;
    const nextValues = personnelForm;
    const previousValues = toPersonArray(lead?.[field]);
    const newlyAssignedNames = nextValues.filter(name => !previousValues.includes(name));
    setLead((prev: any) => prev ? { ...prev, [field]: nextValues } : prev);
    setPersonnelModal(null);

    try {
      const updatedAt = new Date().toISOString();
      await leadsAPI.update(id, { [field]: nextValues, updatedAt });
      await addLeadAuditFollowUp({
        leadId: id,
        lead,
        actorName: myName,
        content: `${myName}调整跟进人员：${personnelModal.title}从“${namesText(previousValues)}”调整为“${namesText(nextValues)}”。`,
        createdAt: updatedAt,
      });

      await syncLeadRelations(id, { ...lead, [field]: nextValues, updatedAt }, lead);
      const recipientUserIds = await resolveUserIdsByNames(
        field === 'sales' ? nextValues : lead?.sales,
        field === 'designer' ? nextValues : lead?.designer,
        field === 'manager' ? nextValues : lead?.manager,
      );
      await createNotificationEventSafely({
        operationId: stableOperationId('lead-personnel-edited', id, field, updatedAt),
        eventType: 'LEAD_PERSONNEL_EDITED',
        actorUserId: myId,
        recipientUserIds,
        recipientRoles: ['admin'],
        category: 'lead',
        title: '客户跟进人员已调整',
        content: `${myName}将客户“${lead?.name || '客户'}”的${personnelModal.title}从“${namesText(previousValues)}”调整为“${namesText(nextValues)}”`,
        link: `/leads/${id}`,
        relatedTo: { type: 'lead', id, name: lead?.name || '客户' },
        channels: ['station', 'wechat'],
      });

      // A personnel edit is also a direct assignment for every newly added owner.
      // Keep this as a distinct event so the assignee always receives an actionable reminder.
      if (newlyAssignedNames.length > 0) {
        const assignedUserIds = await resolveUserIdsByNames(newlyAssignedNames);
        await createNotificationEventSafely({
          operationId: stableOperationId('lead-assigned-from-detail', id, field, updatedAt),
          eventType: 'LEAD_ASSIGNED',
          actorUserId: myId,
          recipientUserIds: assignedUserIds,
          category: 'lead',
          title: '客户已分配给你',
          content: `${myName}将客户“${lead?.name || '客户'}”分配给：${namesText(newlyAssignedNames)}`,
          link: `/leads/${id}`,
          relatedTo: { type: 'lead', id, name: lead?.name || '客户' },
          channels: ['station', 'wechat'],
        });
        await notifyLeadAssignment({
          lead: { ...lead, [field]: nextValues },
          actorUserId: myId,
          actorName: myName,
          field,
          previous: previousValues,
          next: nextValues,
          operationSuffix: updatedAt,
        });
      }
    } catch (e) {
      console.error(e);
      await showAlert('人员分配保存失败，请重试');
      await fetchData(true);
    }
  };

  const confirmSign = async () => {
    if (!signForm.signer || !signForm.signDate) { 
      await showAlert('请填写签单人和签单日期'); 
      return; 
    }
    if (!id) return;
    await leadsAPI.update(id, { status: '已签单', signer: signForm.signer, signDate: signForm.signDate, updatedAt: new Date().toISOString() });
    await followUpsAPI.add({
      _id: generateId(), leadId: id, content: `恭喜开单！签单人：${signForm.signer}，签单日期：${signForm.signDate}`,
      method: '系统记录', createdBy: myName, createdAt: new Date().toISOString(),
      displayTime: formatDateTime(new Date().toISOString()), editedAt: '', editedBy: '',
    });
    void createNotificationEventSafely({
      operationId: stableOperationId('lead-signed', id, signForm.signDate),
      eventType: 'LEAD_SIGNED',
      actorUserId: myId,
      recipientRoles: ['admin', 'finance', 'operations', 'sales', 'designer', 'manager', 'employee'],
      category: 'lead',
      title: '客户签单',
      content: `恭喜签单：${lead?.name || '客户'}，签单人${signForm.signer}`,
      link: `/leads/${id}`,
      relatedTo: { type: 'lead', id, name: lead?.name || '客户' },
      channels: ['station', 'wechat'],
    });
    setShowSignModal(false);
    setShowCelebration(true);
    setTimeout(() => {
      setShowCelebration(false);
      fetchData(true);
    }, 2500);
  };

  const confirmLost = async () => {
    const reason = lostReasonCustom || lostReason;
    if (!reason) { 
      await showAlert('请填写流失原因'); 
      return; 
    }
    if (!id) return;
    await leadsAPI.update(id, { status: '已流失', lostReason: reason, updatedAt: new Date().toISOString() });
    await followUpsAPI.add({
      _id: generateId(), leadId: id, content: `客户已流失，原因：${reason}`,
      method: '系统记录', createdBy: myName, createdAt: new Date().toISOString(),
      displayTime: formatDateTime(new Date().toISOString()), editedAt: '', editedBy: '',
    });
    setShowLostModal(false);
    fetchData(true);
  };

  const handleCreateProject = async () => {
    if (!id || !lead) return;
    if (lead.status !== '已签单') {
      await showAlert('仅已签单客户可创建工地');
      return;
    }
    setProjectForm({
        customer: lead.name || '',
        phone: lead.phone || '',
        address: lead.address || '',
        manager: toPersonArray(lead.manager)[0] || '',
        designer: '',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: '',
        remark: '',
      });
    setShowProjectModal(true);
  };

  const saveProject = async () => {
    if (!id || !lead) return;
    if (!projectForm.manager) { 
      await showAlert('请选择工程'); 
      return; 
    }
    if (!projectForm.startDate) { 
      await showAlert('请选择开工日期'); 
      return; 
    }
    const pf = projectForm;

    // 从云端模板库拉取最新模板
    let templateNodes: any[] = [];
    try {
      const doc = await systemConfigsAPI.doc('default_project_template').get();
      // 提取模板节点数据（兼容多种数据格式）
      let tplData: any = null;
      if (doc?.data && !Array.isArray(doc.data) && Array.isArray(doc.data.nodesData) && doc.data.nodesData.length > 0) {
        tplData = doc.data.nodesData;
      } else if (doc?.data && Array.isArray(doc.data) && Array.isArray(doc.data[0]?.nodesData) && doc.data[0].nodesData.length > 0) {
        tplData = doc.data[0].nodesData;
      } else if (Array.isArray(doc?.nodesData) && doc.nodesData.length > 0) {
        tplData = doc.nodesData;
      } else if (Array.isArray(doc) && Array.isArray(doc[0]?.nodesData) && doc[0].nodesData.length > 0) {
        tplData = doc[0].nodesData;
      }
      if (tplData) {
        templateNodes = tplData.map((stage: any, stageIdx: number) => ({
          _id: generateId() + stageIdx,
          name: stage.name,
          collapsed: false,
          craftsmanship: stage.craftsmanship || [],
          sections: (stage.sections || []).map((sec: any, secIdx: number) => ({
            _id: generateId() + secIdx,
            name: sec.name || '',
            collapsed: false,
            subNodes: (sec.subNodes || []).map((n: any, idx: number) => ({
              _id: generateId() + idx,
              name: n.name,
              type: n.type || '普通工序',
              requirePhoto: n.requirePhoto !== false,
              requireSign: n.requireSign || false,
              fields: n.fields || [],
              standard: n.standard || '',
              standardPublic: n.standardPublic !== false,
              checklist: n.checklist || [],
              order: idx,
              status: 'not_started',
              acceptanceRecord: {
                photos: [],
                remark: '',
                formData: {},
                checklist: [],
              }
            }))
          }))
        }));
      }
    } catch (e) {
      console.error('拉取施工模板失败:', e);
    }

    // 构建进度摘要
    const progressSummary = buildProjectProgressSummary(templateNodes);

    const newProject = {
      _id: generateId(), leadId: id, 
      customer: pf.customer || lead.name || '', 
      phone: pf.phone || lead.phone || '',
      address: pf.address || lead.address || '', 
      sales: lead.sales, designer: lead.designer || '',
      manager: pf.manager, area: lead.area, budget: lead.budget,
      requirementType: lead.requirementType, status: '施工中',
      startDate: pf.startDate, endDate: '', remark: '',
      creatorName: myName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      nodesData: templateNodes,
      nodes: templateNodes,
      progressSummary,
    };
    try {
      const savedProjectId = await projectsAPI.add(newProject);
      const savedProject = { ...newProject, _id: savedProjectId };
      const nextManagers = toPersonArray(pf.manager);
      if (nextManagers.length > 0) {
        const updatedAt = new Date().toISOString();
        await leadsAPI.update(id, { manager: nextManagers, updatedAt });
        setLead((prev: any) => prev ? { ...prev, manager: nextManagers, updatedAt } : prev);
      }
      setHasProject(true);
      setProjectInfo(savedProject);
      setActiveTab('project');
      setShowProjectModal(false);
      fetchData(true);
    } catch (e: any) {
      console.error('创建工地失败', e);
      await showAlert('创建工地失败：' + (e?.message || e?.toString?.() || '未知错误，请重试'));
    }
  };

  const addDesignNode = async () => {
    const name = newNodeName.trim();
    if (!name || !id) return;
    const newNode = { id: Date.now(), name, isCustom: true, startDate: '', endDate: '', status: 'pending', actualStartDate: '', actualEndDate: '', delayReason: '' };
    const currentNodes = lead?.designNodes || [];
    await persistDesignNodes([...currentNodes, newNode]);
    setShowAddNodeModal(false); setNewNodeName('');
  };

  
  const updateDesignNode = async (nodeId: number, updates: any) => {
    setNodeLoading(prev => ({ ...prev, [nodeId]: true }));
    try {
      const currentNodes = lead?.designNodes || [];
      const currentNode = currentNodes.find((node: any) => node.id === nodeId);
      const newNodes = currentNodes.map((n: any) => n.id === nodeId ? { ...n, ...updates } : n);
      await persistDesignNodes(newNodes);
      if (updates.status === 'current' || updates.status === 'completed') {
        const stateText = updates.status === 'current' ? '开始' : '完成';
        const version = updates.actualStartDate || updates.actualEndDate || new Date().toISOString();
        void createNotificationEventSafely({
          operationId: stableOperationId('design-node-status', id, nodeId, updates.status, version),
          eventType: updates.status === 'current' ? 'DESIGN_NODE_STARTED' : 'DESIGN_NODE_COMPLETED',
          actorUserId: myId,
          recipientRoles: ['admin'],
          category: 'lead',
          title: `设计节点已${stateText}`,
          content: `${myName}${stateText}了客户“${lead?.name || '客户'}”的设计节点“${currentNode?.name || '设计节点'}”`,
          link: `/leads/${id}/design`,
          relatedTo: { type: 'lead', id: id || '', name: lead?.name || '客户' },
          channels: ['station', 'wechat'],
        });
      }
    } finally {
      setNodeLoading(prev => ({ ...prev, [nodeId]: false }));
    }
  };

  const handleDeleteDesignNode = async (nodeId: number) => {
    const confirmed = await showConfirm('确定删除该节点吗？', { confirmStyle: 'danger' });
    if (!confirmed) return;
    const newNodes = (lead?.designNodes || []).filter((n: any) => n.id !== nodeId);
    await persistDesignNodes(newNodes);
  };

  const moveDesignNode = async (nodeId: number, direction: 'up' | 'down') => {
    const currentNodes = [...(lead?.designNodes || [])];
    const index = currentNodes.findIndex((node: any) => node.id === nodeId);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentNodes.length) return;
    const [moved] = currentNodes.splice(index, 1);
    currentNodes.splice(targetIndex, 0, moved);
    await persistDesignNodes(currentNodes);
  };

  const handleCloseDesignSetup = async () => {
    // 点击完成按钮时直接关闭（数据已实时保存）
    setShowDesignSetup(false);
    setCustomDesignNodeName('');
    setDesignSetupMode('create');
  };

  const handleCloseDesignSetupWithConfirm = async () => {
    const confirmed = await showConfirm('确定要退出节点管理吗？');
    if (confirmed) {
      setShowDesignSetup(false);
      setCustomDesignNodeName('');
      setDesignSetupMode('create');
    }
  };

  
  
  const syncDesignNodeFilesByFileId = (nodes: any[] = [], fileID: string, patch: Record<string, unknown>) => {
    return nodes.map((node: any) => ({
      ...node,
      files: (node.files || []).map((file: any) =>
        file.fileID === fileID ? { ...file, ...patch } : file
      ),
    }));
  };

  const syncDesignNodeFilesByFolder = (nodes: any[] = [], oldFolderName: string, newFolderName: string) => {
    return nodes.map((node: any) => ({
      ...node,
      files: (node.files || []).map((file: any) =>
        file.folderName === oldFolderName ? { ...file, folderName: newFolderName } : file
      ),
    }));
  };

  const handleNodeFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const targetNodeId = nodeFileTargetRef.current ?? nodeFileTarget;
    if (!files.length || targetNodeId === null || !id) return;

    e.target.value = '';
    const targetNode = (lead?.designNodes || []).find((node: any) => node.id === targetNodeId);
    const folders = lead?.fileFolders || defaultFolders;
    const preferredFolder = targetNode?.name || folders[0] || defaultFolders[0];
    setNodeUploadConfig({
      syncToProject: true,
      folder: preferredFolder,
      visibility: 'internal',
    });
    setNodeUploadModal({ isOpen: true, files, targetNodeId });
  };

  const closeNodeUploadModal = () => {
    if (nodeUploadModal.targetNodeId !== null && nodeFileLoading[nodeUploadModal.targetNodeId]) return;
    setNodeUploadModal({ isOpen: false, files: [], targetNodeId: null });
    setNodeFileTarget(null);
    nodeFileTargetRef.current = null;
  };

  const confirmNodeUpload = async () => {
    const files = nodeUploadModal.files;
    const targetNodeId = nodeUploadModal.targetNodeId;
    if (!files.length || targetNodeId === null || !id) return;

    const freshData = await leadsAPI.doc(id).get();
    const freshLead = Array.isArray(freshData) ? freshData[0] : freshData;
    const targetNode = (freshLead?.designNodes || []).find((n: any) => n.id === targetNodeId);
    const folders = [...(freshLead?.fileFolders || defaultFolders)];
    let targetFolder = nodeUploadConfig.folder || targetNode?.name || folders[0] || defaultFolders[0];
    if (targetFolder === '__new__') targetFolder = targetNode?.name || defaultFolders[0];
    if (nodeUploadConfig.syncToProject && !folders.includes(targetFolder)) {
      folders.push(targetFolder);
      await leadsAPI.update(id, { fileFolders: folders, updatedAt: new Date().toISOString() });
    }

    const syncToProject = nodeUploadConfig.syncToProject;
    const visibility = nodeUploadConfig.visibility;
    const leadId = id;
    const uploadBatchId = generateId();
    const nodeName = targetNode?.name || '设计节点';

    addUploadTasks(files.map(file => ({
      file,
      fileName: file.name,
      fileSize: file.size,
      folder: `design_files/${leadId}`,
      title: `设计进度 / ${nodeName}`,
      context: { scope: 'lead-design-node', leadId, nodeId: targetNodeId, visibility },
      onSuccess: async ({ fileID, task }) => {
        const poster = uploadPosterFromTask(task);
        const uploaded = {
          fileID,
          name: file.name,
          size: file.size,
          sizeStr: formatSize(file.size),
          type: getFileType(file.name),
          uploader: myName,
          uploadTime: new Date().toISOString(),
          folderName: targetFolder,
          isVisible: visibility === 'public',
          ...(poster ? { poster, thumbUrl: poster } : {}),
        };
        const latestData = await leadsAPI.doc(leadId).get();
        const latestLead = Array.isArray(latestData) ? latestData[0] : latestData;
        const currentNodes = latestLead?.designNodes || [];
        const newNodes = currentNodes.map((n: any) =>
          n.id === targetNodeId ? { ...n, files: [...(n.files || []), uploaded] } : n
        );
        const updates: any = { designNodes: newNodes, updatedAt: new Date().toISOString() };
        if (syncToProject) {
          updates.files = [...(latestLead?.files || []), uploaded];
          updates.fileFolders = folders;
        }
        await leadsAPI.update(leadId, updates);
        void createNotificationEventSafely({
          operationId: stableOperationId('design-node-files-uploaded', leadId, targetNodeId, uploadBatchId),
          eventType: 'DESIGN_NODE_FILES_UPLOADED',
          actorUserId: myId,
          recipientRoles: ['admin'],
          category: 'lead',
          title: '设计节点上传资料',
          content: `${myName}为客户“${latestLead?.name || lead?.name || '客户'}”的设计节点上传了${files.length}个文件`,
          link: `/leads/${leadId}/design`,
          relatedTo: { type: 'lead', id: leadId, name: latestLead?.name || lead?.name || '客户' },
          channels: ['station', 'wechat'],
        });
        fetchData(true);
      },
    })));

    setNodeUploadModal({ isOpen: false, files: [], targetNodeId: null });
    setNodeFileTarget(null);
    nodeFileTargetRef.current = null;
  };

  const deleteNodeFile = async (nodeId: number, fileIdx: number) => {
    if (!id || !lead) return;
    
    const currentNodes = lead?.designNodes || [];
    const node = currentNodes.find((n: any) => n.id === nodeId);
    if (!node || !node.files || !node.files[fileIdx]) return;
    
    const targetFile = node.files[fileIdx];
    
    // Check if file is in project files
    const freshData = await leadsAPI.doc(id).get();
    const freshLead = Array.isArray(freshData) ? freshData[0] : freshData;
    const currentProjectFiles = freshLead?.files || [];
    const isInProjectFiles = currentProjectFiles.some((f: any) => f.fileID === targetFile.fileID);
    
    let confirmMsg = '确定从该设计节点中删除此文件吗？';
    if (isInProjectFiles) {
      confirmMsg = '该文件同时同步到了【项目资料】。是否一并从项目资料中删除？\n\n点击“确定”两边同时删除，点击“取消”放弃操作。';
    }
    
    const confirmed = await showConfirm(confirmMsg, { confirmStyle: 'danger' });
    if (!confirmed) return;
    
    const newFiles = (node.files || []).filter((_: any, i: number) => i !== fileIdx);
    const newNodes = currentNodes.map((n: any) => n.id === nodeId ? { ...n, files: newFiles } : n);
    
    const updates: any = { designNodes: newNodes, updatedAt: new Date().toISOString() };
    
    if (isInProjectFiles) {
      updates.files = currentProjectFiles.filter((f: any) => f.fileID !== targetFile.fileID);
    }
    
    await leadsAPI.update(id, updates);
    fetchData(true);
  };

  const toggleDesignNodeFileVisibility = async (nodeId: number, fileIdx: number) => {
    if (!id || !lead) return;

    const freshData = await leadsAPI.doc(id).get();
    const freshLead = Array.isArray(freshData) ? freshData[0] : freshData;
    const currentNodes = freshLead?.designNodes || [];
    const node = currentNodes.find((n: any) => n.id === nodeId);
    const targetFile = node?.files?.[fileIdx];
    if (!targetFile) return;

    const nextVisible = targetFile.isVisible === false;
    const newNodes = currentNodes.map((n: any) =>
      n.id === nodeId ? {
        ...n,
        files: (n.files || []).map((file: any, index: number) =>
          index === fileIdx ? { ...file, isVisible: nextVisible } : file
        ),
      } : n
    );
    const newProjectFiles = (freshLead?.files || []).map((file: any) =>
      file.fileID === targetFile.fileID ? { ...file, isVisible: nextVisible } : file
    );

    await leadsAPI.update(id, {
      designNodes: newNodes,
      files: newProjectFiles,
      updatedAt: new Date().toISOString(),
    });
    fetchData(true);
  };

  const openNewMaterial = () => {
    setMaterialForm({ ...INIT_MATERIAL }); setEditMaterialIndex(-1); setCustomRegion('');
    setIsCustomRegionMode(false);
    setMatLocalImages([]); setMatExistingImages([]);
    setShowMaterialModal(true);
  };

  const openEditMaterial = (item: any) => {
    const materials = lead.materialList || [];
    const idx = materials.findIndex((m: any) => m.id === item.id);
    if (idx === -1) return;
    setMaterialForm({ ...item });
    setEditMaterialIndex(idx);
    const regionOpts = REGION_OPTIONS[item.category] || [];
    const isCustom = item.region && !regionOpts.includes(item.region);
    setCustomRegion(isCustom ? item.region : '');
    setIsCustomRegionMode(isCustom);
    setMatExistingImages(item.images || []);
    setMatLocalImages([]);
    setShowMaterialModal(true);
  };

  const handleMatImgSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newLocal = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setMatLocalImages(prev => [...prev, ...newLocal]);
    e.target.value = '';
  };

  const removeMatLocalImage = (idx: number) => {
    const img = matLocalImages[idx];
    if (img) URL.revokeObjectURL(img.preview);
    setMatLocalImages(prev => prev.filter((_, i) => i !== idx));
  };

  const removeMatExistingImage = (idx: number) => {
    setMatExistingImages(prev => prev.filter((_, i) => i !== idx));
  };

  const saveMaterial = async () => {
    if (!id || !lead) return;
    const form = { ...materialForm };
    if (customRegion) form.region = customRegion;
    if (form.category !== '其他' && !form.region?.trim()) { 
      await showAlert('请填写区域'); 
      return; 
    }
    if ((form.category === '集成吊顶/电器' || form.category === '其他') && !form.name?.trim()) { 
      await showAlert('请输入名称'); 
      return; 
    }

    setMatImageLoading(true);
    const uploadedIds: string[] = [];
    for (const img of matLocalImages) {
      try {
        const result = await uploadToCloud(img.file, `materials/${id}`);
        uploadedIds.push(result.fileID);
      } catch (e) { console.error('Image upload failed:', e); }
    }
    form.images = [...matExistingImages, ...uploadedIds];
    setMatImageLoading(false);

    const materials = [...(lead.materialList || [])];
    if (editMaterialIndex === -1) {
      materials.push({ ...form, id: Date.now().toString() });
    } else {
      materials[editMaterialIndex] = { ...form, id: materials[editMaterialIndex].id };
    }
    await leadsAPI.update(id, { materialList: materials, updatedAt: new Date().toISOString() });
    matLocalImages.forEach(img => URL.revokeObjectURL(img.preview));
    setShowMaterialModal(false); setMatLocalImages([]); setMatExistingImages([]);
    setMaterialForm({ ...INIT_MATERIAL }); setEditMaterialIndex(-1); setCustomRegion('');
    fetchData(true);
  };

  const deleteMaterial = async (matId: string) => {
    if (!id || !lead) return;
    const confirmed = await showConfirm('确定删除该材料记录吗？', { confirmStyle: 'danger' });
    if (!confirmed) return;
    const materials = (lead.materialList || []).filter((m: any) => m.id !== matId);
    await leadsAPI.update(id, { materialList: materials, updatedAt: new Date().toISOString() });
    fetchData(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPendingFiles(files); setUploadFolder(selectedFolder); setUploadVisibility('internal'); setShowUploadModal(true);
    e.target.value = '';
  };

  const confirmUpload = async () => {
    if (!id || !lead || !pendingFiles.length) return;
    const folders = [...(lead.fileFolders || defaultFolders)];
    let targetFolder = uploadFolder;
    if (targetFolder === '__new__') targetFolder = defaultFolders[0] || '默认文件夹';
    if (!folders.includes(targetFolder)) {
      folders.push(targetFolder);
      await leadsAPI.update(id, { fileFolders: folders, updatedAt: new Date().toISOString() });
    }

    const leadId = id;
    const uploadBatchId = generateId();
    const visibility = uploadVisibility;
    addUploadTasks(pendingFiles.map(file => ({
      file,
      fileName: file.name,
      fileSize: file.size,
      folder: `project_files/${leadId}`,
      title: `项目资料 / ${targetFolder}`,
      context: { scope: 'lead-project-files', leadId, folder: targetFolder },
      onSuccess: async ({ fileID, task }) => {
        const poster = uploadPosterFromTask(task);
        const uploaded = {
          fileID,
          name: file.name,
          size: file.size,
          sizeStr: formatSize(file.size),
          type: getFileType(file.name),
          uploader: myName,
          uploadTime: new Date().toISOString(),
          folderName: targetFolder,
          isVisible: visibility === 'public',
          ...(poster ? { poster, thumbUrl: poster } : {}),
        };
        const freshData = await leadsAPI.doc(leadId).get();
        const freshLead = Array.isArray(freshData) ? freshData[0] : freshData;
        await leadsAPI.update(leadId, {
          files: [...(freshLead?.files || []), uploaded],
          fileFolders: folders,
          updatedAt: new Date().toISOString(),
        });
        await followUpsAPI.add({
          _id: generateId(),
          leadId,
          content: `向项目资料文件夹"${targetFolder}"上传了文件：${file.name}`,
          method: '系统记录',
          createdBy: myName,
          createdAt: new Date().toISOString(),
          displayTime: formatDateTime(new Date().toISOString()),
          editedAt: '',
          editedBy: '',
        });
        void createNotificationEventSafely({
          operationId: stableOperationId('project-files-uploaded', leadId, uploadBatchId),
          eventType: 'PROJECT_FILES_UPLOADED',
          actorUserId: myId,
          recipientRoles: ['admin'],
          category: 'lead',
          title: '项目资料上传',
          content: `${myName}为客户“${freshLead?.name || lead?.name || '客户'}”的${targetFolder}上传了${pendingFiles.length}个文件`,
          link: `/leads/${leadId}/files`,
          relatedTo: { type: 'lead', id: leadId, name: freshLead?.name || lead?.name || '客户' },
          channels: ['station', 'wechat'],
        });
        fetchData(true);
      },
    })));

    setShowUploadModal(false);
    setPendingFiles([]);
  };

  const deleteFile = async (fileID: string) => {
    if (!id || !lead) return;
    
    // Check if file is linked to design nodes
    const currentNodes = lead?.designNodes || [];
    let linkedNodeId: number | null = null;
    let linkedNodeName = '';
    
    for (const node of currentNodes) {
      if (node.files?.some((f: any) => f.fileID === fileID)) {
        linkedNodeId = node.id;
        linkedNodeName = node.name;
        break;
      }
    }
    
    let confirmMsg = '确定从项目资料中删除该文件吗？';
    if (linkedNodeId) {
      confirmMsg = `该文件同时关联了设计进度【${linkedNodeName}】节点。是否一并从设计节点中删除？\n\n点击“确定”两边同时删除，点击“取消”放弃操作。`;
    }
    
    const confirmed = await showConfirm(confirmMsg, { confirmStyle: 'danger' });
    if (!confirmed) return;
    
    const freshData = await leadsAPI.doc(id).get();
    const freshLead = Array.isArray(freshData) ? freshData[0] : freshData;
    const currentFiles = freshLead?.files || [];
    const deleted = currentFiles.find((f: any) => f.fileID === fileID);
    
    const updates: any = { 
      files: currentFiles.filter((f: any) => f.fileID !== fileID), 
      updatedAt: new Date().toISOString() 
    };
    
    if (linkedNodeId) {
      updates.designNodes = (freshLead?.designNodes || []).map((n: any) => ({
        ...n,
        files: (n.files || []).filter((f: any) => f.fileID !== fileID),
      }));
    }
    
    await leadsAPI.update(id, updates);

    if (deleted && isContractFolder(deleted.folderName) && contractInfo?.attachments?.length) {
      const nextAttachments = (contractInfo.attachments || []).filter((att: any) => {
        const attachmentFileID = typeof att === 'string' ? att : att.fileID;
        return attachmentFileID !== fileID;
      });
      if (nextAttachments.length !== contractInfo.attachments.length) {
        const nextContract = { ...contractInfo, attachments: nextAttachments };
        await contractsAPI.put(nextContract);
        setContractInfo(nextContract);
      }
    }
    
    if (deleted) {
      await followUpsAPI.add({
        _id: generateId(), leadId: id, content: `从项目资料中移除了文件：${deleted.name}`,
        method: '系统记录', createdBy: myName, createdAt: new Date().toISOString(),
        displayTime: formatDateTime(new Date().toISOString()), editedAt: '', editedBy: '',
      });
    }
    fetchData(true);
  };

  const toggleFileVisibility = async (fileID: string) => {
    if (!id || !lead) return;
    const freshData = await leadsAPI.doc(id).get();
    const freshLead = Array.isArray(freshData) ? freshData[0] : freshData;
    const targetFile = (freshLead?.files || []).find((f: any) => f.fileID === fileID);
    const nextVisible = targetFile?.isVisible === false;
    const newFiles = (freshLead?.files || []).map((f: any) =>
      f.fileID === fileID ? { ...f, isVisible: nextVisible } : f
    );
    const newDesignNodes = syncDesignNodeFilesByFileId(freshLead?.designNodes || [], fileID, { isVisible: nextVisible });
    await leadsAPI.update(id, { files: newFiles, designNodes: newDesignNodes, updatedAt: new Date().toISOString() });
    fetchData(true);
  };

  const confirmMoveFile = async () => {
    if (!id || !lead || !moveFileId || !moveTargetFolder) return;
    const folders = [...(lead.fileFolders || defaultFolders)];
    if (!folders.includes(moveTargetFolder)) folders.push(moveTargetFolder);
    const freshData = await leadsAPI.doc(id).get();
    const freshLead = Array.isArray(freshData) ? freshData[0] : freshData;
    const newFiles = (freshLead?.files || []).map((f: any) =>
      f.fileID === moveFileId ? { ...f, folderName: moveTargetFolder } : f
    );
    const newDesignNodes = syncDesignNodeFilesByFileId(freshLead?.designNodes || [], moveFileId, { folderName: moveTargetFolder });
    await leadsAPI.update(id, { files: newFiles, designNodes: newDesignNodes, fileFolders: folders, updatedAt: new Date().toISOString() });
    setShowMoveFileModal(false); setMoveFileId(''); setMoveTargetFolder('');
    fetchData(true);
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !id || !lead) return;
    const folders = lead.fileFolders || defaultFolders;
    if (folders.includes(name)) { 
      await showAlert('文件夹名称已存在'); 
      return; 
    }
    await leadsAPI.update(id, { fileFolders: [...folders, name], updatedAt: new Date().toISOString() });
    setShowNewFolderModal(false); setNewFolderName('');
    fetchData(true);
  };

  const confirmRenameFolder = async () => {
    const newName = renameFolderNew.trim();
    if (!newName || !id || !lead) return;
    const folders = lead.fileFolders || defaultFolders;
    if (newName === renameFolderOld) { setShowRenameFolderModal(false); return; }
    if (folders.includes(newName)) { 
      await showAlert('文件夹名称已存在'); 
      return; 
    }
    const freshData = await leadsAPI.doc(id).get();
    const freshLead = Array.isArray(freshData) ? freshData[0] : freshData;
    const updatedFolders = folders.map((f: string) => f === renameFolderOld ? newName : f);
    const updatedFiles = (freshLead?.files || []).map((f: any) =>
      f.folderName === renameFolderOld ? { ...f, folderName: newName } : f
    );
    const updatedDesignNodes = syncDesignNodeFilesByFolder(freshLead?.designNodes || [], renameFolderOld, newName);
    await leadsAPI.update(id, { fileFolders: updatedFolders, files: updatedFiles, designNodes: updatedDesignNodes, updatedAt: new Date().toISOString() });
    if (selectedFolder === renameFolderOld) setSelectedFolder(newName);
    setShowRenameFolderModal(false);
    fetchData(true);
  };

  const deleteFolder = async (folderName: string) => {
    if (!id || !lead) return;
    const filesInF = (lead.files || []).filter((f: any) => f.folderName === folderName);
    if (filesInF.length) { 
      await showAlert('该文件夹内还有文件，请先清空或移动文件'); 
      return; 
    }
    const confirmed = await showConfirm(`确定删除文件夹"${folderName}"吗？`, { confirmStyle: 'danger' });
    if (!confirmed) return;
    const folders = (lead.fileFolders || defaultFolders).filter((f: string) => f !== folderName);
    await leadsAPI.update(id, { fileFolders: folders.length > 0 ? folders : ['默认文件夹'], updatedAt: new Date().toISOString() });
    if (selectedFolder === folderName) setSelectedFolder('默认文件夹');
    fetchData(true);
  };

  const downloadFile = async (fileID: string, fileName: string) => {
    try {
      await cloudDownloadFile(fileID, fileName);
    } catch (e: any) {
      console.error(e);
      await showAlert(`下载失败：${e?.message || '请检查云存储跨域或文件权限设置'}`);
    }
  };

  const openManagedFile = async (file: any) => {
    await openAttachment({
      fileID: file.fileID || file.url,
      name: file.name || 'download',
      type: file.type || getFileType(file.name || ''),
      size: file.size,
      sizeStr: file.sizeStr,
      uploader: file.uploader,
      uploadTime: file.uploadTime,
    });
  };

  const downloadManagedFile = async (file: any) => {
    await downloadAttachment({
      fileID: file.fileID || file.url,
      name: file.name || 'download',
      type: file.type || getFileType(file.name || ''),
      size: file.size,
      sizeStr: file.sizeStr,
      uploader: file.uploader,
      uploadTime: file.uploadTime,
    });
  };

  const openImagePreview = (urls: string[], currentIndex = 0) => {
    const validUrls = urls.filter(Boolean);
    if (validUrls.length === 0) return;
    const safeIndex = Math.max(0, Math.min(currentIndex, validUrls.length - 1));

    setPreviewImageList(validUrls);
    setPreviewImageIndex(safeIndex);
    setPreviewUrl(validUrls[safeIndex]);
  };

  const previewFile = async (fileID: string, type: string, fileName?: string) => {
    if (type !== 'image') {
      downloadFile(fileID, fileName || 'download');
      return;
    }
    const url = fileImgUrls[fileID];
    if (url) { openImagePreview([url]); return; }
    try {
      const urlMap = await getTempFileURL([fileID]);
      const fetched = urlMap[fileID];
      if (fetched) {
        setFileImgUrls(prev => ({ ...prev, [fileID]: fetched }));
        openImagePreview([fetched]);
      }
    } catch (e) { console.error(e); }
  };

  const statusOptions = [
    { value: '跟进中', label: '跟进中' },
    { value: '已签单', label: '已签单' },
    { value: '已流失', label: '已流失' },
  ];
  const signerOptions = employees.map(e => {
    const primaryRole = (e.roles && e.roles.length > 0) ? getHighestRole(e.roles) : e.role;
    return { value: e.name, label: e.name, group: ROLE_DEPT[primaryRole] || '普通' };
  });
  const signerGroups = [...new Set(employees.map(e => {
    const primaryRole = (e.roles && e.roles.length > 0) ? getHighestRole(e.roles) : e.role;
    return ROLE_DEPT[primaryRole] || '普通';
  }))].map(d => ({ key: d, label: d }));
  const salesOptions = employees.filter(e => hasRole(e.roles, 'sales', e.role)).map(e => ({ value: e.name, label: e.name, group: '销售部' }));
  const designerOptions = employees.filter(e => hasRole(e.roles, 'designer', e.role)).map(e => ({ value: e.name, label: e.name, group: '设计部' }));
  const managerOptions = employees.filter(e => hasRole(e.roles, 'manager', e.role)).map(e => ({ value: e.name, label: e.name, group: '工程部' }));
  const salesGroups = [{ key: '销售部', label: '销售部' }];
  const designerGroups = [{ key: '设计部', label: '设计部' }];
  const managerGroups = [{ key: '工程部', label: '工程部' }];

  const materials = lead?.materialList || [];
  const groupedMaterials = MATERIAL_CATEGORIES.map(cat => ({
    category: cat,
    items: materials.filter((m: any) => m.category === cat),
  }));
  const orphanMaterials = materials.filter((m: any) => !MATERIAL_CATEGORIES.includes(m.category));
  if (orphanMaterials.length) {
    const g = groupedMaterials.find(g => g.category === '其他');
    if (g) g.items.push(...orphanMaterials);
  }
  const shareableMaterialCategories = groupedMaterials
    .filter(group => group.items.length > 0)
    .map(group => group.category);

  const openShareCategoryModal = async () => {
    if (shareableMaterialCategories.length === 0) {
      alert('请先添加主材后再分享。');
      return;
    }
    setSelectedShareCategories(shareableMaterialCategories);
    setShowShareCategoryModal(true);
  };

  const toggleShareCategory = (category: string) => {
    setSelectedShareCategories(prev => (
      prev.includes(category)
        ? prev.filter(item => item !== category)
        : [...prev, category]
    ));
  };

  const handleShareMaterials = async () => {
    if (selectedShareCategories.length === 0) {
      alert('请至少选择一个主材大项。');
      return;
    }

    const now = formatDateTime(new Date().toISOString());
    const nextStates = { ...(lead.materialCategoryStates || {}) };
    selectedShareCategories.forEach(category => {
      nextStates[category] = {
        status: '待确认',
        sentAt: now,
        confirmedAt: '',
        snapshot: materials.filter((item: any) => item.category === category),
      };
    });

    await leadsAPI.update(id, {
      materialCategoryStates: nextStates,
      updatedAt: new Date().toISOString(),
    });
    setLead((prev: any) => prev ? { ...prev, materialCategoryStates: nextStates } : prev);

    await openCustomerShare({
      id: String(projectInfo._id || projectInfo.id),
      title: '您有一份【主材清单】待确认',
      desc: `${lead.name || '客户'}的主材清单，客户打开后需通过手机号或申请审核查看。`,
      tab: 'materials',
      categories: selectedShareCategories.join(','),
    });
    setShowShareCategoryModal(false);
  };

  const visibleUploadStatuses = ['queued', 'uploading', 'error'];
  const projectFileUploadTasks = uploadTasks.filter(task =>
    task.context?.scope === 'lead-project-files' &&
    task.context?.leadId === id &&
    visibleUploadStatuses.includes(task.status)
  );
  const folders = Array.from(new Set([
    ...(lead?.fileFolders || defaultFolders),
    ...projectFileUploadTasks.map(task => String(task.context?.folder || '默认文件夹')),
  ]));
  const allFiles = [...(lead?.files || [])];
  projectFileUploadTasks.forEach(task => {
    allFiles.push({
      fileID: `uploading:${task.id}`,
      name: task.fileName,
      size: task.fileSize,
      sizeStr: formatSize(task.fileSize),
      type: getFileType(task.fileName),
      folderName: task.context?.folder || '默认文件夹',
      uploadTime: new Date(task.createdAt).toISOString(),
      uploader: myName,
      isUploading: true,
      uploadStatus: task.status,
      uploadProgress: task.progress,
      uploadTaskId: task.id,
      uploadError: task.error,
      previewUrl: task.previewUrl,
    });
  });
  
  if (contractInfo?.attachments) {
    contractInfo.attachments.forEach((att: any, idx: number) => {
      const attachmentFileID = typeof att === 'string' ? att : att.fileID;
      if (allFiles.some((file: any) => file.fileID === attachmentFileID)) return;
      allFiles.push({
        fileID: attachmentFileID,
        name: typeof att === 'string' ? `合同附件_${idx+1}` : att.name,
        size: typeof att === 'string' ? 0 : att.size || 0,
        folderName: '合同资料',
        uploadTime: typeof att === 'string' ? contractInfo.createdAt : att.uploadTime || contractInfo.createdAt,
        uploader: typeof att === 'string' ? '' : att.uploader || '',
        isReadOnly: true,
        source: 'contract'
      });
    });
  }
  
  const filesInFolder = allFiles.filter((f: any) => f.folderName === selectedFolder);

  const statusColorMap: Record<string, string> = { '跟进中': 'bg-blue-50 text-blue-600', '已签单': 'bg-emerald-50 text-emerald-600', '已流失': 'bg-gray-100 text-gray-500' };
  const ratingColorMap: Record<string, string> = { 'A': 'bg-amber-50 text-amber-600', 'B': 'bg-orange-50 text-orange-600', 'C': 'bg-gray-100 text-gray-600', 'D': 'bg-gray-50 text-gray-400' };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!lead) return <div className="p-10 text-center text-gray-400">客户不存在</div>;

  const getMaterialColumns = (cat: string): { key: string; label: string; primary: boolean; wide?: boolean }[] => {
    switch (cat) {
      case '瓷砖/木地板': return [
        { key: 'region', label: '区域', primary: true }, { key: 'brand', label: '品牌', primary: false },
        { key: 'model', label: '型号', primary: false }, { key: 'spec', label: '规格', primary: false },
        { key: 'quantity', label: '数量', primary: false },
      ];
      case '木门/金属门': return [
        { key: 'region', label: '区域', primary: true }, { key: 'brand', label: '品牌', primary: false },
        { key: 'frameColor', label: '边框', primary: false }, { key: 'coreColor', label: '门芯', primary: false },
        { key: 'doorModel', label: '门型', primary: false },
      ];
      case '壁布/乳胶漆/护墙板': return [
        { key: 'region', label: '区域', primary: true }, { key: 'itemCategory', label: '类别', primary: false },
        { key: 'brand', label: '品牌', primary: false }, { key: 'model', label: '型号', primary: false },
        { key: 'quantity', label: '数量', primary: false },
      ];
      case '集成吊顶/电器': return [
        { key: 'region', label: '区域', primary: true }, { key: 'name', label: '名称', primary: true },
        { key: 'spec', label: '规格', primary: false }, { key: 'quantity', label: '数量', primary: false },
      ];
      case '全屋定制衣柜': return [
        { key: 'region', label: '区域', primary: true }, { key: 'brand', label: '品牌', primary: false },
        { key: 'cabinetBody', label: '柜体', primary: false }, { key: 'cabinetDoor', label: '柜门', primary: false },
        { key: 'handle', label: '拉手', primary: false },
      ];
      case '全屋定制橱柜': return [
        { key: 'region', label: '区域', primary: true }, { key: 'brand', label: '品牌', primary: false },
        { key: 'cabinetBody', label: '柜体', primary: false }, { key: 'cabinetDoor', label: '柜门', primary: false },
        { key: 'handle', label: '拉手', primary: false },
      ];
      case '其他': return [{ key: 'name', label: '名称', primary: true }];
      default: return [{ key: 'region', label: '区域', primary: true }, { key: 'brand', label: '品牌', primary: false }];
    }
  };

  const getCellValue = (item: any, key: string): string => {
    const map: Record<string, string | undefined> = {
      region: item.region, brand: item.brand, model: item.model, spec: item.spec,
      quantity: item.quantity, frameColor: item.frameColor, coreColor: item.coreColor,
      doorModel: item.doorModel, itemCategory: item.itemCategory, name: item.name,
      cabinetBody: item.cabinetBody, cabinetDoor: item.cabinetDoor, handle: item.handle,
    };
    return map[key] || '-';
  };

  const sourceText = lead.source === '其他' && lead.sourceCustom ? `其他（${lead.sourceCustom}）` : lead.source;
  const sourceTagText = lead.source === '其他' ? '其他' : sourceText;
  const salesText = toPersonArray(lead.sales).join('、');
  const designerText = toPersonArray(lead.designer).join('、');
  const managerText = toPersonArray(lead.manager).join('、');

  const renderPersonnelAssignCard = (
    label: string,
    field: 'sales' | 'designer' | 'manager',
    names: string | string[] | undefined,
    tone: string,
  ) => {
    const arr = toPersonArray(names);
    const empty = arr.length === 0;
    return (
      <button
        type="button"
        onClick={() => openPersonnelModal(field, label)}
        disabled={!canEdit}
        className={`w-full min-w-0 rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-left transition-colors ${
          canEdit ? 'hover:border-gold-200 hover:bg-gold-50/30 cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="block text-[12px] text-gray-400 font-medium">{label}</span>
        <span className={`mt-1 inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-[12px] font-semibold ${
          empty ? 'bg-amber-50 text-amber-500' : tone
        }`}>
          <span className="truncate">{empty ? `加${label}` : arr.join('、')}</span>
        </span>
      </button>
    );
  };
  const leadSummaryTags = [
    lead.area ? `${lead.area}㎡` : '',
    lead.budget && lead.budget !== '暂无' ? lead.budget : '',
    sourceTagText || '',
  ].filter(Boolean);
  const progressSummary = projectInfo?.progressSummary || {};
  const projectNodeName = progressSummary.currentNodeName || progressSummary.nodeName || projectInfo?.currentNodeName || projectInfo?.currentStage || '';
  const isProjectFinished = ['已完成', '已完工', '已结算'].includes(projectInfo?.status || '');
  const projectDateSummary = hasProject
    ? isProjectFinished
      ? `开工 ${projectInfo?.startDate || '-'} · 完工 ${projectInfo?.endDate || projectInfo?.completedDate || '-'}`
      : `开工 ${projectInfo?.startDate || '-'}`
    : '';
  const mobileInfoRows = [
    { label: '手机号', value: displayPhone },
    { label: '需求类型', value: lead.requirementType },
    { label: '房屋面积', value: lead.area ? `${lead.area}㎡` : '' },
    { label: '装修预算', value: lead.budget && lead.budget !== '暂无' ? lead.budget : '' },
    { label: '客户来源', value: sourceText },
    ...(lead.status === '已签单' ? [
      { label: '签单人', value: lead.signer },
      { label: '签单日期', value: lead.signDate },
    ] : []),
    ...(lead.status === '已流失' && lead.lostReason ? [{ label: '流失原因', value: lead.lostReason }] : []),
  ];

  const tabs: { key: string; label: string; icon: any; hideMobile?: boolean }[] = [
    { key: 'follow', label: '跟进记录', icon: UserCheck },
    ...(currentBizType === '家装' ? [
      { key: 'design', label: '设计进度', icon: Clock },
      { key: 'material', label: '主材清单', icon: Tag },
    ] : []),
    { key: 'quote', label: '报价单', icon: FileText, hideMobile: true },
    { key: 'files', label: currentBizType === '工装' ? '合同资料' : '项目资料', icon: Folder },
  ];

  const jumpToSection = (tab: TabKey) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      document.getElementById('lead-detail-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openContractFlow = async () => {
    if (hasContract && contractInfo) {
      navigate(`/contracts/${contractInfo.id || contractInfo._id}`, { state: { from: returnPath } });
      return;
    }
    // 校验客户状态
    if (lead.status !== '已签单') {
      await showAlert('仅已签单客户可创建合同。请先将客户状态更新为已签单。');
      return;
    }
    const confirmed = await showConfirm('该客户暂无关联合同，是否前往新建合同？');
    if (confirmed) {
      setContractDrawerOpen(true);
    }
  };

  // 刷新关联合同
  const refreshRelatedContract = async () => {
    try {
      let relatedContracts = await contractsAPI.where({ customerId: id }).toArray();
      if (relatedContracts.length === 0 && lead?.name) {
        relatedContracts = (await contractsAPI.where({ customerName: lead.name }).toArray())
          .filter((contract: any) => !lead.phone || contract.customerPhone === lead.phone);
      }
      setHasContract(relatedContracts.length > 0);
      setContractInfo(relatedContracts.length > 0 ? relatedContracts[0] : null);
    } catch (e) {
      console.error('刷新合同信息失败:', e);
    }
  };

  const openProjectFlow = async () => {
    if (hasProject && projectInfo) {
      navigate(`/projects-biz/${projectInfo._id}`, { state: { from: returnPath } });
      return;
    }
    if (lead?.status !== '已签单') {
      await showAlert('仅已签单客户可创建工地');
      return;
    }
    const confirmed = await showConfirm('该客户暂无关联工地，是否立即新建工地？');
    if (confirmed) handleCreateProject();
  };

  const openIncomeFlow = async () => {
    if (hasContract && contractInfo) {
      setShowReceiptModal(true);
      return;
    }
    const confirmed = await showConfirm('新增收款需要先关联合同。是否前往新建合同？');
    if (confirmed) {
      setContractDrawerOpen(true);
    }
  };

  const openReimbursementFlow = async () => {
    if (hasContract && contractInfo) {
      if (canViewFinance) {
        setShowExpenseModal(true);
        return;
      }
      navigate(`/reimbursement?action=create&contractId=${contractInfo.id || contractInfo._id}&from=${encodeURIComponent(location.pathname)}`);
      return;
    }
    const confirmed = await showConfirm('项目报销需要先关联合同。是否前往新建合同？');
    if (confirmed) {
      setContractDrawerOpen(true);
    }
  };

  const openProjectCostFlow = async () => {
    if (hasContract && contractInfo) {
      navigate(`/projects/${contractInfo.id || contractInfo._id}`);
      return;
    }
    const confirmed = await showConfirm('查看项目成本需要先关联合同。是否前往新建合同？');
    if (confirmed) {
      setContractDrawerOpen(true);
    }
  };

  const openShareAccessFlow = async () => {
    if (hasProject && projectInfo) {
      navigate(`/projects-biz/${projectInfo._id || projectInfo.id}/share-access`, { state: { from: returnPath } });
      return;
    }
    const confirmed = await showConfirm('查看申请需要先关联工地。是否立即新建工地？');
    if (confirmed) handleCreateProject();
  };

  const businessActions = [
    { key: 'design', label: '设计管理', icon: Clock, tone: 'bg-violet-50 text-violet-600', onClick: () => navigate(`/leads/${lead._id}/design`), enabled: currentBizType === '家装' },
    { key: 'material', label: '主材清单', icon: Tag, tone: 'bg-orange-50 text-orange-600', onClick: () => navigate(`/leads/${lead._id}/material`), enabled: currentBizType === '家装' },
    { key: 'quote', label: '报价单', icon: FileText, tone: 'bg-blue-50 text-blue-600', onClick: () => navigate(`/leads/${lead._id}/quote`), enabled: currentBizType === '家装' },
    { key: 'files', label: '项目资料', icon: Folder, tone: 'bg-cyan-50 text-cyan-600', onClick: () => navigate(`/leads/${lead._id}/files`), enabled: true },
    { key: 'share-access', label: '查看申请', icon: Eye, tone: 'bg-purple-50 text-purple-600', onClick: openShareAccessFlow, enabled: true },
    { key: 'contract', label: hasContract ? '合同' : '新建合同', icon: Building, tone: 'bg-slate-100 text-slate-700', onClick: openContractFlow, enabled: true },
    { key: 'income', label: '新增收款', icon: DollarSign, tone: 'bg-emerald-50 text-emerald-600', onClick: openIncomeFlow, enabled: true },
    { key: 'reimbursement', label: '项目报销', icon: Receipt, tone: 'bg-rose-50 text-rose-600', onClick: openReimbursementFlow, enabled: true },
    { key: 'cost', label: '项目成本', icon: BarChart3, tone: 'bg-gray-100 text-gray-700', onClick: openProjectCostFlow, enabled: canViewFinance },
  ].filter(item => item.enabled);
  const desktopBusinessActions = [
    { label: hasProject ? '查看工地' : '新建工地', icon: HardHat, tone: 'bg-amber-50 text-amber-600', onClick: openProjectFlow, enabled: hasProject || canEdit },
    { label: hasContract ? '查看合同' : '新建合同', icon: Building, tone: 'bg-slate-100 text-slate-700', onClick: openContractFlow, enabled: hasContract || canEdit },
    { label: '查看申请', icon: Eye, tone: 'bg-purple-50 text-purple-600', onClick: openShareAccessFlow, enabled: true },
    { label: '新增收款', icon: DollarSign, tone: 'bg-emerald-50 text-emerald-600', onClick: openIncomeFlow, enabled: true },
    { label: '项目报销', icon: Receipt, tone: 'bg-rose-50 text-rose-600', onClick: openReimbursementFlow, enabled: true },
    { label: '项目成本', icon: BarChart3, tone: 'bg-gray-100 text-gray-700', onClick: openProjectCostFlow, enabled: canViewFinance },
  ].filter(item => item.enabled);
  const standaloneTitle = standaloneSection ? (tabs.find(t => t.key === standaloneSection)?.label || '业务详情') : '';
  const returnToLeads = (location.state as { from?: string } | null)?.from || '/leads';
  const renderMobileFileRow = (file: any) => {
    const fType = file.type || getFileType(file.name);
    const fThumb = file.isUploading ? file.previewUrl : fType === 'image' ? fileImgUrls[file.fileID] : fType === 'video' ? (file.poster || file.thumbUrl) : null;
    return (
      <div
        key={file.fileID}
        className="relative overflow-hidden rounded-xl border-t border-gray-50 first:border-t-0"
        onClick={() => { if (!file.isUploading) void openManagedFile(file); }}
      >
        <div className="flex items-center gap-3 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50">
            {fThumb ? <UploadingMediaThumb type={fType} src={fThumb} alt={file.name} className="h-full w-full object-cover" /> : <FileTy type={fType} size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-gray-900">{file.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
              <span>{file.sizeStr || formatSize(file.size)}</span>
              <span className={file.isVisible !== false ? 'text-emerald-600' : 'text-gray-400'}>
                {file.isVisible !== false ? '公开' : '内部'}
              </span>
            </div>
          </div>
          {canEdit && !file.isUploading && (
            <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
              <button onClick={() => { void openManagedFile(file); }} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50" title="查看">
                <Eye size={14} />
              </button>
              <button onClick={() => { void downloadManagedFile(file); }} className="p-1.5 text-gray-400 hover:text-emerald-500 rounded-lg hover:bg-emerald-50" title="下载">
                <Download size={14} />
              </button>
              {!file.isReadOnly && (
                <button onClick={() => deleteFile(file.fileID)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50" title="删除">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        <UploadingItemOverlay item={file} onRetry={retryUploadTask} onRemove={removeUploadTask} />
      </div>
    );
  };

  return (
    <div className="p-3 md:p-6 max-w-[1500px] mx-auto space-y-3 md:space-y-4">
      {standaloneSection && (
        <div className="bg-white rounded-xl md:rounded-2xl border border-gray-100 shadow-sm px-3 py-3 md:px-5 md:py-4">
          <div className="flex items-center gap-2.5">
            <button onClick={() => navigate(`/leads/${id}`)} className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={18} className="text-gray-400" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-bold text-gray-900">{standaloneTitle}</h1>
              <p className="mt-0.5 text-xs text-gray-400 truncate">{displayName || '-'}{displayAddress ? ` · ${displayAddress}` : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── 顶部客户信息卡 ─── */}
      {!standaloneSection && (
      <div className="bg-white rounded-xl md:rounded-2xl border border-gray-100 shadow-sm">
        {/* header */}
        <div className="flex items-start justify-between px-3 md:px-6 py-4 md:py-4 gap-3 md:gap-4">
          <div className="flex items-start gap-2.5 md:gap-3 min-w-0 flex-1">
            <button onClick={() => smartBack()} className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={18} className="text-gray-400" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight leading-[1.35]">
                <span className="inline break-words align-middle">{displayName || '-'}</span>
                {lead.rating && (
                  <span className={`ml-2 inline-flex align-middle text-[11px] px-2.5 py-1 rounded-full font-semibold shrink-0 ${ratingColorMap[lead.rating] || ''}`}>{lead.rating}级</span>
                )}
              </h1>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[14px] md:text-base text-gray-500 font-semibold leading-[1.45]">
                {displayAddress && <span className="break-words">{displayAddress}</span>}
                {lead.customerNo && (
                  <span className="hidden sm:inline-flex text-[11px] px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-500 font-mono shrink-0">{lead.customerNo}</span>
                )}
              </div>
              {leadSummaryTags.length > 0 && (
                <div className="md:hidden mt-2 flex flex-wrap gap-1.5">
                  {leadSummaryTags.map(tag => (
                    <span key={tag} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0">
            {canEdit && (
              <button onClick={startEdit}
                className="flex items-center justify-center h-7 w-[76px] md:h-9 md:w-auto md:px-4 text-[11px] md:text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors whitespace-nowrap">
                编辑资料
              </button>
            )}
            {canEdit ? (
              <button
                onClick={() => setMobileStatusPicker(true)}
                className={`inline-flex items-center justify-center gap-0.5 h-7 w-[76px] md:h-9 md:w-auto md:px-3 text-[11px] md:text-xs rounded-lg font-semibold transition-all ${statusColorMap[lead.status] || 'bg-gray-100 text-gray-500'}`}
              >
                {lead.status}<ChevronDown size={11} />
              </button>
            ) : (
              <span className={`inline-flex items-center justify-center h-7 w-[76px] md:h-9 md:w-auto md:px-3 text-[11px] md:text-xs rounded-lg font-semibold ${statusColorMap[lead.status] || 'bg-gray-100 text-gray-500'}`}>{lead.status}</span>
            )}
          </div>
        </div>

        <div className="hidden md:block px-3 md:px-6 pb-4">
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            {desktopBusinessActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="group relative rounded-xl border border-gray-100 bg-white px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-200 hover:shadow-md"
                >
                  {item.label === '查看申请' && pendingAccessCount > 0 && (
                    <span className="absolute right-2 top-2 min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                      {pendingAccessCount > 99 ? '99+' : pendingAccessCount}
                    </span>
                  )}
                  <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${item.tone}`}>
                    <Icon size={18} />
                  </span>
                  <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="md:hidden px-3 pb-3">
          <div className="grid grid-cols-4 gap-2">
            {businessActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="relative aspect-square rounded-xl border border-gray-100 bg-white flex flex-col items-center justify-center gap-1.5 text-center shadow-sm active:bg-gray-50 transition-colors"
                >
                  {item.label === '查看申请' && pendingAccessCount > 0 && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
                  )}
                  {item.key !== 'share-access' && hasLeadActionUnread(item.key) && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
                  )}
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.tone}`}>
                    <Icon size={17} />
                  </span>
                  <span className="text-[11px] font-semibold text-gray-800 leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="md:hidden px-3 pb-3 space-y-2">
          <button
            type="button"
            onClick={openProjectFlow}
            className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${hasProject ? 'border-emerald-200 bg-emerald-50/70 shadow-[0_10px_24px_rgba(16,185,129,0.08)] active:bg-emerald-100/70' : 'border-gray-100 bg-gray-50/80 active:bg-gray-100'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${hasProject ? 'text-emerald-700' : 'text-gray-500'}`}>
                  <HardHat size={13} className={hasProject ? 'text-emerald-500' : 'text-gray-400'} />
                  <span>工地进度</span>
                </div>
                <div className="mt-1 text-[14px] font-semibold text-gray-900 truncate">
                  {hasProject ? (isProjectFinished ? '已完工' : `当前进度：${projectNodeName || (projectInfo?.status === '进行中' ? '施工中' : projectInfo?.status) || '施工中'}`) : '暂无工程进度'}
                </div>
                {hasProject && (
                  <div className="mt-0.5 text-[11px] font-medium text-gray-500">{projectDateSummary}</div>
                )}
              </div>
              <div className={`shrink-0 flex items-center gap-1 text-[12px] font-medium ${hasProject ? 'text-emerald-700' : 'text-gray-400'}`}>
                <span>{hasProject ? '进入工地' : '新建工地'}</span>
                <ChevronRight size={14} />
              </div>
            </div>
          </button>

          <div className="rounded-xl bg-gray-50/60 px-3 py-2">
            <div className="mb-1.5 text-[12px] font-semibold text-gray-700">跟进人员</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-0">
                <span className="block text-[11px] text-gray-400">销售</span>
                <span className="block text-[12px] font-medium leading-4 text-gray-900 break-words">{salesText || '-'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] text-gray-400">设计</span>
                <span className="block text-[12px] font-medium leading-4 text-gray-900 break-words">{designerText || '-'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] text-gray-400">工程</span>
                <span className="block text-[12px] font-medium leading-4 text-gray-900 break-words">{managerText || '-'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-50" />

        <div className="md:hidden px-3 py-3">
          <section>
            <button
              type="button"
              onClick={() => setMobileInfoOpen(v => !v)}
              className="w-full flex items-center justify-between py-1.5 text-left"
            >
              <span className="text-[15px] font-bold text-gray-900">客户信息</span>
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                {mobileInfoOpen ? '收起' : '展开'}
                <ChevronDown size={14} className={`transition-transform ${mobileInfoOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {mobileInfoOpen && (
              <div className="space-y-3 pt-2">
                <div className="rounded-xl bg-gray-50/70 px-3">
                  {mobileInfoRows.map(row => (
                    <DetailRow key={row.label} label={row.label} value={row.value} />
                  ))}
                  {(lead.remark || lead.notes) && (
                    <DetailRow label="备注" value={<span className="whitespace-pre-wrap">{lead.remark || lead.notes}</span>} />
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* info body */}
        <div className="hidden md:flex px-4 md:px-6 py-5 flex-col lg:flex-row gap-6 lg:gap-10">
          {/* 左侧：客户信息 */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-6">
              <InfoBlock label="手机号" value={displayPhone} />
              <InfoBlock label="类型" value={lead.requirementType} />
              <InfoBlock label="面积" value={lead.area ? `${lead.area}㎡` : ''} />
              <InfoBlock label="预算" value={lead.budget && lead.budget !== '暂无' ? lead.budget : ''} />
              <InfoBlock label="来源" value={sourceText} secondary className="sm:col-span-2 md:col-span-2" />
              
              {/* 签单/流失信息融入上方栅格 */}
              {lead.status === '已签单' && (
                <>
                  <InfoBlock label="签单人" value={lead.signer} />
                  <InfoBlock label="签单日期" value={lead.signDate} />
                </>
              )}
            </div>

            {/* 流失信息（单独占据一整行） */}
            {lead.status === '已流失' && lead.lostReason && (
              <div className="mt-6 pt-5 border-t border-gray-100 grid grid-cols-1">
                <InfoBlock label="流失原因" value={lead.lostReason} secondary />
              </div>
            )}
          </div>

          {/* 分割线 */}
          <div className="hidden lg:block w-px bg-gray-100 shrink-0" />
          <div className="lg:hidden h-px bg-gray-100 w-full" />

          {/* 右侧：人员分配 */}
          <div className="lg:w-[280px] xl:w-[320px] shrink-0">
            <div className="grid grid-cols-2 gap-3">
              {renderPersonnelAssignCard('销售', 'sales', lead.sales, 'bg-blue-50 text-blue-600')}
              {renderPersonnelAssignCard('设计', 'designer', lead.designer, 'bg-violet-50 text-violet-600')}
              <div className="col-span-2">
                {renderPersonnelAssignCard('工程', 'manager', lead.manager, 'bg-amber-50 text-amber-600')}
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {(lead.remark || lead.notes) && (
          <>
            <div className="hidden md:block border-t border-gray-50 mx-4 md:mx-6" />
            <div className="hidden md:block px-4 md:px-6 py-4">
              <span className="text-[12px] text-gray-400 font-medium block mb-1.5">备注</span>
              <p className="text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed">
                {lead.remark || lead.notes}
              </p>
            </div>
          </>
        )}
      </div>
      )}

      {/* ─── Tab Content ─── */}
      <div id="lead-detail-workspace" className="bg-white rounded-xl md:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {!standaloneSection && <div className="hidden md:block p-2.5 md:p-4 border-b border-gray-100">
          <div className="grid grid-cols-4 md:flex gap-2 p-1.5 bg-gray-100/80 rounded-xl">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key as TabKey)}
                className={`${t.hideMobile ? 'hidden md:block' : ''} shrink-0 md:flex-1 min-w-0 md:min-w-[80px] px-1.5 md:px-0 py-2 text-[12px] md:text-[13px] font-medium transition-all rounded-lg ${
                  activeTab === t.key
                    ? 'bg-white text-gold-600 shadow-sm border border-gray-200/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>}

        <div className="p-3 md:p-6">
          {/* ════ 跟进记录 ════ */}
          {activeTab === 'follow' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[13px] font-semibold text-gray-700">共 {followUps.length} 条跟进记录</h3>
                {canEdit && (
                  <button onClick={() => setShowFollowForm(!showFollowForm)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors">
                    <Plus size={14} /> 新增跟进
                  </button>
                )}
              </div>
              {showFollowForm && (
                <div className="bg-gray-50/70 rounded-xl p-4 mb-4 space-y-3 border border-gray-100">
                  <textarea value={followForm.content} onChange={e => setFollowForm({ ...followForm, content: e.target.value })}
                    placeholder="请输入跟进内容..." rows={3} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setShowFollowForm(false); setFollowForm(INIT_FOLLOW); }} className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-white transition-colors">取消</button>
                    <button onClick={handleAddFollow} disabled={isSubmittingFollow} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 transition-colors disabled:opacity-50">{isSubmittingFollow ? '提交中...' : '提交'}</button>
                  </div>
                </div>
              )}
              {followUps.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">暂无跟进记录</div>
              ) : (
                <div className="space-y-1.5">
                  {followUps.map(fu => {
                    const isSystemFollow = (fu.method || fu.type) === '系统记录';
                    const canEditOwnFollow = !isSystemFollow && (fu.createdBy || fu.creatorName) === myName;
                    const showFollowActions = swipedFollowId === fu._id;
                    return (
                    <div key={fu._id} className="group border border-transparent hover:border-gray-200 rounded-xl transition-all overflow-hidden relative">
                      {/* 移动端左滑操作按钮 - iOS风格 */}
                      {canEditOwnFollow && isMobile && (
                        <div className="absolute inset-y-0 right-0 flex">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSwipedFollowId(null); handleEditFollow(fu); }}
                            className="w-[72px] h-full bg-gray-800 text-white flex flex-col items-center justify-center gap-0.5 active:bg-gray-700 transition-colors"
                          >
                            <Edit3 size={18} />
                            <span className="text-[11px] font-medium">删除</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSwipedFollowId(null); handleDeleteFollow(fu._id); }}
                            className="w-[72px] h-full bg-red-500 text-white flex flex-col items-center justify-center gap-0.5 active:bg-red-600 transition-colors"
                          >
                            <Trash2 size={18} />
                            <span className="text-[11px] font-medium">删除</span>
                          </button>
                        </div>
                      )}
                      {/* 跟进内容区域 */}
                      <div
                        className="bg-white p-3.5"
                        style={{
                          transform: activeSwipeFollowId === fu._id && followIsDragging
                            ? `translateX(${followSwipeOffset}px)`
                            : showFollowActions
                              ? `translateX(-${FOLLOW_ACTION_WIDTH}px)`
                              : 'translateX(0)',
                          transition: followIsDragging && activeSwipeFollowId === fu._id
                            ? 'none'
                            : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        }}
                        onTouchStart={canEditOwnFollow && isMobile ? (e) => handleFollowTouchStart(e, fu._id) : undefined}
                        onTouchMove={canEditOwnFollow && isMobile ? handleFollowTouchMove : undefined}
                        onTouchEnd={canEditOwnFollow && isMobile ? (e) => handleFollowTouchEnd(e, fu._id) : undefined}
                        onClick={() => { if (showFollowActions) setSwipedFollowId(null); }}
                      >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gold-50 text-gold-600 font-semibold">{fu.method || fu.type || '其他'}</span>
                            <span className="text-xs text-gray-400">{fu.displayTime || formatDateTime(fu.createdAt)}</span>
                            {fu.editedAt && <span className="text-[11px] text-gray-300">(已编辑)</span>}
                          </div>
                          <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{fu.content}</p>
                        </div>
                        {/* 电脑端 hover 显示的编辑/删除按钮 */}
                        {canEditOwnFollow && !isMobile && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => handleEditFollow(fu)} className="p-1 text-gray-400 hover:text-gold-500 rounded hover:bg-gold-50"><Edit3 size={13} /></button>
                            <button onClick={() => handleDeleteFollow(fu._id)} className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">{fu.createdBy || fu.creatorName || '未知'}
                        {fu.editedAt && <span className="ml-2">编辑于 {fu.editedAt}{fu.editedBy ? ` by ${fu.editedBy}` : ''}</span>}
                      </div>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}

          {/* ════ 设计进度 ════ */}
          {activeTab === 'design' && (
            <div>
              <input ref={nodeFileInputRef} type="file" multiple className="hidden" onChange={handleNodeFileSelect} />
              {(!lead.designNodes || lead.designNodes.length === 0) ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gray-50 flex items-center justify-center"><Clock size={24} className="text-gray-300" /></div>
                  <p className="text-sm text-gray-400 mb-4">尚未开启设计工作流</p>
                  {canEdit && (
                    <button onClick={() => { setDesignSetupMode('create'); setShowDesignSetup(true); }}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
                      <PlusCircle size={14} /> 开启设计工作流
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="relative">
                    {lead.designNodes.map((node: any, idx: number) => {
                      const isLast = idx === lead.designNodes.length - 1;
                      const expanded = expandedNodes[node.id] || false;
                      const loading = nodeLoading[node.id] || false;
                      const isPending = node.status === 'pending';
                      const isCurrent = node.status === 'current';
                      const isCompleted = node.status === 'completed';
                      const isDelayed = isCompleted && node.endDate && node.actualEndDate && node.actualEndDate > node.endDate;
                      const canEditPlan = canEdit && isPending;

                      const planStart = node.startDate || null;
                      const planEnd = node.endDate || null;
                      const actualStart = node.actualStartDate || null;
                      const actualEnd = node.actualEndDate || null;

                      const today = new Date().toISOString().slice(0, 10);
                      const daysRemaining = planEnd ? Math.ceil((new Date(planEnd).getTime() - new Date(today).getTime()) / 86400000) : null;
                      const daysOverdue = planEnd && !isCompleted ? Math.ceil((new Date(today).getTime() - new Date(planEnd).getTime()) / 86400000) : null;

                      const nodeUploadTasks = uploadTasks.filter(task =>
                        task.context?.scope === 'lead-design-node' &&
                        task.context?.leadId === id &&
                        task.context?.nodeId === node.id &&
                        visibleUploadStatuses.includes(task.status)
                      );
                      const nodeFiles = [
                        ...(node.files || []),
                        ...nodeUploadTasks.map(task => ({
                          fileID: `uploading:${task.id}`,
                          name: task.fileName,
                          size: task.fileSize,
                          sizeStr: formatSize(task.fileSize),
                          type: getFileType(task.fileName),
                          uploadTime: new Date(task.createdAt).toISOString(),
                          uploader: myName,
                          isVisible: task.context?.visibility === 'public',
                          isUploading: true,
                          uploadStatus: task.status,
                          uploadProgress: task.progress,
                          uploadTaskId: task.id,
                          uploadError: task.error,
                          previewUrl: task.previewUrl,
                        })),
                      ];
                      const nfLoading = nodeFileLoading[node.id] || false;

                      return (
                        <div key={node.id} className="flex gap-0 md:gap-4">
                          {false && (
                            <div className="absolute right-0 top-0 flex h-[136px]">
                              {canEditPlan && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSwipedDesignFileKey(null);
                                    setExpandedNodes(prev => ({ ...prev, [node.id]: !expanded }));
                                  }}
                                  className="w-[72px] h-full bg-gray-800 text-white flex flex-col items-center justify-center gap-0.5 active:bg-gray-700 transition-colors"
                                >
                                  <Edit3 size={18} />
                                  <span className="text-[11px] font-medium">删除</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSwipedDesignFileKey(null);
                                  void handleDeleteDesignNode(node.id);
                                }}
                                className={`${canEditPlan ? 'w-[72px]' : 'w-[144px]'} h-full bg-red-500 text-white flex flex-col items-center justify-center gap-0.5 active:bg-red-600 transition-colors`}
                              >
                                <Trash2 size={18} />
                                <span className="text-[11px] font-medium">删除</span>
                              </button>
                            </div>
                          )}
                          <div className="contents">
                          <div className="hidden md:flex flex-col items-center shrink-0 w-7">
                            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-sm transition-all
                              ${isCompleted ? 'bg-emerald-50 border-emerald-200' : isCurrent ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                              {isCompleted ? <CheckCircle2 size={12} className="text-emerald-500" /> :
                               isCurrent ? <Play size={11} className="text-blue-500" /> :
                               <Circle size={11} className="text-gray-300" />}
                            </div>
                            {!isLast && <div className={`w-0.5 flex-1 mt-1 mb-1 ${isCompleted ? 'bg-emerald-200' : 'bg-gray-200'}`} />}
                          </div>

                          <div className="relative flex-1 min-w-0 rounded-xl">
                            <div className={`rounded-xl border transition-all overflow-hidden
                              ${isCurrent ? 'border-blue-200 bg-blue-50/20 shadow-sm' :
                                isCompleted ? 'border-emerald-300 bg-white' :
                                'border-gray-100 bg-gray-50/30 hover:border-gray-200'}
                              ${canEditPlan ? 'cursor-pointer' : 'cursor-default'}`}
                              onClick={() => { if (canEditPlan) setExpandedNodes(prev => ({ ...prev, [node.id]: !expanded })); }}>
                              <div className="px-3 md:px-4 py-3 md:py-3.5 flex flex-col">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-base md:text-sm font-bold text-gray-900 break-words md:truncate">{node.name}</span>
                                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                                        isCompleted ? 'bg-emerald-50 text-emerald-700' :
                                        isCurrent ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-500'
                                      }`}>
                                        {isCompleted ? '已完成' : isCurrent ? '进行中' : '待开始'}
                                      </span>
                                      {isDelayed && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold shrink-0">逾期</span>
                                      )}
                                      {!isCompleted && daysOverdue !== null && daysOverdue > 0 && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold shrink-0">逾期 {daysOverdue} 天</span>
                                      )}
                                    </div>
                                    <div className="mt-3 space-y-1 text-[13px] md:text-xs text-gray-500">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-gray-400">计划：</span>
                                        <span className="font-medium text-gray-600">{planStart || '—'} ~ {planEnd ? planEnd.slice(5) : '—'}</span>
                                      </div>
                                      {(actualStart || actualEnd) && (
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                          <span className="text-gray-400">实际：</span>
                                          <span className="font-medium text-gray-600">{actualStart || '—'} ~ {actualEnd ? actualEnd.slice(5) : '至今'}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-2" onClick={e => e.stopPropagation()}>
                                    {isPending && (
                                      <button
                                        onClick={() => {
                                          if (!node.startDate || !node.endDate) {
                                            showAlert('请先设置计划开始和结束时间，再开始该节点。');
                                            return;
                                          }
                                          updateDesignNode(node.id, { status: 'current', actualStartDate: new Date().toISOString().slice(0, 10) });
                                        }}
                                        disabled={loading}
                                        className="inline-flex items-center gap-1 rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-600 disabled:opacity-50"
                                      >
                                        <Play size={10} /> 开始
                                      </button>
                                    )}
                                    {isCurrent && (
                                      <button
                                        onClick={() => {
                                          if (node.endDate && new Date().toISOString().slice(0, 10) > node.endDate) {
                                            setDelayModal({ nodeId: node.id, name: node.name });
                                          } else {
                                            updateDesignNode(node.id, { status: 'completed', actualEndDate: new Date().toISOString().slice(0, 10) });
                                          }
                                        }}
                                        disabled={loading}
                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:opacity-50"
                                      >
                                        <CheckCircle2 size={10} /> 完成
                                      </button>
                                    )}
                                    <div className="space-y-1 text-right">
                                      {planStart && planEnd && (
                                        <div className="rounded-md bg-gray-50 px-2 py-0.5 text-[12px] font-medium text-gray-500">计划 {Math.max(0, Math.ceil((new Date(planEnd).getTime() - new Date(planStart).getTime()) / 86400000) + 1)} 天</div>
                                      )}
                                      {actualStart && (actualEnd || isCompleted) && (
                                        <div className="rounded-md bg-gray-50 px-2 py-0.5 text-[12px] font-medium text-gray-500">用时 {Math.ceil((new Date(actualEnd || today).getTime() - new Date(actualStart).getTime()) / 86400000) + 1} 天</div>
                                      )}
                                    </div>
                                  </div>
                                  {/* 操作按钮 - 移动端图标，电脑端文字 */}
                                  <div className="hidden md:flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                    {canEditPlan && (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedNodes(prev => ({ ...prev, [node.id]: !expanded }))}
                                        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                        title="编辑时间"
                                      >
                                        {isMobile ? <Edit3 size={14} /> : <><Edit3 size={11} /> <span className="text-xs">编辑</span></>}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteDesignNode(node.id)}
                                      className="inline-flex items-center justify-center p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
                                      title="删除"
                                    >
                                      {isMobile ? <Trash2 size={14} /> : <><Trash2 size={11} /> <span className="text-xs">删除</span></>}
                                    </button>
                                  </div>
                                </div>
                              </div>
                              {node.delayReason && (
                                <div className="px-3 md:px-4 pb-3 text-xs text-red-400">逾期原因：{node.delayReason}</div>
                              )}
                            </div>

                            {/* expanded detail panel — only date pickers */}
                            {expanded && canEditPlan && (
                              <div className="mt-2 bg-white rounded-xl p-4 border border-gray-200 shadow-sm space-y-4">
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                  <div className="flex-1 h-px bg-gray-100" />
                                  <span className="shrink-0 font-medium tracking-wide uppercase">编辑计划时间</span>
                                  <div className="flex-1 h-px bg-gray-100" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">预计开始</p>
                                    <CustomDatePicker value={node.startDate || ''} onChange={v => updateDesignNode(node.id, { startDate: v })} compact placeholder="选择日期" />
                                  </div>
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">预计结束</p>
                                    <CustomDatePicker value={node.endDate || ''} onChange={v => updateDesignNode(node.id, { endDate: v })} compact placeholder="选择日期" />
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="mt-3 border-t border-gray-100 pt-3" onClick={e => e.stopPropagation()}>
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="text-[13px] font-bold text-slate-500">相关附件/图片 ({nodeFiles.length})</span>
                                <button
                                  onClick={() => { nodeFileTargetRef.current = node.id; setNodeFileTarget(node.id); nodeFileInputRef.current?.click(); }}
                                  disabled={nfLoading}
                                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                                >
                                  + 上传
                                </button>
                              </div>
                            </div>

                            {/* File list — always visible */}
                            {nodeFiles.length > 0 && (
                              <div className="mt-1.5 space-y-1" onClick={e => e.stopPropagation()}>
                                {nodeFiles.map((f: any, fi: number) => {
                                  const fileKey = `${node.id}-${f.fileID || f.name || fi}`;
                                  const showFileActions = swipedDesignFileKey === fileKey;
                                  const fileType = f.type || getFileType(f.name || '');
                                  const ext = (f.name || 'FILE').split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE';
                                  const uploadDate = (f.uploadTime || '').slice(0, 10);
                                  return (
                                    <div key={fi} className="relative overflow-hidden rounded-xl">
                                      {showFileActions && (
                                      <div className="absolute inset-y-0 right-0 flex md:hidden">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSwipedDesignFileKey(null);
                                            void toggleDesignNodeFileVisibility(node.id, fi);
                                          }}
                                          className={`${f.isVisible === false ? 'bg-emerald-600' : 'bg-slate-600'} w-[88px] text-white flex flex-col items-center justify-center gap-0.5 active:brightness-95`}
                                        >
                                          {f.isVisible === false ? <Eye size={18} /> : <EyeOff size={18} />}
                                          <span className="text-[11px] font-medium">{f.isVisible === false ? '\u516c\u5f00' : '\u4ec5\u5185\u90e8'}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSwipedDesignFileKey(null);
                                            deleteNodeFile(node.id, fi);
                                          }}
                                          className="w-[88px] bg-red-500 text-white flex flex-col items-center justify-center gap-0.5 active:bg-red-600"
                                        >
                                          <Trash2 size={18} />
                                          <span className="text-[11px] font-medium">删除</span>
                                        </button>
                                      </div>
                                      )}
                                      <div
                                        className={`flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-3 text-sm shadow-sm group/file transition-transform duration-200 ${showFileActions ? '-translate-x-44 md:translate-x-0' : ''}`}
                                        onTouchStart={isMobile ? handleDesignFileTouchStart : undefined}
                                        onTouchEnd={isMobile ? (e) => handleDesignFileTouchEnd(e, fileKey) : undefined}
                                        onClick={() => { if (showFileActions) setSwipedDesignFileKey(null); }}
                                      >
                                    <button
                                      type="button"
                                      onClick={() => { if (!f.isUploading) void openManagedFile(f); }}
                                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                      title={`下载 ${f.name}`}
                                    >
                                      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                                        fileType === 'image'
                                          ? 'bg-blue-50 text-blue-500'
                                          : fileType === 'doc'
                                            ? 'bg-red-50 text-red-500'
                                            : fileType === 'video'
                                              ? 'bg-purple-50 text-purple-500'
                                              : 'bg-violet-50 text-violet-500'
                                      }`}>
                                        {(f.isUploading && f.previewUrl) || (fileType === 'video' && (f.poster || f.thumbUrl)) ? (
                                          <UploadingMediaThumb type={fileType} src={f.isUploading ? f.previewUrl : (f.poster || f.thumbUrl)} alt={f.name} className="h-full w-full object-cover" />
                                        ) : fileType === 'image' ? <ImageIcon size={20} /> : ext}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[15px] font-semibold text-slate-700">{f.name}</span>
                                        <span className="mt-0.5 block text-[13px] text-slate-400">{f.sizeStr || formatSize(f.size)}</span>
                                      </span>
                                    </button>
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                      <span className="hidden rounded-md bg-slate-50 px-2 py-0.5 text-[12px] font-medium text-slate-500 md:inline-flex">
                                        {f.isVisible === false ? '仅内部' : '公开'}
                                      </span>
                                      <span className="text-[12px] text-slate-400">{uploadDate || '-'}</span>
                                    </div>
                                    {!f.isUploading && (
                                    <div className="hidden shrink-0 items-center gap-1 md:flex">
                                      <button onClick={() => { void downloadManagedFile(f); }} className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-white" title="下载文件"><Download size={14} /></button>
                                      <button onClick={() => { void toggleDesignNodeFileVisibility(node.id, fi); }} className="p-1.5 text-gray-400 hover:text-gold-500 rounded-lg hover:bg-white" title={f.isVisible === false ? '设为公开' : '设为仅内部'}>
                                        {f.isVisible === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                      </button>
                                      <button onClick={() => deleteNodeFile(node.id, fi)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white" title="删除文件"><Trash2 size={14} /></button>
                                    </div>
                                    )}
                                    <UploadingItemOverlay item={f} onRetry={retryUploadTask} onRemove={removeUploadTask} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className="pb-5" />
                          </div>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
                    <button onClick={() => { setDesignSetupMode('manage'); setCustomDesignNodeName(''); setShowDesignSetup(true); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
                      <Edit3 size={14} /> 节点管理
                    </button>
                  </div>
                              </div>
                            )}
                          </div>
          )}

          {/* ════ 主材清单 ════ */}
          {activeTab === 'material' && (
            <div>
              <div className="flex justify-between items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-700">共 {materials.length} 项</h3>
                <button onClick={openNewMaterial}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors">
                  <Plus size={14} /> 添加主材
                </button>
              </div>
              <div className="space-y-3">
                {groupedMaterials.map(group => {
                  const isExpanded = expandedCategories[group.category] !== false;
                  const catState = lead.materialCategoryStates?.[group.category];
                  return (
                    <div key={group.category} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button onClick={() => setExpandedCategories(prev => ({ ...prev, [group.category]: !isExpanded }))}
                        className="flex items-center gap-2 w-full text-left px-4 py-3 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                        <ChevronRight size={13} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <span className="text-sm font-semibold text-gray-800">{group.category}</span>
                        <span className="text-xs text-gray-400">{group.items.length}项</span>
                        {catState && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ml-auto ${catState.status === '已确认' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {catState.status}
                          </span>
                        )}
                      </button>
                      {isExpanded && (group.items.length === 0 ? (
                        <div className="py-8 text-center text-gray-400 text-xs">暂无记录</div>
                      ) : (
                        <div>
                          <div className="md:hidden divide-y divide-gray-50">
                            {group.items.map((item: any, idx: number) => {
                              const itemImages = item.images || [];
                              const showActions = swipedMaterialId === item.id;
                              return (
                              <div key={item.id} className="relative overflow-hidden">
                                {canEdit && (
                                  <div className={`absolute inset-y-0 right-0 flex transition-all duration-200 ${showActions ? 'w-36' : 'w-0'}`}>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSwipedMaterialId(null); openEditMaterial(item); }}
                                      className="w-[72px] h-full bg-gray-800 text-white flex items-center justify-center text-xs font-medium"
                                    >
                                      编辑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSwipedMaterialId(null); deleteMaterial(item.id); }}
                                      className="w-[72px] h-full bg-red-500 text-white flex items-center justify-center text-xs font-medium"
                                    >
                                      删除
                                    </button>
                                  </div>
                                )}
                                <div
                                  className={`bg-white p-3 transition-transform duration-200 ${showActions ? '-translate-x-36' : ''}`}
                                  onTouchStart={canEdit ? handleMaterialTouchStart : undefined}
                                  onTouchEnd={canEdit ? (e) => handleMaterialTouchEnd(e, item.id) : undefined}
                                  onClick={() => { if (showActions) setSwipedMaterialId(null); }}
                                >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[11px] text-gray-400">#{idx + 1}</span>
                                      <span className="text-sm font-semibold text-gray-900 truncate">
                                        {getCellValue(item, getMaterialColumns(group.category)[0]?.key || 'name')}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500">
                                      {getMaterialColumns(group.category).slice(1, 5).map(c => (
                                        <div key={c.key} className="truncate">
                                          <span className="text-gray-400">{c.label}: </span>{getCellValue(item, c.key)}
                                        </div>
                                      ))}
                                    </div>
                                    {item.remark && <p className="text-xs text-gray-400 mt-1 truncate">{item.remark}</p>}
                                  </div>
                                </div>
                                {itemImages.length > 0 && (
                                  <div className="mt-3 grid grid-cols-4 gap-2">
                                    {itemImages.map((imgId: string, imgIdx: number) => (
                                      <button
                                        key={`${item.id}-${imgId}-${imgIdx}`}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const urls = itemImages.map((id: string) => matImageUrls[id]).filter(Boolean);
                                          if (urls.length > 0) {
                                            const selectedUrl = matImageUrls[imgId] || urls[0];
                                            openImagePreview(urls, Math.max(0, urls.indexOf(selectedUrl)));
                                          }
                                        }}
                                        className="aspect-square rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center"
                                      >
                                        {matImageUrls[imgId] ? (
                                          <img src={matImageUrls[imgId]} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                          <ImageIcon size={16} className="text-gray-300" />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                          <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50/60 border-b border-gray-100">
                                <th className="text-center text-[11px] text-gray-700 font-semibold px-3 py-2.5 w-10">#</th>
                                <th className="text-center text-[11px] text-gray-700 font-semibold px-3 py-2.5 w-20">图片</th>
                                {getMaterialColumns(group.category).map(c => (
                                  <th key={c.key} className={`text-left text-[11px] px-3 py-2.5 ${c.primary ? 'text-gray-800 font-semibold uppercase tracking-wide' : 'text-gray-700 font-semibold'}`}>{c.label}</th>
                                ))}
                                <th className="text-left text-[11px] text-gray-700 font-semibold px-3 py-2.5">备注</th>
                                <th className="text-center text-[11px] text-gray-700 font-semibold px-3 py-2.5 w-20">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map((item: any, idx: number) => (
                                <tr key={item.id} className="border-b border-gray-50 hover:bg-gold-50/20 transition-colors group/row">
                                  <td className="px-3 py-3 text-center text-xs text-gray-700">{idx + 1}</td>
                                  <td className="px-3 py-3">
                                    {item.images?.length > 0 ? (
                                      <div className="relative cursor-pointer shrink-0 inline-block" onClick={() => {
                                        const allUrls = item.images.map((id: string) => matImageUrls[id]).filter(Boolean);
                                        if (allUrls.length > 0) {
                                          openImagePreview(allUrls, 0);
                                        }
                                      }}>
                                        {matImageUrls[item.images[0]] ? (
                                          <img src={matImageUrls[item.images[0]]} className="w-10 h-10 rounded-lg object-cover border border-gray-200 shadow-sm" alt="" />
                                        ) : (
                                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon size={14} className="text-gray-300" /></div>
                                        )}
                                        {item.images.length > 1 && (
                                          <div className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gray-800 text-white flex items-center justify-center">
                                            <span className="text-[9px] font-bold leading-none">{item.images.length}</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="inline-block w-10 h-10 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center group-hover/row:border-gold-300 transition-colors">
                                        <ImageIcon size={14} className="text-gray-300 group-hover/row:text-gold-400 transition-colors" />
                                      </span>
                                    )}
                                  </td>
                                  {getMaterialColumns(group.category).map(c => (
                                    <td key={c.key} className={`px-3 py-3 ${c.primary ? 'text-gray-900 font-semibold text-[13px]' : 'text-gray-900 text-xs font-medium'}`}>
                                      <span className={c.primary ? '' : 'truncate max-w-[80px] lg:max-w-[120px] inline-block'} title={getCellValue(item, c.key) !== '-' ? getCellValue(item, c.key) : ''}>
                                        {getCellValue(item, c.key)}
                                      </span>
                                    </td>
                                  ))}
                                  <td className="px-3 py-3 text-gray-400 text-xs max-w-[100px]">
                                    <span className="truncate block" title={item.remark || ''}>{item.remark || '-'}</span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                      <button onClick={() => openEditMaterial(item)} className="p-1.5 text-gray-400 hover:text-gold-500 hover:bg-gold-50 rounded-lg transition-colors" title="编辑">
                                        <Edit3 size={13} />
                                      </button>
                                      <button onClick={() => deleteMaterial(item.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="删除">
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              {materials.length > 0 && (
                <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 md:hidden">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-emerald-800">发送主材清单给客户确认</div>
                      <div className="mt-1 text-xs text-emerald-700/80">可选择一个或多个主材大项，客户打开后可查看并确认。</div>
                    </div>
                    <button
                      onClick={openShareCategoryModal}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      <Share2 size={14} /> 选择并分享
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ 报价单 ════ */}
          {activeTab === 'quote' && (
            <div>
              {quoteList.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">共 {quoteList.length} 份报价单</h3>
                    <button onClick={() => navigate(`/quotation-builder/lead/${id}/new`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors">
                      <Plus size={13} /> 新建报价
                    </button>
                  </div>
                  <div className="space-y-2">
                    {quoteList.map((quote: any) => (
                      <button
                        key={quote.id}
                        type="button"
                        onClick={() => navigate(`/quotation-builder/lead/${id}/${quote.id}?mode=view`)}
                        className="w-full rounded-xl border border-gray-100 bg-white px-3 py-3 text-left active:bg-gray-50 hover:border-gold-200 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                              <FileText size={17} />
                            </span>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-gray-900 truncate">
                                报价单 {quote.version || `#${quote.id.slice(-6)}`}
                              </div>
                              <div className="mt-0.5 text-[11px] text-gray-400">
                                {formatDate(quote.createdAt)} · {quote.status || '草稿'}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[13px] font-bold text-emerald-600">¥{(quote.amount || 0).toLocaleString()}</div>
                            <ChevronRight size={14} className="ml-auto mt-1 text-gray-300" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-50 flex items-center justify-center">
                    <FileText size={28} className="text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500 mb-1">暂无关联报价单</p>
                  <p className="text-xs text-gray-400 mb-5">为客户创建报价以推进签单流程</p>
                  <button onClick={() => navigate(`/quotation-builder/lead/${id}/new`)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white border border-gray-900 rounded-lg font-medium hover:bg-gray-800 transition-colors">
                    <Plus size={14} /> 新建报价单
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════ 工地管理 ════ */}
          {activeTab === 'project' && (
            <div>
              {hasProject && projectInfo ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">关联工地</h3>
                  <div className="border border-gray-100 rounded-xl overflow-hidden hover:border-gold-200 transition-colors">
                    <div className="px-4 md:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/30">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                          <Building size={18} className="text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{projectInfo.customer}</p>
                          <p className="text-xs text-gray-400">{projectInfo.address}</p>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/projects-biz/${projectInfo._id}`)}
                        className="self-start sm:self-auto flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
                        查看详情 <ChevronRight size={13} />
                      </button>
                    </div>
                    <div className="px-4 md:px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-gray-50/50 rounded-lg px-3 py-2.5">
                        <p className="text-[11px] text-gray-400 mb-1">工程</p>
                        <p className="text-sm text-gray-800 font-medium">{projectInfo.manager || '-'}</p>
                      </div>
                      <div className="bg-gray-50/50 rounded-lg px-3 py-2.5">
                        <p className="text-[11px] text-gray-400 mb-1">施工状态</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${projectInfo.status === '已完成' ? 'bg-emerald-50 text-emerald-600' : projectInfo.status === '已暂停' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                          {projectInfo.status === '进行中' ? '施工中' : (projectInfo.status || '施工中')}
                        </span>
                      </div>
                      <div className="bg-gray-50/50 rounded-lg px-3 py-2.5">
                        <p className="text-[11px] text-gray-400 mb-1">开始日期</p>
                        <p className="text-sm text-gray-700">{projectInfo.startDate || '-'}</p>
                      </div>
                      <div className="bg-gray-50/50 rounded-lg px-3 py-2.5">
                        <p className="text-[11px] text-gray-400 mb-1">计划完工</p>
                        <p className="text-sm text-gray-700">{projectInfo.endDate || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-50 flex items-center justify-center">
                    <Building size={28} className="text-gray-300" />
                  </div>
                  {lead.status === '已签单' ? (
                    <>
                      <p className="text-sm text-gray-500 mb-1">暂无关联工地</p>
                      <p className="text-xs text-gray-400 mb-5">签单后可创建工地项目进行施工管理</p>
                      {canEdit && (
                        <button onClick={handleCreateProject}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
                          <Plus size={14} /> 新建工地
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500 mb-1">暂无工地项目</p>
                      <p className="text-xs text-gray-400">仅已签单客户可创建工地</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════ 项目资料 ════ */}
          {activeTab === 'files' && (
            <div className="relative min-h-[180px] rounded-xl">
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
              <div className="md:hidden space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <div>
                    <h3 className="text-[13px] font-semibold text-gray-800">{currentBizType === '工装' ? '合同资料' : '项目资料'}</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">共 {allFiles.length} 个文件</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <>
                        <button
                          onClick={() => { setNewFolderName(''); setShowNewFolderModal(true); }}
                          className="h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-600 bg-white"
                        >
                          新建文件夹
                        </button>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="h-8 px-2.5 rounded-lg bg-gray-900 text-white text-[11px] font-medium flex items-center gap-1"
                        >
                          <Upload size={12} /> 上传
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {folders.map((folder: string) => {
                  const folderFiles = allFiles.filter((f: any) => (f.folderName || '默认文件夹') === folder);
                  const isOpen = expandedFileFolders[folder] ?? folderFiles.length > 0;
                  return (
                    <div key={folder} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedFileFolders(prev => ({ ...prev, [folder]: !isOpen }))}
                        className="w-full min-h-[46px] px-3 py-2.5 flex items-center gap-2 text-left"
                      >
                        <Folder size={16} className={folderFiles.length ? 'text-gold-500' : 'text-gray-300'} />
                        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-gray-800">{folder}</span>
                        <span className="text-[11px] text-gray-400">{folderFiles.length}</span>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isOpen && (
                        <div className="px-3 pb-2">
                          {folderFiles.length === 0 ? (
                            <div className="py-4 text-center text-[12px] text-gray-400">暂无文件</div>
                          ) : (
                            <div className="divide-y divide-gray-50">
                              {folderFiles.map(renderMobileFileRow)}
                            </div>
                          )}
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1.5 pt-2">
                              <button
                                onClick={() => { setRenameFolderOld(folder); setRenameFolderNew(folder); setShowRenameFolderModal(true); }}
                                className="px-2 py-1 text-[11px] text-gray-500 rounded-lg hover:bg-gray-50"
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => deleteFolder(folder)}
                                className="px-2 py-1 text-[11px] text-red-500 rounded-lg hover:bg-red-50"
                              >
                                删除
                              </button>
                </div>
              )}
            </div>
          )}
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:flex flex-col md:flex-row gap-3 md:gap-5 min-h-[420px]">
                <div className="w-full md:w-[200px] shrink-0 border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">文件夹</span>
                    {canEdit && (
                      <button onClick={() => { setNewFolderName(''); setShowNewFolderModal(true); }}
                        className="p-0.5 text-gray-400 hover:text-gold-500 transition-colors rounded hover:bg-white" title="新建文件夹"><FolderPlus size={14} /></button>
                    )}
                  </div>
                  <div className="py-1 block">
                    {folders.map((folder: string) => {
                      const count = allFiles.filter((f: any) => f.folderName === folder).length;
                      return (
                        <div key={folder} onClick={() => { setSelectedFolder(folder); setShowAllFiles(false); }}
                          className={`flex items-center gap-2 px-3 py-3 md:py-2 cursor-pointer text-sm transition-colors group
                            ${selectedFolder === folder ? 'bg-gold-50 text-gold-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
                          <Folder size={18} className={selectedFolder === folder ? 'text-gold-500' : 'text-gray-400'} />
                          <span className="truncate flex-1">{folder}</span>
                          <span className="text-[11px] text-gray-300 md:group-hover:hidden">{count}</span>
                          <div className="flex md:hidden md:group-hover:flex items-center gap-0.5">
                            {canEdit && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); setRenameFolderOld(folder); setRenameFolderNew(folder); setShowRenameFolderModal(true); }}
                                  className="p-0.5 text-gray-400 hover:text-gold-500 rounded" title="重命名"><Edit3 size={11} /></button>
                                <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder); }}
                                  className="p-0.5 text-gray-400 hover:text-red-500 rounded" title="删除文件夹"><Trash2 size={11} /></button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 border border-gray-100 rounded-xl overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Folder size={14} className="text-gold-500" />
                      <span className="text-xs font-semibold text-gray-500">{showAllFiles ? '全部文件' : selectedFolder}</span>
                      <span className="text-xs text-gray-400">{showAllFiles ? allFiles.length : filesInFolder.length}个文件</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowAllFiles(!showAllFiles)}
                        className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${showAllFiles ? 'bg-gold-400 text-black' : 'border border-gray-200 text-gray-500 hover:bg-white'}`}>
                        {showAllFiles ? '收起' : '展开全部'}
                      </button>
                      {canEdit && (
                        <button onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
                          <Upload size={12} /> 上传文件
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-4 flex-1">
                    {showAllFiles ? (
                      allFiles.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm text-gray-400">暂无文件</div>
                      ) : (
                        <div className="space-y-5">
                          {folders.map(folder => {
                            const folderFiles = allFiles.filter((f: any) => f.folderName === folder);
                            if (folderFiles.length === 0) return null;
                            return (
                              <div key={folder}>
                                <div className="flex items-center gap-2 mb-2.5">
                                  <Folder size={13} className="text-gray-400" />
                                  <span className="text-xs font-semibold text-gray-900">{folder}</span>
                                  <span className="text-xs text-gray-400">{folderFiles.length}个</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                  {folderFiles.map((file: any) => {
                                     const fType = file.type || getFileType(file.name);
                                     const fThumb = file.isUploading ? file.previewUrl : fType === 'image' ? fileImgUrls[file.fileID] : fType === 'video' ? (file.poster || file.thumbUrl) : null;
                                     return (
                                       <div key={file.fileID}
                                         className={`relative overflow-hidden border border-gray-100 rounded-xl p-3 hover:shadow-md hover:border-gray-200 transition-all group ${isMobile ? 'cursor-pointer' : 'cursor-default'}`}
                                         onClick={() => { if (isMobile && !file.isUploading) void openManagedFile(file); }}>
                                         <div className="w-full aspect-[4/3] rounded-lg bg-gray-50 flex items-center justify-center mb-2 overflow-hidden">
                                           {fThumb ? (
                                             <UploadingMediaThumb type={fType} src={fThumb} alt={file.name} className="w-full h-full object-cover" />
                                           ) : (
                                             <FileTy type={fType} size={24} />
                                           )}
                                         </div>
                                         <p className="text-xs text-gray-900 truncate mb-1 font-semibold">{file.name}</p>
                                         <div className="flex items-center justify-between">
                                           <span className="text-[11px] text-gray-400">{file.sizeStr || formatSize(file.size)}</span>
                                           <span className={`text-[10px] px-1.5 py-0.5 rounded ${file.isVisible !== false ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                             {file.isVisible !== false ? '公开' : '内部'}
                                           </span>
                                         </div>
                                         <div className="text-[11px] text-gray-400 mt-1.5">{file.uploader || '-'}</div>
                                         {canEdit && !file.isUploading && (
                                           <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-gray-50 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                             {isMobile && (
                                               <button onClick={(e) => { e.stopPropagation(); void openManagedFile(file); }}
                                                 className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-50" title="查看">
                                                 <Eye size={13} />
                                               </button>
                                             )}
                                             <button onClick={(e) => { e.stopPropagation(); void downloadManagedFile(file); }}
                                               className="p-1 text-gray-400 hover:text-emerald-500 rounded hover:bg-emerald-50" title="下载">
                                               <Download size={13} />
                                             </button>
                                             {!file.isReadOnly && (
                                               <>
                                                 <button onClick={(e) => { e.stopPropagation(); deleteFile(file.fileID); }}
                                                   className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50" title="删除">
                                                   <Trash2 size={13} />
                                                 </button>
                                               </>
                                             )}
                                           </div>
                                         )}
                                         <UploadingItemOverlay item={file} onRetry={retryUploadTask} onRemove={removeUploadTask} />
                                       </div>
                                     );
                                   })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    ) : (
                      filesInFolder.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm text-gray-400">暂无文件</div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                          {filesInFolder.map((file: any) => {
                            const sType = file.type || getFileType(file.name);
                            const sThumb = file.isUploading ? file.previewUrl : sType === 'image' ? fileImgUrls[file.fileID] : sType === 'video' ? (file.poster || file.thumbUrl) : null;
                            return (
                              <div key={file.fileID}
                                className={`relative overflow-hidden border border-gray-100 rounded-xl p-3 hover:shadow-md hover:border-gray-200 transition-all group ${isMobile ? 'cursor-pointer' : 'cursor-default'}`}
                                onClick={() => { if (isMobile && !file.isUploading) void openManagedFile(file); }}>
                                <div className="w-full aspect-[4/3] rounded-lg bg-gray-50 flex items-center justify-center mb-2 overflow-hidden">
                                  {sThumb ? (
                                    <UploadingMediaThumb type={sType} src={sThumb} alt={file.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <FileTy type={sType} size={24} />
                                  )}
                                </div>
                                <p className="text-xs text-gray-900 truncate mb-1 font-semibold">{file.name}</p>
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-gray-400">{file.sizeStr || formatSize(file.size)}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${file.isVisible !== false ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                    {file.isVisible !== false ? '公开' : '内部'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-400 mt-1.5">{file.uploader || '-'}</div>
                                {canEdit && !file.isUploading && (
                                  <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-gray-50 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    {isMobile && (
                                      <button onClick={(e) => { e.stopPropagation(); void openManagedFile(file); }}
                                        className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-50" title="查看">
                                        <Eye size={13} />
                                      </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); void downloadManagedFile(file); }}
                                      className="p-1 text-gray-400 hover:text-emerald-500 rounded hover:bg-emerald-50" title="下载">
                                      <Download size={13} />
                                    </button>
                                    {!file.isReadOnly && (
                                      <>
                                        <button onClick={(e) => { e.stopPropagation(); deleteFile(file.fileID); }}
                                          className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50" title="删除">
                                          <Trash2 size={13} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                                <UploadingItemOverlay item={file} onRetry={retryUploadTask} onRemove={removeUploadTask} />
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════ MODALS ════════════ */}

      {personnelModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[95] flex items-center justify-center p-4" onClick={() => setPersonnelModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base md:text-lg font-bold">分配{personnelModal.title}</h2>
              <button type="button" onClick={() => setPersonnelModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {personnelForm.length === 0 ? (
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-500">未分配</span>
                ) : personnelForm.map(name => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {name}
                    <button type="button" onClick={() => setPersonnelForm(prev => prev.filter(item => item !== name))} className="text-gray-400 hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
              <SearchableSelect
                compact
                options={personnelModal.field === 'sales' ? salesOptions : personnelModal.field === 'designer' ? designerOptions : managerOptions}
                value=""
                onChange={v => { if (v && !personnelForm.includes(v)) setPersonnelForm(prev => [...prev, v]); }}
                placeholder={`添加${personnelModal.title}`}
                searchPlaceholder="搜索姓名..."
                groups={personnelModal.field === 'sales' ? salesGroups : personnelModal.field === 'designer' ? designerGroups : managerGroups}
              />
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setPersonnelModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={savePersonnelAssignment} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 transition-colors">保存</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Customer Modal */}
      {showEditModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4" onClick={async () => { 
          const confirmed = await showConfirm('确定要关闭吗？未保存的更改将丢失。', { confirmStyle: 'danger' });
          if (confirmed) setShowEditModal(false); 
        }}>
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto [&_input]:text-[13px] [&_input]:md:text-sm [&_textarea]:text-[13px] [&_textarea]:md:text-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
              <h2 className="text-base md:text-lg font-bold">编辑客户资料</h2>
              <button type="button" onClick={async () => { 
                const confirmed = await showConfirm('确定要关闭吗？未保存的更改将丢失。', { confirmStyle: 'danger' });
                if (confirmed) setShowEditModal(false); 
              }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">客户姓名</label><input value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">联系电话</label><input value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              </div>
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">房屋地址</label><input value={editForm.address || ''} onChange={e => setEditForm({ ...editForm, address: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">房屋面积(㎡)</label><input value={editForm.area || ''} onChange={e => setEditForm({ ...editForm, area: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">装修预算</label><input value={editForm.budget || ''} onChange={e => setEditForm({ ...editForm, budget: e.target.value })} placeholder="例：15万" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">需求类型</label><SearchableSelect options={REQ_OPTIONS.map(r => ({ value: r, label: r }))} value={editForm.requirementType || '毛坯'} onChange={v => setEditForm({ ...editForm, requirementType: v })} placeholder="选择类型" /></div>
                <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">客户评级</label><SearchableSelect options={['A', 'B', 'C', 'D'].map(r => ({ value: r, label: `${r}级` }))} value={editForm.rating || 'C'} onChange={v => setEditForm({ ...editForm, rating: v })} placeholder="选择评级" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">客户来源</label><SearchableSelect options={SOURCE_OPTIONS.map(s => ({ value: s, label: s }))} value={editForm.source || '自然进店'} onChange={v => setEditForm({ ...editForm, source: v })} placeholder="选择来源" />
                  {editForm.source === '其他' && (
                    <input value={editForm.sourceCustom || ''} onChange={e => setEditForm({ ...editForm, sourceCustom: e.target.value })} placeholder="请输入具体来源"
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 mt-2"
                    />
                  )}
                </div>
                <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">客户编号</label><input value={lead.customerNo || ''} readOnly className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-400" /></div>
              </div>
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">销售</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {(editForm.sales || []).map((s: string) => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                      {s}
                      <button type="button" onClick={() => setEditForm({ ...editForm, sales: editForm.sales.filter((x: string) => x !== s) })} className="hover:text-blue-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect compact options={salesOptions} value=""
                  onChange={v => { if (v && !editForm.sales?.includes(v)) setEditForm({ ...editForm, sales: [...(editForm.sales || []), v] }); }}
                  placeholder="添加销售" searchPlaceholder="搜索姓名..." groups={salesGroups} />
              </div>
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">设计师</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {(editForm.designer || []).map((s: string) => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-violet-50 text-violet-600">
                      {s}
                      <button type="button" onClick={() => setEditForm({ ...editForm, designer: editForm.designer.filter((x: string) => x !== s) })} className="hover:text-violet-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect compact options={designerOptions} value=""
                  onChange={v => { if (v && !editForm.designer?.includes(v)) setEditForm({ ...editForm, designer: [...(editForm.designer || []), v] }); }}
                  placeholder="添加设计师" searchPlaceholder="搜索姓名..." groups={designerGroups} />
              </div>
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">工程</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {(editForm.manager || []).map((s: string) => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600">
                      {s}
                      <button type="button" onClick={() => setEditForm({ ...editForm, manager: editForm.manager.filter((x: string) => x !== s) })} className="hover:text-amber-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <SearchableSelect compact options={managerOptions} value=""
                  onChange={v => { if (v && !editForm.manager?.includes(v)) setEditForm({ ...editForm, manager: [...(editForm.manager || []), v] }); }}
                  placeholder="添加工程" searchPlaceholder="搜索姓名..." groups={managerGroups} />
              </div>
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">备注</label><textarea value={editForm.remark || ''} onChange={e => setEditForm({ ...editForm, remark: e.target.value })} rows={2} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" /></div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={saveEdit} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 transition-colors">保存</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sign Confirm Modal */}
      {showSignModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSignModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">签单确认</h2>
              <button type="button" onClick={() => setShowSignModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">确认该客户已签单，请填写签单信息。</p>
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">签单人 *</label><SearchableSelect options={signerOptions} value={signForm.signer} onChange={v => setSignForm({ ...signForm, signer: v })} placeholder="选择签单人" searchPlaceholder="搜索员工..." groups={signerGroups} /></div>
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">签单日期 *</label><CustomDatePicker value={signForm.signDate} onChange={v => setSignForm({ ...signForm, signDate: v })} placeholder="选择签单日期" dropUp /></div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowSignModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={confirmSign} className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors">确认签单</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lost Confirm Modal */}
      {showLostModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowLostModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">客户流失确认</h2>
              <button type="button" onClick={() => setShowLostModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">请记录该客户流失的原因。</p>
              <div><p className="text-[11px] text-gray-500 mb-2 font-medium">常见原因</p>
                <div className="flex flex-wrap gap-2">
                  {LOST_REASONS.map(r => (
                    <button key={r} onClick={() => setLostReason(r === lostReason ? '' : r)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${lostReason === r ? 'bg-rose-500 text-white border-rose-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{r}</button>
                  ))}
                </div>
              </div>
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">详细说明</label><textarea value={lostReasonCustom} onChange={e => setLostReasonCustom(e.target.value)} placeholder="请输入详细流失原因..." rows={3} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" /></div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowLostModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={confirmLost} className="px-4 py-2 text-sm bg-rose-500 text-white rounded-lg font-medium hover:bg-rose-600 transition-colors">确认流失</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Follow Modal */}
      {editFollow && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditFollow(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">编辑跟进记录</h2>
              <button type="button" onClick={() => setEditFollow(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">跟进内容</label><textarea value={fuEditForm.content} onChange={e => setFuEditForm({ ...fuEditForm, content: e.target.value })} rows={4} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" /></div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setEditFollow(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={handleSaveEditFollow} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 transition-colors">保存</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Single Node Modal */}
      {showAddNodeModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowAddNodeModal(false); setNewNodeName(''); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">新增节点</h2>
              <button type="button" onClick={() => { setShowAddNodeModal(false); setNewNodeName(''); }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="text-[11px] text-gray-500 mb-1 block font-medium">节点名称</label>
              <input value={newNodeName} onChange={e => setNewNodeName(e.target.value)} placeholder="输入节点名称..."
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') addDesignNode(); }} />
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => { setShowAddNodeModal(false); setNewNodeName(''); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={addDesignNode} disabled={!newNodeName.trim()} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 transition-colors disabled:opacity-50">确认添加</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Design Node Upload Sync Modal */}
      {showDesignSetup && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={handleCloseDesignSetupWithConfirm}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto scrollbar-hide" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold">节点管理</h2>
                <p className="text-xs text-gray-400 mt-0.5">直接调整节点顺序、删除节点，或添加新的设计节点</p>
              </div>
              <button type="button" onClick={handleCloseDesignSetupWithConfirm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-4 md:p-5 space-y-4">
              {/* Current Nodes */}
              {(lead?.designNodes || []).length > 0 ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 md:px-4 py-3">
                  <p className="text-xs text-gray-400 mb-2">当前工作流节点</p>
                  <div className="space-y-2">
                    {(lead.designNodes || []).map((node: any, index: number) => (
                      <div key={node.id} className="flex items-center justify-between gap-2 md:gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-700 truncate">{index + 1}. {node.name}</div>
                          <div className="text-[11px] text-gray-400">
                            {node.status === 'completed' ? '已完成' : node.status === 'current' ? '进行中' : '待开始'}
                          </div>
                        </div>
                        {/* 移动端：图标按钮；电脑端：文字按钮 */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isMobile ? (
                            <>
                              <button type="button" onClick={() => void moveDesignNode(node.id, 'up')} disabled={index === 0}
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="上移">
                                <ChevronUp size={14} />
                              </button>
                              <button type="button" onClick={() => void moveDesignNode(node.id, 'down')} disabled={index === (lead.designNodes || []).length - 1}
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="下移">
                                <ChevronDown size={14} />
                              </button>
                              <button type="button" onClick={() => void handleDeleteDesignNode(node.id)}
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors" title="删除">
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => void moveDesignNode(node.id, 'up')} disabled={index === 0}
                                className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">上移</button>
                              <button type="button" onClick={() => void moveDesignNode(node.id, 'down')} disabled={index === (lead.designNodes || []).length - 1}
                                className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">下移</button>
                              <button type="button" onClick={() => void handleDeleteDesignNode(node.id)}
                                className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">删除</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center">
                  <p className="text-sm text-gray-500 mb-1">当前工作流为空</p>
                  <p className="text-xs text-gray-400">请从下方选择或添加自定义节点</p>
                </div>
              )}

              {/* Add Standard Nodes */}
              <div className="space-y-2">
                <p className="text-xs text-gray-400 mb-2">添加标准节点</p>
                {DESIGN_NODE_OPTIONS.filter(o => o !== '自定义').map((opt) => {
                  const exists = (lead?.designNodes || []).some((node: any) => node.name === opt);
                  return (
                    <div key={opt}
                      onClick={async () => {
                        if (exists) return;
                        const newNode = { id: Date.now(), name: opt, isCustom: false, startDate: '', endDate: '', status: 'pending', actualStartDate: '', actualEndDate: '', delayReason: '' };
                        await persistDesignNodes([...(lead?.designNodes || []), newNode]);
                      }}
                      className={`flex items-center gap-3 md:gap-4 p-3 md:p-3.5 rounded-xl border-2 transition-all select-none
                        ${exists ? 'border-blue-400 bg-blue-50/40 cursor-default opacity-60' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 cursor-pointer'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors
                        ${exists ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                        {exists && <CheckCircle2 size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${exists ? 'text-blue-700' : 'text-gray-700'}`}>{opt}</span>
                          {exists && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-bold shrink-0">已添加</span>}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 hidden md:block">
                          {opt === '平面布局' ? '确定空间划分与家具布置方案' :
                           opt === '效果图渲染' ? '3D效果图制作与呈现' :
                           opt === '施工图深化' ? '详细施工图纸绘制与标注' :
                           opt === '定制图纸绘制' ? '定制家具、柜体等图纸设计' : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Custom Node - 移动端垂直布局 */}
              <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 md:px-4 py-3">
                <p className="text-xs text-gray-400 mb-2">添加自定义节点</p>
                <div className={`flex ${isMobile ? 'flex-col' : 'flex-row items-center'} gap-2`}>
                  <input
                    value={customDesignNodeName}
                    onChange={(e) => setCustomDesignNodeName(e.target.value)}
                    onKeyDown={async (e) => { 
                      if (e.key === 'Enter') {
                        const name = customDesignNodeName.trim();
                        if (!name) return;
                        if ((lead?.designNodes || []).some((n: any) => n.name === name)) {
                          await showAlert('节点名称已存在');
                          return;
                        }
                        const newNode = { id: Date.now(), name, isCustom: true, startDate: '', endDate: '', status: 'pending', actualStartDate: '', actualEndDate: '', delayReason: '' };
                        await persistDesignNodes([...(lead?.designNodes || []), newNode]);
                        setCustomDesignNodeName('');
                      }
                    }}
                    placeholder="例如：水电定位、复尺确认"
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const name = customDesignNodeName.trim();
                      if (!name) return;
                      if ((lead?.designNodes || []).some((n: any) => n.name === name)) {
                        await showAlert('节点名称已存在');
                        return;
                      }
                      const newNode = { id: Date.now(), name, isCustom: true, startDate: '', endDate: '', status: 'pending', actualStartDate: '', actualEndDate: '', delayReason: '' };
                      await persistDesignNodes([...(lead?.designNodes || []), newNode]);
                      setCustomDesignNodeName('');
                    }}
                    disabled={!customDesignNodeName.trim()}
                    className={`${isMobile ? 'w-full' : ''} px-3 py-2 text-sm rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors`}
                  >
                    直接添加
                  </button>
                </div>
              </div>
            </div>
            {/* 底部完成按钮 - 移动端优化 */}
            <div className="p-4 md:p-5 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-2 md:gap-0 sticky bottom-0 bg-white rounded-b-2xl">
              <div className="text-xs text-gray-400 text-center md:text-left order-2 md:order-1">操作会自动保存，调整好顺序后即可关闭。</div>
              <button onClick={handleCloseDesignSetup} className="w-full md:w-auto px-5 py-2.5 md:py-2 text-sm bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors order-1 md:order-2">
                完成
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Create Project Modal */}
      {showProjectModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[80vh] overflow-y-auto animate-slide-up md:animate-none" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 rounded-t-2xl md:rounded-t-2xl flex items-center justify-between px-5 py-3.5">
              <h2 className="text-sm font-semibold text-gray-900">新建工地</h2>
              <button onClick={() => setShowProjectModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* 关联客户 */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                  <Link size={12} className="text-gold-500" /> 关联客户
                </div>
                <div className="text-[13px] font-medium text-gray-900">{lead?.name || '-'}</div>
                <div className="mt-0.5 text-xs text-gray-500 truncate">{lead?.address || '-'}</div>
              </div>

              {/* 表单 — 仅项目经理 + 开工日期 */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">项目经理 *</label>
                  <SearchableSelect
                    options={managerOptions}
                    value={projectForm.manager}
                    onChange={(v) => setProjectForm({ ...projectForm, manager: v })}
                    placeholder="选择项目经理"
                    searchPlaceholder="搜索姓名..."
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">开工日期 *</label>
                  <DatePicker
                    mode="single"
                    value={projectForm.startDate}
                    onChange={(v) => setProjectForm({ ...projectForm, startDate: v })}
                    placeholder="选择开工日期"
                    dropUp
                  />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex justify-end gap-3">
              <button onClick={() => setShowProjectModal(false)} className="erp-btn-secondary text-xs">取消</button>
              <button onClick={saveProject} className="erp-btn-primary text-xs">创建工地</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delay Reason Modal */}
      {delayModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setDelayModal(null); setDelayReason(''); }}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">节点逾期 · {delayModal.name}</h2>
              <button type="button" onClick={() => { setDelayModal(null); setDelayReason(''); }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-500">该节点预计结束日期已过，请填写逾期原因后再标记为完成。</p>
              <textarea value={delayReason} onChange={e => setDelayReason(e.target.value)} placeholder="请输入逾期原因..." rows={3} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" />
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => { setDelayModal(null); setDelayReason(''); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={async () => {
                if (!delayReason.trim()) {
                  await showAlert('请填写逾期原因');
                  return;
                }
                updateDesignNode(delayModal.nodeId, { status: 'completed', actualEndDate: new Date().toISOString().slice(0, 10), delayReason: delayReason.trim() });
                setDelayModal(null); setDelayReason('');
              }} className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors">确认完成</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Material Form Modal */}
      {showMaterialModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowMaterialModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
              <h2 className="text-lg font-bold">{editMaterialIndex === -1 ? '添加主材' : '编辑主材'}</h2>
              <button type="button" onClick={() => setShowMaterialModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block font-medium">分类</label>
                <SearchableSelect options={MATERIAL_CATEGORIES.map(c => ({ value: c, label: c }))} value={materialForm.category}
                  onChange={v => setMaterialForm({ ...materialForm, category: v, region: '', itemCategory: '', name: '' })} placeholder="选择分类" />
              </div>

              {materialForm.category !== '其他' && (
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block font-medium">区域</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        options={[
                          ...(REGION_OPTIONS[materialForm.category] || []).map(r => ({ value: r, label: r })),
                          { value: '__custom__', label: '自定义...' },
                        ]}
                        value={(() => {
                          const opts = REGION_OPTIONS[materialForm.category] || [];
                          // 如果处于自定义模式或当前值不在预设选项中，显示为「自定义...」
                          if (isCustomRegionMode) return '__custom__';
                          if (materialForm.region && !opts.includes(materialForm.region)) return '__custom__';
                          return materialForm.region;
                        })()}
                        onChange={v => {
                          if (v === '__custom__') {
                            // 进入自定义模式
                            setIsCustomRegionMode(true);
                            const opts = REGION_OPTIONS[materialForm.category] || [];
                            // 如果当前值是非预设值，保留它；否则清空让用户输入
                            if (materialForm.region && !opts.includes(materialForm.region)) {
                              setCustomRegion(materialForm.region);
                            } else {
                              setCustomRegion('');
                              setMaterialForm({ ...materialForm, region: '' });
                            }
                          } else {
                            // 选择预设选项时，退出自定义模式
                            setIsCustomRegionMode(false);
                            setMaterialForm({ ...materialForm, region: v });
                            setCustomRegion('');
                          }
                        }}
                        placeholder="选择区域"
                      />
                    </div>
                    {/* 显示自定义输入框：处于自定义模式，或当前值是非预设值 */}
                    {(isCustomRegionMode || (materialForm.region && !(REGION_OPTIONS[materialForm.category] || []).includes(materialForm.region))) && (
                      <input
                        value={customRegion || materialForm.region}
                        onChange={e => {
                          const newVal = e.target.value;
                          setCustomRegion(newVal);
                          setMaterialForm({ ...materialForm, region: newVal });
                        }}
                        placeholder="输入自定义区域"
                        className="w-40 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"
                      />
                    )}
                  </div>
                </div>
              )}

              {materialForm.category === '壁布/乳胶漆/护墙板' && (
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block font-medium">类别</label>
                  <SearchableSelect
                    options={[...ITEM_CATEGORY_OPTIONS.map(c => ({ value: c, label: c })), { value: '__custom__', label: '自定义...' }]}
                    value={ITEM_CATEGORY_OPTIONS.includes(materialForm.itemCategory) ? materialForm.itemCategory : materialForm.itemCategory || '__custom__'}
                    onChange={v => { if (v !== '__custom__') setMaterialForm({ ...materialForm, itemCategory: v }); }}
                    placeholder="选择类别"
                  />
                </div>
              )}

              {(materialForm.category === '集成吊顶/电器' || materialForm.category === '其他') && (
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block font-medium">名称</label>
                  <div className="flex gap-2">
                    {materialForm.category === '其他' ? (
                      <SearchableSelect
                        options={[...MATERIAL_NAME_OPTIONS.map(n => ({ value: n, label: n })), { value: '__custom__', label: '自定义...' }]}
                        value={MATERIAL_NAME_OPTIONS.includes(materialForm.name) ? materialForm.name : '__custom__'}
                        onChange={v => { if (v !== '__custom__') setMaterialForm({ ...materialForm, name: v }); }}
                        placeholder="选择名称"
                        className="flex-1"
                      />
                    ) : null}
                    <input value={materialForm.name} onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })}
                      placeholder="输入名称" className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {['瓷砖/木地板', '木门/金属门', '壁布/乳胶漆/护墙板', '全屋定制衣柜', '全屋定制橱柜'].includes(materialForm.category) && (
                  <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">品牌</label><input value={materialForm.brand || ''} onChange={e => setMaterialForm({ ...materialForm, brand: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                )}
                {['瓷砖/木地板', '壁布/乳胶漆/护墙板'].includes(materialForm.category) && (
                  <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">型号</label><input value={materialForm.model || ''} onChange={e => setMaterialForm({ ...materialForm, model: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                )}
                {['瓷砖/木地板', '集成吊顶/电器'].includes(materialForm.category) && (
                  <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">规格</label><input value={materialForm.spec || ''} onChange={e => setMaterialForm({ ...materialForm, spec: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                )}
                {['瓷砖/木地板', '壁布/乳胶漆/护墙板', '集成吊顶/电器'].includes(materialForm.category) && (
                  <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">数量</label><input value={materialForm.quantity || ''} onChange={e => setMaterialForm({ ...materialForm, quantity: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                )}
                {materialForm.category === '木门/金属门' && (
                  <>
                    <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">边框颜色</label><input value={materialForm.frameColor || ''} onChange={e => setMaterialForm({ ...materialForm, frameColor: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                    <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">门芯颜色</label><input value={materialForm.coreColor || ''} onChange={e => setMaterialForm({ ...materialForm, coreColor: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                    <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">门型型号</label><input value={materialForm.doorModel || ''} onChange={e => setMaterialForm({ ...materialForm, doorModel: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                  </>
                )}
                {['全屋定制衣柜', '全屋定制橱柜'].includes(materialForm.category) && (
                  <>
                    <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">柜体</label><input value={materialForm.cabinetBody || ''} onChange={e => setMaterialForm({ ...materialForm, cabinetBody: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                    <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">柜门</label><input value={materialForm.cabinetDoor || ''} onChange={e => setMaterialForm({ ...materialForm, cabinetDoor: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                    <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">拉手</label><input value={materialForm.handle || ''} onChange={e => setMaterialForm({ ...materialForm, handle: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                  </>
                )}
              </div>

              <div><label className="text-[11px] text-gray-500 mb-1 block font-medium">备注</label><input value={materialForm.remark || ''} onChange={e => setMaterialForm({ ...materialForm, remark: e.target.value })} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>

              {/* Image Section */}
              <div>
                <label className="text-[11px] text-gray-500 mb-2 block font-medium">材料图片</label>
                <div className="flex flex-wrap gap-2">
                  {matExistingImages.map((imgId, idx) => (
                    <div key={`existing-${idx}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 group/img">
                      {matImageUrls[imgId] ? (
                        <img src={matImageUrls[imgId]} alt="" className="w-full h-full object-cover cursor-pointer"
                          onClick={() => {
                            const allUrls = matExistingImages.map((id: string) => matImageUrls[id]).filter(Boolean);
                            openImagePreview(allUrls, idx);
                          }} />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center"><ImageIcon size={20} className="text-gray-300" /></div>
                      )}
                      <button onClick={() => removeMatExistingImage(idx)}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover/img:opacity-100 transition-opacity">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {matLocalImages.map((img, idx) => (
                    <div key={`local-${idx}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 group/img">
                      <img
                        src={img.preview}
                        alt=""
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => openImagePreview(matLocalImages.map(item => item.preview), idx)}
                      />
                      <button onClick={() => removeMatLocalImage(idx)}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover/img:opacity-100 transition-opacity">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => matImgInputRef.current?.click()}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 hover:border-gold-400 hover:bg-gold-50/30 transition-colors">
                    <Camera size={16} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400">上传</span>
                  </button>
                  <input ref={matImgInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleMatImgSelect} />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => { setShowMaterialModal(false); matLocalImages.forEach(i => URL.revokeObjectURL(i.preview)); setMatLocalImages([]); }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={saveMaterial} disabled={matImageLoading}
                className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 transition-colors disabled:opacity-50">
                {matImageLoading ? '上传图片中...' : '保存'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Design Node Upload Modal */}
      {nodeUploadModal.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeNodeUploadModal}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">上传设计资料</h2>
              {!nodeFileLoading[nodeUploadModal.targetNodeId || -1] && (
                <button type="button" onClick={closeNodeUploadModal} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-gray-600 font-medium">已选择 {nodeUploadModal.files.length} 个文件</div>
              <div className="max-h-32 overflow-auto space-y-1 bg-gray-50 rounded-lg p-2">
                {nodeUploadModal.files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600 py-1">
                    <FileTy type={getFileType(f.name)} size={14} />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-gray-400 shrink-0">{formatSize(f.size)}</span>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={nodeUploadConfig.syncToProject}
                  onChange={e => setNodeUploadConfig(prev => ({ ...prev, syncToProject: e.target.checked }))}
                  className="rounded text-gold-500 focus:ring-gold-500"
                />
                同步到项目资料
              </label>
              {nodeUploadConfig.syncToProject && (
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block font-medium">项目资料文件夹</label>
                  <input
                    value={nodeUploadConfig.folder}
                    onChange={e => setNodeUploadConfig(prev => ({ ...prev, folder: e.target.value }))}
                    placeholder="输入文件夹名称"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
              )}
              <div>
                <label className="text-[11px] text-gray-500 mb-2 block font-medium">可见性</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNodeUploadConfig(prev => ({ ...prev, visibility: 'internal' }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${nodeUploadConfig.visibility === 'internal' ? 'bg-gray-100 border-gray-300 text-gray-700 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <Lock size={12} /> 仅内部
                  </button>
                  <button
                    type="button"
                    onClick={() => setNodeUploadConfig(prev => ({ ...prev, visibility: 'public' }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${nodeUploadConfig.visibility === 'public' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <Eye size={12} /> 公开
                  </button>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={closeNodeUploadModal} disabled={nodeUploadModal.targetNodeId !== null && nodeFileLoading[nodeUploadModal.targetNodeId]} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">取消</button>
              <button type="button" onClick={confirmNodeUpload} disabled={nodeUploadModal.targetNodeId !== null && nodeFileLoading[nodeUploadModal.targetNodeId]}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
                {nodeUploadModal.targetNodeId !== null && nodeFileLoading[nodeUploadModal.targetNodeId] ? '上传中...' : '确认上传'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Upload Modal */}
      {showUploadModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { if (!uploading) setShowUploadModal(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">上传文件</h2>
              {!uploading && <button type="button" onClick={() => setShowUploadModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>}
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-gray-600 font-medium">已选择 {pendingFiles.length} 个文件</div>
              <div className="max-h-32 overflow-auto space-y-1 bg-gray-50 rounded-lg p-2">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600 py-1">
                    <FileTy type={getFileType(f.name)} size={14} />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-gray-400 shrink-0">{formatSize(f.size)}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block font-medium">目标文件夹</label>
                <SearchableSelect
                  options={[...folders.map((f: string) => ({ value: f, label: f })), { value: '__new__', label: '新建文件夹...' }]}
                  value={uploadFolder}
                  onChange={v => setUploadFolder(v)}
                  placeholder="选择文件夹"
                />
              </div>
              {uploadFolder === '__new__' && (
                <input value="" onChange={e => setUploadFolder(e.target.value)} placeholder="输入文件夹名称"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" />
              )}
              <div>
                <label className="text-[11px] text-gray-500 mb-2 block font-medium">可见性</label>
                <div className="flex gap-2">
                  <button onClick={() => setUploadVisibility('internal')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${uploadVisibility === 'internal' ? 'bg-gray-100 border-gray-300 text-gray-700 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <Lock size={12} /> 仅内部
                  </button>
                  <button onClick={() => setUploadVisibility('public')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${uploadVisibility === 'public' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <Eye size={12} /> 公开（客户可见）
                  </button>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowUploadModal(false)} disabled={uploading} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">取消</button>
              <button onClick={confirmUpload} disabled={uploading}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
                {uploading ? '上传中...' : '确认上传'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showShareCategoryModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowShareCategoryModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 text-center">选择要发送的主材大项</h3>
              <p className="mt-1 text-xs text-gray-400 text-center">客户只会看到本次勾选的主材分类</p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-5 py-2">
              {shareableMaterialCategories.map(category => {
                const state = lead.materialCategoryStates?.[category];
                const checked = selectedShareCategories.includes(category);
                return (
                  <label key={category} className="flex items-center justify-between gap-3 py-3 border-b border-gray-50 last:border-b-0 cursor-pointer">
                    <span className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleShareCategory(category)}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-gray-800 truncate">{category}</span>
                    </span>
                    {state?.status && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${state.status === '已确认' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {state.status}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowShareCategoryModal(false)}
                className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleShareMaterials}
                className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white"
              >
                发送
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNewFolderModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">新建文件夹</h2>
              <button type="button" onClick={() => setShowNewFolderModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5">
              <label className="text-[11px] text-gray-500 mb-1 block font-medium">文件夹名称</label>
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="输入文件夹名称"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); }} />
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowNewFolderModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={createFolder} disabled={!newFolderName.trim()} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Move File Modal */}
      {showMoveFileModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowMoveFileModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">移动文件</h2>
              <button type="button" onClick={() => setShowMoveFileModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5">
              <label className="text-[11px] text-gray-500 mb-1 block font-medium">移动到文件夹</label>
              <SearchableSelect
                options={[...folders.map((f: string) => ({ value: f, label: f })), { value: '__new__', label: '新建文件夹...' }]}
                value={moveTargetFolder}
                onChange={v => setMoveTargetFolder(v)}
                placeholder="选择目标文件夹"
              />
              {moveTargetFolder === '__new__' && (
                <input value="" onChange={e => setMoveTargetFolder(e.target.value)} placeholder="输入新文件夹名称"
                  className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" />
              )}
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowMoveFileModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={confirmMoveFile} disabled={!moveTargetFolder || moveTargetFolder === '__new__'}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">确认移动</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Rename Folder Modal */}
      {showRenameFolderModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowRenameFolderModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">重命名文件夹</h2>
              <button type="button" onClick={() => setShowRenameFolderModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5">
              <label className="text-[11px] text-gray-500 mb-1 block font-medium">原名称: {renameFolderOld}</label>
              <input value={renameFolderNew} onChange={e => setRenameFolderNew(e.target.value)} placeholder="输入新名称"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') confirmRenameFolder(); }} />
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowRenameFolderModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={confirmRenameFolder} disabled={!renameFolderNew.trim() || renameFolderNew === renameFolderOld}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">确认</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <BottomDrawer
        open={mobileStatusPicker}
        onClose={() => setMobileStatusPicker(false)}
        title="更改客户状态"
      >
        <div className="space-y-1">
          {statusOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className={`w-full text-left px-4 py-3 text-sm rounded-lg transition-colors ${
                lead.status === opt.value
                  ? 'font-semibold bg-gray-50 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusColorMap[opt.value] || 'bg-gray-100 text-gray-500'}`}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </BottomDrawer>

      {mobileStatusPicker && createPortal(
        <div className="fixed inset-0 z-[110] hidden items-center justify-center bg-black/35 p-6 md:flex" onClick={() => setMobileStatusPicker(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">更改客户状态</h3>
              <button
                type="button"
                onClick={() => setMobileStatusPicker(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                <X size={17} />
              </button>
            </div>
            <div className="space-y-2">
              {statusOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleStatusChange(opt.value)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    lead.status === opt.value
                      ? 'border-gold-200 bg-gold-50 text-gray-900'
                      : 'border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusColorMap[opt.value] || 'bg-gray-100 text-gray-500'}`}>
                    {opt.label}
                  </span>
                  {lead.status === opt.value && <CheckCircle2 size={16} className="text-gold-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {previewUrl && (
        <ImagePreviewModal
          images={previewImageList.length > 0 ? previewImageList : [previewUrl]}
          index={previewImageIndex}
          onIndexChange={(newIdx) => {
            setPreviewImageIndex(newIdx);
            setPreviewUrl((previewImageList.length > 0 ? previewImageList : [previewUrl])[newIdx] || null);
          }}
          onClose={() => {
            setPreviewUrl(null);
            setPreviewImageList([]);
          }}
          layerClassName="z-[60]"
        />
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
            <p className="text-white/70 text-lg">客户 {lead?.name} 已成功签单</p>
            <p className="text-white/50 text-sm mt-1">签单人：{signForm.signer} · {signForm.signDate}</p>
          </div>
        </div>,
        document.body
      )}

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

      <ContractDrawer
        open={contractDrawerOpen}
        onClose={() => setContractDrawerOpen(false)}
        prefill={{
          customerId: lead?._id,
          customerName: lead?.name,
          customerPhone: lead?.phone,
          houseAddress: lead?.address,
          projectManager: Array.isArray(lead?.manager) ? lead.manager.join('、') : (lead?.manager || ''),
          sales: Array.isArray(lead?.sales) ? lead.sales.join('、') : (lead?.sales || ''),
          designer: Array.isArray(lead?.designer) ? lead.designer.join('、') : (lead?.designer || ''),
          customerNo: lead?.customerNo,
        }}
        onSaved={async () => {
          // 刷新合同信息
          await refreshRelatedContract();
          setContractDrawerOpen(false);
        }}
      />

      {/* 新增收款弹窗 */}
      <ReceiptFormModal
        open={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        defaultContractId={contractInfo?.id || contractInfo?._id}
        compact={true}
        onSuccess={() => {
          setShowReceiptModal(false);
          // 可选：刷新相关数据
        }}
      />

      {/* 新增支出弹窗 */}
      <ExpenseFormModal
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        defaultContractId={contractInfo?.id || contractInfo?._id}
        compact={true}
        onSuccess={() => {
          setShowExpenseModal(false);
        }}
      />
    </div>
  );
}
