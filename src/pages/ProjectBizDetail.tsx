import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Calendar, User, Phone, MapPin, CheckCircle, Check, Circle, Edit3,
  X, Camera, Upload, ChevronDown, ChevronRight, ImageIcon, FileText, HardHat, Users,
  ClipboardList, Loader2, ExternalLink, Building2, Mail, Hash, Eye, EyeOff,
  Plus, Trash2, Shield, BookOpen, GripVertical, ChevronLeft, Settings, Share2,
  Receipt, Tag, Folder, DollarSign, BarChart3, AlertTriangle, RotateCcw,
  Play, PlayCircle,
} from 'lucide-react';
import { projectsAPI, leadsAPI, usersAPI, contractsAPI, projectLogsAPI, projectInspectionsAPI, todosAPI } from '@/db/api';
import type { ProjectLog, ProjectInspection } from '@/types';
import { cloudDB, cloudApp } from '@/db/cloudbase';
import { uploadFile as uploadToCloud, getFileDataURL, getTempFileURL } from '@/utils/cloudStorage';
import { formatDate, generateId } from '@/utils/format';
import { openNativeMediaPreview, isMiniProgramWebView } from '@/utils/miniProgramPreview';
import { openAttachment } from '@/utils/financeAttachments';
import { openCustomerShare } from '@/utils/customerShare';
import ContractDrawer from '@/components/ContractDrawer';
import { canViewFinancialData, hasRole, useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useBizStore } from '@/store/bizStore';
import { useUploadQueueStore } from '@/store/uploadQueueStore';
import { useDialogStore } from '@/store/dialogStore';
import { getCurrentReturnPath, useSmartBack } from '@/hooks/useSmartBack';
import {
  CraftTemplate, getTemplates, buildNodesFromTemplate, makeId,
  DEFAULT_NODE_TYPE, normalizeNodeType, TYPE_OPTIONS,
} from '@/config/constructionTemplates';
import Select from '@/components/Select';
import WorkerAvatar from '@/components/WorkerAvatar';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import DatePicker from '@/components/DatePicker';
import {
  createNotificationEventSafely,
  resolveProjectParticipantUserIds,
  resolveUserIdsByNames,
  stableOperationId,
  TODO_NOTIFICATION_TEMPLATE_ID,
} from '@/services/notificationService';
import { addLeadAuditFollowUp } from '@/utils/leadAudit';
import { buildProjectProgressSummary } from '@/utils/projectProgress';
import { findScheduleConflicts, workersAPI, workerSchedulesAPI } from '@/db/workerScheduleApi';
import type { Worker, WorkerSchedule, WorkerScheduleStatus } from '@/types/workerSchedule';
import { scheduleIdOf, tradeForStage, workerIdOf, workerMatchesStage } from '@/types/workerSchedule';

const CACHED_URLS = new Map<string, string>();
const CLOUD_STORAGE_PREFIX = 'cloud://cloud1-8grodf5s3006f004.636c-cloud1-8grodf5s3006f004-1421470557/';
const WORKER_STATUS_LABEL: Record<Worker['status'], string> = {
  available: '可安排',
  busy: '忙碌',
  resting: '休息',
  inactive: '停用',
};

const normalizeCloudMediaSource = (src: string) => {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:')) return src;

  const cloudSrc = src.startsWith('cloud://') ? src : `${CLOUD_STORAGE_PREFIX}${src}`;
  return cloudSrc.replace(
    '636c-cloud1-8grodf5s3006f004-1330053916',
    '636c-cloud1-8grodf5s3006f004-1421470557',
  );
};

const VIDEO_MEDIA_PATTERN = /\.(mp4|mov|avi|m4v|webm|mkv)(\?|$)/i;

const mediaSourceOf = (item: any) => String(item?.fileID || item?.url || item || '');

const isVideoMedia = (item: any) => {
  const source = mediaSourceOf(item);
  return item?.type === 'video' || /^video\//i.test(item?.mimeType || '') || VIDEO_MEDIA_PATTERN.test(source);
};

const toPreviewMedia = (item: any) => ({
  fileID: mediaSourceOf(item),
  type: isVideoMedia(item) ? 'video' : 'image',
});

function MediaThumb({ src, className }: { src: string; className?: string }) {
  if (!isVideoMedia(src)) return <CloudImage src={src} className={className} />;
  return (
    <div className={`relative flex items-center justify-center bg-gray-100 text-gray-500 ${className || ''}`}>
      <CloudImage src={src} className="absolute inset-0 h-full w-full object-cover opacity-40" />
      <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm">
        <PlayCircle className="h-5 w-5 text-gray-800" />
      </div>
    </div>
  );
}

function UploadingMediaOverlay({
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
    <div className="absolute inset-0 z-10 flex flex-col justify-end rounded-[5px] bg-white/70 p-1 backdrop-blur-[1px]">
      <div className="rounded bg-white/95 p-1 shadow-sm">
        <div className={`truncate text-center text-[10px] font-semibold ${isError ? 'text-red-600' : 'text-gray-700'}`}>
          {isError ? '失败' : item.uploadStatus === 'queued' ? '等待' : '上传中'}
        </div>
        {isError ? (
          <div className="mt-1 flex justify-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); onRetry(item.uploadTaskId); }} className="rounded bg-gray-900 px-1 py-0.5 text-[9px] text-white">重试</button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(item.uploadTaskId); }} className="rounded bg-gray-100 px-1 py-0.5 text-[9px] text-gray-600">删</button>
          </div>
        ) : (
          <>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-right text-[9px] text-gray-400">{progress}%</div>
          </>
        )}
      </div>
    </div>
  );
}

const normalizeVideoPoster = (poster?: string) => {
  if (!poster) return '';
  if (poster.startsWith('wxfile://') || poster.startsWith('http://tmp/') || poster.startsWith('file://')) return '';
  return poster;
};

function CloudVideo({ src, className, poster }: { src: string, className?: string, poster?: string }) {
  const validPoster = normalizeVideoPoster(poster);
  if (validPoster) return <img src={validPoster} className={className} alt="视频缩略图" loading="lazy" decoding="async" />;
  return <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}><ImageIcon className="h-4 w-4" /></div>;
}

function VideoPlayBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/20 ${className}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white shadow-sm ring-1 ring-white/70">
        <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
      </span>
    </span>
  );
}

function CloudImage({ src, className, alt }: { src: string, className?: string, alt?: string }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [loadingFallback, setLoadingFallback] = useState(false);
  
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    if (!src) {
      setLoading(false);
      return;
    }
    
    if (CACHED_URLS.has(src)) {
      setUrl(CACHED_URLS.get(src)!);
      setLoading(false);
      return;
    }
    
    const cloudSrc = normalizeCloudMediaSource(src);

    if (cloudSrc.startsWith('cloud://')) {
      getTempFileURL([cloudSrc])
        .then((tempUrlMap) => {
          if (cancelled) return;
          const tempUrl = tempUrlMap[cloudSrc] || Object.values(tempUrlMap)[0];
          if (!tempUrl) {
            void loadThroughCloudFunction();
          } else {
            setUrl(tempUrl);
            CACHED_URLS.set(src, tempUrl);
            setLoading(false);
          }
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn('[ProjectBizDetail] 获取图片临时地址失败:', error);
          void loadThroughCloudFunction();
        });
    } else {
      setUrl(cloudSrc);
      CACHED_URLS.set(src, cloudSrc);
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, [src, retryKey]);
  
  const loadThroughCloudFunction = async () => {
    if (loadingFallback) return;
    setLoading(false);
    setLoadingFallback(true);
    try {
      const dataUrl = await getFileDataURL(normalizeCloudMediaSource(src), 'thumbnail');
      setUrl(dataUrl);
      CACHED_URLS.set(src, dataUrl);
      setFailed(false);
    } catch (error) {
      console.warn('[ProjectBizDetail] 云函数读取图片失败:', error);
      setFailed(true);
    } finally {
      setLoadingFallback(false);
    }
  };

  if (loading || loadingFallback) {
    return <div className={`flex items-center justify-center bg-gray-100 ${className}`}><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>;
  }
  
  if (failed || !url) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}
        title="图片加载失败，点击重试"
        onClick={(event) => {
          event.stopPropagation();
          CACHED_URLS.delete(src);
          setRetryKey(key => key + 1);
        }}
      >
        <RotateCcw className="h-4 w-4" />
      </div>
    );
  }

  return <img src={url} className={className} alt={alt} loading="lazy" decoding="async" onError={() => { CACHED_URLS.delete(src); void loadThroughCloudFunction(); }} />;
}

const STATUS_COLORS: Record<string, string> = {
  '施工中': 'bg-blue-50 text-blue-600',
  '进行中': 'bg-blue-50 text-blue-600',
  '已完工': 'bg-emerald-50 text-emerald-600',
  '已暂停': 'bg-gray-100 text-gray-500',
};

const toPersonArray = (val: any): string[] => {
  if (Array.isArray(val)) return val.flatMap(v => toPersonArray(v));
  if (val && typeof val === 'object') return toPersonArray(val.name || val.realName || val.nickName || val.value || '');
  if (typeof val === 'string' && val !== '未分配' && val !== '') return val.split(/[,，、\s]+/).filter(Boolean);
  return [];
};

const includesPerson = (val: any, name: string): boolean => {
  return toPersonArray(val).includes(name);
};

function isActiveSubNode(subNode: any) {
  if (!subNode) return false;
  if (subNode.status === 'current' || subNode.status === 'in_progress') return true;
  if (subNode.status === 'completed') return false;
  return Boolean(subNode.actualStartDate || subNode.startedAt || subNode.acceptanceRecord?.startedAt);
}

function normalizeStageText(value: any) {
  return String(value || '').trim().toLowerCase();
}

function getActivityTime(activity: any) {
  const raw = activity?.createdAt || activity?.updatedAt || activity?.rectifySubmittedAt || '';
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function getActivityStageText(activity: any) {
  return [
    activity?.stage,
    activity?.nodeName,
    activity?.sectionName,
    activity?.subNodeName,
    activity?.title,
    activity?.area,
  ].map(normalizeStageText).filter(Boolean).join(' ');
}

function getLatestProjectActivity(logsData: any[] = [], inspectionsData: any[] = []) {
  return [...logsData, ...inspectionsData]
    .filter(Boolean)
    .sort((a, b) => getActivityTime(b) - getActivityTime(a))[0] || null;
}

function findActivityNodeTarget(nodesData: any[] = [], activity: any) {
  const activityText = getActivityStageText(activity);
  if (!activityText) return null;

  for (let nodeIdx = 0; nodeIdx < nodesData.length; nodeIdx += 1) {
    const node = nodesData[nodeIdx];
    const nodeName = normalizeStageText(node?.name);
    if (nodeName && (activityText.includes(nodeName) || nodeName.includes(activityText))) {
      return { nodeIdx, secIdx: null };
    }

    const sections = node?.sections || [];
    for (let secIdx = 0; secIdx < sections.length; secIdx += 1) {
      const section = sections[secIdx];
      const sectionName = normalizeStageText(section?.name);
      if (sectionName && (activityText.includes(sectionName) || sectionName.includes(activityText))) {
        return { nodeIdx, secIdx };
      }

      const matchedSubNode = (section?.subNodes || []).some((subNode: any) => {
        const subNodeName = normalizeStageText(subNode?.name);
        return subNodeName && (activityText.includes(subNodeName) || subNodeName.includes(activityText));
      });
      if (matchedSubNode) return { nodeIdx, secIdx };
    }
  }

  return null;
}

function applyDefaultNodeExpansion(nodesData: any[] = [], latestActivity?: any) {
  const activityTarget = findActivityNodeTarget(nodesData, latestActivity);
  if (activityTarget) {
    return nodesData.map((node: any, nodeIdx: number) => ({
      ...node,
      collapsed: nodeIdx !== activityTarget.nodeIdx,
      sections: (node.sections || []).map((section: any, secIdx: number) => ({
        ...section,
        collapsed: nodeIdx !== activityTarget.nodeIdx || (
          activityTarget.secIdx !== null && secIdx !== activityTarget.secIdx
        ),
      })),
    }));
  }

  let hasActiveSubNode = false;
  const activeMap = nodesData.map((node: any) => {
    const sectionActive = (node.sections || []).map((section: any) => (
      (section.subNodes || []).some(isActiveSubNode)
    ));
    if (sectionActive.some(Boolean)) hasActiveSubNode = true;
    return sectionActive;
  });

  return nodesData.map((node: any, nodeIdx: number) => ({
    ...node,
    collapsed: hasActiveSubNode ? !activeMap[nodeIdx]?.some(Boolean) : true,
    sections: (node.sections || []).map((section: any, secIdx: number) => ({
      ...section,
      collapsed: hasActiveSubNode ? !activeMap[nodeIdx]?.[secIdx] : true,
    })),
  }));
}



export default function ProjectBizDetail() {
  const { id, section } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getCurrentReturnPath(location.pathname, location.search);
  const { user } = useAuthStore();
  const { showConfirm } = useDialogStore();
  const notifications = useNotificationStore((state) => state.notifications);
  const markRelatedAsRead = useNotificationStore((state) => state.markRelatedAsRead);
  const hasProjectActionUnread = (actionKey: string) => notifications.some((item: any) => {
    if (item.isRead || item.relatedTo?.type !== 'project' || item.relatedTo?.id !== id) return false;
    const text = `${item.title || ''} ${item.content || ''} ${item.link || ''}`;
    if (actionKey === 'logs') return /施工日志|\/logs(?:\?|$)/.test(text);
    if (actionKey === 'inspections') return /巡检|整改|\/inspections(?:\?|$)/.test(text);
    if (actionKey === 'files') return /资料|附件|上传|\/files(?:\?|$)/.test(text);
    if (actionKey === 'share-access') return /查看申请|访问申请|\/share-access(?:\?|$)/.test(text);
    if (['contract', 'income', 'reimbursement', 'cost'].includes(actionKey)) return /合同|收款|报销|成本|保险|报价/.test(text);
    return /施工节点|工地节点|进度|开工|完工/.test(text);
  });
  const myName = user?.name || '';
  const addUploadTasks = useUploadQueueStore(s => s.addTasks);
  const uploadTasks = useUploadQueueStore(s => s.tasks);
  const retryUploadTask = useUploadQueueStore(s => s.retryTask);
  const removeUploadTask = useUploadQueueStore(s => s.removeTask);
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);
  const canViewFinance = canViewFinancialData(user?.roles, user?.role);
  const { currentBizType } = useBizStore();
  const confirmUser = useCallback((message: string, options?: { title?: string; confirmText?: string; cancelText?: string; confirmStyle?: 'primary' | 'danger' }) => {
    return showConfirm(message, {
      title: options?.title || '请确认',
      confirmText: options?.confirmText || '确定',
      cancelText: options?.cancelText || '取消',
      confirmStyle: options?.confirmStyle || 'primary',
    });
  }, [showConfirm]);

  const tabs = [
    { key: 'site', label: '施工进度' },
    { key: 'logs', label: '施工日志' },
    { key: 'inspections', label: '工地巡检' },
    { key: 'files', label: currentBizType === '工装' ? '合同资料' : '项目资料' },
  ];
  const standaloneSection = (['logs', 'inspections'] as const).includes(section as any) ? section as 'logs' | 'inspections' : null;
  const stageParam = new URLSearchParams(location.search).get('stage');
  const stageDetailIndex = section?.startsWith('stage-') ? Number(section.slice(6)) : Number(stageParam ?? -1);
  const isStageDetail = Number.isInteger(stageDetailIndex) && stageDetailIndex >= 0;
  const smartBack = useSmartBack((standaloneSection || isStageDetail) ? `/projects-biz/${id}` : '/projects-biz');

  const [project, setProject] = useState<any>(null);
  const [lead, setLead] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [pendingAccessCount, setPendingAccessCount] = useState(0);
  const [contractDrawerOpen, setContractDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(['logs', 'inspections'].includes(section || '') ? section! : 'site');
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ manager: [] as string[], startDate: '', endDate: '', entryPassword: '' });
  const [employees, setEmployees] = useState<any[]>([]);
  const [projectTodos, setProjectTodos] = useState<any[]>([]);
  const [completingTodoId, setCompletingTodoId] = useState<string | null>(null);
  const [showQuickTodoModal, setShowQuickTodoModal] = useState(false);
  const todayDateValue = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [quickTodoForm, setQuickTodoForm] = useState({ title: '', dueDate: todayDateValue() });
  const [submittingQuickTodo, setSubmittingQuickTodo] = useState(false);

  const [uploadingSubNode, setUploadingSubNode] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const nodeFileInputRef = useRef<HTMLInputElement>(null);
  const [targetSubNodeId, setTargetSubNodeId] = useState<string | null>(null);

  // Gallery Preview State
  const [previewImages, setPreviewImages] = useState<{url: string, isVideo: boolean, poster?: string, source?: string}[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewRequestRef = useRef<{
    photo: any;
    allPhotos: any[];
    deleteContext: { nodeId: string; secIdx: number; subIdx: number; photoIdx: number } | null;
  } | null>(null);
  const [nodePhotoAction, setNodePhotoAction] = useState<{
    photo: any;
    photos: any[];
    nodeId: string;
    secIdx: number;
    subIdx: number;
    photoIdx: number;
    canDelete: boolean;
  } | null>(null);
  const [currentPhotoDeleteContext, setCurrentPhotoDeleteContext] = useState<{
    nodeId: string;
    secIdx: number;
    subIdx: number;
    photoIdx: number;
  } | null>(null);

  const [editingSubNode, setEditingSubNode] = useState<{ nodeId: string; sectionIdx: number; subIdx: number } | null>(null);
  const [editSubNodeForm, setEditSubNodeForm] = useState({ name: '', type: DEFAULT_NODE_TYPE, standard: '', checklist: '' });
  const [showAddNodePanel, setShowAddNodePanel] = useState<{ nodeId: string; sectionIdx: number } | null>(null);
  const [newNodeForm, setNewNodeForm] = useState({ name: '', type: DEFAULT_NODE_TYPE, standard: '' });

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [cloudTemplate, setCloudTemplate] = useState<any[] | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [isEditingNodes, setIsEditingNodes] = useState(false);
  const [editingRecordKey, setEditingRecordKey] = useState<string | null>(null);
  const [draggedNodeIndex, setDraggedNodeIndex] = useState<number | null>(null);
  const [dragOverNodeIndex, setDragOverNodeIndex] = useState<number | null>(null);

  // 项目日志与巡检状态
  const [logs, setLogs] = useState<ProjectLog[]>([]);
  const [inspections, setInspections] = useState<ProjectInspection[]>([]);
  
  const [showLogModal, setShowLogModal] = useState(false);
  const [newLogForm, setNewLogForm] = useState({ stage: '', content: '', photos: [] as string[], visibleToCustomer: true });
  const [editingLog, setEditingLog] = useState<ProjectLog | null>(null);
  const [swipedLogId, setSwipedLogId] = useState<string | null>(null);
  const logFileInputRef = useRef<HTMLInputElement>(null);
  const logSwipeStartX = useRef<number | null>(null);
  const previewSwipeStartX = useRef<number | null>(null);
  
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [newInspectionForm, setNewInspectionForm] = useState({ title: '', status: '合格', description: '', photos: [] as string[] });
  const inspectionFileInputRef = useRef<HTMLInputElement>(null);
  const [swipedInspectionId, setSwipedInspectionId] = useState<string | null>(null);
  const inspectionSwipeStartX = useRef<number | null>(null);
  
  const [showRectifyModal, setShowRectifyModal] = useState<ProjectInspection | null>(null);
  const [rectifyForm, setRectifyForm] = useState({ rectifyDescription: '', rectifyPhotos: [] as string[] });
  const rectifyFileInputRef = useRef<HTMLInputElement>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionDate, setCompletionDate] = useState('');

  const [delayReasonModal, setDelayReasonModal] = useState<{open: boolean, nodeId: string, secIdx: number, name: string, reason: string}>({open: false, nodeId: '', secIdx: -1, name: '', reason: ''});
  const [showPlanDateModal, setShowPlanDateModal] = useState<{nodeId: string; secIdx: number; name: string; startDate: string; endDate: string} | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [allWorkerSchedules, setAllWorkerSchedules] = useState<WorkerSchedule[]>([]);
  const [projectWorkerSchedules, setProjectWorkerSchedules] = useState<WorkerSchedule[]>([]);
  const [showWorkerScheduleModal, setShowWorkerScheduleModal] = useState(false);
  const [workerScheduleForm, setWorkerScheduleForm] = useState({ workerId: '', startDate: '', endDate: '', status: 'confirmed' as WorkerScheduleStatus, note: '' });
  const [workerScheduleError, setWorkerScheduleError] = useState('');
  const [savingWorkerSchedule, setSavingWorkerSchedule] = useState(false);
  const [workerProfileSchedule, setWorkerProfileSchedule] = useState<WorkerSchedule | null>(null);
  const [workerPhotoViewer, setWorkerPhotoViewer] = useState<string[]>([]);

  // 勾选式分享：进入选择模式后，在检查项前显示圆圈直接勾选
  const [shareSelect, setShareSelect] = useState<{ nodeIdx: number; secIdx: number; checked: Record<number, boolean> } | null>(null);

  // 常用语状态
  const [quickReplies, setQuickReplies] = useState<string[]>([
    '今日施工内容：\n今日施工问题：\n明日施工计划：',
    '今日施工正常，按计划推进。无遗留问题。',
    '材料已进场，等待下一步施工。'
  ]);
  const [showQuickReplyMenu, setShowQuickReplyMenu] = useState(false);
  const [showQuickReplyManager, setShowQuickReplyManager] = useState(false);
  const [newQuickReplyText, setNewQuickReplyText] = useState('');

  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [isSubmittingInspection, setIsSubmittingInspection] = useState(false);
  const [isSubmittingRectify, setIsSubmittingRectify] = useState(false);
  const isProjectActionBusy = (key?: string) => !!pendingAction && (!key || pendingAction === key);
  useEffect(() => {
    if (!showPreviewModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPreviewModal(false);
      if (e.key === 'ArrowLeft' && previewImages.length > 1) {
        setPreviewIndex(prev => prev > 0 ? prev - 1 : previewImages.length - 1);
      }
      if (e.key === 'ArrowRight' && previewImages.length > 1) {
        setPreviewIndex(prev => prev < previewImages.length - 1 ? prev + 1 : 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPreviewModal, previewImages.length]);

  const getProjectDocId = useCallback((source?: any) => {
    const rawId = source?._docId || source?._id || source?.id || id;
    if (typeof rawId === 'string' || typeof rawId === 'number') return String(rawId);
    return '';
  }, [id]);

  const sendProjectUpdateNotification = async (
    eventType: string,
    operationId: string,
    title: string,
    content: string,
    sourceProject: any = project,
  ) => {
    const projectDocId = getProjectDocId(sourceProject);
    if (!projectDocId || !user?.id) return;
    await createNotificationEventSafely({
      operationId,
      eventType,
      actorUserId: user.id,
      recipientUserIds: await resolveProjectParticipantUserIds(sourceProject, lead),
      recipientRoles: ['admin'],
      category: 'project',
      title,
      content,
      link: `/projects-biz/${projectDocId}`,
      relatedTo: { type: 'project', id: projectDocId, name: sourceProject.address || sourceProject.customer || '工地' },
      channels: ['station', 'wechat'],
    });
  };

  const findRelatedLead = useCallback(async (sourceProject: any) => {
    if (!sourceProject) return null;
    if (sourceProject.leadId) {
      const linkedLeadData = await leadsAPI.doc(sourceProject.leadId).get();
      const linkedLead = Array.isArray(linkedLeadData) ? linkedLeadData[0] : linkedLeadData;
      if (linkedLead) return linkedLead;
    }
    const normalize = (v?: string) => (v || '').trim();
    const pPhone = normalize(sourceProject.phone);
    const pCustomer = normalize(sourceProject.customer);
    const pAddress = normalize(sourceProject.address);
    const candidates = await Promise.all([
      pPhone ? leadsAPI.where({ phone: pPhone }).toArray() : Promise.resolve([]),
      pCustomer ? leadsAPI.where({ name: pCustomer }).toArray() : Promise.resolve([]),
      pAddress ? leadsAPI.where({ address: pAddress }).toArray() : Promise.resolve([]),
    ]);
    return candidates.flat()[0] || null;
  }, []);

  const findRelatedContracts = useCallback(async (sourceProject: any, sourceLead: any) => {
    try {
      const normalize = (v?: string) => (v || '').trim();
      const pPhone = normalize(sourceProject?.phone) || normalize(sourceLead?.phone);
      const pCustomer = normalize(sourceProject?.customer) || normalize(sourceLead?.name);
      const pAddress = normalize(sourceProject?.address) || normalize(sourceLead?.address);
      const leadId = sourceProject?.leadId || sourceLead?._id;
      const matches = await Promise.all([
        leadId ? contractsAPI.where({ customerId: leadId }).toArray() : Promise.resolve([]),
        pPhone ? contractsAPI.where({ customerPhone: pPhone }).toArray() : Promise.resolve([]),
        pCustomer ? contractsAPI.where({ customerName: pCustomer }).toArray() : Promise.resolve([]),
        pAddress ? contractsAPI.where({ houseAddress: pAddress }).toArray() : Promise.resolve([]),
      ]);
      const unique = new Map<string, any>();
      matches.flat().forEach((contract: any) => unique.set(contract._id || contract.id, contract));
      return Array.from(unique.values());
    } catch { return []; }
  }, []);

  const hydrateProject = useCallback(async (p: any) => {
    const projectDocId = getProjectDocId(p);
    if (projectDocId && !p._docId) p._docId = projectDocId;
    if (projectDocId && !p._id) p._id = projectDocId;
    const relatedLead = await findRelatedLead(p);
    if (relatedLead) {
      const updates: any = {};
      if (!p.customer || p.customer === '-') updates.customer = relatedLead.name || '';
      if (!p.phone || p.phone === '-') updates.phone = relatedLead.phone || '';
      if (!p.leadId) updates.leadId = relatedLead._id;
      if (projectDocId && Object.keys(updates).length > 0) {
        await projectsAPI.update(projectDocId, updates);
        Object.assign(p, updates);
      }
    }
    // 小程序使用的是 nodesData 字段，且我们不再自动为其创建写死的旧版模板，而是让用户点击“套用模板”
    if (!p.nodesData || !Array.isArray(p.nodesData)) {
      p.nodesData = [];
    }
    return p;
  }, [findRelatedLead, getProjectDocId]);

  const getPlanDays = (start: string, end?: string) => {
    if (!start) return 0;
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    if (Number.isNaN(s) || Number.isNaN(e)) return 0;
    return Math.max(1, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
  };

  const loadProject = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      if (id === 'new') { setProject(null); setLoading(false); return; }
      let pData = await projectsAPI.doc(id!).get();
      let p = Array.isArray(pData) ? pData[0] : pData;
      if (!p) {
        const matched = await projectsAPI.where({ _id: id! }).toArray();
        p = matched[0] || null;
      }
      if (!p) { setProject(null); setLoading(false); return; }
      p._docId = id!;
      if (!p._id) p._id = id!;
      p = await hydrateProject(p);
      // 补齐节点缺少的 _id（旧数据兼容）
      if (p.nodesData) {
        p.nodesData.forEach((node: any) => {
          if (!node._id) node._id = makeId();
          if (node.sections) {
            node.sections.forEach((sec: any) => {
              if (!sec._id) sec._id = makeId();
              if (sec.subNodes) {
                sec.subNodes.forEach((sn: any) => { if (!sn._id) sn._id = makeId(); });
              }
            });
          }
        });
      }
      const calculatedProgressSummary = buildProjectProgressSummary(p.nodesData || []);
      const previousProgressVersion = Number(p.progressSummary?.algorithmVersion || 0);
      p.progressSummary = calculatedProgressSummary;
      if (previousProgressVersion < calculatedProgressSummary.algorithmVersion) {
        void projectsAPI.update(id!, { progressSummary: calculatedProgressSummary }).catch(() => undefined);
      }
      const [latestLogsData, latestInspectionsData] = await Promise.all([
        projectLogsAPI.where({ projectId: id }).orderBy('createdAt', 'desc').toArray().catch(() => []),
        projectInspectionsAPI.where({ projectId: id }).orderBy('createdAt', 'desc').toArray().catch(() => []),
      ]);
      const latestActivity = getLatestProjectActivity(latestLogsData.slice(0, 1), latestInspectionsData.slice(0, 1));
      
      setProject((prev: any) => {
        if (!prev) {
          return {
            ...p,
            nodesData: applyDefaultNodeExpansion(p.nodesData || [], latestActivity),
          };
        }
        // Preserve collapsed state
        if (p.nodesData && prev.nodesData) {
          p.nodesData.forEach((node: any) => {
            const prevNode = prev.nodesData.find((n: any) => n._id === node._id);
            if (prevNode) {
              if (prevNode.collapsed !== undefined) node.collapsed = prevNode.collapsed;
              if (node.sections && prevNode.sections) {
                node.sections.forEach((sec: any, i: number) => {
                  if (prevNode.sections[i] && prevNode.sections[i].collapsed !== undefined) {
                    sec.collapsed = prevNode.sections[i].collapsed;
                  }
                });
              }
            }
          });
        }
        if (JSON.stringify(prev) === JSON.stringify(p)) return prev;
        return p;
      });

      let relatedLeadData = p.leadId ? await leadsAPI.doc(p.leadId).get().catch(() => null) : null;
      const relatedLead = Array.isArray(relatedLeadData) ? relatedLeadData[0] : relatedLeadData;
      setLead(relatedLead || null);
      const relatedContracts = await findRelatedContracts(p, relatedLead);
      setContracts(relatedContracts);
      cloudDB.collection('shareAccess')
        .where({ projectId: p._id || id, status: 'pending' })
        .count()
        .then((res: any) => setPendingAccessCount(res.total || 0))
        .catch(() => setPendingAccessCount(0));

      // 一次性迁移：统一同步姓名 + 清理"1"脏数据
      if (false && !(window as any)._fixManager1) {
        (window as any)._fixManager1 = true;
        import('@/db/sync').then(({ syncEmployeeName }) => {
          syncEmployeeName('张小琴', '张晓琴').then(() => {
            console.log('✅ 工地端同步完成：张小琴 → 张晓琴');
          });
          // 另外清理旧的"1"脏数据
          (async () => {
            try {
              const allProjs = await projectsAPI.toArray();
              const fixes: Promise<void>[] = [];
              for (const pp of allProjs) {
                const arr = toPersonArray(pp.manager);
                const filtered = arr.filter(n => n !== '1');
                if (arr.length !== filtered.length) {
                  fixes.push(projectsAPI.update(pp._id, { manager: filtered }));
                }
              }
              if (fixes.length) {
                await Promise.all(fixes);
                console.log('✅ 已移除项目经理中的脏数据 "1"');
              }
            } catch (e) { /* ignore */ }
          })();
        });
      }
    } catch (e) { console.error('加载项目失败', e); setProject(null); }
    if (showLoading) setLoading(false);
  }, [id, hydrateProject, findRelatedContracts]);

  const loadLogsAndInspections = useCallback(async () => {
    if (!id || id === 'new') return;
    try {
      const logsData = await projectLogsAPI.where({ projectId: id }).orderBy('createdAt', 'desc').toArray();
      setLogs(logsData);
      const inspectionsData = await projectInspectionsAPI.where({ projectId: id }).orderBy('createdAt', 'desc').toArray();
      setInspections(inspectionsData);
    } catch (e) { console.error('加载日志/巡检失败', e); }
  }, [id]);

  const loadProjectTodos = useCallback(async () => {
    if (!id || id === 'new') return;
    const allTodos = await todosAPI.toArray().catch(() => []);
    setProjectTodos(allTodos
      .filter((todo: any) => todo.status !== 'completed' && todo.relatedTo?.type === 'project' && todo.relatedTo?.id === id)
      .sort((a: any, b: any) => String(a.dueDate || a.createdAt || '').localeCompare(String(b.dueDate || b.createdAt || ''))));
  }, [id]);

  const loadWorkerSchedules = useCallback(async () => {
    if (!id || id === 'new') return;
    try {
      const [workerRows, scheduleRows] = await Promise.all([workersAPI.toArray(), workerSchedulesAPI.toArray()]);
      setWorkers(workerRows.filter((item: any) => !item._placeholder));
      const validSchedules = scheduleRows.filter((item: any) => !item._placeholder);
      setAllWorkerSchedules(validSchedules);
      setProjectWorkerSchedules(validSchedules.filter((item) => item.projectId === id));
    } catch (error) {
      console.warn('[project-worker-schedule] load failed', error);
    }
  }, [id]);

  const loadQuickReplies = useCallback(async () => {
    try {
      const res = await cloudDB.collection('system_configs').doc('log_quick_replies').get();
      const data = Array.isArray(res.data) ? res.data[0] : res.data;
      if (data && data.replies && Array.isArray(data.replies)) {
        setQuickReplies(data.replies);
      }
    } catch (e) {
      console.log('尚未配置常用语，使用默认值');
    }
  }, []);

  const saveQuickRepliesToCloud = async (newReplies: string[]) => {
    setQuickReplies(newReplies);
    try {
      await cloudApp.callFunction({
        name: 'quickUpdateConfig',
        data: {
          docId: 'log_quick_replies',
          updateData: { replies: newReplies }
        }
      });
    } catch (e) {
      console.error('保存常用语失败', e);
    }
  };

  useEffect(() => { loadProject(true); loadLogsAndInspections(); loadProjectTodos(); loadWorkerSchedules(); loadQuickReplies(); fetchEmployees(); }, [loadProject, loadLogsAndInspections, loadProjectTodos, loadWorkerSchedules, loadQuickReplies]);

  useEffect(() => {
    if (!isStageDetail || !project?.nodesData?.[stageDetailIndex]) return;
    setProject((current: any) => {
      if (!current?.nodesData?.[stageDetailIndex]) return current;
      const nodesData = current.nodesData.map((node: any, index: number) => index === stageDetailIndex ? {
        ...node,
        collapsed: false,
        sections: (node.sections || []).map((item: any) => ({ ...item, collapsed: false })),
      } : node);
      return { ...current, nodesData };
    });
    const scrollContainer = document.querySelector<HTMLElement>('[data-scroll="main"]');
    window.requestAnimationFrame(() => scrollContainer?.scrollTo({ top: 0, behavior: 'auto' }));
  }, [isStageDetail, stageDetailIndex, project?._id]);

  useEffect(() => {
    if (isStageDetail || loading) return;
    const savedPosition = sessionStorage.getItem(`project_detail_scroll_${id}`);
    if (!savedPosition) return;
    const scrollContainer = document.querySelector<HTMLElement>('[data-scroll="main"]');
    window.requestAnimationFrame(() => {
      scrollContainer?.scrollTo({ top: Number(savedPosition) || 0, behavior: 'auto' });
      sessionStorage.removeItem(`project_detail_scroll_${id}`);
    });
  }, [id, isStageDetail, loading]);

  // 页面可见时刷新关联合同（从合同页返回时不会重新挂载组件）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && project) {
        void loadProjectTodos();
        (async () => {
          const leadData = project.leadId ? await leadsAPI.doc(project.leadId).get().catch(() => null) : null;
          const lead = Array.isArray(leadData) ? leadData[0] : leadData;
          const related = await findRelatedContracts(project, lead);
          setContracts(related);
        })();
      }
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [project, findRelatedContracts, loadProjectTodos]);

  useEffect(() => {
    if (section && ['logs', 'inspections'].includes(section)) setActiveTab(section);
    if (!section) setActiveTab('site');
  }, [section]);

  useEffect(() => {
    if (!id) return;
    void markRelatedAsRead('project', id);
  }, [id, markRelatedAsRead]);

  // Refresh collaborative records only when returning to the page.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && id && id !== 'new') {
        void loadLogsAndInspections();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [id, loadLogsAndInspections]);

  const syncToDB = async (newNodesData: any[]) => {
    if (!project) return;
    if (project.status === '已完工') return;
    const progressSummary = buildProjectProgressSummary(newNodesData);
    setProject({ ...project, nodesData: newNodesData, progressSummary });
    const projectDocId = getProjectDocId(project);
    if (!projectDocId) return;
    try { await projectsAPI.update(projectDocId, { nodesData: newNodesData, progressSummary }); } catch { /* ignore */ }
  };

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await usersAPI.toArray();
      setEmployees(data);
    } catch (e) { console.error(e); }
  }, []);

  const saveProject = async () => {
    if (!project || pendingAction) return;
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const projectDocId = getProjectDocId(project);
    if (!projectDocId) return;
    const updates: any = {
      manager: editForm.manager,
      startDate: editForm.startDate,
      entryPassword: editForm.entryPassword,
    };
    setPendingAction('save-project');
    try {
      await projectsAPI.update(projectDocId, updates);
      const leadDocId = lead?._id || project.leadId;
      if (leadDocId) {
        await leadsAPI.update(leadDocId, { manager: editForm.manager });
        setLead((prev: any) => prev ? { ...prev, manager: editForm.manager } : prev);
      }
      const updatedProject = { ...project, ...updates };
      void sendProjectUpdateNotification(
        'PROJECT_ASSIGNMENT_UPDATED',
        stableOperationId('project-assignment-updated', projectDocId, Date.now()),
        '工地负责人已更新',
        `${myName}更新了“${project.address || project.customer || '工地'}”的负责人或开工信息`,
        updatedProject,
      );
      setProject((prev: any) => ({ ...prev, ...updates }));
      setEditMode(false);
    } finally {
      setPendingAction(null);
    }
  };

  const startEdit = () => {
    setEditForm({
      manager: toPersonArray(project.manager).length > 0 ? toPersonArray(project.manager) : toPersonArray(lead?.manager),
      startDate: project.startDate ? project.startDate.slice(0, 10) : '',
      endDate: '',
      entryPassword: project.entryPassword || '',
    });
    setEditMode(true);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!project) return;
    const projectDocId = getProjectDocId(project);
    if (!projectDocId) return;
    await projectsAPI.update(projectDocId, { status: newStatus });
    await addLeadAuditFollowUp({
      leadId: project.leadId || lead?._id,
      lead,
      actorName: myName,
      content: `${myName}将工地“${project.address || project.customer || '工地'}”状态从“${project.status || '未设置'}”更新为“${newStatus}”。`,
    });
    void sendProjectUpdateNotification(
      'PROJECT_STATUS_UPDATED',
      stableOperationId('project-status-updated', projectDocId, newStatus, Date.now()),
      '工地状态已更新',
      `${myName}将“${project.address || project.customer || '工地'}”状态更新为${newStatus}`,
      { ...project, status: newStatus },
    );
    setProject({ ...project, status: newStatus });
  };

  /* ---- 节点折叠 ---- */
  const toggleNodeCollapse = (nodeId: string) => {
    const newNodesData = (project.nodesData || []).map((n: any) => n._id === nodeId ? { ...n, collapsed: !n.collapsed } : n);
    setProject({ ...project, nodesData: newNodesData });
  };

  const toggleSectionCollapse = (nodeId: string, secIdx: number) => {       
    const newNodesData = (project.nodesData || []).map((n: any) => n._id === nodeId ? {
      ...n, sections: n.sections.map((s: any, i: number) => i === secIdx ? { ...s, collapsed: !s.collapsed } : s),
    } : n);
    setProject({ ...project, nodesData: newNodesData });
    syncToDB(newNodesData);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedNodeIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set
    e.dataTransfer.setData('text/html', index.toString());
    
    // 拖拽时自动将所有节点折叠
    const newNodesData = (project.nodesData || []).map((n: any) => ({
      ...n,
      collapsed: true
    }));
    setProject({ ...project, nodesData: newNodesData });

    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedNodeIndex === null || draggedNodeIndex === index) return;
    setDragOverNodeIndex(index);
  };

  const handleDragEnd = (e?: React.DragEvent) => {
    if (e && e.target instanceof HTMLElement) {
      e.target.style.opacity = '1';
    }
    setDraggedNodeIndex(null);
    setDragOverNodeIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!canManageConstructionStructure) return;
    if (draggedNodeIndex === null || draggedNodeIndex === index) {
      handleDragEnd(e);
      return;
    }
    const newNodesData = [...(project.nodesData || [])];
    const draggedItem = newNodesData.splice(draggedNodeIndex, 1)[0];
    newNodesData.splice(index, 0, draggedItem);
    syncToDB(newNodesData);
    handleDragEnd(e);
  };

  /* ---- 节点编辑（对齐模板库UI） ---- */
  const moveNode = (index: number, direction: -1 | 1) => {
    if (!canManageConstructionStructure) return;
    if (project?.status === '已完工') return;
    const target = index + direction;
    if (target < 0 || target >= (project.nodesData || []).length) return;
    const newNodesData = [...(project.nodesData || [])];
    const [item] = newNodesData.splice(index, 1);
    newNodesData.splice(target, 0, item);
    syncToDB(newNodesData);
  };
  const moveSection = (nodeIdx: number, secIdx: number, direction: -1 | 1) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const sections = project.nodesData[nodeIdx]?.sections || [];
    const target = secIdx + direction;
    if (target < 0 || target >= sections.length) return;
    const newNodesData = [...(project.nodesData || [])];
    const [item] = newNodesData[nodeIdx].sections.splice(secIdx, 1);
    newNodesData[nodeIdx].sections.splice(target, 0, item);
    syncToDB(newNodesData);
  };
  const moveSubNode = (nodeIdx: number, secIdx: number, subIdx: number, direction: -1 | 1) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const subNodes = project.nodesData[nodeIdx]?.sections?.[secIdx]?.subNodes || [];
    const target = subIdx + direction;
    if (target < 0 || target >= subNodes.length) return;
    const newNodesData = [...(project.nodesData || [])];
    const [item] = newNodesData[nodeIdx].sections[secIdx].subNodes.splice(subIdx, 1);
    newNodesData[nodeIdx].sections[secIdx].subNodes.splice(target, 0, item);
    syncToDB(newNodesData);
  };
  const addSection = (nodeIdx: number) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    if (!newNodesData[nodeIdx].sections) newNodesData[nodeIdx].sections = [];
    newNodesData[nodeIdx].sections.push({ _id: makeId(), name: '', collapsed: false, status: 'pending', subNodes: [] });
    syncToDB(newNodesData);
    void sendProjectUpdateNotification(
      'PROJECT_SECTION_ADDED',
      stableOperationId('project-section-added', getProjectDocId(project), Date.now()),
      '工地新增施工阶段',
      `${myName}为“${project.address || project.customer || '工地'}”新增了施工阶段`,
    );
  };
  const addNode = () => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    newNodesData.push({ _id: makeId(), name: '新节点', collapsed: false, sections: [], craftsmanship: [] });
    syncToDB(newNodesData);
    void sendProjectUpdateNotification(
      'PROJECT_NODE_ADDED',
      stableOperationId('project-node-added', getProjectDocId(project), Date.now()),
      '工地新增施工节点',
      `${myName}为“${project.address || project.customer || '工地'}”新增了施工节点`,
    );
  };

  /* ---- 阶段时间与状态管理 ---- */
  const updateSectionDate = (nodeId: string, secIdx: number, field: 'startDate' | 'endDate', value: string) => {
    if (!project) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    if (field === 'endDate' && node.sections[secIdx].startDate && value < node.sections[secIdx].startDate) {
      alert('结束不可早于开始');
      return;
    }
    node.sections[secIdx][field] = value;
    syncToDB(newNodesData);
  };

  const saveSectionPlanDates = () => {
    if (!project || !showPlanDateModal) return;
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const { nodeId, secIdx, startDate, endDate } = showPlanDateModal;
    if (startDate && endDate && endDate < startDate) {
      alert('计划完工不可早于计划开工');
      return;
    }
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    node.sections[secIdx].startDate = startDate;
    node.sections[secIdx].endDate = endDate;
    syncToDB(newNodesData);
    setShowPlanDateModal(null);
  };

  const startSectionNode = async (nodeId: string, secIdx: number) => {
    const actionKey = `start-${nodeId}-${secIdx}`;
    if (!project || pendingAction) return;
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const newNodesData = [...(project.nodesData || [])];
    const nodeIndex = newNodesData.findIndex((n: any) => n._id === nodeId);
    if (nodeIndex === -1) return;
    const node = newNodesData[nodeIndex];
    const section = node.sections[secIdx];
    if (!section.startDate || !section.endDate) {
      alert('请先设置完整的计划时间');
      return;
    }
    if (await confirmUser('开始后计划时间将无法修改。', { title: '确认开始该施工阶段吗？' })) {
      setPendingAction(actionKey);
      const dateStr = new Date().toISOString().slice(0, 10);
      section.status = 'current';
      section.actualStartDate = dateStr;
      section.startBy = myName;
      
      let updates: any = { nodesData: newNodesData, progressSummary: buildProjectProgressSummary(newNodesData) };
      let newCurrentNode = project.currentNode || 1;
      if (nodeIndex + 1 > newCurrentNode) {
        newCurrentNode = nodeIndex + 1;
        updates.currentNode = newCurrentNode;
      }
      
      setProject({ ...project, ...updates });
      const projectDocId = getProjectDocId(project);
      if (projectDocId) {
        try {
          await projectsAPI.update(projectDocId, updates);
          await addLeadAuditFollowUp({
            leadId: project.leadId || lead?._id,
            lead,
            actorName: myName,
            content: `${myName}开始施工节点：${section.name || node.name}，工地：${project.address || project.customer || '工地'}。`,
          });
          void createNotificationEventSafely({
            operationId: stableOperationId('project-section-started', projectDocId, nodeId, secIdx, dateStr),
            eventType: 'PROJECT_SECTION_STARTED',
            actorUserId: user?.id || '',
            recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
            recipientRoles: ['admin'],
            category: 'project',
            title: '工地节点已开始',
            content: `${myName}开始了“${project.customer || project.address || '工地'}”的“${section.name || node.name}”`,
            link: `/projects-biz/${projectDocId}`,
            relatedTo: { type: 'project', id: projectDocId, name: project.customer || project.address || '工地' },
            channels: ['station', 'wechat'],
          });
        } catch (e) {
          console.error(e);
          alert('开工状态保存失败，请稍后重试');
        } finally {
          setPendingAction(null);
        }
      } else {
        setPendingAction(null);
      }
    }
  };

  const getProjectBlockingUploadTasks = () => {
    const projectId = getProjectDocId(project) || id;
    return uploadTasks.filter(task =>
      task.context?.scope === 'project-node-media' &&
      task.context?.projectId === projectId &&
      ['queued', 'uploading', 'error'].includes(task.status)
    );
  };

  const showBlockingUploadMessage = (tasks: typeof uploadTasks, target: string) => {
    const failedCount = tasks.filter(task => task.status === 'error').length;
    const pendingCount = tasks.length - failedCount;
    if (failedCount > 0) {
      alert(`${target}还有 ${failedCount} 个文件上传失败${pendingCount > 0 ? `、${pendingCount} 个文件正在上传` : ''}，请先重试或移除失败文件后再提交。`);
      return;
    }
    alert(`${target}还有 ${pendingCount} 个文件正在上传，上传并保存完成后才能提交。`);
  };

  const completeSectionNode = async (nodeId: string, secIdx: number) => {
    const actionKey = `submit-${nodeId}-${secIdx}`;
    if (!project || pendingAction) return;
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    const section = node.sections[secIdx];
    const subNodeIds = new Set((section?.subNodes || []).map((subNode: any) => subNode._id));
    const blockingUploads = getProjectBlockingUploadTasks().filter(task =>
      subNodeIds.has(task.context?.subNodeId)
    );
    if (blockingUploads.length > 0) {
      showBlockingUploadMessage(blockingUploads, `“${section?.name || node.name || '当前阶段'}”`);
      return;
    }
    if (await confirmUser('完工提交后将记录为已完成状态，请确认无误后提交！', { title: '确认完工提交吗？' })) {
      setPendingAction(actionKey);
      const now = new Date();
      const pad = (n: number) => n < 10 ? '0' + n : n;
      const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const dateStr = timeStr.split(' ')[0];
      
      if (!section.submitTime) {
         section.submitTime = timeStr;
      } else {
         section.updateTime = timeStr;
      }
      section.submitted = true;
      if (section.status !== 'completed') {
         section.status = 'completed';
         section.actualEndDate = dateStr;
         section.endBy = myName;
         if (!section.actualStartDate) {
           section.actualStartDate = dateStr;
           section.startBy = myName;
         }
      }
      section.subNodes?.forEach((sn: any) => {
        if (sn.status !== 'completed' && sn.status !== 'awaiting_signature') {
          sn.status = 'completed';
          if (!sn.acceptanceRecord) sn.acceptanceRecord = {};
          if (!sn.acceptanceRecord.completedAt) sn.acceptanceRecord.completedAt = timeStr;
          if (!sn.completedBy) sn.completedBy = myName;
        }
      });
      try {
        await syncToDB(newNodesData);
        const projectDocId = getProjectDocId(project);
        if (projectDocId) {
          await addLeadAuditFollowUp({
            leadId: project.leadId || lead?._id,
            lead,
            actorName: myName,
            content: `${myName}完成施工节点：${section.name || node.name}，工地：${project.address || project.customer || '工地'}。`,
          });
          void createNotificationEventSafely({
            operationId: stableOperationId('project-section-completed', projectDocId, nodeId, secIdx, section.submitTime),
            eventType: 'PROJECT_SECTION_COMPLETED',
            actorUserId: user?.id || '',
            recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
            recipientRoles: ['admin'],
            category: 'project',
            title: '工地节点已完成',
            content: `${myName}完成了“${project.customer || project.address || '工地'}”的“${section.name || node.name}”`,
            link: `/projects-biz/${projectDocId}`,
            relatedTo: { type: 'project', id: projectDocId, name: project.customer || project.address || '工地' },
            channels: ['station', 'wechat'],
          });
        }
        setEditingRecordKey(null);
      } finally {
        setPendingAction(null);
      }
    }
  };

  const updateSectionRecordRemark = (nodeId: string, secIdx: number, value: string, persist = false) => {
    if (!project) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    node.sections[secIdx].recordRemark = value;
    if (persist) {
      syncToDB(newNodesData);
    } else {
      setProject({ ...project, nodesData: newNodesData });
    }
  };

  const startEditingSectionRecord = (nodeId: string, secIdx: number) => {
    if (project?.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    setEditingRecordKey(`${nodeId}-${secIdx}`);
    const newNodesData = (project.nodesData || []).map((n: any) => n._id === nodeId ? {
      ...n,
      collapsed: false,
      sections: n.sections.map((s: any, i: number) => i === secIdx ? { ...s, collapsed: false } : s),
    } : n);
    setProject({ ...project, nodesData: newNodesData });
  };

  const saveDelayReason = () => {
    if (!delayReasonModal.reason.trim()) {
      alert('请填写逾期原因');
      return;
    }
    if (!project) return;
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === delayReasonModal.nodeId);
    if (!node) return;
    node.sections[delayReasonModal.secIdx].delayReason = delayReasonModal.reason;
    syncToDB(newNodesData);
    setDelayReasonModal({open: false, nodeId: '', secIdx: -1, name: '', reason: ''});
  };

  /* ---- 节点完成 ---- */
  const toggleSubNodeComplete = async (nodeId: string, secIdx: number, subIdx: number) => {
    if (!project) return;
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    const subNode = node.sections[secIdx].subNodes[subIdx];
    const now = new Date().toISOString();
    
    // 初始化 acceptanceRecord
    if (!subNode.acceptanceRecord) subNode.acceptanceRecord = {};
    
    const isCompleted = subNode.status === 'completed';
    subNode.status = isCompleted ? 'not_started' : 'completed';
    subNode.acceptanceRecord.completedAt = isCompleted ? null : now;
    subNode.acceptanceRecord.completedBy = isCompleted ? null : myName;
    syncToDB(newNodesData);
  };

  /* ---- 编辑节点 ---- */
  const openEditSubNode = (nodeId: string, secIdx: number, subIdx: number) => {
    if (project?.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const node = (project.nodesData || []).find((n: any) => n._id === nodeId);
    if (!node) return;
    const sn = node.sections[secIdx].subNodes[subIdx];
    setEditingSubNode({ nodeId, sectionIdx: secIdx, subIdx });
    setEditSubNodeForm({
      name: sn.name,
      type: normalizeNodeType(sn.type),
      standard: sn.standard || '',
      checklist: (sn.acceptanceRecord?.checklist || []).join('\n'),
    });
  };

  const saveEditSubNode = async () => {
    if (!editingSubNode || !project || pendingAction) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const { nodeId, sectionIdx, subIdx } = editingSubNode;
    const actionKey = `edit-subnode-${nodeId}-${sectionIdx}-${subIdx}`;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    const sn = node.sections[sectionIdx].subNodes[subIdx];
    sn.name = editSubNodeForm.name;
    sn.type = normalizeNodeType(editSubNodeForm.type);
    sn.standard = editSubNodeForm.standard || '';
    if (!sn.acceptanceRecord) sn.acceptanceRecord = {};
    sn.acceptanceRecord.checklist = editSubNodeForm.checklist ? editSubNodeForm.checklist.split('\n').filter(Boolean) : [];
    delete sn.fields;
    setPendingAction(actionKey);
    try {
      await syncToDB(newNodesData);
      const projectDocId = getProjectDocId(project);
      if (projectDocId) {
        void createNotificationEventSafely({
          operationId: stableOperationId('project-subnode-edited', projectDocId, sn._id, Date.now()),
          eventType: 'PROJECT_SUBNODE_EDITED',
          actorUserId: user?.id || '',
          recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
          recipientRoles: ['admin'],
          category: 'project',
          title: '工地节点已编辑',
          content: `${myName}编辑了“${project.address || project.customer || '工地'}”的节点“${sn.name}”`,
          link: `/projects-biz/${projectDocId}`,
          relatedTo: { type: 'project', id: projectDocId, name: project.address || project.customer || '工地' },
          channels: ['station', 'wechat'],
        });
      }
      setEditingSubNode(null);
    } finally {
      setPendingAction(null);
    }
  };

  /* ---- 删除节点 ---- */
  const deleteSubNode = (nodeId: string, secIdx: number, subIdx: number) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    node.sections[secIdx].subNodes.splice(subIdx, 1);
    syncToDB(newNodesData);
    void sendProjectUpdateNotification(
      'PROJECT_SUBNODE_DELETED',
      stableOperationId('project-subnode-deleted', getProjectDocId(project), nodeId, secIdx, subIdx, Date.now()),
      '工地施工项已删除',
      `${myName}删除了“${project.address || project.customer || '工地'}”的一项施工内容`,
    );
  };

  /* ---- 添加节点 ---- */
  const addSubNode = () => {
    if (!showAddNodePanel || !project || !newNodeForm.name.trim()) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const { nodeId, sectionIdx } = showAddNodePanel;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    const newSubNode = {
      _id: makeId(),
      name: newNodeForm.name.trim(),
      type: normalizeNodeType(newNodeForm.type),
      requirePhoto: true,
      requireSign: false,
      fields: [],
      standard: newNodeForm.standard || '',
      standardPublic: true,
      order: (node.sections[sectionIdx].subNodes || []).length,
      status: 'not_started',
      acceptanceRecord: {
        photos: [],
        remark: '',
        formData: {},
        checklist: [],
      }
    };
    if (!node.sections[sectionIdx].subNodes) node.sections[sectionIdx].subNodes = [];
    node.sections[sectionIdx].subNodes.push(newSubNode);
    setShowAddNodePanel(null);
    setNewNodeForm({ name: '', type: DEFAULT_NODE_TYPE, standard: '' });
    syncToDB(newNodesData);
    void sendProjectUpdateNotification(
      'PROJECT_SUBNODE_ADDED',
      stableOperationId('project-subnode-added', getProjectDocId(project), newSubNode._id),
      '工地新增施工内容',
      `${myName}为“${project.address || project.customer || '工地'}”新增了“${newSubNode.name}”`,
    );
  };

  const addBlankSubNode = (nodeId: string, sectionIdx: number) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    if (!node.sections[sectionIdx].subNodes) node.sections[sectionIdx].subNodes = [];
    node.sections[sectionIdx].subNodes.push({
      _id: makeId(),
      name: '',
      type: DEFAULT_NODE_TYPE,
      requirePhoto: true,
      requireSign: false,
      standard: '',
      standardPublic: true,
      order: node.sections[sectionIdx].subNodes.length,
      status: 'not_started',
      acceptanceRecord: { photos: [], remark: '', formData: {}, checklist: [] },
    });
    syncToDB(newNodesData);
    void sendProjectUpdateNotification(
      'PROJECT_SUBNODE_ADDED',
      stableOperationId('project-subnode-added', getProjectDocId(project), nodeId, sectionIdx, Date.now()),
      '工地新增施工内容',
      `${myName}为“${project.address || project.customer || '工地'}”新增了施工内容`,
    );
  };

  const updateSubNodeName = (nodeIdx: number, secIdx: number, subIdx: number, value: string) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    newNodesData[nodeIdx].sections[secIdx].subNodes[subIdx].name = value;
    setProject({ ...project, nodesData: newNodesData });
  };

  /* ---- 照片 ---- */
  const triggerSubNodePhoto = (subNodeId: string) => {
    if (!canManageConstruction) return;
    setTargetSubNodeId(subNodeId);
    nodeFileInputRef.current?.click();
  };

  const getShortNodeName = (targetInfo: any) => {
    const rawName = targetInfo?.nodeName || targetInfo?.sectionName || targetInfo?.subNode?.name || '施工节点';
    return String(rawName)
      .split(/\r?\n|[：:；;]/)[0]
      .trim()
      .slice(0, 20) || '施工节点';
  };

  const handleSubNodePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !targetSubNodeId || !project) return;
    if (!canManageConstruction) {
      e.target.value = '';
      return;
    }
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      e.target.value = '';
      return;
    }

    const subNodeId = targetSubNodeId;
    const uploadBatchId = makeId();
    const projectDocId = getProjectDocId(project);
    const targetInfo = (project.nodesData || []).flatMap((node: any) =>
      (node.sections || []).flatMap((section: any) =>
        (section.subNodes || []).map((sn: any) => ({ nodeName: node.name, sectionName: section.name, subNode: sn }))
      )
    ).find((item: any) => item.subNode?._id === subNodeId);
    const projectName = project.address || project.customer || '工地';
    const nodeName = getShortNodeName(targetInfo);
    const uploadLabel = files.every((file) => file.type.startsWith('image/'))
      ? `${files.length}张图片`
      : `${files.length}个现场文件`;

    addUploadTasks(files.map(file => ({
      file,
      fileName: file.name,
      fileSize: file.size,
      folder: 'project/nodes',
      title: `工地节点 / ${targetInfo?.sectionName || '施工记录'} / ${targetInfo?.subNode?.name || '检查项'}`,
      context: { scope: 'project-node-media', projectId: projectDocId || id, subNodeId },
      onSuccess: async ({ fileID }) => {
        if (!projectDocId) return;
        const latestData = await projectsAPI.doc(projectDocId).get();
        const latestProject = Array.isArray(latestData) ? latestData[0] : latestData;
        const newNodesData = [...(latestProject?.nodesData || [])];
        for (const node of newNodesData) {
          for (const section of node.sections || []) {
            const sn = (section.subNodes || []).find((s: any) => s._id === subNodeId);
            if (!sn) continue;
            if (!sn.acceptanceRecord) sn.acceptanceRecord = { photos: [] };
            if (!sn.acceptanceRecord.photos) sn.acceptanceRecord.photos = [];
            const isVideo = file.type.startsWith('video/');
            sn.acceptanceRecord.photos.push({
              fileID,
              url: fileID,
              type: isVideo ? 'video' : 'image',
              name: file.name,
              size: file.size,
              sizeStr: (file.size / 1024).toFixed(1) + 'KB',
              uploader: myName,
              uploadTime: new Date().toISOString(),
            });
            const progressSummary = buildProjectProgressSummary(newNodesData);
            await projectsAPI.update(projectDocId, { nodesData: newNodesData, progressSummary });
            void createNotificationEventSafely({
              operationId: stableOperationId('project-subnode-files-uploaded', projectDocId, uploadBatchId),
              eventType: 'PROJECT_SUBNODE_FILES_UPLOADED',
              actorUserId: user?.id || '',
              recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
              recipientRoles: ['admin'],
              category: 'project',
              title: '工地节点上传资料',
              content: `${myName}在“${projectName}”的“${nodeName}”上传了${uploadLabel}`,
              link: `/projects-biz/${projectDocId}`,
              relatedTo: { type: 'project', id: projectDocId, name: projectName },
              channels: ['station', 'wechat'],
            });
            setProject((prev: any) => prev ? { ...prev, nodesData: newNodesData, progressSummary } : prev);
            return;
          }
        }
      },
    })));

    e.target.value = '';
    setUploadingSubNode(null);
    setTargetSubNodeId(null);
  };

  const openPreview = async (photo: any, allPhotos: any[] = [photo], deleteContext: { nodeId: string; secIdx: number; subIdx: number; photoIdx: number } | null = null) => {
    if (isPreviewLoading) return;
    setIsPreviewLoading(true);
    setPreviewError('');
    previewRequestRef.current = { photo, allPhotos, deleteContext };
    
    const isMiniProgram = isMiniProgramWebView();
    
    // 非小程序环境：立即显示web弹窗（加载中状态）
    if (!isMiniProgram) {
      setPreviewImages([{ url: '', isVideo: false }]);
      setPreviewIndex(0);
      setCurrentPhotoDeleteContext(deleteContext);
      setShowPreviewModal(true);
    }
    
    try {
      const previewSources = allPhotos.map((p: any) => {
        const rawUrl = p.url || p.fileID;
        if (!rawUrl) return null;
        const source = normalizeCloudMediaSource(rawUrl);
        return { photo: p, rawUrl, source };
      }).filter(Boolean) as { photo: any; rawUrl: string; source: string }[];

      const targetSource = mediaSourceOf(photo);

      if (isMiniProgram && previewSources.length > 0) {
        let targetIndex = previewSources.findIndex(item => (
          item.photo === photo || (!!targetSource && mediaSourceOf(item.photo) === targetSource)
        ));
        if (targetIndex < 0) targetIndex = 0;

        const nativeOpened = openNativeMediaPreview(previewSources.map(item => ({
          url: item.source,
          type: item.photo.type === 'video' || VIDEO_MEDIA_PATTERN.test(item.rawUrl) ? 'video' : 'image',
        })), targetIndex);

        if (nativeOpened) {
          setShowPreviewModal(false);
          setIsPreviewLoading(false);
          return;
        }
      }

      const cloudSources = Array.from(new Set(previewSources.filter(item => item.source.startsWith('cloud://')).map(item => item.source)));
      const tempUrlMap = cloudSources.length > 0 ? await Promise.race([
        getTempFileURL(cloudSources),
        new Promise<Record<string, string>>((_, reject) => {
          window.setTimeout(() => reject(new Error('获取图片地址超时')), 15000);
        }),
      ]) : {};
      const images = [];
      let targetIndex = 0;

      for (const item of previewSources) {
        const p = item.photo;
        let finalUrl = item.source;
        const isVideoSource = p.type === 'video' || VIDEO_MEDIA_PATTERN.test(item.rawUrl);
        if (finalUrl.startsWith('cloud://')) {
          finalUrl = tempUrlMap[finalUrl] || finalUrl.replace(/^cloud:\/\/[^.]+\.([^/]+)\//, 'https://$1.tcb.qcloud.la/');
        }
        
        const isVideo = isVideoSource || VIDEO_MEDIA_PATTERN.test(finalUrl);
        images.push({
          url: finalUrl,
          isVideo,
          source: item.source,
          ...(isVideo ? { poster: normalizeVideoPoster(p.poster || p.thumbUrl || p.thumbTempFilePath) } : {}),
        });

        if (p === photo || (!!targetSource && mediaSourceOf(p) === targetSource)) {
          targetIndex = images.length - 1;
        }
      }

      if (images.length > 0) {
        if (isMiniProgram) {
          console.warn('[ProjectBizDetail] 原生预览不可用，跳过');
          setIsPreviewLoading(false);
          return;
        }
        setPreviewImages(images);
        setPreviewIndex(targetIndex);
      }
      setIsPreviewLoading(false);
    } catch (e) {
      console.error(e);
      if (isMiniProgram) {
        // 小程序环境：静默失败，不弹alert
        setIsPreviewLoading(false);
      } else {
        setPreviewError(e instanceof Error ? e.message : '获取预览链接失败');
        setIsPreviewLoading(false);
      }
    }
  };

  const deletePhoto = async (nodeId: string, secIdx: number, subIdx: number, photoIdx: number) => {
    if (!project) return;
    if (!canManageConstruction) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    node.sections[secIdx].subNodes[subIdx].acceptanceRecord.photos.splice(photoIdx, 1);
    syncToDB(newNodesData);
  };

  const updateProjectCraftsmanship = (nodeId: string, craftIdx: number, updates: any, persist = false) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    if (!node.craftsmanship) node.craftsmanship = [];
    node.craftsmanship[craftIdx] = { ...(node.craftsmanship[craftIdx] || {}), ...updates };
    if (persist) syncToDB(newNodesData);
    else setProject({ ...project, nodesData: newNodesData });
  };

  const addProjectCraftsmanship = (nodeId: string) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node) return;
    if (!node.craftsmanship) node.craftsmanship = [];
    node.craftsmanship.push({ text: '', images: [] });
    setProject({ ...project, nodesData: newNodesData });
    syncToDB(newNodesData);
  };

  const removeProjectCraftsmanship = (nodeId: string, craftIdx: number) => {
    if (!project) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') return;
    const newNodesData = [...(project.nodesData || [])];
    const node = newNodesData.find((n: any) => n._id === nodeId);
    if (!node?.craftsmanship) return;
    node.craftsmanship.splice(craftIdx, 1);
    setProject({ ...project, nodesData: newNodesData });
    syncToDB(newNodesData);
  };

  const uploadProjectCraftsmanshipImages = async (nodeId: string, craftIdx: number, files: FileList | null) => {
    if (!project || !files || files.length === 0) return;
    if (!canManageConstructionStructure) return;
    if (project.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    const actionKey = `craft-${nodeId}-${craftIdx}`;
    if (uploadingSubNode || pendingAction) return;
    setPendingAction(actionKey);
    try {
      const newNodesData = [...(project.nodesData || [])];
      const node = newNodesData.find((n: any) => n._id === nodeId);
      if (!node) return;
      if (!node.craftsmanship) node.craftsmanship = [];
      if (!node.craftsmanship[craftIdx]) node.craftsmanship[craftIdx] = { text: '', images: [] };
      if (!node.craftsmanship[craftIdx].images) node.craftsmanship[craftIdx].images = [];
      for (let i = 0; i < files.length; i++) {
        const result = await uploadToCloud(files[i], 'project/craftsmanship');
        node.craftsmanship[craftIdx].images.push(result.fileID);
      }
      await syncToDB(newNodesData);
    } catch (e) {
      console.error('上传工艺标准图片失败', e);
      alert('上传图片失败，请稍后重试');
    } finally {
      setPendingAction(null);
    }
  };

  /* ---- 模板套用 ---- */
  const openTemplateModal = async () => {
    if (!canManageConstructionStructure) return;
    if (project?.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    setShowTemplateModal(true);
    setLoadingTemplate(true);
    try {
      const res = await cloudDB.collection('system_configs').doc('default_project_template').get();
      const data = Array.isArray(res.data) ? res.data[0] : res.data;
      if (data && data.nodesData) {
        setCloudTemplate(data.nodesData);
      } else {
        setCloudTemplate([]);
      }
    } catch (e) {
      console.error('获取云端模板失败', e);
      setCloudTemplate([]);
    }
    setLoadingTemplate(false);
  };

  const applyTemplate = async () => {
    if (!canManageConstructionStructure) return;
    if (project?.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    if (!await confirmUser(
      '此操作将拉取最新模板，覆盖当前所有的【排期结构和工艺标准】。已完工的验收数据可能丢失，建议仅在未开工时使用。',
      { title: '确定要继续吗？', confirmStyle: 'danger' },
    )) return;
    
    try {
      const res = await cloudDB.collection('system_configs').doc('default_project_template').get();
      const data = Array.isArray(res.data) ? res.data[0] : res.data;
      if (!data || !data.nodesData) {
        alert('模板库为空');
        return;
      }
      
      const newNodesData = JSON.parse(JSON.stringify(data.nodesData));
      newNodesData.forEach((node: any) => {
        if (!node._id) node._id = makeId();
        node.status = 'pending';
        node.aggregateStatus = '待开始';
        node.collapsed = true;
        node.editCollapsed = true;
        node.sections?.forEach((sec: any) => {
          sec.status = 'pending';
          sec.collapsed = true;
          sec.editCollapsed = true;
          sec.subNodes?.forEach((sn: any) => {
            if (!sn._id) sn._id = makeId();
            sn.status = 'pending';
            if (!sn.acceptanceRecord) sn.acceptanceRecord = { photos: [], remark: '', formData: {}, checklist: [] };
          });
        });
      });
      const progressSummary = buildProjectProgressSummary(newNodesData);
      setProject({ ...project, nodesData: newNodesData, progressSummary });
      const projectDocId = getProjectDocId(project);
      if (projectDocId) {
        await projectsAPI.update(projectDocId, { nodesData: newNodesData, progressSummary });
        void sendProjectUpdateNotification(
          'PROJECT_TEMPLATE_APPLIED',
          stableOperationId('project-template-applied', projectDocId, Date.now()),
          '工地施工模板已更新',
          `${myName}为“${project.address || project.customer || '工地'}”重新套用了施工模板`,
        );
      }
      alert('同步成功');
    } catch (e) {
      console.error('获取云端模板失败', e);
      alert('拉取失败');
    }
  };

  const handleSaveLog = async () => {
    if (!newLogForm.content.trim() || !newLogForm.stage || isSubmittingLog) return;
    if (project?.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    setIsSubmittingLog(true);
    try {
      const logId = editingLog?.id || makeId();
      const logPayload = {
        stage: newLogForm.stage,
        content: newLogForm.content,
        photos: newLogForm.photos,
        visibleToCustomer: newLogForm.visibleToCustomer,
        updatedAt: new Date().toISOString(),
      };
      if (editingLog) {
        await projectLogsAPI.update(logId, logPayload);
      } else {
        await projectLogsAPI.add({
          id: logId,
          projectId: id,
          ...logPayload,
          creatorName: myName,
          createdAt: new Date().toISOString(),
        });
      }
      await addLeadAuditFollowUp({
        leadId: project?.leadId || lead?._id,
        lead,
        actorName: myName,
        content: `${myName}${editingLog ? '更新' : '新增'}施工日志：阶段“${newLogForm.stage}”，内容：${newLogForm.content.trim().slice(0, 100)}。`,
      });
      void createNotificationEventSafely({
        operationId: stableOperationId(editingLog ? 'project-log-updated' : 'project-log-created', id, logId),
        eventType: editingLog ? 'PROJECT_LOG_UPDATED' : 'PROJECT_LOG_CREATED',
        actorUserId: user?.id || '',
        recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
        recipientRoles: ['admin'],
        category: 'project',
        title: editingLog ? '施工日志已更新' : '新增施工日志',
        content: `${myName}为“${project.customer || project.address || '工地'}”${editingLog ? '更新了' : '新增了'}施工日志`,
        link: `/projects-biz/${id}`,
        relatedTo: { type: 'project', id: id || '', name: project.customer || project.address || '工地' },
        channels: ['station', 'wechat'],
      });
      setShowLogModal(false);
      setEditingLog(null);
      setNewLogForm({ stage: '', content: '', photos: [], visibleToCustomer: true });
      loadLogsAndInspections();
    } catch (e) {
      alert('保存日志失败，请确保数据库中已创建 project_logs 集合。');
      console.error(e);
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const openNewLogModal = () => {
    setEditingLog(null);
    setNewLogForm({ stage: '', content: '', photos: [], visibleToCustomer: true });
    setShowLogModal(true);
  };

  const openEditLogModal = (log: ProjectLog) => {
    setEditingLog(log);
    setNewLogForm({
      stage: log.stage || '',
      content: log.content || '',
      photos: (log.photos || []) as string[],
      visibleToCustomer: log.visibleToCustomer !== false,
    });
    setSwipedLogId(null);
    setShowLogModal(true);
  };

  const handleDeleteLog = async (log: ProjectLog) => {
    if (!await confirmUser('删除后无法恢复。', { title: '确认删除这条施工日志吗？', confirmStyle: 'danger', confirmText: '删除' })) return;
    try {
      await projectLogsAPI.delete(log.id);
      void createNotificationEventSafely({
        operationId: stableOperationId('project-log-deleted', id, log.id),
        eventType: 'PROJECT_LOG_DELETED',
        actorUserId: user?.id || '',
        recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
        recipientRoles: ['admin'],
        category: 'project',
        title: '施工日志已删除',
        content: `${myName}为“${project.customer || project.address || '工地'}”删除了一条施工日志`,
        link: `/projects-biz/${id}`,
        relatedTo: { type: 'project', id: id || '', name: project.customer || project.address || '工地' },
        channels: ['station', 'wechat'],
      });
      setSwipedLogId(null);
      await loadLogsAndInspections();
    } catch (error) {
      console.error('delete project log failed', error);
      alert('删除施工日志失败，请稍后重试。');
    }
  };

  const canDeleteInspection = (inspection: ProjectInspection) => {
    if (isAdmin) return true;
    const raw = inspection as any;
    return raw.inspectorId === user?.id || raw.createdBy === user?.id || inspection.inspectorName === myName;
  };

  const handleDeleteInspection = async (inspection: ProjectInspection) => {
    const inspectionId = String((inspection as any)._id || inspection.id || '');
    if (!inspectionId) return;
    if (!await confirmUser('删除后无法恢复。', { title: '确认删除这条工地巡检吗？', confirmStyle: 'danger', confirmText: '删除' })) return;
    try {
      await projectInspectionsAPI.delete(inspectionId);
      void createNotificationEventSafely({
        operationId: stableOperationId('project-inspection-deleted', id, inspectionId),
        eventType: 'PROJECT_INSPECTION_DELETED',
        actorUserId: user?.id || '',
        recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
        recipientRoles: ['admin'],
        category: 'project',
        title: '工地巡检已删除',
        content: `${myName}为“${project.customer || project.address || '工地'}”删除了一条工地巡检记录`,
        link: `/projects-biz/${id}/inspections`,
        relatedTo: { type: 'project', id: id || '', name: project.customer || project.address || '工地' },
        channels: ['station', 'wechat'],
      });
      setSwipedInspectionId(null);
      await loadLogsAndInspections();
    } catch (error) {
      console.error('delete project inspection failed', error);
      alert('删除工地巡检失败，请稍后重试。');
    }
  };

  const handleSaveInspection = async () => {
    if (!newInspectionForm.title.trim() || isSubmittingInspection) return;
    if (project?.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    setIsSubmittingInspection(true);
    try {
      const inspectionId = makeId();
      await projectInspectionsAPI.add({
        id: inspectionId,
        projectId: id,
        title: newInspectionForm.title,
        status: newInspectionForm.status,
        description: newInspectionForm.description,
        photos: newInspectionForm.photos,
        inspectorName: myName,
        inspectorId: user?.id || '',
        createdBy: user?.id || myName,
        createdAt: new Date().toISOString(),
      });
      await addLeadAuditFollowUp({
        leadId: project?.leadId || lead?._id,
        lead,
        actorName: myName,
        content: `${myName}新增工地巡检：${newInspectionForm.title}，状态：${newInspectionForm.status}。${newInspectionForm.description ? `说明：${newInspectionForm.description.slice(0, 100)}` : ''}`,
      });

      void createNotificationEventSafely({
        operationId: stableOperationId('project-inspection-created', id, inspectionId),
        eventType: 'PROJECT_INSPECTION_CREATED',
        actorUserId: user?.id || '',
        recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
        recipientRoles: ['admin'],
        category: 'project',
        title: '新增工地巡检',
        content: `${myName}为“${project.customer || project.address || '工地'}”新增了${newInspectionForm.status}巡检记录`,
        link: `/projects-biz/${id}`,
        relatedTo: { type: 'project', id: id || '', name: project.customer || project.address || '工地' },
        channels: ['station', 'wechat'],
      });
      
      // 如果需要整改，且当前工地有项目经理，则自动为项目经理创建一条待办事项
      if (newInspectionForm.status === '需整改' && project?.manager) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3); // 默认3天内完成整改
        
        const managerUserIds = await resolveUserIdsByNames(project.manager);
        const managerUsers = managerUserIds.map((managerId, index) => ({
          id: managerId,
          name: toPersonArray(project.manager)[index] || toPersonArray(project.manager)[0] || '项目经理',
        }));
        await todosAPI.add({
          _id: makeId(),
          title: `[整改] ${project.customer || '未知客户'} - ${newInspectionForm.title}`,
          description: `巡检人：${myName}\n巡检意见：${newInspectionForm.description}\n请尽快前往“工地详情-工地巡检”中提交整改反馈。`,
          priority: 'high',
          dueDate: dueDate.toISOString().slice(0, 10),
          status: 'pending',
          assignees: managerUsers,
          creatorId: user?.id || myName,
          creatorName: myName,
          createdAt: new Date().toISOString(),
          relatedTo: { type: 'project', id: id || '', name: project.customer || '工地整改' },
          attachments: [],
        });
        void createNotificationEventSafely({
          operationId: stableOperationId('inspection-rectification-required', id, inspectionId),
          eventType: 'INSPECTION_RECTIFICATION_REQUIRED',
          actorUserId: user?.id || '',
          recipientUserIds: managerUserIds,
          category: 'project',
          title: '工地巡检待整改',
          content: `“${project.customer || project.address || '工地'}”有新的整改任务：${newInspectionForm.title}`,
          link: `/projects-biz/${id}`,
          relatedTo: { type: 'project', id: id || '', name: project.customer || project.address || '工地' },
          channels: ['station', 'wechat'],
        });
      }

      setShowInspectionModal(false);
      setNewInspectionForm({ title: '', status: '合格', description: '', photos: [] });
      loadLogsAndInspections();
    } catch (e) {
      alert('保存巡检失败，请确保数据库中已创建 project_inspections 集合。');
      console.error(e);
    } finally {
      setIsSubmittingInspection(false);
    }
  };

  const handleSaveRectify = async () => {
    if (!showRectifyModal || !rectifyForm.rectifyDescription.trim() || isSubmittingRectify) return;
    if (project?.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    setIsSubmittingRectify(true);
    try {
      const inspectionId = showRectifyModal.id || (showRectifyModal as any)._id;
      const submittedAt = new Date().toISOString();
      await projectInspectionsAPI.update(inspectionId, {
        status: '整改待验收',
        rectifyDescription: rectifyForm.rectifyDescription,
        rectifyPhotos: rectifyForm.rectifyPhotos,
        rectifyManagerName: myName,
        rectifySubmittedAt: submittedAt,
      });
      void createNotificationEventSafely({
        operationId: stableOperationId('inspection-rectification-submitted', id, inspectionId, submittedAt),
        eventType: 'INSPECTION_RECTIFICATION_SUBMITTED',
        actorUserId: user?.id || '',
        recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
        recipientRoles: ['admin'],
        category: 'project',
        title: '整改已完成待验收',
        content: `${myName}提交了“${project.customer || project.address || '工地'}”的整改结果`,
        link: `/projects-biz/${id}`,
        relatedTo: { type: 'project', id: id || '', name: project.customer || project.address || '工地' },
        channels: ['station', 'wechat'],
      });
      setShowRectifyModal(null);
      setRectifyForm({ rectifyDescription: '', rectifyPhotos: [] });
      loadLogsAndInspections();
    } catch (e) {
      alert('提交整改失败');
      console.error(e);
    } finally {
      setIsSubmittingRectify(false);
    }
  };

  const handleAcceptRectify = async (inspection: any) => {
    if (project?.status === '已完工') {
      alert('工地已完工，仅支持预览。如需修改，请先恢复为施工中。');
      return;
    }
    if (!await confirmUser('确认后该整改将标记为已合格。', { title: '确认该整改已合格？' })) return;
    try {
      await projectInspectionsAPI.update(inspection.id || inspection._id, {
        status: '整改通过',
      });
      const acceptedAt = new Date().toISOString();
      void createNotificationEventSafely({
        operationId: stableOperationId('inspection-rectification-accepted', id, inspection.id || inspection._id, acceptedAt),
        eventType: 'INSPECTION_RECTIFICATION_ACCEPTED',
        actorUserId: user?.id || '',
        recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
        recipientRoles: ['admin'],
        category: 'project',
        title: '工地整改已验收',
        content: `${myName}通过了“${project.customer || project.address || '工地'}”的整改验收`,
        link: `/projects-biz/${id}`,
        relatedTo: { type: 'project', id: id || '', name: project.customer || project.address || '工地' },
        channels: ['station', 'wechat'],
      });
      loadLogsAndInspections();
    } catch (e) {
      alert('验收整改失败');
    }
  };


  const getCompletionChecks = useCallback(() => {
    const nodes = project?.nodesData || [];
    const unfinished: string[] = [];

    nodes.forEach((node: any) => {
      (node.sections || []).forEach((section: any) => {
        const sectionName = `${node.name || '阶段'} / ${section.name || '工序'}`;
        const subNodes = section.subNodes || [];
        if (subNodes.length === 0) {
          if (!(section.status === 'completed' || section.submitted)) {
            unfinished.push(sectionName);
          }
        } else {
          subNodes.forEach((sn: any) => {
            if (!(sn.status === 'completed' || sn.submitted)) {
              unfinished.push(`${sectionName} / ${sn.name || '检查项'}`);
            }
          });
        }
      });
    });

    const pendingRectifications = inspections.filter((inspection: any) =>
      ['需整改', '整改待验收'].includes(inspection.status)
    );

    return {
      unfinished,
      pendingRectifications,
    };
  }, [project?.nodesData, inspections]);

  const openCompletionModal = () => {
    const blockingUploads = getProjectBlockingUploadTasks();
    if (blockingUploads.length > 0) {
      showBlockingUploadMessage(blockingUploads, '当前工地');
      return;
    }
    setCompletionDate(project?.endDate ? project.endDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setShowCompletionModal(true);
  };

  const handleCompleteProject = async () => {
    if (!project || pendingAction) return;
    const blockingUploads = getProjectBlockingUploadTasks();
    if (blockingUploads.length > 0) {
      showBlockingUploadMessage(blockingUploads, '当前工地');
      return;
    }
    const projectDocId = getProjectDocId(project);
    if (!projectDocId) return;
    setPendingAction('complete-project');
    try {
      const now = new Date().toISOString();
      const completedDate = completionDate || now.slice(0, 10);
      const updates = {
        status: '已完工',
        completedAt: now,
        completedBy: myName,
        endDate: completedDate,
      };
      await projectsAPI.update(projectDocId, updates);
      const recipientUserIds = await resolveProjectParticipantUserIds(project, lead);
      void createNotificationEventSafely({
        operationId: stableOperationId('project-completed', projectDocId, now),
        eventType: 'PROJECT_COMPLETED',
        actorUserId: user?.id || '',
        recipientUserIds,
        recipientRoles: ['admin'],
        category: 'project',
        title: '工地已标记完工',
        content: `${myName}将“${project.address || project.customer || '工地'}”标记为完工，完工日期${completedDate}`,
        link: `/projects-biz/${projectDocId}`,
        relatedTo: { type: 'project', id: projectDocId, name: project.address || project.customer || '工地' },
        channels: ['station', 'wechat'],
      });
      setProject((prev: any) => prev ? { ...prev, ...updates } : prev);
      setShowCompletionModal(false);
      setEditMode(false);
      setIsEditingNodes(false);
      setEditingRecordKey(null);
    } finally {
      setPendingAction(null);
    }
  };

  const handleReopenProject = async () => {
    if (!project || pendingAction) return;
    const confirmed = await confirmUser('恢复后将重新开放施工进度、日志和巡检编辑入口。', { title: '确认恢复为施工中？' });
    if (!confirmed) return;
    const projectDocId = getProjectDocId(project);
    if (!projectDocId) return;
    setPendingAction('reopen-project');
    try {
      const now = new Date().toISOString();
      const updates = {
        status: '施工中',
        reopenedAt: now,
        reopenedBy: myName,
      };
      await projectsAPI.update(projectDocId, updates);
      void createNotificationEventSafely({
        operationId: stableOperationId('project-reopened', projectDocId, now),
        eventType: 'PROJECT_REOPENED',
        actorUserId: user?.id || '',
        recipientUserIds: await resolveProjectParticipantUserIds(project, lead),
        recipientRoles: ['admin'],
        category: 'project',
        title: '工地已恢复施工',
        content: `${myName}将“${project.address || project.customer || '工地'}”恢复为施工中`,
        link: `/projects-biz/${projectDocId}`,
        relatedTo: { type: 'project', id: projectDocId, name: project.address || project.customer || '工地' },
        channels: ['station', 'wechat'],
      });
      setProject((prev: any) => prev ? { ...prev, ...updates } : prev);
    } finally {
      setPendingAction(null);
    }
  };


  /* ---- 统计 ---- */
  const progressSummary = buildProjectProgressSummary(project?.nodesData || []);
  const progressedCount = progressSummary.progressedSubNodes;
  const totalCount = progressSummary.totalSubNodes;
  const progress = progressSummary.progressPercent;

  const handleCompleteProjectTodo = async (todo: any) => {
    if (!todo?._id || completingTodoId) return;
    setCompletingTodoId(todo._id);
    try {
      const completedAt = new Date().toISOString();
      await todosAPI.update(todo._id, { status: 'completed', completedAt, updatedAt: completedAt });
      setProjectTodos(current => current.filter(item => item._id !== todo._id));
      void createNotificationEventSafely({
        operationId: stableOperationId('todo-completed-from-project', todo._id, completedAt),
        eventType: 'TODO_COMPLETED',
        actorUserId: user?.id || '',
        recipientUserIds: [todo.creatorId, ...(todo.assignees || []).map((assignee: any) => assignee.id)].filter(Boolean),
        recipientRoles: ['admin'],
        category: 'todo',
        title: '工地待办已完成',
        content: `${myName}完成了“${todo.title}”`,
        link: `/todos?todoId=${todo._id}`,
        relatedTo: { type: 'todo', id: todo._id, name: todo.title },
        channels: ['station', 'wechat'],
        templateId: TODO_NOTIFICATION_TEMPLATE_ID,
        templateData: {
          thing1: { value: String(todo.title || '工地待办').slice(0, 20) },
          time2: { value: completedAt.slice(0, 16).replace('T', ' ') },
          thing3: { value: myName.slice(0, 20) },
          thing4: { value: '管理员' },
        },
      });
    } finally {
      setCompletingTodoId(null);
    }
  };

  const openQuickTodoModal = () => {
    setQuickTodoForm({ title: '', dueDate: todayDateValue() });
    setShowQuickTodoModal(true);
  };

  const handleCreateQuickTodo = async () => {
    const title = quickTodoForm.title.trim();
    if (!title || !quickTodoForm.dueDate || submittingQuickTodo) return;
    setSubmittingQuickTodo(true);
    try {
      const managerNames = toPersonArray(project.manager);
      if (managerNames.length === 0) {
        alert('当前工地尚未设置项目经理，请先完善工地资料。');
        return;
      }
      const managerAccounts = await Promise.all(managerNames.map(async name => ({
        name,
        userIds: await resolveUserIdsByNames(name),
      })));
      const unresolvedManagerNames = managerAccounts.filter(item => item.userIds.length === 0).map(item => item.name);
      if (unresolvedManagerNames.length > 0) {
        alert(`以下项目经理未找到有效 ERP 账号，暂时无法创建并发送待办提醒：${unresolvedManagerNames.join('、')}。请先检查工地负责人和员工账号。`);
        return;
      }
      const managerUserIds = [...new Set(managerAccounts.flatMap(item => item.userIds))];
      const assignees = managerAccounts.map(({ name, userIds }) => {
        const employee = employees.find((item: any) => item.name === name);
        return { id: userIds[0] || employee?._id || employee?.id || '', name };
      }).filter((item: any) => item.id || item.name);
      const todo = {
        _id: generateId(),
        title,
        description: '',
        priority: 'high',
        dueDate: quickTodoForm.dueDate,
        status: 'pending',
        assignees,
        creatorId: user?.id || '',
        creatorName: myName,
        createdAt: new Date().toISOString(),
        relatedTo: {
          type: 'project',
          id: project._id || id,
          name: `${project.customer || ''}${project.address ? ` - ${project.address}` : ''}`.replace(/^\s*-\s*/, ''),
        },
        attachments: [],
      };
      await todosAPI.add(todo);
      setProjectTodos(current => [...current, todo].sort((a: any, b: any) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))));
      setShowQuickTodoModal(false);
      setQuickTodoForm({ title: '', dueDate: todayDateValue() });
      void createNotificationEventSafely({
        operationId: stableOperationId('todo-assigned', todo._id),
        eventType: 'TODO_ASSIGNED',
        actorUserId: user?.id || '',
        recipientUserIds: managerUserIds,
        category: 'todo',
        title: '工地新增待办',
        content: `${myName}为“${project.address || project.customer || '工地'}”新增了待办“${title}”`,
        link: `/projects-biz/${project._id || id}`,
        relatedTo: { type: 'todo', id: todo._id, name: title },
        channels: ['station', 'wechat'],
        templateId: TODO_NOTIFICATION_TEMPLATE_ID,
        templateData: {
          thing1: { value: title.slice(0, 20) },
          time2: { value: quickTodoForm.dueDate },
          thing3: { value: myName.slice(0, 20) },
          thing4: { value: managerNames.join('、').slice(0, 20) },
        },
      });
    } catch (error) {
      console.error('创建工地待办失败', error);
      alert('待办创建失败，请稍后重试。');
    } finally {
      setSubmittingQuickTodo(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <HardHat className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-400 text-sm">工地不存在</p>
        <button onClick={() => smartBack()} className="mt-4 px-4 py-2 bg-gold-400 text-black rounded-lg text-sm">返回工地列表</button>
      </div>
    );
  }

  const canEdit = isAdmin || project.creatorName === myName || includesPerson(project.manager, myName) || includesPerson(project.designer, myName) || (lead && includesPerson(lead.sales, myName));
  const isProjectCompleted = project.status === '已完工';
  const canEditSite = canEdit && !isProjectCompleted;
  const canManageConstruction = !isAdmin && includesPerson(project.manager, myName) && !isProjectCompleted;
  const canManageConstructionStructure = isAdmin && !isProjectCompleted;
  const canCreateProjectTodo = isAdmin || includesPerson(project.manager, myName);
  const canEditProjectInfo = canEdit && !isProjectCompleted;
  const canShareCustomerProgress = isAdmin
    || project.creatorName === myName
    || includesPerson(project.sales, myName)
    || includesPerson(project.designer, myName)
    || includesPerson(project.manager, myName)
    || includesPerson(lead?.sales, myName)
    || includesPerson(lead?.designer, myName)
    || includesPerson(lead?.manager, myName);
  const canCompleteTodo = (todo: any) => isAdmin || includesPerson(project.manager, myName) || (todo.assignees || []).some((assignee: any) => assignee.id === user?.id || assignee.name === myName);
  const completionChecks = getCompletionChecks();
  const completionIssueCount = completionChecks.unfinished.length + completionChecks.pendingRectifications.length;
  const relatedContract = contracts?.[0];
  const currentNodeName = progressSummary.currentNodeName || progressSummary.nodeName || '';
  const selectedStage = isStageDetail ? project.nodesData?.[stageDetailIndex] : null;
  const selectedStageSummary = isStageDetail ? progressSummary.stageStatuses[stageDetailIndex] : null;
  const selectedStageSections = selectedStage?.sections || [];
  const selectedStageActualStarts = selectedStageSections.map((item: any) => item.actualStartDate).filter(Boolean);
  const selectedStageActualEnds = selectedStageSections.map((item: any) => item.actualEndDate).filter(Boolean);
  const selectedStagePercent = selectedStageSummary?.stageTotal > 0
    ? Math.min(100, Math.round((selectedStageSummary.stageProgressed / selectedStageSummary.stageTotal) * 100))
    : selectedStageSummary?.status === 'completed' ? 100 : 0;
  const selectedStageStatus = selectedStageSummary?.status === 'completed' ? '已完成' : selectedStageSummary?.status === 'current' ? '施工中' : '待开始';
  const selectedStageDateText = selectedStageActualStarts.length > 0
    ? `${String(selectedStageActualStarts[0]).slice(5, 10)} ~ ${selectedStageSummary?.status === 'current' ? '至今' : String(selectedStageActualEnds[selectedStageActualEnds.length - 1] || selectedStageActualStarts[0]).slice(5, 10)}`
    : '尚未开工';
  const selectedStageId = String(selectedStage?._id || selectedStage?.id || '');
  const selectedStageWorkerSchedule = projectWorkerSchedules.find((item) => item.stageId === selectedStageId && item.status !== 'cancelled');
  const selectedStageWorker = selectedStageWorkerSchedule
    ? workers.find((item) => workerIdOf(item) === selectedStageWorkerSchedule.workerId)
    : undefined;
  const profileWorker = workerProfileSchedule
    ? workers.find((item) => workerIdOf(item) === workerProfileSchedule.workerId)
    : undefined;
  const selectedStagePlanStarts = selectedStageSections.map((item: any) => item.startDate).filter(Boolean).sort();
  const selectedStagePlanEnds = selectedStageSections.map((item: any) => item.endDate).filter(Boolean).sort();
  const canArrangeWorkers = (isAdmin || includesPerson(project.manager, myName)) && !isProjectCompleted;
  const selectedScheduleWorker = workers.find((item) => workerIdOf(item) === workerScheduleForm.workerId);
  const selectedStageTrade = tradeForStage(selectedStage?.name || '');
  const eligibleStageWorkers = workers.filter((worker) => worker.status !== 'inactive' && workerMatchesStage(worker, selectedStage?.name || ''));
  const workerScheduleConflicts = selectedScheduleWorker
    ? findScheduleConflicts(selectedScheduleWorker, workerScheduleForm, allWorkerSchedules, selectedStageWorkerSchedule ? scheduleIdOf(selectedStageWorkerSchedule) : undefined)
    : [];
  const openWorkerPhoto = async (source: string) => {
    if (!source) return;
    try {
      if (!source.startsWith('cloud://')) {
        setWorkerPhotoViewer([source]);
        return;
      }
      const urls = await getTempFileURL([source]);
      setWorkerPhotoViewer([urls[source] || await getFileDataURL(source)]);
    } catch (previewError) {
      console.error('[project-detail] worker photo preview failed', previewError);
      try {
        setWorkerPhotoViewer([await getFileDataURL(source)]);
      } catch (fallbackError) {
        console.error('[project-detail] worker photo fallback failed', fallbackError);
      }
    }
  };
  const openWorkerScheduleModal = () => {
    const fallbackDate = todayDateValue();
    setWorkerScheduleForm({
      workerId: selectedStageWorkerSchedule?.workerId || '',
      startDate: selectedStageWorkerSchedule?.startDate || selectedStagePlanStarts[0] || fallbackDate,
      endDate: selectedStageWorkerSchedule?.endDate || selectedStagePlanEnds[selectedStagePlanEnds.length - 1] || selectedStagePlanStarts[0] || fallbackDate,
      status: selectedStageWorkerSchedule?.status || (selectedStageSummary?.status === 'current' ? 'in_progress' : 'confirmed'),
      note: selectedStageWorkerSchedule?.note || '',
    });
    setWorkerScheduleError('');
    setShowWorkerScheduleModal(true);
  };
  const saveStageWorkerSchedule = async () => {
    const worker = workers.find((item) => workerIdOf(item) === workerScheduleForm.workerId);
    if (!worker || !selectedStageId || !workerScheduleForm.startDate || !workerScheduleForm.endDate) {
      setWorkerScheduleError('请选择工人并填写完整排期日期'); return;
    }
    if (!workerMatchesStage(worker, selectedStage?.name || '')) {
      setWorkerScheduleError(`当前节点需要${selectedStageTrade}工人，请重新选择匹配工种的师傅`); return;
    }
    if (workerScheduleForm.endDate < workerScheduleForm.startDate) {
      setWorkerScheduleError('结束日期不能早于开始日期'); return;
    }
    if (workerScheduleConflicts.length > 0) {
      setWorkerScheduleError(`该工人与“${workerScheduleConflicts[0].schedule.projectAddress}”排期冲突`); return;
    }
    setSavingWorkerSchedule(true);
    const now = new Date().toISOString();
    const payload = {
      workerId: workerIdOf(worker), workerName: worker.name,
      projectId: String(project._id || id), projectAddress: project.address || '未填写地址', customerName: project.customer || '',
      stageId: selectedStageId, stageName: selectedStage?.name || '施工阶段', trade: selectedStageTrade,
      startDate: workerScheduleForm.startDate, endDate: workerScheduleForm.endDate, status: workerScheduleForm.status, note: workerScheduleForm.note,
      createdBy: myName, createdAt: selectedStageWorkerSchedule?.createdAt || now, updatedAt: now,
    };
    try {
      if (selectedStageWorkerSchedule) await workerSchedulesAPI.update(scheduleIdOf(selectedStageWorkerSchedule), payload);
      else await workerSchedulesAPI.add(payload);
      setShowWorkerScheduleModal(false);
      await loadWorkerSchedules();
    } catch (error) {
      console.error(error); setWorkerScheduleError('工人排期保存失败，请稍后重试');
    } finally { setSavingWorkerSchedule(false); }
  };
  const removeStageWorkerSchedule = async () => {
    if (!selectedStageWorkerSchedule) return;
    const confirmed = await confirmUser('删除后，该阶段会恢复为待安排状态。', { title: '确定删除工人排期？', confirmStyle: 'danger' });
    if (!confirmed) return;
    await workerSchedulesAPI.delete(scheduleIdOf(selectedStageWorkerSchedule));
    setShowWorkerScheduleModal(false);
    await loadWorkerSchedules();
  };
  const projectDuration = getPlanDays(project.startDate, project.endDate);
  const followPeople = [
    { label: '销售', value: toPersonArray(project.sales).join('、') || toPersonArray(lead?.sales).join('、') || '-' },
    { label: '设计', value: toPersonArray(project.designer).join('、') || toPersonArray(lead?.designer).join('、') || '-' },
    { label: '工程', value: toPersonArray(project.manager).join('、') || toPersonArray(lead?.manager).join('、') || '-' },
  ];
  const getProjectShareTitle = (suffix = '工地进度播报') => `[品诺筑家] ${project.address || project.customer || '工地'} ${suffix}`;
  const handleOpenShareAccess = async () => {
    navigate(`/projects-biz/${project._id || id}/share-access`, { state: { from: returnPath } });
  };
  const projectQuickActions = [
    { key: 'customer', label: '客户详情', icon: Users, tone: 'bg-blue-50 text-blue-600', onClick: () => lead?._id ? navigate(`/leads/${lead._id}`, { state: { from: returnPath } }) : setActiveTab('customer') },
    { key: 'logs', label: '施工日志', icon: ClipboardList, tone: 'bg-cyan-50 text-cyan-600', onClick: () => navigate(`/projects-biz/${id}/logs`, { state: { from: returnPath } }) },
    { key: 'inspections', label: '工地巡检', icon: Shield, tone: 'bg-emerald-50 text-emerald-600', onClick: () => navigate(`/projects-biz/${id}/inspections`, { state: { from: returnPath } }) },
    { key: 'share-access', label: '查看申请', icon: Eye, tone: 'bg-purple-50 text-purple-600', onClick: handleOpenShareAccess },
    {
      key: 'contract',
      label: relatedContract ? (currentBizType === '工装' ? '查看合同' : '查看合同') : '新建合同',
      icon: FileText,
      tone: 'bg-slate-100 text-slate-700',
      onClick: () => relatedContract ? navigate(`/contracts/${relatedContract.id || relatedContract._id}`, { state: { from: returnPath } }) : setContractDrawerOpen(true),
    },
    {
      key: 'reimbursement',
      label: '项目报销',
      icon: Receipt,
      tone: 'bg-rose-50 text-rose-600',
      onClick: async () => {
        if (relatedContract) {
          navigate(`/reimbursement?action=create&contractId=${relatedContract.id || relatedContract._id}&from=${encodeURIComponent(location.pathname)}`);
        } else {
          const confirmed = await confirmUser('项目报销需要先关联合同。', { title: '是否前往新建合同？' });
          if (confirmed) {
            setContractDrawerOpen(true);
          }
        }
      },
    },
    {
      key: 'income',
      label: '新增收款',
      icon: DollarSign,
      tone: 'bg-emerald-50 text-emerald-600',
      onClick: async () => {
        if (relatedContract) {
          const contractId = relatedContract.id || relatedContract._id;
          navigate(canViewFinance ? `/income?action=create&contractId=${contractId}&from=${encodeURIComponent(location.pathname)}` : `/contracts/${contractId}`);
        } else {
          const confirmed = await confirmUser('新增收款需要先关联合同。', { title: '是否前往新建合同？' });
          if (confirmed) {
            setContractDrawerOpen(true);
          }
        }
      },
    },
    {
      key: 'cost',
      label: '项目成本',
      icon: BarChart3,
      tone: 'bg-gray-100 text-gray-700',
      enabled: canViewFinance,
      onClick: async () => {
        if (relatedContract) {
          navigate(`/projects/${relatedContract.id || relatedContract._id}`);
        } else {
          const confirmed = await confirmUser('查看项目成本需要先关联合同。', { title: '是否前往新建合同？' });
          if (confirmed) {
            setContractDrawerOpen(true);
          }
        }
      },
    },
    {
      key: 'material',
      label: '主材清单',
      icon: Tag,
      tone: 'bg-orange-50 text-orange-600',
      onClick: () => {
        if (lead?._id) {
          navigate(`/leads/${lead._id}/material`, { state: { from: returnPath } });
        } else {
          alert('请先关联客户');
        }
      },
    },
    {
      key: 'files',
      label: '项目资料',
      icon: Folder,
      tone: 'bg-teal-50 text-teal-600',
      onClick: () => {
        if (lead?._id) {
          navigate(`/leads/${lead._id}/files`, { state: { from: returnPath } });
        } else {
          alert('请先关联客户');
        }
      },
    },
  ].filter(action => action.enabled !== false);
  const desktopQuickActions = projectQuickActions.filter(action => !['logs', 'inspections', 'files'].includes(action.key));
  const openQuickAction = (action: typeof projectQuickActions[number]) => {
    action.onClick();
  };
  const handleShareProject = async () => {
    if (!canShareCustomerProgress) return;
    await openCustomerShare({
      id: String(project._id || id),
      title: getProjectShareTitle(),
      desc: `${project.customer || ''} ${project.address || ''}`.trim() || '客户查看前需要通过手机号或申请审核。',
    });
  };

  const handleShareCraft = async (majorIdx: number, nodeName?: string) => {
    if (!canShareCustomerProgress) return;
    await openCustomerShare({
      id: String(project._id || id),
      title: `[品诺筑家] 客户须知：${nodeName || '工艺标准'}`,
      desc: '工艺标准分享会沿用旧版小程序客户查看和权限校验流程。',
      shareType: 'craft',
      majorIdx,
    });
  };

  // ==== 勾选式分享：在检查项前显示圆圈直接勾选 ====
  const subHasPhoto = (sn: any) => !!(sn?.acceptanceRecord?.photos && sn.acceptanceRecord.photos.length > 0);

  const enterShareSelect = (nodeIdx: number, secIdx: number, section: any) => {
    if (!canShareCustomerProgress) return;
    const checked: Record<number, boolean> = {};
    let any = false;
    (section.subNodes || []).forEach((sn: any, idx: number) => {
      if (subHasPhoto(sn)) { checked[idx] = true; any = true; }
    });
    if (!any) { alert('该阶段暂无已上传照片的检查项'); return; }
    setShareSelect({ nodeIdx, secIdx, checked });
  };

  const toggleShareSelectItem = (subIdx: number) => {
    setShareSelect(prev => prev ? { ...prev, checked: { ...prev.checked, [subIdx]: !prev.checked[subIdx] } } : prev);
  };

  const confirmShareSelect = async () => {
    if (!shareSelect || !canShareCustomerProgress) return;
    const selected = Object.keys(shareSelect.checked).filter(k => shareSelect.checked[+k]).map(Number);
    if (selected.length === 0) { alert('请至少选择1个检查项'); return; }
    await openCustomerShare({
      id: String(project._id || id),
      title: getProjectShareTitle('施工记录已更新，请查阅'),
      desc: '客户首次仅看到所选检查项，可在分享页继续申请查看完整工地进度。',
      shareMajor: shareSelect.nodeIdx,
      shareSec: shareSelect.secIdx,
      shareSubs: selected.join(','),
    });
    setShareSelect(null);
  };

  const cancelShareSelect = () => setShareSelect(null);

  // 全选 / 取消全选（仅针对有照片的可选检查项）
  const selectableSubIdxs = (section: any): number[] =>
    (section.subNodes || []).map((sn: any, idx: number) => (subHasPhoto(sn) ? idx : -1)).filter((i: number) => i >= 0);

  const isAllShareSelected = (section: any): boolean => {
    if (!shareSelect) return false;
    const idxs = selectableSubIdxs(section);
    return idxs.length > 0 && idxs.every(i => shareSelect.checked[i]);
  };

  const toggleShareSelectAll = (section: any) => {
    if (!shareSelect) return;
    const idxs = selectableSubIdxs(section);
    const next = !isAllShareSelected(section);
    setShareSelect(prev => {
      if (!prev) return prev;
      const checked = { ...prev.checked };
      idxs.forEach(i => { checked[i] = next; });
      return { ...prev, checked };
    });
  };

  const completionCheckRows = [
    {
      key: 'unfinished',
      title: '施工阶段/子节点',
      question: '是否所有施工阶段/子节点已完成',
      issueText: '存在未完成项',
      okText: '已全部完成',
      items: completionChecks.unfinished,
    },
    {
      key: 'rectifications',
      title: '整改巡检',
      question: '是否还有待整改巡检',
      issueText: '仍有待处理整改',
      okText: '无待整改巡检',
      items: completionChecks.pendingRectifications,
    },
  ];

  const getCompletionItemText = (item: any) => {
    if (typeof item === 'string') return item;
    return `${item.title || '巡检记录'}${item.status ? `（${item.status}）` : ''}`;
  };
  const projectUploadTaskKey = getProjectDocId(project) || id;
  const visibleUploadStatuses = ['queued', 'uploading', 'error'];

  return (
    <div className="erp-page max-w-[1500px] mx-auto space-y-4">
      {/* ========== 基本信息置顶 ========== */}
      {!standaloneSection && !isStageDetail && (
      <div className="bg-white rounded-xl md:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-1.5 px-3 py-4 md:gap-x-3 md:px-6">
          <button onClick={() => smartBack()} className="col-start-1 row-start-1 -ml-1.5 rounded-lg p-1.5 transition-colors hover:bg-gray-100 md:row-span-2">
            <ArrowLeft className="h-[18px] w-[18px] text-gray-400" />
          </button>
          <h1 className="col-span-2 col-start-2 row-start-1 min-w-0 break-words text-base font-bold leading-[1.4] tracking-tight text-gray-900 md:col-span-1 md:text-xl">
            {project.address || '未命名工地'}
          </h1>
          <div className="col-start-2 row-start-2 flex min-h-7 min-w-0 flex-wrap items-center gap-1.5 text-sm font-medium leading-none text-gray-500">
            <span>{project.customer || '-'}</span>
            {isProjectCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                <CheckCircle className="h-3 w-3" /> 已完工
              </span>
            )}
          </div>

          <div className="col-start-3 row-start-2 flex shrink-0 flex-row items-center self-center gap-1.5 md:row-span-2 md:row-start-1 md:self-start">
              {canEdit && (
              <>
                {canEditProjectInfo && (
                  <button
                    onClick={editMode ? saveProject : startEdit}
                    disabled={isProjectActionBusy('save-project')}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 md:h-9 md:w-auto md:gap-1.5 md:px-4 md:text-xs md:font-medium"
                    title={editMode ? '保存资料' : '编辑资料'}
                    aria-label={editMode ? '保存资料' : '编辑资料'}
                  >
                    {isProjectActionBusy('save-project') ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin md:h-4 md:w-4" />
                    ) : editMode ? (
                      <Check className="h-3.5 w-3.5 md:hidden" />
                    ) : (
                      <Edit3 className="h-3.5 w-3.5 md:hidden" />
                    )}
                    <span className="hidden md:inline">{editMode ? '保存资料' : '编辑资料'}</span>
                  </button>
                )}
                {canShareCustomerProgress && (
                  <button onClick={handleShareProject} className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 md:h-9 md:w-auto md:gap-1 md:px-4 md:text-xs md:font-medium" title="分享给客户" aria-label="分享给客户">
                    <Share2 className="h-3.5 w-3.5 md:h-4 md:w-4" /> <span className="hidden md:inline">分享</span>
                  </button>
                )}
              </>
            )}
            {!canEdit && canShareCustomerProgress && (
              <button onClick={handleShareProject} className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 md:h-9 md:w-auto md:gap-1 md:px-4 md:text-xs md:font-medium" title="分享给客户" aria-label="分享给客户">
                <Share2 className="h-3.5 w-3.5 md:h-4 md:w-4" /> <span className="hidden md:inline">分享</span>
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-gray-50" />

        {!editMode && desktopQuickActions.length > 0 && (
          <div className="hidden md:block px-6 pb-5">
            <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
              {desktopQuickActions.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => openQuickAction(action)}
                    className="group relative min-w-[132px] flex-1 rounded-xl border border-gray-100 bg-white px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-200 hover:shadow-md"
                  >
                    {action.key === 'share-access' && pendingAccessCount > 0 && (
                      <span className="absolute right-2 top-2 min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                        {pendingAccessCount > 99 ? '99+' : pendingAccessCount}
                      </span>
                    )}
                    <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${action.tone}`}>
                      <Icon size={18} />
                    </span>
                    <span className="block text-sm font-semibold text-gray-900">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!editMode && (
          <div className="md:hidden px-3 pb-4 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {projectQuickActions.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.key}
                    onClick={() => openQuickAction(action)}
                    className="relative aspect-square rounded-xl border border-gray-100 bg-white flex flex-col items-center justify-center gap-1.5 text-center shadow-sm"
                  >
                    {action.key === 'share-access' && pendingAccessCount > 0 && (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
                    )}
                    {action.key !== 'share-access' && hasProjectActionUnread(action.key) && (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
                    )}
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${action.tone}`}>
                      <Icon size={17} />
                    </span>
                    <span className="text-[11px] font-semibold text-gray-800 leading-tight">{action.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setMobileInfoOpen(v => !v)}
              className="w-full rounded-xl bg-gray-50 px-3 py-3 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-gray-900">工地信息</div>
                  <div className="mt-0.5 truncate text-[11px] text-gray-400">
                    当前 {currentNodeName || '未开始'} · 开工 {project.startDate ? formatDate(project.startDate) : '-'} · 工期 {projectDuration ? `${projectDuration}天` : '-'}
                  </div>
                </div>
                <ChevronDown size={15} className={`mt-0.5 shrink-0 text-gray-400 transition-transform ${mobileInfoOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {mobileInfoOpen && (
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-100 p-3">
                {[
                  { label: '客户名称', value: project.customer || '-' },
                  { label: '客户电话', value: project.phone || '-' },
                  { label: '开工日期', value: project.startDate ? formatDate(project.startDate) : '-' },
                  { label: isProjectCompleted ? '完工日期' : '预计完工', value: project.endDate ? formatDate(project.endDate) : '-' },
                  { label: '当前进度', value: currentNodeName || `${progress}%` },
                  { label: '工期', value: projectDuration ? `${projectDuration}天` : '-' },
                  ...(project.entryPassword && canEdit ? [{ label: '入户密码', value: project.entryPassword }] : []),
                ].map(item => (
                  <div key={item.label}>
                    <div className="text-[11px] text-gray-400">{item.label}</div>
                    <div className="mt-0.5 text-[13px] font-medium text-gray-800 break-words">{item.value}</div>
                  </div>
                ))}
                <div className="col-span-2 mt-1">
                  <div className="text-[13px] font-semibold text-gray-900 mb-2">跟进人员</div>
                  <div className="grid grid-cols-3 gap-2">
                    {followPeople.map(item => (
                      <div key={item.label} className="rounded-xl bg-gray-50 px-2.5 py-2">
                        <div className="text-[11px] text-gray-400">{item.label}</div>
                        <div className="mt-1 text-[13px] font-semibold text-gray-900 break-words">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={editMode ? 'px-4 md:px-6 py-5' : 'hidden md:block px-4 md:px-6 py-5'}>
          {editMode && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">开工日期</label>
                <DatePicker
                  mode="single"
                  value={editForm.startDate}
                  onChange={(v) => setEditForm(p => ({ ...p, startDate: v }))}
                  placeholder="选择日期"
                  dropUp
                />
              </div>
              {/* 工程多选 */}
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">工程</label>
                <div className="flex flex-wrap gap-1 mt-0.5 mb-1">
                  {editForm.manager.map((s: string) => (
                    <span key={s} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                      {s}
                      <button type="button" onClick={() => setEditForm(p => ({ ...p, manager: p.manager.filter((x: string) => x !== s) }))} className="hover:text-amber-800 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <Select
                  options={employees.filter(e => e.name && !editForm.manager.includes(e.name)).map(e => ({ value: e.name, label: e.name }))}
                  value="" onChange={(v: string) => { if (v && !editForm.manager.includes(v)) setEditForm(p => ({ ...p, manager: [...p.manager, v] })); }}
                  placeholder="+添加工程" searchable
                />
              </div>
              <div className="flex flex-col justify-between h-full">
                <label className="text-[10px] text-gray-400 mb-1 block">入户密码</label>
                <input
                  type="text"
                  value={editForm.entryPassword}
                  onChange={(e) => setEditForm(p => ({ ...p, entryPassword: e.target.value }))}
                  placeholder="请输入入户密码"
                  className="erp-input"
                />
              </div>
              <div className="col-span-2 self-end text-[11px] text-gray-400">
                客户信息请到客户详情页维护。
              </div>
            </div>
          )}
          {!editMode && (
            <div className="hidden md:flex flex-col lg:flex-row gap-6 lg:gap-10">
              <div className="flex-1 flex flex-col justify-between">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
                  {[
                    { label: '客户姓名', value: project.customer || '-' },
                    { label: '客户电话', value: project.phone || '-' },
                    { label: '开工日期', value: project.startDate ? formatDate(project.startDate) : '-' },
                    { label: isProjectCompleted ? '完工日期' : '预计完工', value: project.endDate ? formatDate(project.endDate) : '-' },
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{item.label}</span>
                      <span className="text-sm text-gray-900 font-medium truncate">{item.value}</span>
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">销售</span>
                    <span className="text-sm text-gray-900 font-medium">{toPersonArray(project.sales).join('、') || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">设计师</span>
                    <span className="text-sm text-gray-900 font-medium">{toPersonArray(project.designer).join('、') || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">工程</span>
                    <span className="text-sm text-gray-900 font-medium">{toPersonArray(project.manager).join('、') || '-'}</span>
                  </div>
                  {project.entryPassword && canEdit && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">入户密码</span>
                      <span className="text-sm text-gray-900 font-medium">{project.entryPassword}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">施工进度</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-gray-400">已施工 {progressedCount} / 总计 {totalCount} 项</span>
                        <span className="text-sm font-bold text-gold-600">{progress}%</span>
                      </div>
                    </div>
                    <div className="mt-2 pb-4">
                      {(project.nodesData && project.nodesData.length > 0) ? (() => {
                        const nodeStatuses = progressSummary.stageStatuses.map((stage: any, index: number) => ({
                          ...stage,
                          node: project.nodesData[index],
                        }));
                        
                        return (
                          <div
                            className="mt-1.5"
                            style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, nodeStatuses.length)}, minmax(0, 1fr))` }}
                          >
                            {/* 圆点 + 连线行 */}
                            {nodeStatuses.map((ns: any, i: number) => {
                                const isLast = i === nodeStatuses.length - 1;
                                const isCompleted = ns.status === 'completed';
                                const isCurrent = ns.status === 'current';
                                const isCurrentPosition = Boolean(ns.isCurrentPosition);
                                return (
                                  <div key={`dot-${i}`} className="relative flex items-center py-0.5">
                                    {i > 0 && (
                                      <div className="absolute right-1/2 left-0 top-1/2 h-0.5 -translate-y-px"
                                        style={{ background: isCompleted ? '#10b981' : '#f3f4f6' }} />
                                    )}
                                    <div className="relative z-10 mx-auto flex flex-col items-center group">
                                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 shrink-0 bg-white transition-colors
                                        ${isCurrentPosition && isCompleted ? 'ring-2 ring-gold-400 ring-offset-2' : ''}
                                        ${isCompleted ? 'border-emerald-500 bg-emerald-500' : 
                                          isCurrent ? 'border-gold-500' : 'border-gray-200'}`}>
                                        {isCompleted ? <CheckCircle size={11} className="text-white" /> : 
                                          isCurrent ? <Circle size={8} className="fill-gold-500 text-gold-500" /> :
                                          <Circle size={8} className="fill-gray-200 text-gray-200" />}
                                      </div>
                                      <div className="absolute opacity-0 group-hover:opacity-100 -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-20 transition-opacity">
                                        {ns.node.name} ({ns.stageProgressed}/{ns.stageTotal})
                                      </div>
                                    </div>
                                    {!isLast && (
                                      <div className="absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-px"
                                        style={{ background: isCompleted ? '#10b981' : '#f3f4f6' }} />
                                    )}
                                  </div>
                                );
                              })}
                            {/* 文字标签行 */}
                            {nodeStatuses.map((ns: any, i: number) => {
                                const isCompleted = ns.status === 'completed';
                                const isCurrent = ns.status === 'current';
                                const isCurrentPosition = Boolean(ns.isCurrentPosition);
                                return (
                                  <span key={`label-${i}`} className={`truncate text-center text-[10px] mt-1 transition-colors ${isCurrentPosition ? 'font-semibold' : ''} ${isCompleted ? 'text-emerald-600' : isCurrent ? 'text-gold-600 font-medium' : 'text-gray-400'}`}>
                                    {ns.node.name || '阶段'}
                                  </span>
                                );
                              })}
                          </div>
                        );
                      })() : (
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="bg-gold-400 h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
              </div>
              <div className="lg:w-64 shrink-0 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-gray-100 pt-4 lg:pt-0 lg:pl-10">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">销售</span>
                    <span className="text-sm text-gray-900 font-medium truncate">{toPersonArray(lead?.sales).join('、') || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">设计</span>
                    <span className="text-sm text-gray-900 font-medium truncate">{toPersonArray(project.designer).join('、') || toPersonArray(lead?.designer).join('、') || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">工程</span>
                    <span className="text-sm text-gray-900 font-medium truncate">{toPersonArray(project.manager).join('、') || toPersonArray(lead?.manager).join('、') || '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========== Tab Bar (Professional ERP Style) ========== */}
        <div className="hidden md:block px-4 pb-4">
          <div className="flex flex-wrap gap-2 p-1.5 bg-gray-100/80 rounded-xl">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 min-w-[80px] py-2 text-[13px] font-medium transition-all rounded-lg ${
                  activeTab === tab.key
                    ? 'bg-white text-gold-600 shadow-sm border border-gray-200/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {standaloneSection && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate(`/projects-biz/${id}`)}
              className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-[18px] h-[18px] text-gray-400" />
            </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-semibold text-gray-900 md:text-lg">
                  {standaloneSection === 'logs' ? '施工日志' : '工地巡检'}
                </h1>
                <div className="mt-1 truncate text-xs text-gray-500 md:text-sm">{project.address || '未命名工地'}</div>
              </div>
              {standaloneSection === 'logs' && canEditSite && (
                <button onClick={openNewLogModal} className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">
                  <Plus size={16} /> 日志
                </button>
              )}
              {standaloneSection === 'inspections' && isAdmin && !isProjectCompleted && (
                <button onClick={() => setShowInspectionModal(true)} className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 md:text-sm">
                  <Shield size={15} /> 发起巡检
                </button>
              )}
            </div>
        </div>
      )}

      {isStageDetail && (
        <div className="px-1 py-2 md:hidden">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/projects-biz/${id}`)} className="-ml-1.5 shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100">
              <ArrowLeft className="h-[18px] w-[18px] text-gray-400" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className={`truncate text-lg font-semibold ${selectedStageSummary?.status === 'current' ? 'text-amber-600' : 'text-gray-900'}`}>{selectedStage?.name || '施工阶段'}</h1>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${selectedStageSummary?.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : selectedStageSummary?.status === 'current' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{selectedStageStatus}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">{selectedStageDateText}</div>
            </div>
            <div
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(${selectedStageSummary?.status === 'completed' ? '#10b981' : selectedStageSummary?.status === 'current' ? '#d4a72c' : '#d1d5db'} ${selectedStagePercent * 3.6}deg, #e5e7eb 0deg)` }}
              aria-label={`节点进度 ${selectedStagePercent}%`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-xs font-semibold text-gray-800">{selectedStagePercent}%</div>
            </div>
          </div>
          <div className="mt-2 truncate pl-9 text-[11px] text-gray-400">{project.address || '未命名工地'}</div>
        </div>
      )}

      <div id="project-detail-workspace" className="space-y-4">
        {/* ========== Tab: 施工进度 ========== */}
        {activeTab === 'site' && (
          <div className="relative space-y-4 rounded-xl">
            {isStageDetail && (
              <div className="flex items-center justify-between gap-3 border-y border-gray-200 bg-white px-3 py-3 md:rounded-lg md:border md:px-4">
                {selectedStageWorkerSchedule ? (
                  <button type="button" onClick={() => setWorkerProfileSchedule(selectedStageWorkerSchedule)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gold-400" title="查看工人档案">
                    <WorkerAvatar name={selectedStageWorker?.name || selectedStageWorkerSchedule.workerName} fileID={selectedStageWorker?.photoFileID} className="h-9 w-9" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2"><span className="text-xs text-gray-400">施工工人</span><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">已排期</span></span>
                      <span className="mt-0.5 block truncate text-sm font-medium text-gray-900">{selectedStageWorker?.name || selectedStageWorkerSchedule.workerName}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-500">{String(selectedStageWorkerSchedule.startDate).slice(5)} 至 {String(selectedStageWorkerSchedule.endDate).slice(5)}{selectedStageWorker?.phone ? ` · ${selectedStageWorker.phone}` : ''}</span>
                    </span>
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400"><Users size={17} /></span>
                    <div className="min-w-0"><div className="text-xs text-gray-400">施工工人</div><div className="mt-0.5 text-sm text-gray-500">暂未安排工人</div></div>
                  </div>
                )}
                {canArrangeWorkers ? <button onClick={openWorkerScheduleModal} className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:border-gold-300 hover:text-gold-600" title={selectedStageWorkerSchedule ? '修改工人排期' : '安排工人'} aria-label={selectedStageWorkerSchedule ? '修改工人排期' : '安排工人'}>{selectedStageWorkerSchedule ? <Edit3 size={16} /> : <Plus size={16} />}</button> : <button onClick={() => navigate('/worker-schedule')} className="shrink-0 text-xs font-medium text-gold-600">查看排期</button>}
              </div>
            )}
            {!isStageDetail && projectTodos.length > 0 && (
              <div className="hidden overflow-hidden rounded-xl border border-red-100 bg-white shadow-sm md:block">
                <div className="flex items-center justify-between border-b border-red-100 bg-red-50/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-600"><AlertTriangle className="h-4 w-4" /> 当前待办 {projectTodos.length} 项</div>
                  {canCreateProjectTodo && <button onClick={openQuickTodoModal} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"><Plus className="h-3.5 w-3.5" /> 新增待办</button>}
                </div>
                <div className="divide-y divide-gray-100">
                  {projectTodos.map(todo => (
                    <div key={todo._id} className="flex items-center gap-3 px-4 py-3">
                      {canCompleteTodo(todo) ? (
                        <button onClick={() => handleCompleteProjectTodo(todo)} disabled={completingTodoId === todo._id} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 text-white hover:border-emerald-500 hover:bg-emerald-500 disabled:opacity-50" aria-label="完成待办" title="完成待办">
                          {completingTodoId === todo._id ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> : <Check className="h-3 w-3" />}
                        </button>
                      ) : <span className="h-3 w-3 shrink-0 rounded-full border border-red-300 bg-red-50" />}
                      <button onClick={() => navigate(`/todos?todoId=${todo._id}`)} className="min-w-0 flex-1 text-left">
                        <span className="font-medium text-gray-800">{todo.title}</span>
                        <span className="ml-3 text-xs text-gray-400">{todo.dueDate ? `截止 ${todo.dueDate}` : ''}{(todo.assignees || []).length > 0 ? ` · ${todo.assignees.map((item: any) => item.name).join('、')}` : ''}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 模板操作 (仅在没有节点时显示) */}
            {(!project.nodesData || project.nodesData.length === 0) ? (
              <div className="hidden md:flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">施工节点</h3>
                  <p className="text-xs text-gray-400 mt-0.5">当前项目暂无施工节点，请选择模板进行生成</p>
                </div>
                {(canCreateProjectTodo || canManageConstructionStructure) && (
                  <div className="flex items-center gap-2">
                    {canCreateProjectTodo && (
                      <button onClick={openQuickTodoModal} className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                        <ClipboardList className="h-3.5 w-3.5" /> 新增待办
                      </button>
                    )}
                    {canManageConstructionStructure && (
                      <button onClick={openTemplateModal} className="text-sm px-4 py-2 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-500 transition-colors">
                        套用模板
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">施工节点</h3>
                  <p className="text-xs text-gray-400 mt-0.5">管理和查看各阶段进度</p>
                </div>
                {(canCreateProjectTodo || canManageConstruction || canManageConstructionStructure) && (
                  <div className="flex items-center gap-2">
                    {canCreateProjectTodo && <button
                      onClick={openQuickTodoModal}
                      className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 px-3 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 md:h-8 md:text-xs"
                    >
                      <ClipboardList className="h-3.5 w-3.5" /> 新增待办
                    </button>}
                    {canManageConstruction && !isEditingNodes && !isStageDetail && (
                      !isProjectCompleted ? (
                        <button
                          onClick={openCompletionModal}
                          disabled={isProjectActionBusy('complete-project')}
                          className="flex items-center h-7 md:h-8 px-3 text-[11px] md:text-xs font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> 标记完工
                        </button>
                      ) : isAdmin ? (
                        <button
                          onClick={handleReopenProject}
                          disabled={isProjectActionBusy('reopen-project')}
                          className="flex items-center h-7 md:h-8 px-3 text-[11px] md:text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 恢复为施工中
                        </button>
                      ) : null
                    )}
                    {canManageConstructionStructure && isEditingNodes && (
                      <>
                        <button onClick={applyTemplate} className="text-sm px-4 py-2 bg-white border border-gold-400 text-gold-600 font-medium rounded-lg hover:bg-gold-50 transition-colors flex items-center gap-1">
                          ↻ 同步模板库
                        </button>
                        <button onClick={() => { setIsEditingNodes(false); loadProject(); }} className="text-sm px-4 py-2 bg-gray-100 text-gray-600 font-medium rounded-lg hover:bg-gray-200 transition-colors">
                          取消修改
                        </button>
                      </>
                    )}
                    {canManageConstructionStructure && <button onClick={() => {
                      if (!isEditingNodes && project.nodesData) {
                        const newNodes = project.nodesData.map((n: any) => ({
                          ...n,
                          collapsed: true,
                          sections: n.sections?.map((s: any) => ({ ...s, collapsed: true }))
                        }));
                        setProject({ ...project, nodesData: newNodes });
                      }
                      setIsEditingNodes(!isEditingNodes);
                    }} className="flex items-center h-7 md:h-8 px-3 text-[11px] md:text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors whitespace-nowrap">
                      {isEditingNodes ? '保存编辑' : '编辑节点'}
                    </button>}
                  </div>
                )}
              </div>
            )}

            <div className="md:hidden space-y-3">
              <div className={isStageDetail ? '' : 'overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'}>
                {!isStageDetail && <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-700">施工动态</h3>
                  </div>
                  {(canCreateProjectTodo || canManageConstructionStructure) && !isStageDetail && (
                    <div className="flex items-center gap-1.5">
                    {canCreateProjectTodo && <button onClick={openQuickTodoModal} className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50" title="新增待办" aria-label="新增待办">
                      <ClipboardList className="h-3.5 w-3.5" />
                    </button>}
                    {canManageConstructionStructure && <button
                      onClick={() => {
                        if (!isEditingNodes && project.nodesData) {
                          const newNodes = project.nodesData.map((n: any) => ({
                            ...n,
                            collapsed: true,
                            sections: n.sections?.map((s: any) => ({ ...s, collapsed: true }))
                          }));
                          setProject({ ...project, nodesData: newNodes });
                        }
                        setIsEditingNodes(!isEditingNodes);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
                      title={isEditingNodes ? '保存节点' : '编辑节点'}
                      aria-label={isEditingNodes ? '保存节点' : '编辑节点'}
                    >
                      {isEditingNodes ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                    </button>}
                    </div>
                  )}
                </div>}

                {!isStageDetail && projectTodos.length > 0 && (
                  <div className="border-b border-red-100 bg-red-50/40 px-4 py-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> 当前待办 {projectTodos.length} 项
                    </div>
                    <div className="divide-y divide-red-100/70">
                      {projectTodos.map(todo => (
                        <div key={todo._id} className="flex items-center gap-2 py-2">
                          {canCompleteTodo(todo) ? (
                            <button onClick={() => handleCompleteProjectTodo(todo)} disabled={completingTodoId === todo._id} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-200 bg-white text-white transition-colors hover:border-emerald-500 hover:bg-emerald-500 disabled:opacity-50" aria-label="完成待办" title="完成待办">
                              {completingTodoId === todo._id ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> : <Check className="h-3 w-3" />}
                            </button>
                          ) : <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-400" />}
                          <div className="min-w-0 flex-1 text-sm leading-snug text-gray-800">{todo.title}</div>
                          {todo.dueDate && <span className="shrink-0 text-[11px] text-red-500">{String(todo.dueDate).slice(5, 10)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

            {/* 移动端节点编辑 — 对齐模板库 UI */}
            {isEditingNodes ? (
              <div className="md:hidden space-y-2">
                {project.nodesData?.map((node: any, index: number) => (
                  <div key={node._id || `m-node-${index}`} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button onClick={async (e) => { e.stopPropagation(); if(await confirmUser('删除后无法恢复。', { title: '确定删除该节点？', confirmStyle: 'danger', confirmText: '删除' })) { const n = [...project.nodesData]; n.splice(index, 1); syncToDB(n); }}} className="p-1 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
                        <input value={node.name} onChange={(e) => { const n = [...project.nodesData]; n[index].name = e.target.value; setProject({ ...project, nodesData: n }); }} onBlur={() => syncToDB(project.nodesData)} className="min-w-0 flex-1 text-sm font-medium bg-transparent border border-transparent focus:border-gold-400 rounded px-2 py-1 outline-none" />
                        <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-500">工艺{node.craftsmanship?.length || 0}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => moveNode(index, -1)} disabled={index === 0} className="px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-50 rounded disabled:opacity-30">上移</button>
                        <button onClick={() => moveNode(index, 1)} disabled={index === (project.nodesData?.length || 0) - 1} className="px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-50 rounded disabled:opacity-30">下移</button>
                        <button onClick={() => toggleNodeCollapse(node._id)} className="px-2 py-1 text-[10px] font-medium text-gray-600 bg-gray-100 rounded">{node.collapsed ? '展开' : '收起'}</button>
                      </div>
                    </div>
                    {!node.collapsed && (
                      <div className="p-2 space-y-2 bg-gray-50/40">
                        {/* 工艺标准 — 移动端编辑 */}
                        {((node.craftsmanship && node.craftsmanship.length > 0) || node.craftCollapsed === false) ? (
                        <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50/60">
                            <button type="button" onClick={(e) => { e.stopPropagation(); const n = [...project.nodesData]; n[index].craftCollapsed = !n[index].craftCollapsed; setProject({ ...project, nodesData: n }); }} className="flex items-center gap-1.5 text-left">
                              {node.craftCollapsed ? <ChevronRight size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                              <span className="text-xs font-medium text-gray-700">工艺标准 ({node.craftsmanship?.length || 0})</span>
                            </button>
                            <button onClick={() => addProjectCraftsmanship(node._id)} className="text-[10px] text-gold-600"><Plus size={12} /> 添加</button>
                          </div>
                          {!node.craftCollapsed && ((!node.craftsmanship || node.craftsmanship.length === 0) ? (
                            <div className="px-3 py-2 text-[10px] text-gray-400">暂无工艺标准</div>
                          ) : (
                            <div className="p-2 space-y-2">
                              {node.craftsmanship.map((craft: any, ci: number) => (
                                <div key={ci} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                                  <div className="flex justify-end mb-1"><button onClick={() => removeProjectCraftsmanship(node._id, ci)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button></div>
                                  <textarea value={craft?.text || ''} onChange={(e) => updateProjectCraftsmanship(node._id, ci, { text: e.target.value })} onBlur={(e) => updateProjectCraftsmanship(node._id, ci, { text: e.target.value }, true)} rows={Math.min(8, Math.max(3, Math.ceil((craft?.text || '').length / 22)))} placeholder="输入工艺标准..." className="min-h-[80px] w-full resize-y rounded-lg border border-gray-100 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-gold-300" />
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {(craft?.images || []).map((img: string, ii: number) => (
                                      <div key={`${img}-${ii}`} className="relative h-12 w-12 rounded-md overflow-hidden border border-gray-200">
                                        <button type="button" onClick={() => openPreview({ fileID: img }, (craft?.images || []).map((url: string) => ({ fileID: url })))} className="h-full w-full">
                                          <CloudImage src={img} className="h-full w-full object-cover" />
                                        </button>
                                        <button onClick={() => updateProjectCraftsmanship(node._id, ci, { images: (craft?.images || []).filter((_: string, i: number) => i !== ii) }, true)} className="absolute right-0.5 top-0.5 rounded-full bg-black/45 p-0.5 text-white"><X size={10} /></button>
                                      </div>
                                    ))}
                                    <label className="flex h-12 w-12 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-gray-200 bg-white text-[10px] text-gray-400"><ImageIcon size={14} />图片<input type="file" accept="image/*" multiple className="hidden" disabled={isProjectActionBusy(`craft-${node._id}-${ci}`)} onChange={(e) => { uploadProjectCraftsmanshipImages(node._id, ci, e.target.files); e.currentTarget.value = ''; }} /></label>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        ) : (
                          <button onClick={() => addProjectCraftsmanship(node._id)} className="w-full py-2 text-xs font-medium text-gray-400 border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-1 hover:text-gold-600 hover:border-gold-300 transition-colors"><Plus size={14} /> 添加工艺标准</button>
                        )}
                        {node.sections?.map((sec: any, secIdx: number) => (
                          <div key={secIdx} className="rounded-lg border border-gray-100 bg-white overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50/60 border-b border-gray-100">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <button onClick={async (e) => { e.stopPropagation(); if(await confirmUser('删除后无法恢复。', { title: '确定删除该阶段？', confirmStyle: 'danger', confirmText: '删除' })) { const n = [...project.nodesData]; n[index].sections.splice(secIdx, 1); syncToDB(n); }}} className="p-1 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
                                <input value={sec.name} onChange={(e) => { const n = [...project.nodesData]; n[index].sections[secIdx].name = e.target.value; setProject({ ...project, nodesData: n }); }} onBlur={() => syncToDB(project.nodesData)} className="min-w-0 flex-1 text-xs font-medium bg-transparent border border-transparent focus:border-gold-400 rounded px-2 py-1 outline-none" />
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => moveSection(index, secIdx, -1)} disabled={secIdx === 0} className="px-1.5 py-0.5 text-[10px] text-gray-500 bg-white rounded disabled:opacity-30">上移</button>
                                <button onClick={() => moveSection(index, secIdx, 1)} disabled={secIdx === (node.sections?.length || 0) - 1} className="px-1.5 py-0.5 text-[10px] text-gray-500 bg-white rounded disabled:opacity-30">下移</button>
                                <button onClick={() => toggleSectionCollapse(node._id, secIdx)} className="px-2 py-1 text-[10px] font-medium text-gray-600 bg-white rounded">{sec.collapsed ? '展开' : '收起'}</button>
                              </div>
                            </div>
                            {!sec.collapsed && (
                              <div className="p-2 space-y-1">
                                {sec.subNodes?.map((sn: any, subIdx: number) => (
                                  <div key={sn._id || subIdx} className="flex items-start gap-2 p-1.5 hover:bg-gray-50 rounded group">
                                    <textarea value={sn.name} onChange={(e) => { const n = [...project.nodesData]; n[index].sections[secIdx].subNodes[subIdx].name = e.target.value; setProject({ ...project, nodesData: n }); }} onBlur={() => syncToDB(project.nodesData)} className="text-xs text-gray-700 bg-transparent border border-transparent focus:border-gold-400 rounded px-2 py-1 outline-none flex-1 resize-none overflow-hidden" rows={Math.max(2, Math.ceil((sn.name || '').length / 16))} onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} />
                                    <button onClick={async () => { if(await confirmUser('删除后无法恢复。', { title: '确定删除？', confirmStyle: 'danger', confirmText: '删除' })) { const n = [...project.nodesData]; n[index].sections[secIdx].subNodes.splice(subIdx, 1); syncToDB(n); }}} className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><Trash2 size={13} /></button>
                                  </div>
                                ))}
                                <button onClick={() => addBlankSubNode(node._id, secIdx)} className="text-[10px] text-gray-500 flex items-center gap-1 p-2 w-full justify-center border border-dashed border-gray-200 rounded mt-1"><Plus size={13} /> 添加检查项</button>
                              </div>
                            )}
                          </div>
                        ))}
                        <button onClick={() => addSection(index)} className="w-full py-2 text-xs font-medium text-gray-500 bg-white border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-1"><Plus size={14} /> 添加阶段</button>
                      </div>
                    )}
                  </div>
                ))}
                <button onClick={() => addNode()} className="w-full py-2.5 text-xs font-medium text-gray-500 bg-white border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-2"><Plus size={15} /> 新建节点</button>
              </div>
            ) : (
              /* ===== 移动端：查看模式 ===== */
                <div className={isStageDetail ? 'space-y-3' : 'space-y-3 bg-gray-50/60 p-3'}>
                  {project.nodesData?.map((node: any, index: number) => {
                    if (isStageDetail && index !== stageDetailIndex) return null;
                    const sections = node.sections || [];
                    const nodeSections = sections.flatMap((s: any) => s ? [s] : []);
                    const stageSummary = progressSummary.stageStatuses[index];
                    const hasCurrent = stageSummary?.status === 'current';
                    const allCompleted = stageSummary?.status === 'completed';
                    const isCurrentPosition = Boolean(stageSummary?.isCurrentPosition);
                    const badge = allCompleted ? '已完成' : hasCurrent ? '施工中' : '待开始';
                    const badgeClass = allCompleted ? 'bg-emerald-50 text-emerald-700' : hasCurrent ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500';
                    const actualStarts = nodeSections.map((s: any) => s.actualStartDate).filter(Boolean);
                    const actualEnds = nodeSections.map((s: any) => s.actualEndDate || (s.status === 'current' ? '至今' : '')).filter(Boolean);
                    const toMonthDay = (value: string) => value === '至今' ? value : String(value).slice(5, 10);
                    const actualRange = actualStarts.length ? `${toMonthDay(actualStarts[0])} ~ ${toMonthDay(actualEnds[actualEnds.length - 1] || '至今')}` : '';
                    const planStarts = nodeSections.map((s: any) => s.startDate).filter(Boolean);
                    const planEnds = nodeSections.map((s: any) => s.endDate).filter(Boolean);
                    const planRange = planStarts.length ? `${toMonthDay(planStarts[0])} ~ ${planEnds.length ? toMonthDay(planEnds[planEnds.length - 1]) : '未设置'}` : '';
                    const stagePercent = stageSummary?.stageTotal > 0
                      ? Math.min(100, Math.round((stageSummary.stageProgressed / stageSummary.stageTotal) * 100))
                      : (allCompleted ? 100 : 0);

                    return (
                      <div key={node._id || `mobile-node-${index}`} className={`relative ${!isStageDetail && index < (project.nodesData?.length || 0) - 1 ? 'pb-1' : ''}`}>
                        {!isStageDetail && index < (project.nodesData?.length || 0) - 1 && <div className="absolute bottom-0 left-[8px] top-[28px] w-px bg-gray-200" />}
                        {!isStageDetail && <div onClick={() => {
                          if (isStageDetail || isEditingNodes) return;
                          const scrollContainer = document.querySelector<HTMLElement>('[data-scroll="main"]');
                          sessionStorage.setItem(`project_detail_scroll_${id}`, String(scrollContainer?.scrollTop || 0));
                          navigate(`/projects-biz/${id}?stage=${index}`);
                        }} className={`w-full py-2 text-left ${!isStageDetail ? 'cursor-pointer' : ''}`}>
                          <div className="flex items-start gap-3">
                            {!isStageDetail && (
                              <span className={`relative z-10 mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 bg-white ${allCompleted ? 'border-emerald-500' : hasCurrent || isCurrentPosition ? 'border-amber-500' : 'border-gray-300'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${allCompleted ? 'bg-emerald-500' : hasCurrent || isCurrentPosition ? 'bg-amber-500' : 'bg-gray-300'}`} />
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                {isEditingNodes ? (
                                  <input
                                    value={node.name}
                                    onChange={(e) => {
                                      const newNodes = [...project.nodesData];
                                      newNodes[index].name = e.target.value;
                                      setProject({ ...project, nodesData: newNodes });
                                    }}
                                    onBlur={() => syncToDB(project.nodesData)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm font-medium text-gray-800 outline-none focus:border-gold-400"
                                  />
                                ) : (
                                  <div className={`truncate text-sm font-medium ${hasCurrent ? 'text-amber-600' : 'text-gray-800'}`}>
                                    {node.name}
                                  </div>
                                )}
                                {!isEditingNodes && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>{badge}</span>}
                              </div>
                              {!isEditingNodes && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    if (actualRange || !canManageConstruction || !nodeSections[0]) return;
                                    event.stopPropagation();
                                    setShowPlanDateModal({
                                      nodeId: node._id,
                                      secIdx: 0,
                                      name: `${node.name} · ${nodeSections[0].name || '阶段计划'}`,
                                      startDate: nodeSections[0].startDate || '',
                                      endDate: nodeSections[0].endDate || '',
                                    });
                                  }}
                                  className={`mt-1 text-left text-xs text-slate-500 ${!actualRange && canManageConstruction && nodeSections[0] ? 'underline decoration-dashed underline-offset-2' : ''}`}
                                >
                                  {actualRange ? `实际：${actualRange}` : planRange ? `计划：${planRange}` : '未设置计划时间'}
                                </button>
                              )}
                            </div>
                            {isEditingNodes ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleNodeCollapse(node._id);
                                }}
                                className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600"
                              >
                                {node.collapsed ? '展开' : '收起'}
                              </button>
                            ) : isStageDetail ? null : (
                              <div className="flex shrink-0 items-center gap-2">
                                <span className={`text-xs font-semibold ${allCompleted ? 'text-emerald-600' : hasCurrent || isCurrentPosition ? 'text-amber-600' : 'text-gray-400'}`}>{stagePercent}%</span>
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                          </div>
                        </div>}

                        {isStageDetail && (
                          <div className="space-y-2">
                            {(node.craftsmanship && node.craftsmanship.length > 0) && (
                              <details className="group border-y border-gray-200 bg-transparent px-1 py-2">
                                <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-gray-500">
                                  <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> 工艺标准</span>
                                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="mt-3 space-y-2">
                                  {node.craftsmanship.map((craft: any, cIdx: number) => (
                                    <div key={cIdx} className="rounded-lg border border-gray-100 bg-white p-2">
                                      <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">{craft?.text || ''}</p>
                                      {craft?.images && craft.images.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                          {craft.images.map((img: string, iIdx: number) => (
                                            <button key={iIdx} onClick={() => openPreview({ fileID: img }, craft.images.map((url: string) => ({ fileID: url })))} className="relative w-10 h-10 rounded-md overflow-hidden border border-gray-200 bg-white">
                                              <CloudImage src={img} alt="工艺标准图" className="w-full h-full object-cover" />
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {canShareCustomerProgress && <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                                  <button
                                    onClick={() => handleShareCraft(index, node.name)}
                                    className="flex items-center gap-1 rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white"
                                  >
                                    <Share2 className="w-3 h-3" /> 分享给客户
                                  </button>
                                </div>}
                              </details>
                            )}

                            {node.sections.map((section: any, secIdx: number) => {
                              const isSecCompleted = section.status === 'completed' || section.submitted;
                              const isSecCurrent = section.status === 'current';
                              const isSecPending = !section.status || section.status === 'pending';
                              const isEditingRecord = editingRecordKey === `${node._id}-${secIdx}`;
                              const canEditRecord = canManageConstruction && !isEditingNodes && (isSecCurrent || isEditingRecord);
                              const secBadge = isSecCompleted ? '已完成' : isSecCurrent ? '施工中' : '待开始';
                              const secBadgeClass = isSecCompleted ? 'bg-emerald-50 text-emerald-700' : isSecCurrent ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500';
                              const latestEditTime = section.updateTime || section.lastEditedAt || section.submitTime;

                              return (
                                <div key={secIdx} className={`overflow-hidden rounded-xl border ${isSecCurrent ? 'border-amber-400' : 'border-gray-100'} bg-white shadow-sm`}>
                                  <div
                                    className="px-3 py-3 bg-white cursor-pointer"
                                    onClick={() => !isEditingNodes && toggleSectionCollapse(node._id, secIdx)}
                                  >
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          {isEditingNodes ? (
                                            <input
                                              value={section.name}
                                              onChange={(e) => {
                                                const newNodes = [...project.nodesData];
                                                newNodes[index].sections[secIdx].name = e.target.value;
                                                setProject({ ...project, nodesData: newNodes });
                                              }}
                                              onBlur={() => syncToDB(project.nodesData)}
                                              className="w-full rounded-lg border border-gray-200 px-2 py-1 text-sm font-medium text-gray-800 outline-none focus:border-gold-400"
                                            />
                                          ) : (
                                            <div className="truncate text-sm font-medium text-gray-800">{section.name}</div>
                                          )}
                                        </div>
                                      {!isEditingNodes && (
                                        <div className="flex shrink-0 items-center gap-2">
                                          <span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium leading-none ${secBadgeClass}`}>{isEditingRecord ? '编辑中' : secBadge}</span>
                                          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${section.collapsed ? '-rotate-90' : ''}`} />
                                        </div>
                                      )}
                                      </div>
                                      {!isEditingNodes && (
                                        <div className="space-y-1 text-[11px] leading-relaxed text-gray-500">
                                          {(section.startDate || section.endDate) && (
                                            <div className="flex items-center justify-between">
                                              <span>计划：{section.startDate || '-'} ~ {section.endDate || '-'}</span>
                                              {section.startDate && section.endDate && <span className="text-gray-400">{getPlanDays(section.startDate, section.endDate)}天</span>}
                                            </div>
                                          )}
                                          {(section.actualStartDate || section.actualEndDate) && (
                                            <div className="flex items-center justify-between">
                                              <span>实际：{section.actualStartDate || '-'} ~ {section.actualEndDate || '至今'}</span>
                                              {section.actualStartDate && section.actualEndDate && <span className="text-gray-400">{getPlanDays(section.actualStartDate, section.actualEndDate)}天</span>}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {canManageConstruction && !isEditingNodes && isSecPending && !section.submitted && !section.actualStartDate && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setShowPlanDateModal({
                                              nodeId: node._id,
                                              secIdx,
                                              name: section.name,
                                              startDate: section.startDate || '',
                                              endDate: section.endDate || '',
                                            });
                                          }}
                                          className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600"
                                        >
                                          {section.startDate || section.endDate ? '修改计划时间' : '设置计划时间'}
                                        </button>
                                      )}
                                    </div>
                                    {canManageConstruction && !isEditingNodes && isSecPending && !section.submitted && (
                                      <div className="mt-3 flex justify-end">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startSectionNode(node._id, secIdx);
                                          }}
                                          disabled={isProjectActionBusy(`start-${node._id}-${secIdx}`)}
                                          className="rounded-full border border-gold-500 px-3 py-1 text-xs font-medium text-gold-600 disabled:opacity-50"
                                        >
                                          {isProjectActionBusy(`start-${node._id}-${secIdx}`) ? '处理中...' : '开工'}
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {!section.collapsed && (
                                    <div className="border-t border-gray-100 bg-white px-3 py-2">
                                      {section.subNodes?.map((sn: any, subIdx: number) => {
                                        const subNodeUploadTasks = uploadTasks.filter(task =>
                                          task.context?.scope === 'project-node-media' &&
                                          task.context?.projectId === projectUploadTaskKey &&
                                          task.context?.subNodeId === sn._id &&
                                          visibleUploadStatuses.includes(task.status)
                                        );
                                        const photos = [
                                          ...(sn.acceptanceRecord?.photos || []),
                                          ...subNodeUploadTasks.map(task => ({
                                            fileID: `uploading:${task.id}`,
                                            url: '',
                                            type: task.file.type.startsWith('video/') ? 'video' : 'image',
                                            name: task.fileName,
                                            size: task.fileSize,
                                            sizeStr: (task.fileSize / 1024).toFixed(1) + 'KB',
                                            uploader: myName,
                                            uploadTime: new Date(task.createdAt).toISOString(),
                                            isUploading: true,
                                            uploadStatus: task.status,
                                            uploadProgress: task.progress,
                                            uploadTaskId: task.id,
                                          })),
                                        ];
                                        return (
                                        <div key={sn._id || subIdx} className="border-b border-dashed border-gray-100 py-3 last:border-b-0">
                                          <div className="flex items-center gap-2">
                                            {shareSelect && shareSelect.nodeIdx === index && shareSelect.secIdx === secIdx && subHasPhoto(sn) && (
                                              <span onClick={() => toggleShareSelectItem(subIdx)} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer ${shareSelect.checked[subIdx] ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                                                {shareSelect.checked[subIdx] && <Check className="w-3.5 h-3.5 text-white" />}
                                              </span>
                                            )}
                                            {isEditingNodes ? (
                                              <textarea
                                                value={sn.name}
                                                onChange={(e) => updateSubNodeName(index, secIdx, subIdx, e.target.value)}
                                                onBlur={() => syncToDB(project.nodesData)}
                                                rows={Math.max(2, Math.ceil((sn.name || '').length / 18))}
                                                className="min-h-[44px] flex-1 resize-none rounded-lg border border-gray-200 px-2 py-1.5 text-sm leading-relaxed text-gray-800 outline-none focus:border-gold-400"
                                                placeholder="检查项内容"
                                              />
                                            ) : (
                                              <div className="flex-1 text-xs leading-relaxed text-gray-600 whitespace-pre-wrap break-words">{sn.name}</div>
                                            )}
                                            {canManageConstructionStructure && isEditingNodes && (
                                              <button onClick={() => deleteSubNode(node._id, secIdx, subIdx)} className="mt-1 rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            )}
                                          </div>
                                          {(photos.length > 0 || canEditRecord) && (
                                            <div className="mt-2 grid w-full grid-cols-4 gap-1.5">
                                              {photos.map((p: any, pi: number) => {
                                                const isVideo = p.type === 'video' || (p.url && !!p.url.match(/\.(mp4|mov|avi)$/i));
                                                return (
                                                  <div key={pi} className="relative aspect-square min-w-0">
                                                  <button onClick={() => {
                                                    if (p.isUploading) return;
                                                    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                                                    const isSecCompleted = section.status === 'completed' || section.submitted;
                                                    if (canEditRecord && isMobile && !isSecCompleted) {
                                                      setNodePhotoAction({ photo: p, photos, nodeId: node._id, secIdx, subIdx, photoIdx: pi, canDelete: canEditRecord });
                                                    } else {
                                                      openPreview(p, photos, canEditRecord ? { nodeId: node._id, secIdx, subIdx, photoIdx: pi } : null);
                                                    }
                                                  }} className="relative h-full w-full overflow-hidden rounded-[5px] border border-gray-200 bg-gray-100 flex items-center justify-center">
                                                    {p.isUploading ? (
                                                      <ImageIcon className="h-5 w-5 text-gray-300" />
                                                    ) : isVideo ? (
                                                      <CloudVideo src={p.url || p.fileID} poster={p.poster || p.thumbUrl || p.thumbTempFilePath} className="h-full w-full object-cover" />
                                                    ) : (
                                                      <CloudImage src={p.url || p.fileID} className="h-full w-full object-cover" alt="现场照片" />
                                                    )}
                                                    {isVideo && <VideoPlayBadge className="rounded-[5px]" />}
                                                  </button>
                                                  <UploadingMediaOverlay item={p} onRetry={retryUploadTask} onRemove={removeUploadTask} />
                                                  </div>
                                                );
                                              })}
                                              {canEditRecord && (
                                                <button
                                                  onClick={() => triggerSubNodePhoto(sn._id)}
                                                  disabled={uploadingSubNode === sn._id}
                                                  className="flex aspect-square h-full w-full items-center justify-center rounded-[5px] border border-dashed border-gray-300 bg-gray-50 text-gray-500 disabled:opacity-50"
                                                >
                                                  {uploadingSubNode === sn._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        );
                                      })}
                                      {!isEditingNodes && (
                                        <div className="border-t border-gray-100 pt-3">
                                          {canEditRecord ? (
                                            <textarea
                                              value={section.recordRemark || ''}
                                              onChange={(e) => updateSectionRecordRemark(node._id, secIdx, e.target.value)}
                                              onBlur={(e) => updateSectionRecordRemark(node._id, secIdx, e.target.value, true)}
                                              rows={3}
                                              placeholder="填写备注（仅内部可见）..."
                                              className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none focus:border-gold-400"
                                            />
                                          ) : section.recordRemark ? (
                                            <div className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{section.recordRemark}</div>
                                          ) : null}
                                        </div>
                                      )}
                                      {canManageConstructionStructure && isEditingNodes && (
                                        <button onClick={() => addBlankSubNode(node._id, secIdx)} className="my-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-500">
                                          <Plus className="h-4 w-4" /> 新增检查项
                                        </button>
                                      )}
                                      {(canManageConstruction || canShareCustomerProgress) && !isEditingNodes && (
                                        <div className="space-y-2 pt-1">
                                          {latestEditTime && (
                                            <div className="text-right text-[11px] text-gray-400">最近编辑：{latestEditTime}</div>
                                          )}
                                          <div className="grid grid-cols-2 gap-2">
                                            {canManageConstruction && isSecCurrent && (
                                              <button
                                                onClick={() => completeSectionNode(node._id, secIdx)}
                                                disabled={isProjectActionBusy(`submit-${node._id}-${secIdx}`)}
                                                className="rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white disabled:opacity-50"
                                              >
                                                {isProjectActionBusy(`submit-${node._id}-${secIdx}`) ? '提交中...' : '提交记录'}
                                              </button>
                                            )}
                                            {canManageConstruction && isSecCompleted && isEditingRecord && (
                                              <button
                                                onClick={() => completeSectionNode(node._id, secIdx)}
                                                disabled={isProjectActionBusy(`submit-${node._id}-${secIdx}`)}
                                                className="rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white disabled:opacity-50"
                                              >
                                                {isProjectActionBusy(`submit-${node._id}-${secIdx}`) ? '提交中...' : '提交'}
                                              </button>
                                            )}
                                            {canManageConstruction && isSecCompleted && !isEditingRecord && !(shareSelect && shareSelect.nodeIdx === index && shareSelect.secIdx === secIdx) && (
                                              <button
                                                onClick={() => startEditingSectionRecord(node._id, secIdx)}
                                                className="rounded-lg bg-gray-100 py-2 text-xs font-medium text-gray-700"
                                              >
                                                编辑记录
                                              </button>
                                            )}
                                            {/* 开工后任意时刻均可分享，不要求阶段已完工 */}
                                            {canShareCustomerProgress && !isSecPending && !isEditingRecord && (
                                              shareSelect && shareSelect.nodeIdx === index && shareSelect.secIdx === secIdx ? (
                                                <div className="col-span-2 flex gap-2">
                                                  <button
                                                    onClick={() => toggleShareSelectAll(section)}
                                                    className={`flex-none px-4 rounded-lg py-2 text-xs font-medium transition-colors ${isAllShareSelected(section) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                                                  >
                                                    全选
                                                  </button>
                                                  <button
                                                    onClick={cancelShareSelect}
                                                    className="flex-none px-4 rounded-lg bg-gray-100 py-2 text-xs font-medium text-gray-600"
                                                  >
                                                    取消
                                                  </button>
                                                  <button
                                                    onClick={confirmShareSelect}
                                                    className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
                                                  >
                                                    <Share2 className="w-3.5 h-3.5" /> 确认分享
                                                  </button>
                                                </div>
                                              ) : (
                                                <button
                                                  onClick={() => enterShareSelect(index, secIdx, section)}
                                                  className="rounded-lg bg-gray-900 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5"
                                                >
                                                  <Share2 className="w-3.5 h-3.5" /> 分享给客户
                                                </button>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>

            {/* 节点树 */}
            {/* 节点树 — 编辑模式：对齐模板库 UI */}
            {isEditingNodes ? (
              <div className="hidden md:block space-y-2">
                {project.nodesData?.map((node: any, index: number) => (
                  <div 
                    key={node._id || `node-${index}`} 
                    className={`bg-white rounded-lg border transition-all ${
                      draggedNodeIndex === index ? 'opacity-50 border-gold-400' :
                      dragOverNodeIndex === index ? 'border-gold-400 border-dashed border-2' :
                      'border-gray-200'
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    {/* 节点头部 */}
                    <div className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50/50 transition-colors border-b border-gray-100">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            if(await confirmUser('该大节点及其包含的所有内容都会被删除。', { title: '确定删除该大节点吗？', confirmStyle: 'danger', confirmText: '删除' })) {
                              const newNodes = [...project.nodesData];
                              newNodes.splice(index, 1);
                              syncToDB(newNodes);
                            }
                          }}
                          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                          title="删除节点"
                        >
                          <Trash2 size={13} />
                        </button>
                        <input 
                          value={node.name}
                          onChange={(e) => {
                            const newNodes = [...project.nodesData];
                            newNodes[index].name = e.target.value;
                            setProject({ ...project, nodesData: newNodes });
                          }}
                          onBlur={() => syncToDB(project.nodesData)}
                          className="min-w-0 flex-1 text-sm font-medium text-gray-800 bg-transparent border border-transparent hover:border-gray-200 focus:border-gold-400 focus:bg-white rounded px-2 py-1 outline-none"
                        />
                        <span className="hidden sm:inline-flex shrink-0 rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-500">
                          工艺标准 {node.craftsmanship?.length || 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveNode(index, -1)} disabled={index === 0} className="px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">上移</button>
                          <button onClick={() => moveNode(index, 1)} disabled={index === (project.nodesData?.length || 0) - 1} className="px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">下移</button>
                        </div>
                        <button onClick={() => toggleNodeCollapse(node._id)} className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded">
                          {node.collapsed ? '展开' : '收起'}
                        </button>
                        <div className="hidden md:block cursor-grab hover:text-gold-500 text-gray-400 p-1 pl-2 border-l border-gray-200 ml-1" title="拖拽排序">
                          <span className="text-lg font-bold">≡</span>
                        </div>
                      </div>
                    </div>

                    {/* 展开内容 */}
                    {!node.collapsed && (
                      <div className="p-3 bg-white space-y-3 border-t border-gray-100">
                        {/* 工艺标准 — 桌面编辑 */}
                        {((node.craftsmanship && node.craftsmanship.length > 0) || node.craftCollapsed === false) ? (
                        <div className="rounded-lg border border-gray-100 bg-gray-50/40 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newNodes = [...project.nodesData];
                                newNodes[index].craftCollapsed = !newNodes[index].craftCollapsed;
                                setProject({ ...project, nodesData: newNodes });
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              {node.craftCollapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                              <span className="text-xs font-medium text-gray-700">
                                工艺标准 <span className="text-gray-400 font-normal">({node.craftsmanship?.length || 0})</span>
                              </span>
                            </button>
                            <button onClick={() => addProjectCraftsmanship(node._id)} className="inline-flex items-center gap-1 text-[11px] text-gold-600 hover:text-gold-700">
                              <Plus size={13} /> 添加
                            </button>
                          </div>
                          {!node.craftCollapsed && ((!node.craftsmanship || node.craftsmanship.length === 0) ? (
                            <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">暂无工艺标准，可按阶段预置文字和图片。</div>
                          ) : (
                            <div className="border-t border-gray-100 p-3 space-y-2">
                              {node.craftsmanship.map((craft: any, craftIdx: number) => (
                                <div key={craftIdx} className="rounded-lg bg-white border border-gray-100 p-2">
                                  <div className="flex items-center justify-end gap-2 mb-1.5">
                                    <button onClick={() => removeProjectCraftsmanship(node._id, craftIdx)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                  <textarea
                                    value={craft?.text || ''}
                                    onChange={(e) => updateProjectCraftsmanship(node._id, craftIdx, { text: e.target.value })}
                                    onBlur={(e) => updateProjectCraftsmanship(node._id, craftIdx, { text: e.target.value }, true)}
                                    rows={Math.min(12, Math.max(4, Math.ceil((craft?.text || '').length / 28)))}
                                    placeholder="输入工艺标准..."
                                    className="min-h-[120px] w-full resize-y rounded-lg border border-gray-100 px-2 py-1.5 text-xs md:text-sm text-gray-700 outline-none focus:border-gold-300"
                                  />
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {(craft?.images || []).map((img: string, imgIdx: number) => (
                                      <div key={`${img}-${imgIdx}`} className="relative h-14 w-14 overflow-hidden rounded-lg border border-gray-200 bg-white">
                                        <button type="button" onClick={() => openPreview({ fileID: img }, (craft?.images || []).map((url: string) => ({ fileID: url })))} className="h-full w-full">
                                          <CloudImage src={img} alt="工艺标准图" className="h-full w-full object-cover" />
                                        </button>
                                        <button
                                          onClick={() => updateProjectCraftsmanship(node._id, craftIdx, { images: (craft?.images || []).filter((_: string, i: number) => i !== imgIdx) }, true)}
                                          className="absolute right-0.5 top-0.5 rounded-full bg-black/45 p-0.5 text-white"
                                        >
                                          <X size={10} />
                                        </button>
                                      </div>
                                    ))}
                                    <label className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white text-[10px] text-gray-400 hover:text-gold-600">
                                      <ImageIcon size={15} />
                                      {isProjectActionBusy(`craft-${node._id}-${craftIdx}`) ? '上传中' : '图片'}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        disabled={isProjectActionBusy(`craft-${node._id}-${craftIdx}`)}
                                        onChange={(e) => {
                                          uploadProjectCraftsmanshipImages(node._id, craftIdx, e.target.files);
                                          e.currentTarget.value = '';
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        ) : (
                          <button onClick={() => addProjectCraftsmanship(node._id)} className="w-full py-2 text-xs font-medium text-gray-400 border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-1 hover:text-gold-600 hover:border-gold-300 transition-colors"><Plus size={14} /> 添加工艺标准</button>
                        )}

                        {/* 阶段列表 */}
                        {node.sections?.map((sec: any, secIdx: number) => (
                          <div key={secIdx} className="rounded-lg border border-gray-100 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50/60 border-b border-gray-100">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <button 
                                  onClick={async (e) => {
                            e.stopPropagation();
                            if(await confirmUser('删除后无法恢复。', { title: '确定删除该阶段吗？', confirmStyle: 'danger', confirmText: '删除' })) {
                                      const newNodes = [...project.nodesData];
                                      newNodes[index].sections.splice(secIdx, 1);
                                      syncToDB(newNodes);
                                    }
                                  }}
                                  className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                                  title="删除阶段"
                                >
                                  <Trash2 size={12} />
                                </button>
                                <input 
                                  value={sec.name}
                                  onChange={(e) => {
                                    const newNodes = [...project.nodesData];
                                    newNodes[index].sections[secIdx].name = e.target.value;
                                    setProject({ ...project, nodesData: newNodes });
                                  }}
                                  onBlur={() => syncToDB(project.nodesData)}
                                  className="min-w-0 flex-1 text-xs md:text-sm font-medium text-gray-700 bg-transparent border border-transparent hover:border-gray-200 focus:border-gold-400 focus:bg-white rounded px-2 py-1 outline-none"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => moveSection(index, secIdx, -1)} disabled={secIdx === 0} className="px-1.5 py-0.5 text-[10px] md:text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">上移</button>
                                <button onClick={() => moveSection(index, secIdx, 1)} disabled={secIdx === (node.sections?.length || 0) - 1} className="px-1.5 py-0.5 text-[10px] md:text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">下移</button>
                                <button onClick={() => toggleSectionCollapse(node._id, secIdx)} className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-white hover:bg-gray-100 rounded">
                                  {sec.collapsed ? '展开' : '收起'}
                                </button>
                              </div>
                            </div>
                            {!sec.collapsed && (
                              <div className="p-2 space-y-1">
                                {sec.subNodes?.map((sn: any, subIdx: number) => (
                                  <div key={sn._id || subIdx} className="flex items-start gap-2 p-1.5 hover:bg-gray-50 rounded group">
                                    <textarea 
                                      value={sn.name}
                                      onChange={(e) => {
                                        const newNodes = [...project.nodesData];
                                        newNodes[index].sections[secIdx].subNodes[subIdx].name = e.target.value;
                                        setProject({ ...project, nodesData: newNodes });
                                      }}
                                      onBlur={() => syncToDB(project.nodesData)}
                                      className="text-xs md:text-sm text-gray-700 bg-transparent border border-transparent hover:border-gray-200 focus:border-gold-400 focus:bg-white rounded px-2 py-1 outline-none flex-1 min-h-[30px] resize-none overflow-hidden"
                                      rows={Math.max(2, Math.ceil((sn.name || '').length / 18))}
                                      onInput={(e) => {
                                        const target = e.target as HTMLTextAreaElement;
                                        target.style.height = 'auto';
                                        target.style.height = target.scrollHeight + 'px';
                                      }}
                                    />
                                    <div className="flex shrink-0 flex-col md:flex-row items-end md:items-center gap-1">
                                      <button onClick={() => moveSubNode(index, secIdx, subIdx, -1)} disabled={subIdx === 0} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">上移</button>
                                      <button onClick={() => moveSubNode(index, secIdx, subIdx, 1)} disabled={subIdx === (sec.subNodes?.length || 0) - 1} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">下移</button>
                                      <button
                                        onClick={async () => {
                                          if(await confirmUser('删除后无法恢复。', { title: '确定删除该检查项吗？', confirmStyle: 'danger', confirmText: '删除' })) {
                                            const newNodes = [...project.nodesData];
                                            newNodes[index].sections[secIdx].subNodes.splice(subIdx, 1);
                                            syncToDB(newNodes);
                                          }
                                        }}
                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <button 
                                  onClick={() => addBlankSubNode(node._id, secIdx)}
                                  className="text-[11px] md:text-xs text-gray-500 hover:text-gold-600 flex items-center gap-1 p-2 w-full justify-center border border-dashed border-gray-200 rounded mt-2 hover:bg-gold-50 transition-colors"
                                >
                                  <Plus size={14} /> 添加检查项
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        <button 
                          onClick={() => addSection(index)}
                          className="w-full py-2 text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-1 transition-colors"
                        >
                          <Plus size={16} /> 添加阶段
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <button 
                  onClick={() => addNode()}
                  className="w-full py-3 text-xs md:text-sm font-medium text-gray-500 bg-white hover:bg-gray-50 border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus size={16} /> 新建节点
                </button>
              </div>
            ) : (
              /* ===== 查看模式：保留原有布局 ===== */
              <div className="hidden md:block space-y-2">
                {project.nodesData?.map((node: any, index: number) => {
                  const stageSummary = progressSummary.stageStatuses[index];
                  const nodeProgressed = stageSummary?.stageProgressed || 0;
                  const nodeTotal = stageSummary?.stageTotal || 0;
                  const nodeIsCompleted = stageSummary?.status === 'completed';

                  return (
                    <div key={node._id || `node-${index}`} className="bg-white rounded-xl border overflow-hidden transition-all border-gray-200">
                      <div className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => toggleNodeCollapse(node._id)}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                            nodeIsCompleted ? 'border-emerald-500 bg-emerald-500 text-white' : nodeProgressed > 0 ? 'border-gold-500 text-gold-500 bg-white' : 'border-gray-200 text-gray-300 bg-white'
                          }`}>
                            {nodeIsCompleted ? <CheckCircle size={14} className="text-white" /> : <Circle size={10} className={nodeProgressed > 0 ? 'fill-gold-500 text-gold-500' : 'fill-gray-200 text-gray-200'} />}
                          </div>
                          <div className="flex-1 text-left flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{node.name}</span>
                            <span className="text-xs text-gray-400">{nodeProgressed}/{nodeTotal}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggleNodeCollapse(node._id)} className="p-1 hover:bg-gray-200 rounded text-gray-400">
                            {node.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {!node.collapsed && (
                        <div className="border-t border-gray-100 bg-gray-50/50 p-3 space-y-3">
                          {/* 工艺标准 */}
                          {(node.craftsmanship && node.craftsmanship.length > 0) && (
                            <details className="group bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-gray-800">
                                <div className="flex items-center gap-2">
                                  <BookOpen className="w-4 h-4 text-gold-500 shrink-0" />
                                  <span>工艺标准</span>
                                  <span className="text-xs font-normal text-gray-400">({node.craftsmanship.length})</span>
                                </div>
                                <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
                              </summary>
                              <div className="mt-3 space-y-3">
                                {node.craftsmanship.map((craft: any, cIdx: number) => (
                                   <div key={cIdx} className="bg-gray-50 rounded-lg p-3">
                                     <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{craft?.text || ''}</p>
                                     {craft?.images && craft.images.length > 0 && (
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {craft.images.map((img: string, iIdx: number) => (
                                          <button key={iIdx} onClick={() => openPreview({ fileID: img }, craft.images.map((url: string) => ({ fileID: url })))} className="relative w-14 h-14 rounded-md overflow-hidden border border-gray-200 bg-white">
                                            <CloudImage src={img} alt="工艺标准图" className="w-full h-full object-cover" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {canShareCustomerProgress && <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                                <button
                                  onClick={() => handleShareCraft(index, node.name)}
                                  className="flex items-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                  分享给客户
                                </button>
                              </div>}
                            </details>
                          )}

                          {/* 阶段与检查项 */}
                          {node.sections.map((section: any, secIdx: number) => {
                            const isSecCompleted = section.status === 'completed' || section.submitted;
                            const isSecCurrent = section.status === 'current';
                            const isSecPending = !section.status || section.status === 'pending';
                            const isEditingRecord = editingRecordKey === `${node._id}-${secIdx}`;
                            const canEditRecord = canManageConstruction && (isSecCurrent || isEditingRecord);
                            const latestEditTime = section.updateTime || section.lastEditedAt || section.submitTime;
                            const planStart = section.startDate || null;
                            const planEnd = section.endDate || null;
                            const actualStart = section.actualStartDate || null;
                            const actualEnd = section.actualEndDate || null;
                            const today = new Date().toISOString().slice(0, 10);

                            const getPlanDays = (s: string, e: string) => {
                              if (!s || !e) return 0;
                              return Math.max(1, Math.floor((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1);
                            };
                            const getDelayDays = (actualEnd: string, end: string) => {
                              if (!actualEnd || !end) return 0;
                              const diff = new Date(actualEnd).getTime() - new Date(end).getTime();
                              return diff > 0 ? Math.floor(diff / 86400000) : 0;
                            };
                            const getOverdueDays = (end: string) => {
                              if (!end) return 0;
                              const diff = new Date(today).getTime() - new Date(end).getTime();
                              return diff > 0 ? Math.floor(diff / 86400000) : 0;
                            };

                            return (
                              <div key={secIdx} className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3">
                                {section.name && (
                                  <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${isSecCurrent ? 'text-amber-600' : 'text-gray-800'}`}>{section.name}</span>
                                        {isSecCompleted ? (
                                          (actualEnd && planEnd && actualEnd > planEnd) ? 
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">逾期 {getDelayDays(actualEnd, planEnd)} 天</span> :
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-bold">{actualEnd ? '按时完成' : '已公开'}</span>
                                        ) : isSecCurrent ? (
                                          (planEnd && getOverdueDays(planEnd) > 0) ?
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">逾期 {getOverdueDays(planEnd)} 天</span> :
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-bold border border-amber-200">进行中</span>
                                        ) : (
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 font-bold">待开始</span>
                                        )}
                                      </div>
                                      <button onClick={() => toggleSectionCollapse(node._id, secIdx)} className="p-1 hover:bg-gray-200 rounded text-gray-400">
                                        {section.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                      </button>
                                    </div>
                                    <div className="text-[11px] text-gray-500 flex flex-col gap-1.5">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                          <span className="w-10 text-gray-400">计划：</span>
                                          {planStart && planEnd ? <span>{planStart} ~ {planEnd}</span> : planStart ? <span>{planStart} ~ 未设置</span> : <span className="text-gray-300">未设置计划时间</span>}
                                        </div>
                                        {planStart && planEnd && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] text-gray-400">计划 {getPlanDays(planStart, planEnd)} 天</span>}
                                      </div>
                                      {(actualStart || section.submitTime) && (
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1">
                                            <span className="w-10 text-gray-400">实际：</span>
                                            {actualStart ? <span>{actualStart} ~ {actualEnd || '至今'}</span> : <span>完工于 {section.submitTime}</span>}
                                          </div>
                                          {actualStart && (actualEnd || !isSecCompleted) && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] text-gray-400">实际 {getPlanDays(actualStart, actualEnd)} 天</span>}
                                        </div>
                                      )}
                                      {isSecCompleted && actualEnd && planEnd && actualEnd > planEnd && (
                                        <div className="mt-1 bg-red-50 border border-red-100 text-red-600 p-2 rounded">
                                          <span className="font-bold">逾期原因：</span>
                                          {section.delayReason ? (
                                            <span onClick={() => canManageConstruction && setDelayReasonModal({ open: true, nodeId: node._id, secIdx, name: section.name, reason: section.delayReason })} className={canManageConstruction ? 'cursor-pointer' : ''}>{section.delayReason}</span>
                                          ) : (
                                            <span>* 此阶段已逾期，请补充填写逾期原因 {canManageConstruction && <span onClick={() => setDelayReasonModal({ open: true, nodeId: node._id, secIdx, name: section.name, reason: '' })} className="ml-2 text-gold-600 underline cursor-pointer">去填写</span>}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div className={section.collapsed ? 'hidden' : ''}>
                                  {section.subNodes?.map((sn: any, subIdx: number) => {
                                    const inShareSelect = !!(shareSelect && shareSelect.nodeIdx === index && shareSelect.secIdx === secIdx);
                                    const selectable = inShareSelect && subHasPhoto(sn);
                                    const subNodeUploadTasks = uploadTasks.filter(task =>
                                      task.context?.scope === 'project-node-media' &&
                                      task.context?.projectId === projectUploadTaskKey &&
                                      task.context?.subNodeId === sn._id &&
                                      visibleUploadStatuses.includes(task.status)
                                    );
                                    const photos = [
                                      ...(sn.acceptanceRecord?.photos || []),
                                      ...subNodeUploadTasks.map(task => ({
                                        fileID: `uploading:${task.id}`,
                                        url: '',
                                        type: task.file.type.startsWith('video/') ? 'video' : 'image',
                                        name: task.fileName,
                                        size: task.fileSize,
                                        sizeStr: (task.fileSize / 1024).toFixed(1) + 'KB',
                                        uploader: myName,
                                        uploadTime: new Date(task.createdAt).toISOString(),
                                        isUploading: true,
                                        uploadStatus: task.status,
                                        uploadProgress: task.progress,
                                        uploadTaskId: task.id,
                                      })),
                                    ];
                                    return (
                                    <div key={sn._id} className={`flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0 ${sn.status === 'completed' ? 'bg-emerald-50/20' : ''} ${selectable ? 'cursor-pointer hover:bg-gold-50/40' : ''}`} onClick={selectable ? () => toggleShareSelectItem(subIdx) : undefined}>
                                      {inShareSelect && (
                                        selectable ? (
                                          <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${shareSelect!.checked[subIdx] ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                                            {shareSelect!.checked[subIdx] && <Check className="w-3.5 h-3.5 text-white" />}
                                          </span>
                                        ) : (
                                          <span className="w-5 h-5 shrink-0" />
                                        )
                                      )}
                                      <span className="text-sm font-medium text-gray-400 w-5 text-right shrink-0">{subIdx + 1}.</span>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="text-sm leading-relaxed text-gray-700">{sn.name}</div>
                                          {canManageConstruction && canEditRecord && (
                                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                              <button onClick={() => triggerSubNodePhoto(sn._id)} disabled={uploadingSubNode === sn._id} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gold-600 transition-colors">
                                                {uploadingSubNode === sn._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                        {sn.checklist && sn.checklist.length > 0 && (
                                          <div className="mt-2 space-y-1">
                                            {sn.checklist.map((item: string, ci: number) => (
                                              <label key={ci} className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                <input type="checkbox" disabled={!canManageConstruction || sn.status === 'completed'} checked={sn.acceptanceRecord?.checklist?.[ci] || false}
                                                  onChange={() => {
                                                    const newNodesData = [...(project.nodesData || [])];
                                                    const nd = newNodesData.find((n: any) => n._id === node._id);
                                                    if (!nd) return;
                                                    const t = nd.sections[secIdx].subNodes[subIdx];
                                                    if (!t.acceptanceRecord) t.acceptanceRecord = {};
                                                    if (!t.acceptanceRecord.checklist) t.acceptanceRecord.checklist = [];
                                                    t.acceptanceRecord.checklist[ci] = !t.acceptanceRecord.checklist[ci];
                                                    setProject({ ...project, nodesData: newNodesData });
                                                    syncToDB(newNodesData);
                                                  }}
                                                  className="mt-0.5 accent-gold-400" />
                                                <span className={sn.acceptanceRecord?.checklist?.[ci] ? 'line-through text-gray-400' : ''}>{item}</span>
                                              </label>
                                            ))}
                                          </div>
                                        )}
                                        {sn.acceptanceRecord?.remark && (
                                          <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg whitespace-pre-wrap">{sn.acceptanceRecord.remark}</div>
                                        )}
                                        {photos.length > 0 && (
                                          <div className="mt-2 grid w-full grid-cols-4 gap-1 md:hidden">
                                            {photos.map((p: any, pi: number) => {
                                              const isVideo = p.type === 'video' || (p.url && !!p.url.match(/\.(mp4|mov|avi)$/i));
                                              return (
                                                <div key={pi} className="relative group aspect-square">
                                                  <button onClick={() => {
                                                    if (p.isUploading) return;
                                                    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                                                    const isSecCompleted = section.status === 'completed' || section.submitted;
                                                    if (canEditRecord && isMobile && !isSecCompleted) {
                                                      setNodePhotoAction({ photo: p, photos, nodeId: node._id, secIdx, subIdx, photoIdx: pi, canDelete: canEditRecord });
                                                    } else {
                                                      openPreview(p, photos, canEditRecord ? { nodeId: node._id, secIdx, subIdx, photoIdx: pi } : null);
                                                    }
                                                  }} className="relative w-full h-full rounded-[5px] bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                                                    {p.isUploading ? (
                                                      <ImageIcon className="h-5 w-5 text-gray-300" />
                                                    ) : isVideo ? (
                                                      <CloudVideo src={p.url || p.fileID} poster={p.poster || p.thumbUrl || p.thumbTempFilePath} className="w-full h-full object-cover" />
                                                    ) : (
                                                      <CloudImage src={p.url || p.fileID} className="w-full h-full object-cover" alt="现场照片" />
                                                    )}
                                                    {isVideo && <VideoPlayBadge className="rounded-[5px]" />}
                                                  </button>
                                                  <UploadingMediaOverlay item={p} onRetry={retryUploadTask} onRemove={removeUploadTask} />
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {photos.length > 0 && (
                                          <div className="mt-2 hidden md:flex md:flex-wrap md:gap-2">
                                            {photos.map((p: any, pi: number) => {
                                              const isVideo = p.type === 'video' || (p.url && !!p.url.match(/\.(mp4|mov|avi)$/i));
                                              return (
                                                <div key={pi} className="relative group">
                                                  <button onClick={() => { if (!p.isUploading) openPreview(p, photos, canEditRecord ? { nodeId: node._id, secIdx, subIdx, photoIdx: pi } : null); }} className="h-14 w-14 overflow-hidden rounded-[5px] border border-gray-200 bg-gray-100 flex items-center justify-center">
                                                    {p.isUploading ? (
                                                      <ImageIcon className="h-5 w-5 text-gray-300" />
                                                    ) : isVideo ? (
                                                      <CloudVideo src={p.url || p.fileID} poster={p.poster || p.thumbUrl || p.thumbTempFilePath} className="h-full w-full object-cover" />
                                                    ) : (
                                                      <CloudImage src={p.url || p.fileID} className="h-full w-full object-cover" alt="现场照片" />
                                                    )}
                                                    {isVideo && <VideoPlayBadge className="rounded-[5px]" />}
                                                  </button>
                                                  <UploadingMediaOverlay item={p} onRetry={retryUploadTask} onRemove={removeUploadTask} />
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    );
                                  })}
                                  <div className="border-t border-gray-100 bg-white p-4 space-y-3">
                                    {(canEditRecord || section.recordRemark) && (
                                      canEditRecord ? (
                                        <textarea value={section.recordRemark || ''} onChange={(e) => updateSectionRecordRemark(node._id, secIdx, e.target.value)}
                                          onBlur={(e) => updateSectionRecordRemark(node._id, secIdx, e.target.value, true)} rows={3} placeholder="填写备注..."
                                          className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-800 outline-none focus:border-gold-400" />
                                      ) : (
                                        <div className="rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{section.recordRemark}</div>
                                      )
                                    )}
                {(canManageConstruction || canShareCustomerProgress) && (
                                      <div className="space-y-2">
                                        {latestEditTime && <div className="text-right text-xs text-gray-400">最近编辑：{latestEditTime}</div>}
                                        <div className="flex justify-end gap-2">
                                          {canManageConstruction && isSecPending && !section.submitted && !section.actualStartDate && (
                                            <button
                                              type="button"
                                              onClick={() => setShowPlanDateModal({
                                                nodeId: node._id,
                                                secIdx,
                                                name: section.name,
                                                startDate: section.startDate || '',
                                                endDate: section.endDate || '',
                                              })}
                                              className="rounded-lg bg-gray-100 px-3 py-2 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
                                            >
                                              {section.startDate || section.endDate ? '修改计划时间' : '设置计划时间'}
                                            </button>
                                          )}
                                          {canManageConstruction && isSecPending && !section.submitted && (
                                            <button onClick={() => startSectionNode(node._id, secIdx)} disabled={isProjectActionBusy(`start-${node._id}-${secIdx}`)}
                                              className="rounded-lg border border-gold-500 px-4 py-2 text-xs font-medium text-gold-600 hover:bg-gold-50 disabled:opacity-50">
                                              {isProjectActionBusy(`start-${node._id}-${secIdx}`) ? '处理中...' : '开工'}
                                            </button>
                                          )}
                                          {canManageConstruction && isSecCurrent && (
                                            <button onClick={() => completeSectionNode(node._id, secIdx)} disabled={isProjectActionBusy(`submit-${node._id}-${secIdx}`)}
                                              className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-medium text-white disabled:opacity-50">
                                              {isProjectActionBusy(`submit-${node._id}-${secIdx}`) ? '提交中...' : '提交记录'}
                                            </button>
                                          )}
                                          {canManageConstruction && isSecCompleted && isEditingRecord && (
                                            <button onClick={() => completeSectionNode(node._id, secIdx)} disabled={isProjectActionBusy(`submit-${node._id}-${secIdx}`)}
                                              className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-medium text-white disabled:opacity-50">
                                              {isProjectActionBusy(`submit-${node._id}-${secIdx}`) ? '提交中...' : '提交'}
                                            </button>
                                          )}
                                          {canManageConstruction && isSecCompleted && !isEditingRecord && !(shareSelect && shareSelect.nodeIdx === index && shareSelect.secIdx === secIdx) && (
                                            <button onClick={() => startEditingSectionRecord(node._id, secIdx)} className="rounded-lg bg-gray-100 px-3 py-2 text-[11px] font-medium text-gray-700">编辑记录</button>
                                          )}
                                          {/* 开工后任意时刻均可分享，不要求阶段已完工 */}
                                          {canShareCustomerProgress && !isSecPending && !isEditingRecord && (
                                            shareSelect && shareSelect.nodeIdx === index && shareSelect.secIdx === secIdx ? (
                                              <div className="flex gap-1.5 w-full">
                                                <button onClick={() => toggleShareSelectAll(section)} className={`flex-none rounded-lg px-3 py-2 text-[11px] font-medium transition-colors ${isAllShareSelected(section) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>全选</button>
                                                <button onClick={cancelShareSelect} className="flex-none rounded-lg bg-gray-100 px-3 py-2 text-[11px] font-medium text-gray-600">取消</button>
                                                <button onClick={confirmShareSelect} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-medium text-white flex items-center justify-center gap-1">
                                                  <Share2 className="w-3 h-3" /> 确认分享
                                                </button>
                                              </div>
                                            ) : (
                                              <button onClick={() => enterShareSelect(index, secIdx, section)} className="rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-medium text-white flex items-center gap-1">
                                                <Share2 className="w-3 h-3" /> 分享给客户
                                              </button>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!project.nodesData || project.nodesData.length === 0) && (
                  <div className="text-center py-12 text-gray-400">
                    <HardHat className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    <p className="text-sm">暂无施工节点</p>
                    {canManageConstructionStructure && (
                      <button onClick={openTemplateModal} className="mt-2 text-xs text-gold-600 hover:underline">套用模板</button>
                    )}
                  </div>
                )}
              </div>
            )}
            {canEdit && !isStageDetail && (
              <div className="md:hidden px-1 pb-2 pt-1">
                {!isProjectCompleted ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCompletionDate(project.endDate ? project.endDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
                      setShowCompletionModal(true);
                    }}
                    disabled={isProjectActionBusy('complete-project')}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" />
                    工地完工
                  </button>
                ) : isAdmin ? (
                  <button
                    type="button"
                    onClick={handleReopenProject}
                    disabled={isProjectActionBusy('reopen-project')}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    恢复为施工中
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* ========== Tab: 施工日志 ========== */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            {!standaloneSection && canEditSite && (
              <div className="flex justify-end">
                <button onClick={openNewLogModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors">
                  <Plus size={14} /> 新增日志
                </button>
              </div>
            )}
            
            <div className="space-y-3">
              {logs.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400">
                  <ClipboardList className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">暂无施工日志</p>
                </div>
              ) : (
                logs.map((log, index) => {
                  const logKey = String((log as any)._id || log.id || `log-${index}`);
                  return (
                  <div key={logKey} className="relative overflow-hidden rounded-xl">
                    {canEditSite && (
                      <div className="absolute inset-y-0 right-0 flex md:hidden">
                        <button onClick={() => openEditLogModal(log)} className="w-16 bg-amber-500 text-xs font-semibold text-white">编辑</button>
                        <button onClick={() => void handleDeleteLog(log)} className="w-16 bg-red-500 text-xs font-semibold text-white">删除</button>
                      </div>
                    )}
                  <div
                    className={`relative bg-white rounded-xl border border-gray-200 p-4 shadow-sm transition-transform duration-200 ${swipedLogId === logKey ? '-translate-x-32' : 'translate-x-0'} md:!translate-x-0`}
                    onTouchStart={(event) => { logSwipeStartX.current = event.touches[0]?.clientX ?? null; }}
                    onTouchEnd={(event) => {
                      const startX = logSwipeStartX.current;
                      logSwipeStartX.current = null;
                      if (startX === null || !canEditSite) return;
                      const delta = (event.changedTouches[0]?.clientX ?? startX) - startX;
                      if (delta < -44) setSwipedLogId(logKey);
                      if (delta > 24) setSwipedLogId(null);
                    }}
                  >
                    {!log.visibleToCustomer && (
                      <div className="absolute top-0 right-0 bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded-bl-lg flex items-center gap-1">
                        <EyeOff size={10} /> 内部可见
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold bg-gold-50 text-gold-600 px-2 py-1 rounded">{log.stage || '日志'}</span>
                        <span className="text-xs text-gray-400">{formatDate(log.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{log.creatorName}</span>
                        {canEditSite && (
                          <div className="hidden items-center gap-1 md:flex">
                            <button type="button" onClick={() => openEditLogModal(log)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="编辑日志"><Edit3 size={14} /></button>
                            <button type="button" onClick={() => void handleDeleteLog(log)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="删除日志"><Trash2 size={14} /></button>
                          </div>
                        )}
                        {canShareCustomerProgress && log.visibleToCustomer !== false && (
                          <button
                            onClick={() => openCustomerShare({
                              id: String(project._id || id),
                              title: getProjectShareTitle('施工日志已更新，请查阅'),
                              desc: log.content || '客户查看前需要通过手机号或申请审核。',
                              shareType: 'log',
                              logId: String((log as any)._id || log.id),
                              tab: 'logs',
                            })}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                          >
                            <Share2 className="w-3 h-3" /> 分享
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-2">{log.content}</p>
                        {log.photos && log.photos.length > 0 && (
                          <div className="mt-3 grid grid-cols-4 gap-1.5 md:flex md:flex-wrap md:gap-2">
                            {log.photos.map((photo, idx) => {
                              const isVideo = isVideoMedia(photo);
                              return (
                              <button key={idx} onClick={() => openPreview({ fileID: photo as string, type: isVideo ? 'video' : 'image' }, log.photos.map(p => ({ fileID: p as string, type: isVideoMedia(p) ? 'video' : 'image' })))} className="relative aspect-square min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 md:h-16 md:w-16">
                                {isVideo
                                  ? <CloudVideo src={photo as string} className="h-full w-full object-cover" />
                                  : <CloudImage src={photo as string} className="h-full w-full object-cover" />}
                                {isVideo && <VideoPlayBadge className="rounded-lg" />}
                              </button>
                              );
                            })}
                          </div>
                        )}
                  </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========== Tab: 工地巡检 ========== */}
        {activeTab === 'inspections' && (
          <div className="space-y-4">
            {!standaloneSection && (
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800">工地巡检</h3>
              {isAdmin && !isProjectCompleted && (
                <button onClick={() => setShowInspectionModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors">
                  <Shield size={14} /> 发起巡检
                </button>
              )}
            </div>
            )}
            
            <div className="space-y-3">
              {inspections.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400">
                  <Shield className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">暂无巡检记录</p>
                </div>
              ) : (
                inspections.map((ins, index) => {
                  const inspectionKey = String((ins as any)._id || ins.id || `inspection-${index}`);
                  const canDeleteCurrentInspection = canDeleteInspection(ins);
                  return (
                  <div key={inspectionKey} className="relative overflow-hidden rounded-xl">
                    {canDeleteCurrentInspection && (
                      <div className="absolute inset-y-0 right-0 flex md:hidden">
                        <button onClick={() => void handleDeleteInspection(ins)} className="w-20 bg-red-500 text-xs font-semibold text-white">删除</button>
                      </div>
                    )}
                  <div
                    className={`relative bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-3 transition-transform duration-200 ${swipedInspectionId === inspectionKey ? '-translate-x-20' : 'translate-x-0'} md:!translate-x-0`}
                    onTouchStart={(event) => { inspectionSwipeStartX.current = event.touches[0]?.clientX ?? null; }}
                    onTouchEnd={(event) => {
                      const startX = inspectionSwipeStartX.current;
                      inspectionSwipeStartX.current = null;
                      if (startX === null || !canDeleteCurrentInspection) return;
                      const delta = (event.changedTouches[0]?.clientX ?? startX) - startX;
                      if (delta < -44) setSwipedInspectionId(inspectionKey);
                      if (delta > 24) setSwipedInspectionId(null);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <h4 className="truncate text-sm font-semibold text-gray-900">{ins.title}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          ins.status === '合格' ? 'bg-emerald-50 text-emerald-600' :
                          ins.status === '需整改' ? 'bg-rose-50 text-rose-600' :
                          ins.status === '整改待验收' ? 'bg-amber-50 text-amber-600' :
                          'bg-blue-50 text-blue-600'
                        }`}>{ins.status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{formatDate(ins.createdAt)}</span>
                        {canDeleteCurrentInspection && (
                          <button type="button" onClick={() => void handleDeleteInspection(ins)} className="hidden rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 md:inline-flex" title="删除巡检">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-gray-500">巡检意见 · {ins.inspectorName}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{ins.description}</p>
                      {ins.photos && ins.photos.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {ins.photos.map((photo, idx) => (
                            <button key={idx} onClick={() => openPreview(toPreviewMedia(photo), ins.photos.map(toPreviewMedia))} className="h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                              <MediaThumb src={mediaSourceOf(photo)} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* 整改信息区 */}
                    {(ins.status === '整改待验收' || ins.status === '整改通过') && ins.rectifyDescription && (
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-bold text-amber-700">整改反馈 · {ins.rectifyManagerName}</span>
                          <span className="text-[10px] text-amber-600/70">{formatDate(ins.rectifySubmittedAt || '')}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-amber-900/80">{ins.rectifyDescription}</p>
                        {ins.rectifyPhotos && ins.rectifyPhotos.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {ins.rectifyPhotos.map((photo, idx) => (
                              <button key={idx} onClick={() => openPreview(toPreviewMedia(photo), (ins.rectifyPhotos || []).map(toPreviewMedia))} className="h-16 w-16 overflow-hidden rounded-lg border border-amber-200/50 bg-white">
                                <MediaThumb src={mediaSourceOf(photo)} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 操作区 */}
                    <div className="flex justify-end mt-1">
                      {ins.status === '需整改' && canEditSite && (
                        <button onClick={() => setShowRectifyModal(ins)} className="px-3 py-1.5 bg-rose-50 text-rose-600 text-xs font-bold rounded hover:bg-rose-100 transition-colors">
                          提交整改
                        </button>
                      )}
                      {ins.status === '整改待验收' && isAdmin && !isProjectCompleted && (
                        <button onClick={() => handleAcceptRectify(ins)} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded hover:bg-emerald-100 transition-colors">
                          验收通过
                        </button>
                      )}
                    </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========== Tab: 项目资料 ========== */}
        {activeTab === 'files' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{currentBizType === '工装' ? '合同资料' : '项目资料'}</h3>
                  <p className="mt-1 text-xs text-gray-400">同步展示关联客户详情页中的资料文件。</p>
                </div>
                {lead?._id && (
                  <button onClick={() => navigate(`/leads/${lead._id}/files`, { state: { from: returnPath } })} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white">
                    <ExternalLink className="w-3.5 h-3.5" /> 管理资料
                  </button>
                )}
              </div>
              {(!lead?.files || lead.files.length === 0) ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                  暂无项目资料
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {lead.files.map((file: any) => (
                    <button
                      key={file.fileID || file.name}
                      type="button"
                      onClick={() => { void openAttachment(file); }}
                      className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-3 text-left transition-colors hover:border-gold-200 hover:bg-gold-50/30"
                    >
                      <div className="flex items-start gap-2">
                        <Folder className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-800" title={file.name}>{file.name || '未命名文件'}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-400">
                            <span>{file.folderName || '默认文件夹'}</span>
                            <span>{file.uploader || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== Tab: 客户信息 ========== */}
        {activeTab === 'customer' && (
          <div className="space-y-4">
            {lead ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">{lead.name || lead.customerName || '-'}</h3>
                  <button onClick={() => navigate(`/leads/${lead._id}`, { state: { from: returnPath } })} className="flex items-center gap-1 text-xs text-gold-600 hover:text-gold-700">
                    <ExternalLink className="w-3.5 h-3.5" /> 查看客户详情
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-400 w-12">电话</span>
                      <span className="text-sm text-gray-900 font-medium">{lead.phone || '-'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-400 w-12">地址</span>
                      <span className="text-sm text-gray-900 font-medium">{lead.address || '-'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-400 w-12">来源</span>
                      <span className="text-sm text-gray-900 font-medium">{lead.source || '-'}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-400 w-12">房型</span>
                      <span className="text-sm text-gray-900 font-medium">{lead.houseType || '-'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-400 w-12">面积</span>
                      <span className="text-sm text-gray-900 font-medium">{lead.area ? `${lead.area} m²` : '-'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-400 w-12">预算</span>
                      <span className="text-sm text-gray-900 font-medium">{lead.budget ? `¥${lead.budget.toLocaleString()}` : '-'}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-400 w-12">建档</span>
                      <span className="text-sm text-gray-900 font-medium">{lead.createdAt ? formatDate(lead.createdAt) : '-'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-400 w-12">状态</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lead.status === '已签单' ? 'bg-emerald-50 text-emerald-600' : lead.status === '跟进中' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        {lead.status || '-'}
                      </span>
                    </div>
                  </div>
                </div>
                {lead.remark && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-1">备注</p>
                    <p className="text-sm text-gray-600">{lead.remark}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">暂无关联客户信息</p>
                <p className="text-xs text-gray-300 mt-1">客户信息将在关联客户线索后自动同步</p>
                <button onClick={() => smartBack()} className="mt-4 px-4 py-2 bg-gold-400 text-black text-sm rounded-lg">
                  关联客户
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========== Tab: 合同资料 ========== */}
        {activeTab === 'contract' && (
          <div className="space-y-4">
            {contracts.length > 0 ? (
              contracts.map((c: any) => (
                <div key={c.id || c._id} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gold-500" />
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{c.contractNo}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          c.status === '已结算' ? 'bg-emerald-50 text-emerald-600' :
                          c.status === '已完工' ? 'bg-blue-50 text-blue-600' :
                          'bg-gold-50 text-gold-600'
                        }`}>{c.status}</span>
                        <span className="text-xs text-gray-400 ml-2">{c.bizType}</span>
                      </div>
                    </div>
                    <button onClick={() => navigate(`/contracts/${c.id || c._id}`, { state: { from: returnPath } })} className="flex items-center gap-1 text-xs text-gold-600 hover:text-gold-700">
                      <ExternalLink className="w-3.5 h-3.5" /> 查看合同详情
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">合同金额</p>
                      <p className="text-lg font-bold text-gray-900">¥{c.contractAmount?.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">客户</p>
                      <p className="text-sm font-medium text-gray-700">{c.customerName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">项目经理</p>
                      <p className="text-sm text-gray-700">{c.projectManager || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">地址</p>
                      <p className="text-sm text-gray-700 truncate">{c.houseAddress}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 pt-3 border-t border-gray-100">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">签订日期</p>
                      <p className="text-sm text-gray-600">{c.signDate || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">预计完工</p>
                      <p className="text-sm text-gray-600">{c.expectedEndDate || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">电话</p>
                      <p className="text-sm text-gray-600">{c.customerPhone || '-'}</p>
                    </div>
                    {c.remark && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">备注</p>
                        <p className="text-sm text-gray-600 truncate">{c.remark}</p>
                      </div>
                    )}
                  </div>
                  {c.paymentStages && c.paymentStages.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-2">付款阶段</p>
                      <div className="flex flex-wrap gap-2">
                        {c.paymentStages.map((ps: any, i: number) => (
                          <span key={i} className="text-xs bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                            {ps.name}: ¥{ps.amount?.toLocaleString()} ({ps.ratio}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2 justify-end">
                    {(isAdmin || user?.role === 'finance') && (
                      <button onClick={() => navigate(`/projects/${c._id || c.id}`)} className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 text-xs font-medium rounded-lg hover:bg-rose-100 transition-colors">
                        查看项目利润
                      </button>
                    )}
                    {(isAdmin || user?.role === 'finance') && (
                      <button onClick={() => navigate(`/expense`)} className="px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors">
                        财务记账
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">暂无关联合同</p>
                <p className="text-xs text-gray-300 mt-1">合同信息将在签订合同后自动同步显示</p>
                <button onClick={() => smartBack()} className="mt-4 px-4 py-2 bg-gold-400 text-black text-sm rounded-lg">
                  查看所有合同
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========== 完工确认弹窗 ========== */}
      {showCompletionModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 md:items-center md:justify-center md:p-6" onClick={() => setShowCompletionModal(false)}>
          <div className="w-full max-h-[88vh] overflow-auto rounded-t-2xl bg-white shadow-xl md:max-w-lg md:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 md:px-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">确认工地完工</h2>
                <p className="mt-1 text-xs text-gray-400">完工后施工进度、日志和巡检将只读预览，管理员可恢复为施工中。</p>
              </div>
              <button onClick={() => setShowCompletionModal(false)} className="rounded-lg p-1.5 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4 md:px-6">
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                <label className="mb-1.5 block text-xs font-medium text-gray-500">完工日期</label>
                <DatePicker
                  mode="single"
                  value={completionDate}
                  onChange={setCompletionDate}
                  placeholder="选择完工日期"
                  dropUp
                />
              </div>
              {completionCheckRows.map(row => {
                const hasIssue = row.items.length > 0;
                return (
                  <div key={row.key} className={`rounded-xl border p-3 ${hasIssue ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-100 bg-emerald-50/60'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${hasIssue ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {hasIssue ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900">{row.title}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${hasIssue ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {hasIssue ? `${row.items.length} 项` : '通过'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{row.question}</p>
                        <p className={`mt-1 text-xs font-medium ${hasIssue ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {hasIssue ? row.issueText : row.okText}
                        </p>
                        {hasIssue && (
                          <div className="mt-2 space-y-1">
                            {row.items.slice(0, 3).map((item: any, idx: number) => (
                              <p key={idx} className="truncate text-xs text-gray-600">- {getCompletionItemText(item)}</p>
                            ))}
                            {row.items.length > 3 && (
                              <p className="text-xs text-gray-400">等 {row.items.length} 项</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 md:px-6">
              <button onClick={() => setShowCompletionModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100">
                取消
              </button>
              <button
                onClick={handleCompleteProject}
                disabled={isProjectActionBusy('complete-project')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {isProjectActionBusy('complete-project') && <Loader2 className="h-4 w-4 animate-spin" />}
                {completionIssueCount > 0 ? '仍然标记完工' : '确认完工'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== 模板选择弹窗 ========== */}
      {showTemplateModal && createPortal(
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">选择施工模板</h2>
              <button onClick={() => setShowTemplateModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-gray-400 mb-4">套用模板将覆盖当前所有施工节点，此操作不可撤销</p>
              {getTemplates().map(tpl => {
                const totalNodes = tpl.stages.reduce((s: any, st: any) => s + st.sections.reduce((ss: any, sec: any) => ss + sec.nodes.length, 0), 0);
                const active = selectedTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      active ? 'border-gold-400 bg-gold-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold ${active ? 'text-gold-700' : 'text-gray-700'}`}>{tpl.name}</span>
                      <span className="text-[10px] text-gray-400">{tpl.stages.length} 阶段 · {totalNodes} 节点</span>
                    </div>
                    <p className="text-xs text-gray-400">{tpl.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tpl.stages.slice(0, 5).map(st => (
                        <span key={st.name} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{st.name}</span>
                      ))}
                      {tpl.stages.length > 5 && <span className="text-[10px] text-gray-400">+{tpl.stages.length - 5}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowTemplateModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={applyTemplate} className="px-4 py-2 bg-gold-400 text-black text-sm font-medium rounded-lg hover:bg-gold-500">套用模板</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== 编辑子节点弹窗 ========== */}
      {editingSubNode && createPortal(
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">编辑节点</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">名称</label>
                  <input value={editSubNodeForm.name} onChange={e => setEditSubNodeForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">类型</label>
                  <Select
                    value={editSubNodeForm.type}
                    onChange={(type) => setEditSubNodeForm(p => ({ ...p, type }))}
                    options={TYPE_OPTIONS.map(type => ({ value: type, label: type }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">工艺标准</label>
                <textarea value={editSubNodeForm.standard} onChange={e => setEditSubNodeForm(p => ({ ...p, standard: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">验收清单（每行一项）</label>
                <textarea value={editSubNodeForm.checklist} onChange={e => setEditSubNodeForm(p => ({ ...p, checklist: e.target.value }))} rows={4} placeholder="每行一个检查项" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400" />
              </div>

            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingSubNode(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={saveEditSubNode} className="px-4 py-2 bg-gold-400 text-black text-sm font-medium rounded-lg hover:bg-gold-500">保存</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {nodePhotoAction && createPortal(
        <div className="fixed inset-0 z-[75] flex items-end bg-black/30 md:items-center md:p-6" onClick={() => setNodePhotoAction(null)}>
          <div className="w-full overflow-hidden rounded-t-2xl bg-white shadow-xl md:rounded-2xl md:max-w-sm" onClick={e => e.stopPropagation()}>
            {/* 拖拽条 */}
            <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-gray-300 md:hidden"></div>
            
            <button
              type="button"
              onClick={() => {
                openPreview(nodePhotoAction.photo, nodePhotoAction.photos, { nodeId: nodePhotoAction.nodeId, secIdx: nodePhotoAction.secIdx, subIdx: nodePhotoAction.subIdx, photoIdx: nodePhotoAction.photoIdx });
                setNodePhotoAction(null);
              }}
              className="w-full px-4 py-4 text-center text-base font-medium text-gray-800 hover:bg-gray-50 border-b border-gray-100"
            >
              预览大图
            </button>
            {nodePhotoAction.canDelete && (
              <button
                type="button"
                onClick={() => {
                  deletePhoto(nodePhotoAction.nodeId, nodePhotoAction.secIdx, nodePhotoAction.subIdx, nodePhotoAction.photoIdx);
                  setNodePhotoAction(null);
                }}
                className="w-full px-4 py-4 text-center text-base font-medium text-red-600 hover:bg-red-50"
              >
                删除图片
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 画廊预览弹窗 */}
      {showPreviewModal && previewImages.length > 0 && createPortal(
        <div className="fixed inset-0 bg-black/90 z-[300] isolate flex items-center justify-center p-4">
          <div className="absolute top-4 right-4 z-[310] flex items-center gap-3 md:top-5 md:right-5">
            {currentPhotoDeleteContext && (
              <button 
                onClick={() => {
                  if (!currentPhotoDeleteContext) return;
                  deletePhoto(currentPhotoDeleteContext.nodeId, currentPhotoDeleteContext.secIdx, currentPhotoDeleteContext.subIdx, currentPhotoDeleteContext.photoIdx);
                  setShowPreviewModal(false);
                  setCurrentPhotoDeleteContext(null);
                }}
                className="px-4 py-2 bg-red-500/80 text-white rounded-lg hover:bg-red-600/80 backdrop-blur-sm transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Trash2 size={16} /> 删除
              </button>
            )}
            <button 
              onClick={() => {
                const url = previewImages[previewIndex]?.url;
                if (!url) return;
                const ext = previewImages[previewIndex]?.isVideo ? 'mp4' : 'jpg';
                const a = document.createElement('a');
                a.href = url;
                a.download = `现场影像_${Date.now()}.${ext}`;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
              className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 backdrop-blur-sm transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              下载
            </button>
            <button onClick={() => { setShowPreviewModal(false); setCurrentPhotoDeleteContext(null); }} className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 backdrop-blur-sm transition-colors text-sm font-medium flex items-center gap-2">
              <X size={16} /> 关闭
            </button>
          </div>
          
          {previewImages.length > 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); setPreviewIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1)); }} 
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4"
            >
              <ChevronLeft size={36} />
            </button>
          )}

          <div
            className="w-full max-w-4xl max-h-[85vh] flex items-center justify-center touch-pan-y"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(event) => { previewSwipeStartX.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => {
              const startX = previewSwipeStartX.current;
              previewSwipeStartX.current = null;
              if (startX === null || previewImages.length < 2) return;
              const delta = (event.changedTouches[0]?.clientX ?? startX) - startX;
              if (delta < -44) setPreviewIndex(prev => prev < previewImages.length - 1 ? prev + 1 : 0);
              if (delta > 44) setPreviewIndex(prev => prev > 0 ? prev - 1 : previewImages.length - 1);
            }}
          >
            {previewError ? (
              <div className="flex flex-col items-center justify-center gap-3 text-white/70">
                <AlertTriangle className="h-10 w-10" />
                <p className="text-sm">{previewError}</p>
                <button
                  type="button"
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25"
                  onClick={() => {
                    const request = previewRequestRef.current;
                    if (!request) return;
                    setIsPreviewLoading(false);
                    void openPreview(request.photo, request.allPhotos, request.deleteContext);
                  }}
                >
                  重新加载
                </button>
              </div>
            ) : isPreviewLoading || !previewImages[previewIndex].url ? (
              <div className="flex flex-col items-center justify-center text-white/60">
                <Loader2 className="w-12 h-12 animate-spin mb-4" />
                <p className="text-sm">加载中...</p>
              </div>
            ) : previewImages[previewIndex].isVideo ? (
              <video src={previewImages[previewIndex].url} poster={previewImages[previewIndex].poster} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />
            ) : (
              <img
                src={previewImages[previewIndex].url}
                alt="预览"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                onError={async () => {
                  const current = previewImages[previewIndex];
                  if (!current?.source || current.url.startsWith('data:')) {
                    setPreviewError('图片加载失败，请重新获取访问地址');
                    return;
                  }
                  setIsPreviewLoading(true);
                  try {
                    const dataUrl = await getFileDataURL(current.source);
                    setPreviewImages(items => items.map((item, index) => index === previewIndex ? { ...item, url: dataUrl } : item));
                    setPreviewError('');
                  } catch (error) {
                    setPreviewError(error instanceof Error ? error.message : '云端读取图片失败');
                  } finally {
                    setIsPreviewLoading(false);
                  }
                }}
              />
            )}
          </div>

          {previewImages.length > 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); setPreviewIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0)); }} 
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4"
            >
              <ChevronRight size={36} />
            </button>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium tracking-widest bg-black/50 px-4 py-1.5 rounded-full">
            {previewIndex + 1} / {previewImages.length}
          </div>
        </div>,
        document.body
      )}

      {/* ========== 录入日志弹窗 ========== */}
      {showLogModal && createPortal(
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editingLog ? '编辑施工日志' : '新增施工日志'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">施工阶段</label>
                <Select
                  value={newLogForm.stage}
                  onChange={(val) => setNewLogForm(p => ({ ...p, stage: val }))}
                  options={[
                    { value: '开工', label: '开工' },
                    { value: '水电', label: '水电' },
                    { value: '泥瓦', label: '泥瓦' },
                    { value: '木工', label: '木工' },
                    { value: '油漆', label: '油漆' },
                    { value: '安装', label: '安装' },
                    { value: '竣工', label: '竣工' },
                    { value: '其他', label: '其他' },
                  ]}
                  placeholder="选择阶段..."
                />
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-700">日志内容</label>
                  <div className="relative">
                    <button type="button" onClick={() => setShowQuickReplyMenu(!showQuickReplyMenu)} className="text-[10px] text-gold-600 hover:text-gold-700 flex items-center gap-1">
                      常用语 <ChevronDown size={10} />
                    </button>
                    {showQuickReplyMenu && (
                      <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-100 z-10 py-1">
                        {quickReplies.map((reply, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setNewLogForm(p => ({ ...p, content: reply }));
                              setShowQuickReplyMenu(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0 truncate"
                            title={reply}
                          >
                            {reply}
                          </button>
                        ))}
                        <div className="border-t border-gray-100 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowQuickReplyMenu(false);
                              setShowQuickReplyManager(true);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-gold-600 hover:bg-gold-50 font-medium flex items-center justify-center gap-1"
                          >
                            <Settings size={12} /> 管理常用语
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <textarea 
                  value={newLogForm.content} 
                  onChange={e => setNewLogForm(p => ({ ...p, content: e.target.value }))}
                  rows={5} 
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gold-400 focus:outline-none"
                  placeholder="请输入今日工作详情..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">现场照片</label>
                <div className="flex flex-wrap gap-2">
                  {newLogForm.photos.map((p, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                      <button type="button" onClick={() => openPreview({ fileID: p }, newLogForm.photos.map(fileID => ({ fileID })))} className="h-full w-full">
                        <CloudImage src={p} className="w-full h-full object-cover" />
                      </button>
                      <button type="button" onClick={() => setNewLogForm(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => logFileInputRef.current?.click()} className="w-16 h-16 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-gold-500 hover:border-gold-300 bg-gray-50">
                    <Camera size={16} />
                    <span className="text-[10px] mt-1">上传</span>
                  </button>
                </div>
                <input ref={logFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  try {
                    const uploaded = await Promise.all(files.map(f => uploadToCloud(f, `project/logs/${id}/${Date.now()}_${f.name}`)));
                    setNewLogForm(p => ({ ...p, photos: [...p.photos, ...uploaded.map(u => u.fileID)] }));
                  } catch (err) { alert('上传失败'); }
                  if (logFileInputRef.current) logFileInputRef.current.value = '';
                }} />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="visibleToCustomer" checked={newLogForm.visibleToCustomer} onChange={e => setNewLogForm(p => ({ ...p, visibleToCustomer: e.target.checked }))} className="rounded text-gold-500 focus:ring-gold-500" />
                <label htmlFor="visibleToCustomer" className="text-sm text-gray-700">公开给客户可见</label>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowLogModal(false); setEditingLog(null); }} disabled={isSubmittingLog} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50">取消</button>
              <button onClick={handleSaveLog} disabled={isSubmittingLog} className="px-4 py-2 bg-gold-400 text-black text-sm font-medium rounded-lg hover:bg-gold-500 disabled:opacity-50">{isSubmittingLog ? '保存中...' : editingLog ? '保存修改' : '发布'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== 发起巡检弹窗 ========== */}
      {showInspectionModal && createPortal(
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowInspectionModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">发起工地巡检</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">巡检标题</label>
                <input 
                  value={newInspectionForm.title} 
                  onChange={e => setNewInspectionForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="例如：水电阶段突击巡检"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">巡检结论</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="ins_status" value="合格" checked={newInspectionForm.status === '合格'} onChange={e => setNewInspectionForm(p => ({ ...p, status: e.target.value }))} className="text-emerald-500 focus:ring-emerald-500" />
                    <span className="text-sm text-gray-700">合格通过</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="ins_status" value="需整改" checked={newInspectionForm.status === '需整改'} onChange={e => setNewInspectionForm(p => ({ ...p, status: e.target.value }))} className="text-rose-500 focus:ring-rose-500" />
                    <span className="text-sm text-gray-700">需整改</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">巡检说明 / 整改要求</label>
                <textarea 
                  value={newInspectionForm.description} 
                  onChange={e => setNewInspectionForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} 
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                  placeholder="请描述现场情况..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">现场图片/视频</label>
                <div className="flex flex-wrap gap-2">
                  {newInspectionForm.photos.map((p, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                      <button type="button" onClick={() => openPreview(toPreviewMedia(p), newInspectionForm.photos.map(toPreviewMedia))} className="h-full w-full">
                        <MediaThumb src={p} className="w-full h-full object-cover" />
                      </button>
                      <button type="button" onClick={() => setNewInspectionForm(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => inspectionFileInputRef.current?.click()} className="w-16 h-16 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-300 bg-gray-50">
                    <Camera size={16} />
                    <span className="text-[10px] mt-1">上传</span>
                  </button>
                </div>
                <input ref={inspectionFileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  try {
                    const uploaded = await Promise.all(files.map(f => uploadToCloud(f, `project/inspections/${id}/${Date.now()}_${f.name}`)));
                    setNewInspectionForm(p => ({ ...p, photos: [...p.photos, ...uploaded.map(u => u.fileID)] }));
                  } catch (err) { alert('上传失败'); }
                  if (inspectionFileInputRef.current) inspectionFileInputRef.current.value = '';
                }} />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowInspectionModal(false)} disabled={isSubmittingInspection} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50">取消</button>
              <button onClick={handleSaveInspection} disabled={isSubmittingInspection} className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50">{isSubmittingInspection ? '发起中...' : '发起巡检'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== 提交整改弹窗 ========== */}
      {showRectifyModal && createPortal(
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowRectifyModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">提交整改反馈</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">整改说明</label>
                <textarea 
                  value={rectifyForm.rectifyDescription} 
                  onChange={e => setRectifyForm(p => ({ ...p, rectifyDescription: e.target.value }))}
                  rows={3} 
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-rose-400 focus:outline-none"
                  placeholder="请描述整改过程与结果..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">整改后图片/视频</label>
                <div className="flex flex-wrap gap-2">
                  {rectifyForm.rectifyPhotos.map((p, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                      <button type="button" onClick={() => openPreview(toPreviewMedia(p), rectifyForm.rectifyPhotos.map(toPreviewMedia))} className="h-full w-full">
                        <MediaThumb src={p} className="w-full h-full object-cover" />
                      </button>
                      <button type="button" onClick={() => setRectifyForm(prev => ({ ...prev, rectifyPhotos: prev.rectifyPhotos.filter((_, i) => i !== idx) }))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => rectifyFileInputRef.current?.click()} className="w-16 h-16 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-rose-500 hover:border-rose-300 bg-gray-50">
                    <Camera size={16} />
                    <span className="text-[10px] mt-1">上传</span>
                  </button>
                </div>
                <input ref={rectifyFileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  try {
                    const uploaded = await Promise.all(files.map(f => uploadToCloud(f, `project/rectify/${id}/${Date.now()}_${f.name}`)));
                    setRectifyForm(p => ({ ...p, rectifyPhotos: [...p.rectifyPhotos, ...uploaded.map(u => u.fileID)] }));
                  } catch (err) { alert('上传失败'); }
                  if (rectifyFileInputRef.current) rectifyFileInputRef.current.value = '';
                }} />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowRectifyModal(null)} disabled={isSubmittingRectify} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50">取消</button>
              <button onClick={handleSaveRectify} disabled={isSubmittingRectify} className="px-4 py-2 bg-rose-500 text-white text-sm font-medium rounded-lg hover:bg-rose-600 disabled:opacity-50">{isSubmittingRectify ? '提交中...' : '提交整改'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== 管理常用语弹窗 ========== */}
      {showQuickReplyManager && createPortal(
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={() => setShowQuickReplyManager(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">管理常用语模板</h3>
              <button onClick={() => setShowQuickReplyManager(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4 p-1">
              {quickReplies.map((reply, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100 group">
                  <p className="text-xs text-gray-700 whitespace-pre-wrap flex-1 leading-relaxed">{reply}</p>
                  <button 
                    onClick={() => saveQuickRepliesToCloud(quickReplies.filter((_, i) => i !== idx))} 
                    className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {quickReplies.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">暂无常用语</div>
              )}
            </div>
            
            <div className="mb-4">
              <textarea
                value={newQuickReplyText}
                onChange={(e) => setNewQuickReplyText(e.target.value)}
                placeholder="输入新的常用语模板..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gold-400 focus:outline-none"
                rows={3}
              />
              <button
                onClick={() => {
                  if (newQuickReplyText.trim()) {
                    saveQuickRepliesToCloud([...quickReplies, newQuickReplyText.trim()]);
                    setNewQuickReplyText('');
                  }
                }}
                className="mt-2 w-full py-2 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 border border-gray-200 flex items-center justify-center gap-1 transition-colors"
              >
                <Plus size={14} /> 添加为常用语
              </button>
            </div>
            
            <div className="flex justify-end">
              <button onClick={() => setShowQuickReplyManager(false)} className="px-5 py-2 bg-gold-400 text-black text-sm font-medium rounded-lg hover:bg-gold-500">
                完成
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== 填写逾期原因弹窗 ========== */}
      {delayReasonModal.open && createPortal(
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setDelayReasonModal({ open: false, nodeId: '', secIdx: -1, name: '', reason: '' })}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-600 mb-2 text-center">填写逾期原因</h3>
            <p className="text-sm text-gray-500 mb-4 text-center">{delayReasonModal.name}</p>
            <textarea
              value={delayReasonModal.reason}
              onChange={e => setDelayReasonModal(p => ({ ...p, reason: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 border border-red-200 bg-red-50 text-red-900 rounded-xl text-sm focus:border-red-400 focus:outline-none mb-4"
              placeholder="请详细说明导致该阶段逾期的原因..."
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setDelayReasonModal({open: false, nodeId: '', secIdx: -1, name: '', reason: ''})} className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">取消</button>
              <button onClick={saveDelayReason} className="flex-1 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg">保存</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showPlanDateModal && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6" onClick={() => setShowPlanDateModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">设置计划时间</h3>
              <p className="mt-1 text-xs text-gray-400">{showPlanDateModal.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-gray-400">计划开工</label>
                <DatePicker
                  mode="single"
                  value={showPlanDateModal.startDate}
                  onChange={(v) => setShowPlanDateModal(p => p ? { ...p, startDate: v } : p)}
                  placeholder="选择日期"
                  dropUp
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-gray-400">计划完工</label>
                <DatePicker
                  mode="single"
                  value={showPlanDateModal.endDate}
                  onChange={(v) => setShowPlanDateModal(p => p ? { ...p, endDate: v } : p)}
                  placeholder="选择日期"
                  dropUp
                />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowPlanDateModal(null)}
                className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-600"
              >
                取消
              </button>
              <button
                onClick={saveSectionPlanDates}
                className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white"
              >
                保存
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showWorkerScheduleModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-5" onClick={() => setShowWorkerScheduleModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div><h3 className="text-base font-semibold text-gray-900">{selectedStageWorkerSchedule ? '修改工人排期' : '安排工人'}</h3><p className="mt-1 text-xs text-gray-400">{selectedStage?.name} · {project.address}</p></div>
              <button onClick={() => setShowWorkerScheduleModal(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="关闭"><X size={17} /></button>
            </div>
            <div className="space-y-4 p-5">
              {eligibleStageWorkers.length === 0 ? (
                <div className="rounded-lg bg-amber-50 p-4 text-center"><p className="text-sm text-amber-700">还没有可用的{selectedStageTrade}工人</p><button onClick={() => navigate('/worker-schedule')} className="mt-2 text-xs font-medium text-gold-600">前往工人管理添加对应工种</button></div>
              ) : (
                <label className="block text-xs text-gray-500">工人 * <span className="text-gold-600">仅显示{selectedStageTrade}工人</span>
                  <Select value={eligibleStageWorkers.some((worker) => workerIdOf(worker) === workerScheduleForm.workerId) ? workerScheduleForm.workerId : ''} onChange={(value) => setWorkerScheduleForm((current) => ({ ...current, workerId: value }))} options={eligibleStageWorkers.map((worker) => ({ value: workerIdOf(worker), label: worker.name, description: worker.trades.join('/') }))} placeholder={`请选择${selectedStageTrade}工人`} searchable className="mt-1" sheetTitle="选择匹配工种的工人" />
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-500">开始日期<DatePicker value={workerScheduleForm.startDate} onChange={(value) => setWorkerScheduleForm((current) => ({ ...current, startDate: value }))} className="mt-1" /></label>
                <label className="text-xs text-gray-500">结束日期<DatePicker value={workerScheduleForm.endDate} onChange={(value) => setWorkerScheduleForm((current) => ({ ...current, endDate: value }))} className="mt-1" /></label>
              </div>
              <label className="block text-xs text-gray-500">状态
                <Select value={workerScheduleForm.status} onChange={(value) => setWorkerScheduleForm((current) => ({ ...current, status: value as WorkerScheduleStatus }))} options={[{ value: 'planned', label: '待确认' }, { value: 'confirmed', label: '已排期' }, { value: 'in_progress', label: '施工中' }, { value: 'completed', label: '已完成' }]} className="mt-1" sheetTitle="选择排期状态" />
              </label>
              <label className="block text-xs text-gray-500">备注<textarea value={workerScheduleForm.note} onChange={(event) => setWorkerScheduleForm((current) => ({ ...current, note: event.target.value }))} rows={2} className="mt-1 w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gold-400" /></label>
              {workerScheduleConflicts.length > 0 && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600"><div className="flex items-center gap-1.5 font-medium"><AlertTriangle size={14} />排期冲突</div><p className="mt-1">已安排：{workerScheduleConflicts[0].schedule.projectAddress}，{String(workerScheduleConflicts[0].schedule.startDate).slice(5)} 至 {String(workerScheduleConflicts[0].schedule.endDate).slice(5)}</p></div>}
              {workerScheduleError && <p className="text-xs text-red-500">{workerScheduleError}</p>}
              <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                <div>{selectedStageWorkerSchedule && <button onClick={() => void removeStageWorkerSchedule()} className="inline-flex items-center gap-1 text-xs text-red-500"><Trash2 size={14} />删除排期</button>}</div>
                <div className="flex gap-2"><button onClick={() => setShowWorkerScheduleModal(false)} className="erp-btn-secondary">取消</button><button disabled={savingWorkerSchedule || workerScheduleConflicts.length > 0 || eligibleStageWorkers.length === 0} onClick={() => void saveStageWorkerSchedule()} className="erp-btn-primary">保存排期</button></div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {workerProfileSchedule && createPortal(
        <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/40 p-4" onClick={() => setWorkerProfileSchedule(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="font-semibold text-gray-900">工人档案</h2>
              <button type="button" onClick={() => setWorkerProfileSchedule(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" title="关闭" aria-label="关闭工人档案"><X size={18} /></button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-4">
                <button type="button" disabled={!profileWorker?.photoFileID} onClick={() => void openWorkerPhoto(profileWorker?.photoFileID || '')} className={profileWorker?.photoFileID ? 'shrink-0 cursor-zoom-in rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold-400' : 'shrink-0'} title={profileWorker?.photoFileID ? '查看照片大图' : undefined}>
                  <WorkerAvatar name={profileWorker?.name || workerProfileSchedule.workerName} fileID={profileWorker?.photoFileID} className="h-20 w-20" />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xl font-semibold text-gray-900">{profileWorker?.name || workerProfileSchedule.workerName}</h3>
                  <p className="mt-1 text-sm text-gray-500">{profileWorker?.phone || '未填写联系电话'}</p>
                  {profileWorker && <p className="mt-2 text-xs text-gold-700">{WORKER_STATUS_LABEL[profileWorker.status]}</p>}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 border-y border-gray-100 py-4">
                <div><div className="text-xs text-gray-400">工龄</div><div className="mt-1 text-sm font-medium text-gray-800">{profileWorker?.experienceYears ? `${profileWorker.experienceYears} 年` : '未填写'}</div></div>
                <div><div className="text-xs text-gray-400">最大并行任务</div><div className="mt-1 text-sm font-medium text-gray-800">{profileWorker?.maxConcurrent ? `${profileWorker.maxConcurrent} 个` : '未填写'}</div></div>
                <div className="col-span-2"><div className="text-xs text-gray-400">工种</div><div className="mt-1 text-sm font-medium text-gray-800">{profileWorker?.trades?.join('、') || workerProfileSchedule.trade || '未填写'}</div></div>
                <div className="col-span-2"><div className="text-xs text-gray-400">本节点排期</div><div className="mt-1 text-sm font-medium text-gray-800">{workerProfileSchedule.stageName} · {workerProfileSchedule.startDate} 至 {workerProfileSchedule.endDate}</div></div>
              </div>
              {(profileWorker?.note || workerProfileSchedule.note) && <div className="pt-4"><div className="text-xs text-gray-400">备注</div><div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{profileWorker?.note || workerProfileSchedule.note}</div></div>}
              <div className="mt-5 flex justify-end"><button type="button" onClick={() => setWorkerProfileSchedule(null)} className="erp-btn-secondary">关闭</button></div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {workerPhotoViewer.length > 0 && (
        <ImagePreviewModal images={workerPhotoViewer} index={0} onIndexChange={() => undefined} onClose={() => setWorkerPhotoViewer([])} layerClassName="z-[220]" />
      )}

      {showQuickTodoModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-5" onClick={() => setShowQuickTodoModal(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">新增工地待办</h3>
                <p className="mt-1 text-xs text-gray-400">自动通知项目经理，关联当前工地</p>
              </div>
              <button type="button" onClick={() => setShowQuickTodoModal(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">待办事项</label>
                <textarea
                  autoFocus
                  rows={2}
                  value={quickTodoForm.title}
                  onChange={event => setQuickTodoForm(current => ({ ...current, title: event.target.value }))}
                  placeholder="例如：确认厨房水电定位"
                  className="min-h-[72px] w-full resize-none overflow-y-hidden rounded-xl border border-gray-200 px-3 py-3 text-sm leading-6 outline-none transition-colors focus:border-gold-400"
                  onInput={event => {
                    const target = event.currentTarget;
                    target.style.height = 'auto';
                    const nextHeight = Math.min(target.scrollHeight, 168);
                    target.style.height = `${Math.max(72, nextHeight)}px`;
                    target.style.overflowY = target.scrollHeight > 168 ? 'auto' : 'hidden';
                  }}
                  onKeyDown={event => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && quickTodoForm.title.trim() && quickTodoForm.dueDate) void handleCreateQuickTodo();
                  }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">截止日期</label>
                <DatePicker
                  mode="single"
                  value={quickTodoForm.dueDate}
                  onChange={value => setQuickTodoForm(current => ({ ...current, dueDate: value }))}
                  placeholder="选择截止日期"
                  dropUp
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowQuickTodoModal(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600">取消</button>
              <button
                type="button"
                onClick={() => void handleCreateQuickTodo()}
                disabled={!quickTodoForm.title.trim() || !quickTodoForm.dueDate || submittingQuickTodo}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submittingQuickTodo && <Loader2 className="h-4 w-4 animate-spin" />}
                创建
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <input ref={nodeFileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleSubNodePhotoUpload} />

      <ContractDrawer
        open={contractDrawerOpen}
        onClose={() => setContractDrawerOpen(false)}
        prefill={{
          customerId: lead?._id || project.leadId || '',
          customerName: project?.customer || lead?.name || '',
          customerPhone: project?.phone || lead?.phone || '',
          houseAddress: project?.address || lead?.address || '',
          projectManager: Array.isArray(project?.manager) ? project.manager.join('、') : (project?.manager || ''),
          sales: Array.isArray(lead?.sales) ? lead.sales.join('、') : (lead?.sales || ''),
          designer: Array.isArray(lead?.designer) ? lead.designer.join('、') : (lead?.designer || ''),
          customerNo: lead?.customerNo || '',
        }}
      />
    </div>
  );
}
