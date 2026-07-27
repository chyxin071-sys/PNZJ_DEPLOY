import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Calendar, Trash2, Edit3, ChevronRight,
  LayoutTemplate, X, Save, BookOpen, ChevronDown, Eye, Layers, CheckCircle,
  ChevronUp, ImagePlus, Filter,
} from 'lucide-react';
import { projectsAPI, usersAPI, leadsAPI, systemConfigsAPI } from '@/db/api';
import { cloudDB } from '@/db/cloudbase';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { hasRole } from '@/store/authStore';
import { formatDate } from '@/utils/format';
import {
  CraftTemplate, getTemplates, saveTemplates, buildNodesFromTemplate,
  DEFAULT_NODE_TYPE, DEFAULT_TEMPLATES, StageConfig, SectionConfig, SubNodeConfig, TYPE_OPTIONS, normalizeNodeType,
} from '@/config/constructionTemplates';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import { getCurrentReturnPath } from '@/hooks/useSmartBack';
import { uploadFile as uploadToCloud } from '@/utils/cloudStorage';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { openNativeMediaPreview } from '@/utils/miniProgramPreview';
import { useIncrementalList, usePageScrollRestore } from '@/hooks/useListViewportState';
import {
  createNotificationEventSafely,
  resolveProjectParticipantUserIds,
  stableOperationId,
} from '@/services/notificationService';

const STATUS_COLORS: Record<string, string> = {
  '施工中': 'bg-blue-50 text-blue-600',
  '进行中': 'bg-blue-50 text-blue-600',
  '已完工': 'bg-emerald-50 text-emerald-600',
  '已暂停': 'bg-gray-100 text-gray-500',
};

const TEMPLATE_DOC_ID = 'default_project_template';
const LEGACY_TEMPLATE_DOC_ID = 'project_template';
const PROJECT_LIST_FIELDS: Record<string, boolean> = {
  _id: true,
  leadId: true,
  customer: true,
  phone: true,
  customerNo: true,
  address: true,
  manager: true,
  designer: true,
  sales: true,
  creatorName: true,
  status: true,
  health: true,
  startDate: true,
  signDate: true,
  endDate: true,
  completedAt: true,
  actualEndDate: true,
  pauseDate: true,
  pausedAt: true,
  createdAt: true,
  updatedAt: true,
  progressSummary: true,
};
const ROLE_DEPT: Record<string, string> = {
  admin: '管理组', sales: '销售部', designer: '设计部',
  manager: '工程部', finance: '财务部', employee: '普通',
};
const DEPT_ORDER = [ROLE_DEPT.sales, ROLE_DEPT.designer, ROLE_DEPT.manager, ROLE_DEPT.finance, ROLE_DEPT.admin, ROLE_DEPT.employee];
const ROLE_ORDER: Record<string, number> = { sales: 0, designer: 1, manager: 2, finance: 3, admin: 4, employee: 5 };
const CLOUD_FILE_PREFIX = 'https://636c-cloud1-8grodf5s3006f004-1421470557.tcb.qcloud.la/';

function resolveCloudImageSrc(src?: string) {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:')) return src;
  if (src.startsWith('cloud://')) {
    return src.replace(/^cloud:\/\/[^.]+\.([^/]+)\//, 'https://$1.tcb.qcloud.la/');
  }
  return `${CLOUD_FILE_PREFIX}${src.replace(/^\/+/, '')}`;
}

function moveItem<T>(list: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function getPrimaryRole(emp: any): string {
  const roles = Array.isArray(emp.roles) ? emp.roles : [];
  return roles.find((role: string) => role in ROLE_ORDER) || emp.role || 'employee';
}

function getDept(emp: any): string {
  if (emp.department) return emp.department;
  return ROLE_DEPT[getPrimaryRole(emp)] || ROLE_DEPT.employee;
}

function sortEmployeesForFilter(list: any[]) {
  return [...list].sort((a, b) => {
    const ar = ROLE_ORDER[getPrimaryRole(a)] ?? 99;
    const br = ROLE_ORDER[getPrimaryRole(b)] ?? 99;
    if (ar !== br) return ar - br;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
  });
}

function getProjectPeople(project: any): string[] {
  const values = [project.sales, project.manager, project.designer, project.creatorName];
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(/[,，、\s]+/).filter(Boolean);
    return [];
  });
}

function formatProjectPeople(project: any) {
  const names = getProjectPeople(project)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index);
  return names.join(' | ') || '-';
}

function parseProjectDate(value?: string) {
  if (!value) return null;
  const date = new Date(String(value).replace(/-/g, '/'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatProjectDate(value?: string) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function countProjectDays(startValue?: string, endValue?: string) {
  const start = parseProjectDate(startValue);
  if (!start) return 0;
  const end = parseProjectDate(endValue) || new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

function getProjectDateMeta(project: any) {
  const lifecycleStatus = getProjectLifecycleStatus(project);
  const startDate = formatProjectDate(project.startDate);
  const finishDate = lifecycleStatus === '已完工' ? formatProjectDate(project.endDate || project.completedAt || project.actualEndDate) : '';
  const pauseDate = lifecycleStatus === '已暂停' ? formatProjectDate(project.pauseDate || project.pausedAt || project.updatedAt) : '';
  const durationEnd = finishDate || pauseDate || new Date().toISOString().slice(0, 10);
  const days = countProjectDays(project.startDate, durationEnd);
  return { startDate, finishDate, pauseDate, days };
}

function hasProjectStarted(project: any) {
  const start = parseProjectDate(project.startDate);
  if (!start) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return start.getTime() <= today.getTime();
}

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

function getProjectLifecycleStatus(project: any) {
  if (project.status === '已完工' || project.status === '已暂停') return project.status;
  if (project.status === '施工中' || project.status === '进行中' || hasProjectStarted(project)) return '施工中';
  return project.status || '未开工';
}

function getCurrentStageLabel(project: any) {
  if (project.status === '已完工' || project.status === '已暂停') return project.status;
  if (project.progressSummary?.currentNodeName || project.progressSummary?.nodeName) {
    return project.progressSummary.currentNodeName || project.progressSummary.nodeName;
  }
  const stages = getStageStatuses(project.nodesData || []);
  const current = stages.find((stage: any) => stage.status === 'current');
  const lastCompleted = [...stages].reverse().find((stage: any) => stage.status === 'completed');
  return current?.node?.name || lastCompleted?.node?.name || (hasProjectStarted(project) ? '开工' : '未开工');
}

function extractTemplateNodes(doc: any) {
  if (doc?.data && !Array.isArray(doc.data) && Array.isArray(doc.data.nodesData) && doc.data.nodesData.length > 0) {
    return doc.data.nodesData;
  }
  if (doc?.data && Array.isArray(doc.data) && Array.isArray(doc.data[0]?.nodesData) && doc.data[0].nodesData.length > 0) {
    return doc.data[0].nodesData;
  }
  if (Array.isArray(doc?.nodesData) && doc.nodesData.length > 0) {
    return doc.nodesData;
  }
  if (Array.isArray(doc) && Array.isArray(doc[0]?.nodesData) && doc[0].nodesData.length > 0) {
    return doc[0].nodesData;
  }
  return null;
}

function normalizeTemplateDataForSave(nodes: any[]) {
  return (nodes || []).map((stage: any) => ({
    _id: stage._id || `stage_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: (stage.name || '').trim(),
    craftsmanship: (stage.craftsmanship || [])
      .map((item: any) => ({
        text: (item?.text || '').trim(),
        images: (item?.images || []).filter(Boolean),
      }))
      .filter((item: any) => item.text || (item.images && item.images.length > 0)),
    sections: (stage.sections || []).map((section: any) => ({
      _id: section._id || `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: section.name || '',
      subNodes: (section.subNodes || [])
        .map((node: any) => ({
          _id: node._id || `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: (node.name || '').trim(),
          type: normalizeNodeType(node.type),
          requirePhoto: node.requirePhoto !== false,
          requireSign: !!node.requireSign,
          standard: node.standard || '',
          standardPublic: node.standardPublic !== false,
          checklist: Array.isArray(node.checklist) ? node.checklist : [],
        }))
        .filter((node: any) => node.name),
    })),
  })).filter((stage: any) => stage.name);
}

function toText(value: any) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function getLeadName(lead: any) {
  return toText(lead?.name || lead?.customerName || lead?.customer || '');
}

function getLeadPhone(lead: any) {
  return toText(lead?.phone || lead?.customerPhone || '');
}

function getLeadAddress(lead: any) {
  return toText(lead?.address || lead?.houseAddress || lead?.projectAddress || '');
}

function getLeadNo(lead: any) {
  return toText(lead?.customerNo || lead?.leadNo || lead?.id || lead?._id || '');
}

function toPersonList(value: any): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => toPersonList(item));
  return toText(value).split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean);
}

function getProjectRoleBadges(project: any) {
  const roleDefs: Array<[string, string]> = [
    ['sales', '销'],
    ['designer', '设'],
    ['manager', '工'],
  ];
  const people = new Map<string, string[]>();
  roleDefs.forEach(([field, label]) => {
    toPersonList(project[field]).forEach((name) => {
      const roles = people.get(name) || [];
      if (!roles.includes(label)) roles.push(label);
      people.set(name, roles);
    });
  });
  return Array.from(people.entries()).map(([name, roles]) => ({ name, roles }));
}

function isSignedLead(lead: any) {
  const status = toText(lead?.status);
  const signedText = ['已签单', '签单', 'signed', 'contracted'];
  return signedText.some((item) => status.includes(item)) || !!lead?.signedAt || !!lead?.signDate;
}

function getLeadSearchText(lead: any) {
  return [
    getLeadName(lead),
    getLeadPhone(lead),
    getLeadAddress(lead),
    getLeadNo(lead),
    toText(lead?.status),
  ].join(' ').toLowerCase();
}

const INIT_FORM = {
  customer: '', phone: '', address: '', sales: '', manager: '', designer: '',
  startDate: '', endDate: '', remark: '', leadId: '',
};

const MOBILE_DELETE_WIDTH = 88;

export default function ProjectsBiz() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getCurrentReturnPath(location.pathname, location.search);
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const notifications = useNotificationStore((state) => state.notifications);
  const projectUnreadCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    notifications.forEach((notification) => {
      if (notification.isRead) return;
      const linkedProjectId = notification.relatedTo?.type === 'project'
        ? notification.relatedTo.id
        : String((notification as any).link || '').match(/^\/(?:erp\/)?projects-biz\/([^/?#]+)/)?.[1];
      if (linkedProjectId) {
        counts[linkedProjectId] = (counts[linkedProjectId] || 0) + 1;
      }
    });
    return counts;
  }, [notifications]);
  const myName = user?.name || '';
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);

  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [form, setForm] = useState(INIT_FORM);
  const [employees, setEmployees] = useState<any[]>([]);
  const [statFilter, setStatFilter] = useState<string>('all');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterScope, setFilterScope] = useState<'related' | 'all'>(() => isAdmin ? 'all' : 'related');
  const [showFilter, setShowFilter] = useState(false);
  const [stats, setStats] = useState({ total: 0, ongoing: 0, completed: 0, paused: 0 });
  const [leads, setLeads] = useState<any[]>([]);
  const [pendingAccessByProject, setPendingAccessByProject] = useState<Record<string, number>>({});
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [openSwipeProjectId, setOpenSwipeProjectId] = useState<string | null>(null);
  const projectTouchStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const suppressProjectClickRef = useRef<string | null>(null);

  const [templateData, setTemplateData] = useState<any[]>([]);
  const [showTemplateLib, setShowTemplateLib] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedStageIdx, setExpandedStageIdx] = useState<number | null>(null);
  const [expandedSectionIdx, setExpandedSectionIdx] = useState<number | null>(null);
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [showAddSection, setShowAddSection] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [showAddNode, setShowAddNode] = useState<{ stageIdx: number; sectionIdx: number } | null>(null);
  const [newNodeForm, setNewNodeForm] = useState({ name: '' });
  const [editingCraftsmanship, setEditingCraftsmanship] = useState<number | null>(null);
  const [craftsmanshipList, setCraftsmanshipList] = useState<{ text: string; images: string[] }[]>([]);
  const [uploadingCraftIdx, setUploadingCraftIdx] = useState<number | null>(null);
  const [craftPreview, setCraftPreview] = useState<{ images: string[]; index: number } | null>(null);
  const [templateSavedSnapshot, setTemplateSavedSnapshot] = useState('');
  const [showTemplateCloseConfirm, setShowTemplateCloseConfirm] = useState(false);
  const [movedItem, setMovedItem] = useState<{ key: string; direction: 'up' | 'down' } | null>(null);

  useEffect(() => {
    setFilterScope(isAdmin ? 'all' : 'related');
  }, [user?.id, isAdmin]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projData, userData, leadData] = await Promise.all([
        projectsAPI.toArray(PROJECT_LIST_FIELDS),
        usersAPI.toArray(),
        leadsAPI.toArray(),
      ]);
      const projectsWithSummary = await Promise.all((projData || []).map(async (project: any) => {
        if (project.progressSummary?.nodesCount) return project;
        const id = project._id || project.id;
        if (!id) return project;
        try {
          const fullProject = await projectsAPI.doc(id).get();
          const progressSummary = buildProjectProgressSummary(fullProject?.nodesData || []);
          projectsAPI.update(id, { progressSummary }).catch(() => {});
          return { ...project, progressSummary };
        } catch {
          return project;
        }
      }));
      setProjects(projectsWithSummary);
      setEmployees(userData);
      setLeads(leadData);
      cloudDB.collection('shareAccess')
        .where({ status: 'pending' })
        .limit(1000)
        .get()
        .then((res: any) => {
          const counts: Record<string, number> = {};
          (res.data || []).forEach((record: any) => {
            if (!record.projectId) return;
            counts[record.projectId] = (counts[record.projectId] || 0) + 1;
          });
          setPendingAccessByProject(counts);
        })
        .catch(() => setPendingAccessByProject({}));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  const fetchTemplate = useCallback(async () => {
    try {
      const [primaryDoc, legacyDoc]: any[] = await Promise.all([
        systemConfigsAPI.doc(TEMPLATE_DOC_ID).get(),
        systemConfigsAPI.doc(LEGACY_TEMPLATE_DOC_ID).get(),
      ]);
      const nodes = extractTemplateNodes(primaryDoc) || extractTemplateNodes(legacyDoc);
      
      if (nodes) {
        setTemplateData(nodes);
      } else {
        setTemplateData(buildNodesFromTemplate(DEFAULT_TEMPLATES[0]));
      }
    } catch (e) {
      console.error('Failed to load default template', e);
      setTemplateData(buildNodesFromTemplate(DEFAULT_TEMPLATES[0]));
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchTemplate();
  }, [fetchData, fetchTemplate]);

  useEffect(() => {
    const s = { total: 0, ongoing: 0, completed: 0, paused: 0 };
    const baseList = projects.filter(p => {
      if (filterScope === 'related' && !getProjectPeople(p).includes(myName)) return false;
      return true;
    });
    s.total = baseList.length;
    baseList.forEach(p => {
      const lifecycleStatus = getProjectLifecycleStatus(p);
      if (lifecycleStatus === '施工中') s.ongoing++;
      if (lifecycleStatus === '已完工') s.completed++;
      if (lifecycleStatus === '已暂停') s.paused++;
    });
    setStats(s);
  }, [projects, filterScope, isAdmin, myName]);

  const filtered = projects
    .filter(p => {
      if (filterScope === 'related' && !getProjectPeople(p).includes(myName)) return false;
      if (statFilter !== 'all' && getProjectLifecycleStatus(p) !== statFilter) return false;
      if (filterEmployee) {
        if (!getProjectPeople(p).includes(filterEmployee)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!p.customer?.toLowerCase().includes(q) && !p.address?.toLowerCase().includes(q) && !p.phone?.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  const projectListKey = [filterScope, statFilter, filterEmployee, search.trim().toLowerCase(), myName].join('|');
  const {
    visibleItems: visibleProjects,
    visibleCount: visibleProjectCount,
    hasMore: hasMoreProjects,
    loadMore: loadMoreProjects,
  } = useIncrementalList(filtered, 'projects_biz_visible_count', projectListKey, 20, 20);
  const saveProjectListScroll = usePageScrollRestore('projects_biz_scroll_pos', !loading);

  const activeProjectFilters = [statFilter !== 'all', !!filterEmployee].filter(Boolean).length;
  const clearProjectFilters = () => {
    setStatFilter('all');
    setFilterEmployee('');
  };

  const filteredLeads = useMemo(() => {
    const q = leadSearch.toLowerCase();
    return leads
      .filter((l: any) => !q || getLeadSearchText(l).includes(q))
      .sort((a: any, b: any) => {
        const signedDiff = Number(isSignedLead(b)) - Number(isSignedLead(a));
        if (signedDiff) return signedDiff;
        return String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || ''));
      })
      .slice(0, 30);
  }, [leads, leadSearch]);

  const isTemplateDirty = useMemo(() => (
    JSON.stringify(normalizeTemplateDataForSave(templateData)) !== templateSavedSnapshot
  ), [templateData, templateSavedSnapshot]);

  useEffect(() => {
    if (!movedItem) return;
    const element = document.querySelector(`[data-move-key="${movedItem.key}"]`) as HTMLElement | null;
    if (element) {
      element.animate(
        [
          {
            transform: movedItem.direction === 'up' ? 'translateY(16px)' : 'translateY(-16px)',
            backgroundColor: 'rgba(212, 175, 55, 0.10)',
          },
          {
            transform: 'translateY(0)',
            backgroundColor: 'rgba(212, 175, 55, 0)',
          },
        ],
        {
          duration: 320,
          easing: 'ease-out',
        }
      );
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const timer = window.setTimeout(() => setMovedItem(null), 380);
    return () => window.clearTimeout(timer);
  }, [movedItem]);

  const syncLeadProjectManager = async (leadId: string | undefined, manager: any, updatedAt = new Date().toISOString()) => {
    const managers = toPersonList(manager);
    if (!leadId || managers.length === 0) return;
    await leadsAPI.update(leadId, { manager: managers, updatedAt });
    setLeads(prev => prev.map((lead: any) => lead._id === leadId ? { ...lead, manager: managers, updatedAt } : lead));
  };

  const handleOpenCreate = () => {
    setForm(INIT_FORM);
    setSelectedLead(null);
    setLeadSearch('');
    setShowCreate(true);
  };

  useEffect(() => {
    if (searchParams.get('action') === 'new') handleOpenCreate();
  }, [searchParams]);

  const handleSelectLead = (lead: any) => {
    setSelectedLead(lead);
    setLeadSearch('');
    setForm({
      ...INIT_FORM,
      customer: getLeadName(lead),
      phone: getLeadPhone(lead),
      address: getLeadAddress(lead),
      sales: toText(lead.sales),
      designer: toText(lead.designer),
      manager: toText(lead.manager),
      remark: lead.requirementType || '',
      leadId: lead._id || '',
    });
  };

  const handleCreate = async () => {
    if (saving) return;
    if (!form.customer || !form.address) { alert('请先选择关联客户'); return; }
    if (!form.manager) { alert('请选择项目经理'); return; }
    if (!form.startDate) { alert('请选择开工日期'); return; }
    setSaving(true);
    const now = new Date().toISOString();
    
    // We fetch the latest template from cloud
    let tplData = templateData;
    if (!tplData || tplData.length === 0) {
      const doc = await systemConfigsAPI.doc(TEMPLATE_DOC_ID).get();
      const nodes = extractTemplateNodes(doc);
      if (nodes) {
        tplData = nodes;
      } else {
        alert('未找到施工模板，请先配置模板'); return;
      }
    }
    
    try {
      // Create new nodes from template
      const nodes = tplData.map((stage: any, stageIdx: number) => ({
        _id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9) + stageIdx,
        name: stage.name,
        collapsed: false,
        craftsmanship: stage.craftsmanship || [],
        sections: (stage.sections || []).map((sec: any, secIdx: number) => ({
          _id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9) + secIdx,
          name: sec.name || '',
          collapsed: false,
          subNodes: (sec.subNodes || []).map((n: any, idx: number) => ({
            _id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9) + idx,
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

      const newProject = {
        _id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
        ...form,
        status: '施工中',
        creatorName: myName,
        createdAt: now,
        updatedAt: now,
        nodesData: nodes,
        progressSummary: buildProjectProgressSummary(nodes),
      };
      await projectsAPI.add(newProject);
      await syncLeadProjectManager(form.leadId, form.manager, now);
      void createNotificationEventSafely({
        operationId: stableOperationId('project-created', newProject._id, now),
        eventType: 'PROJECT_CREATED',
        actorUserId: user?.id || '',
        recipientUserIds: await resolveProjectParticipantUserIds(newProject, selectedLead),
        recipientRoles: ['admin'],
        category: 'project',
        title: '新工地已建立',
        content: `${myName}建立了“${newProject.address || newProject.customer || '工地'}”`,
        link: `/projects-biz/${newProject._id}`,
        relatedTo: { type: 'project', id: newProject._id, name: newProject.address || newProject.customer || '工地' },
        channels: ['station', 'wechat'],
      });
      setShowCreate(false);
      setForm(INIT_FORM);
      setSelectedLead(null);
      fetchData();
    } catch (e: any) {
      console.error('创建工地失败', e);
      alert('创建工地失败：' + (e?.message || e?.toString?.() || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!showEdit || !showEdit._id) return;
    const updated = { ...showEdit, updatedAt: new Date().toISOString() };
    await projectsAPI.update(showEdit._id, updated);
    await syncLeadProjectManager(showEdit.leadId, showEdit.manager, updated.updatedAt);
    const linkedLead = leads.find((item: any) => item._id === showEdit.leadId);
    void createNotificationEventSafely({
      operationId: stableOperationId('project-updated', showEdit._id, updated.updatedAt),
      eventType: 'PROJECT_UPDATED',
      actorUserId: user?.id || '',
      recipientUserIds: await resolveProjectParticipantUserIds(updated, linkedLead),
      recipientRoles: ['admin'],
      category: 'project',
      title: '工地信息已更新',
      content: `${myName}更新了“${updated.address || updated.customer || '工地'}”的项目信息`,
      link: `/projects-biz/${showEdit._id}`,
      relatedTo: { type: 'project', id: showEdit._id, name: updated.address || updated.customer || '工地' },
      channels: ['station', 'wechat'],
    });
    setShowEdit(null);
    // 静默更新
    setProjects(prev => prev.map(p => p._id === showEdit._id ? { ...p, ...updated } : p));
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (saving) return;
    const project = projects.find(p => p._id === id);
    const msg = project
      ? `确定删除工地 "${project.customer || project.address || '未命名'}" 吗？\n\n删除后，该工地的所有施工节点、日志、巡检记录等数据将被永久删除，且不可恢复！`
      : '确定删除该工地吗？删除后所有关联数据将被永久删除，且不可恢复！';
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      await projectsAPI.delete(id);
      // 静默更新：从本地状态中移除，不刷新页面
      setProjects(prev => prev.filter(p => p._id !== id));
    } catch (e) {
      console.error('删除工地失败:', e);
    } finally {
      setSaving(false);
    }
  };

  const getProgress = (nodesData: any[]) => {
    if (!nodesData || nodesData.length === 0) return 0;
    const all = nodesData.flatMap((n: any) => n.sections?.flatMap((s: any) => s.subNodes) || []);
    if (all.length === 0) return 0;
    const completed = all.filter((sn: any) => sn.status === 'completed').length;
    return Math.round((completed / all.length) * 100);
  };

  const managerOptions = employees.map(e => e.name);

  /* ---- 模板库管理 ---- */
  const openTemplateLib = () => {
    navigate('/template-library');
  };

  const requestCloseTemplateLib = () => {
    if (templateSaving) return;
    if (isTemplateDirty) {
      setShowTemplateCloseConfirm(true);
      return;
    }
    setShowTemplateLib(false);
  };

  const discardTemplateChanges = async () => {
    await fetchTemplate();
    setTemplateSavedSnapshot(JSON.stringify(normalizeTemplateDataForSave(templateData)));
    setShowTemplateCloseConfirm(false);
    setShowTemplateLib(false);
  };

  const saveTemplateLib = async () => {
    setTemplateSaving(true);
    try {
      const normalized = normalizeTemplateDataForSave(templateData);
      const payload = {
        nodesData: normalized,
        updateTime: new Date().toISOString()
      };
      await Promise.all([
        systemConfigsAPI.doc(TEMPLATE_DOC_ID).set(payload),
        systemConfigsAPI.doc(LEGACY_TEMPLATE_DOC_ID).set(payload),
      ]);
      setTemplateData(normalized);
      setTemplateSavedSnapshot(JSON.stringify(normalized));
      setShowTemplateCloseConfirm(false);
      alert('模板库保存成功');
      setShowTemplateLib(false);
    } catch (e: any) {
      alert('保存失败：' + (e.message || '未知错误'));
    } finally {
      setTemplateSaving(false);
    }
  };

  /* ---- 阶段操作 ---- */
  const addStage = () => {
    if (!newStageName.trim()) return;
    const updated = [...templateData, { _id: `stage_${Date.now()}`, name: newStageName.trim(), craftsmanship: [], sections: [{ _id: `sec_${Date.now()}`, name: '默认阶段', subNodes: [] }] }];
    setTemplateData(updated);
    setNewStageName('');
    setShowAddStage(false);
  };

  const deleteStage = (stageIdx: number) => {
    const updated = templateData.filter((_, i) => i !== stageIdx);
    setTemplateData(updated);
    if (expandedStageIdx === stageIdx) setExpandedStageIdx(null);
  };

  const editStageName = (stageIdx: number, name: string) => {
    const updated = templateData.map((s, i) => i === stageIdx ? { ...s, name } : s);
    setTemplateData(updated);
  };

  /* ---- 工艺标准操作 ---- */
  const openCraftsmanshipEdit = (stageIdx: number) => {
    setEditingCraftsmanship(stageIdx);
    setCraftsmanshipList(templateData[stageIdx].craftsmanship || []);
  };

  const saveCraftsmanship = () => {
    if (editingCraftsmanship === null) return;
    const updated = [...templateData];
    updated[editingCraftsmanship].craftsmanship = craftsmanshipList;
    setTemplateData(updated);
    setEditingCraftsmanship(null);
  };

  const addCraftsmanship = () => {
    setCraftsmanshipList([...craftsmanshipList, { text: '', images: [] }]);
  };

  const uploadCraftsmanshipImages = async (idx: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      setUploadingCraftIdx(idx);
      const uploaded = await Promise.all(
        Array.from(files).map(file => uploadToCloud(file, `template_craftsmanship/${Date.now()}`))
      );
      const next = [...craftsmanshipList];
      next[idx] = {
        ...next[idx],
        images: [...(next[idx].images || []), ...uploaded.map(item => item.fileID)],
      };
      setCraftsmanshipList(next);
    } catch (e: any) {
      alert('工艺标准图片上传失败：' + (e?.message || '未知错误'));
    } finally {
      setUploadingCraftIdx(null);
    }
  };

  const openCraftPreview = (images: string[], index: number) => {
    const resolved = images.map(resolveCloudImageSrc).filter(Boolean);
    if (resolved.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, resolved.length - 1));
    if (openNativeMediaPreview(resolved.map(url => ({ url, type: 'image' })), safeIndex)) return;
    setCraftPreview({ images: resolved, index: safeIndex });
  };

  const removeCraftsmanship = (idx: number) => {
    setCraftsmanshipList(craftsmanshipList.filter((_, i) => i !== idx));
  };

  const updateCraftsmanshipText = (idx: number, text: string) => {
    const newList = [...craftsmanshipList];
    newList[idx].text = text;
    setCraftsmanshipList(newList);
  };

  /* ---- 子组操作 ---- */
  const addSection = (stageIdx: number) => {
    if (!newSectionName.trim()) return;
    const updated = templateData.map((s, i) =>
      i === stageIdx ? { ...s, sections: [...s.sections, { _id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: newSectionName.trim(), subNodes: [] }] } : s
    );
    setTemplateData(updated);
    setNewSectionName('');
    setShowAddSection(null);
  };

  const deleteSection = (stageIdx: number, sectionIdx: number) => {
    const updated = templateData.map((s, i) =>
      i === stageIdx ? { ...s, sections: s.sections.filter((_: any, j: number) => j !== sectionIdx) } : s
    );
    setTemplateData(updated);
  };

  /* ---- 节点操作 ---- */
  const addNode = (stageIdx: number, sectionIdx: number) => {
    if (!newNodeForm.name.trim()) return;
    const updated = templateData.map((s, i) =>
      i === stageIdx ? {
        ...s, sections: s.sections.map((sec: any, j: number) =>
          j === sectionIdx ? {
            ...sec, subNodes: [...(sec.subNodes || []), {
              _id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: newNodeForm.name.trim(),
              type: DEFAULT_NODE_TYPE,
              requirePhoto: true,
              standard: '',
              standardPublic: true,
              fields: [],
              checklist: [],
            }],
          } : sec
        ),
      } : s
    );
    setTemplateData(updated);
    setNewNodeForm({ name: '' });
    setShowAddNode(null);
  };

  const deleteNode = (stageIdx: number, sectionIdx: number, nodeIdx: number) => {
    const updated = templateData.map((s, i) =>
      i === stageIdx ? {
        ...s, sections: s.sections.map((sec: any, j: number) =>
          j === sectionIdx ? { ...sec, subNodes: sec.subNodes.filter((_: any, k: number) => k !== nodeIdx) } : sec
        ),
      } : s
    );
    setTemplateData(updated);
  };

  const updateNodeName = (stageIdx: number, sectionIdx: number, nodeIdx: number, name: string) => {
    const updated = [...templateData];
    updated[stageIdx].sections[sectionIdx].subNodes[nodeIdx] = {
      ...updated[stageIdx].sections[sectionIdx].subNodes[nodeIdx],
      name,
      type: normalizeNodeType(updated[stageIdx].sections[sectionIdx].subNodes[nodeIdx].type),
    };
    delete updated[stageIdx].sections[sectionIdx].subNodes[nodeIdx].fields;
    setTemplateData(updated);
  };

  const moveStage = (stageIdx: number, direction: -1 | 1) => {
    const targetIdx = stageIdx + direction;
    if (targetIdx < 0 || targetIdx >= templateData.length) return;
    const movedStage = templateData[stageIdx];
    setTemplateData(moveItem(templateData, stageIdx, targetIdx));
    if (expandedStageIdx === stageIdx) setExpandedStageIdx(targetIdx);
    else if (expandedStageIdx === targetIdx) setExpandedStageIdx(stageIdx);
    setMovedItem({ key: `stage-${movedStage?._id || targetIdx}`, direction: direction === -1 ? 'up' : 'down' });
  };

  const moveSection = (stageIdx: number, sectionIdx: number, direction: -1 | 1) => {
    const targetIdx = sectionIdx + direction;
    const sectionList = templateData[stageIdx]?.sections || [];
    if (targetIdx < 0 || targetIdx >= sectionList.length) return;
    const movedSection = sectionList[sectionIdx];
    const updated = [...templateData];
    updated[stageIdx] = {
      ...updated[stageIdx],
      sections: moveItem(sectionList, sectionIdx, targetIdx),
    };
    setTemplateData(updated);
    setMovedItem({ key: `section-${movedSection?._id || `${stageIdx}-${targetIdx}`}`, direction: direction === -1 ? 'up' : 'down' });
  };

  const moveNode = (stageIdx: number, sectionIdx: number, nodeIdx: number, direction: -1 | 1) => {
    const nodeList = templateData[stageIdx]?.sections?.[sectionIdx]?.subNodes || [];
    const targetIdx = nodeIdx + direction;
    if (targetIdx < 0 || targetIdx >= nodeList.length) return;
    const movedNode = nodeList[nodeIdx];
    const updated = [...templateData];
    updated[stageIdx].sections[sectionIdx] = {
      ...updated[stageIdx].sections[sectionIdx],
      subNodes: moveItem(nodeList, nodeIdx, targetIdx),
    };
    setTemplateData(updated);
    setMovedItem({ key: `node-${movedNode?._id || `${stageIdx}-${sectionIdx}-${targetIdx}`}`, direction: direction === -1 ? 'up' : 'down' });
  };

  const STAT_CARDS = [
    { key: 'all' as const, label: '全部工地', count: stats.total, color: 'text-gray-900', activeClass: 'border-gray-400 bg-gray-50', icon: Layers },
    { key: '施工中' as const, label: '施工中', count: stats.ongoing, color: 'text-blue-600', activeClass: 'border-blue-400 bg-blue-50', icon: Calendar },
    { key: '已完工' as const, label: '已完工', count: stats.completed, color: 'text-emerald-600', activeClass: 'border-emerald-400 bg-emerald-50', icon: CheckCircle },
    { key: '已暂停' as const, label: '已暂停', count: stats.paused, color: 'text-gray-500', activeClass: 'border-gray-400 bg-gray-50', icon: X },
  ];

  return (
    <div className="erp-page pb-24 md:pb-6">
      <div className="erp-page-header items-start">
        <div>
          <h1 className="erp-page-title">工地管理</h1>
          <p className="erp-page-subtitle">管理所有施工工地信息</p>
        </div>
        <div className="flex items-center gap-2 pt-0.5 shrink-0">
          {isAdmin && (
            <button onClick={openTemplateLib} className="flex items-center gap-1.5 px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gold-300 hover:text-gold-600 transition-colors whitespace-nowrap">
              模板
            </button>
          )}
          <button onClick={handleOpenCreate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors whitespace-nowrap">
            <Plus size={16} /> 新建工地
          </button>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-1.5 md:grid md:grid-cols-4 md:gap-3 mb-4 scrollbar-hide">
        {STAT_CARDS.map(card => {
          const active = statFilter === card.key;
          const Icon = card.icon;
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

      <div className="erp-surface overflow-visible">
        <div className="erp-search-row">
            <div className="erp-search-field">
              <Search size={14} className="erp-search-icon" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索客户、地址、电话"
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
                      全部工地
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
              <button onClick={() => setShowFilter(!showFilter)} className={`erp-filter-button ${showFilter ? 'erp-filter-button-active' : 'erp-filter-button-idle'} ${activeProjectFilters > 0 ? 'bg-gold-50 text-gold-600 border-gold-200' : ''}`}>
                <Filter size={13} /> <span>筛选</span>
                {activeProjectFilters > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold-400 text-white text-[10px] font-bold">{activeProjectFilters}</span>
                )}
              </button>
            </div>
        </div>

        {activeProjectFilters > 0 && (
          <div className="md:hidden flex items-center justify-between gap-3 border-b border-gray-100 bg-gold-50/50 px-3 py-2">
            <span className="min-w-0 truncate text-xs text-gray-600">
              已筛选：{[statFilter !== 'all' ? statFilter : '', filterEmployee].filter(Boolean).join('、')}
            </span>
            <button type="button" onClick={clearProjectFilters} className="shrink-0 text-xs font-medium text-gold-600">清除筛选</button>
          </div>
        )}

        {showFilter && (
          <div className="erp-filter-panel">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-2">工地状态</p>
                <div className="flex flex-wrap gap-2">
                  {['施工中', '已完工', '已暂停'].map(s => (
                    <button key={s} onClick={() => setStatFilter(statFilter === s ? 'all' : s)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${statFilter === s ? 'bg-gold-400 text-black border-gold-400' : 'border-gray-200 text-gray-600 hover:bg-white'}`}>{s}</button>
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
            {(statFilter !== 'all' || filterEmployee) && (
              <div className="flex justify-end mt-3">
                <button onClick={clearProjectFilters} className="text-xs text-gold-500 hover:text-gold-600 font-medium">清除筛选</button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-gray-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-400 text-sm">暂无工地数据</div>
        ) : (
          <div>
            <div className="erp-list-head grid-cols-[minmax(240px,1.2fr)_minmax(180px,0.8fr)_minmax(380px,1.8fr)_minmax(160px,0.7fr)_56px] gap-6">
              <span>工地信息</span>
              <span>负责人</span>
              <span>施工进度</span>
              <span>时间</span>
              <span className="text-right">操作</span>
            </div>
            {visibleProjects.map(p => {
              const summary = p.progressSummary || buildProjectProgressSummary(p.nodesData || []);
              const stageStatuses = Array.isArray(summary.stageStatuses) ? summary.stageStatuses : [];
              const progress = typeof summary.progressPercent === 'number' ? summary.progressPercent : getProgress(p.nodesData || []);
              const lifecycleStatus = getProjectLifecycleStatus(p);
              const currentStageLabel = getCurrentStageLabel(p);
              const dateMeta = getProjectDateMeta(p);
              const isRelated = isAdmin || getProjectPeople(p).includes(myName);
              const projectId = p._id;
              const roleBadges = getProjectRoleBadges(p);
              const pendingAccess = pendingAccessByProject[projectId] || 0;
              const unreadUpdates = projectUnreadCountById[projectId] || 0;

              return (
              <div key={projectId} className="relative overflow-hidden border-b border-gray-50 last:border-b-0 md:overflow-visible">
                {/* 卡片主体 */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSwipeProjectId(null);
                      void handleDelete(projectId);
                    }}
                    className="absolute inset-y-0 right-0 flex w-[88px] flex-col items-center justify-center gap-1 bg-red-500 text-xs font-medium text-white active:bg-red-600 md:hidden"
                    aria-label="删除工地"
                  >
                    <Trash2 size={18} />
                    删除
                  </button>
                )}
                <div
                  className="erp-list-row cursor-pointer bg-white p-3 transition-transform duration-200 ease-out md:px-4 md:py-3"
                  style={{ transform: isAdmin && openSwipeProjectId === projectId ? `translateX(-${MOBILE_DELETE_WIDTH}px)` : 'translateX(0)' }}
                  onTouchStart={(event) => {
                    if (!isAdmin) return;
                    const touch = event.touches[0];
                    projectTouchStartRef.current = { x: touch.clientX, y: touch.clientY, id: projectId };
                  }}
                  onTouchMove={(event) => {
                    if (!isAdmin || projectTouchStartRef.current?.id !== projectId) return;
                    const touch = event.touches[0];
                    const dx = touch.clientX - projectTouchStartRef.current.x;
                    const dy = touch.clientY - projectTouchStartRef.current.y;
                    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                      if (dx < 0) setOpenSwipeProjectId(projectId);
                      if (dx > 0) setOpenSwipeProjectId(null);
                    }
                  }}
                  onTouchEnd={(event) => {
                    if (!isAdmin || projectTouchStartRef.current?.id !== projectId) return;
                    const touch = event.changedTouches[0];
                    const dx = touch.clientX - projectTouchStartRef.current.x;
                    const dy = touch.clientY - projectTouchStartRef.current.y;
                    const swiped = Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.25;
                    if (swiped) {
                      suppressProjectClickRef.current = projectId;
                      window.setTimeout(() => {
                        if (suppressProjectClickRef.current === projectId) suppressProjectClickRef.current = null;
                      }, 250);
                      setOpenSwipeProjectId(dx < 0 ? projectId : null);
                    }
                    projectTouchStartRef.current = null;
                  }}
                  onClick={() => {
                    if (suppressProjectClickRef.current === projectId) return;
                    if (openSwipeProjectId && openSwipeProjectId !== projectId) {
                      setOpenSwipeProjectId(null);
                      return;
                    }
                    if (openSwipeProjectId === projectId) {
                      setOpenSwipeProjectId(null);
                      return;
                    }
                    saveProjectListScroll();
                    navigate(`/projects-biz/${projectId}`, { state: { from: returnPath } });
                  }}
                >
                  {/* 移动端 */}
                  <div className="md:hidden">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 truncate leading-snug">
                          <span className="relative inline-flex items-center">
                            <span>{p.address || '无地址'}</span>
                            {unreadUpdates > 0 && (
                              <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
                                {unreadUpdates > 99 ? '99+' : unreadUpdates}
                              </span>
                            )}
                            {pendingAccess > 0 && <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" />}
                          </span>
                        </h3>
                        <div className="mt-0.5 truncate text-[11px] text-gray-500">{p.customer || '未命名'}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${STATUS_COLORS[lifecycleStatus] || 'bg-gold-50 text-gold-600'}`}>{currentStageLabel}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1.5 flex-wrap">
                      {roleBadges.length > 0 ? roleBadges.map((person) => (
                        <span key={person.name} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                          {person.name} {person.roles.join('/')}
                        </span>
                      )) : <span>-</span>}
                    </div>
                    {stageStatuses.length > 0 && (
                      <div className="mt-1.5">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-gray-400">施工进度</span>
                          <span className="font-bold text-gold-600">{progress}%</span>
                        </div>
                        <div className="flex items-center w-full px-0.5">
                          {stageStatuses.map((ns: any, i: number) => {
                              const isLast = i === stageStatuses.length - 1;
                              const isCompleted = ns.status === 'completed';
                              const isCurrent = ns.status === 'current';
                              return (
                                <div key={`${ns.name || 'stage'}-${i}`} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
                                  <div className={`relative w-3 h-3 rounded-full shrink-0 z-10 bg-white border transition-colors
                                    ${isCompleted ? 'border-emerald-500' : isCurrent ? 'border-gold-500' : 'border-gray-200'}`}>
                                    <span className={`absolute left-1/2 top-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                                      isCompleted ? 'bg-emerald-500' : isCurrent ? 'bg-gold-500' : 'bg-gray-200'
                                    }`} />
                                  </div>
                                  {!isLast && <div className={`flex-1 h-[2px] mx-0 ${isCompleted ? 'bg-emerald-500' : isCurrent ? 'bg-gold-300' : 'bg-gray-100'}`} />}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-500 mt-2">
                      <div className="min-w-0 text-left">
                        {dateMeta.finishDate ? `完工日期 ${dateMeta.finishDate}` : dateMeta.pauseDate ? `暂停日期 ${dateMeta.pauseDate}` : dateMeta.startDate ? `开工日期 ${dateMeta.startDate}` : ''}
                      </div>
                      <div className="min-w-0 text-right font-normal text-gray-500">
                        {dateMeta.days > 0 ? `工期 ${dateMeta.days} 天` : ''}
                      </div>
                    </div>
                  </div>
                  
                  {/* 桌面端 */}
                  <div className="hidden md:grid grid-cols-[minmax(240px,1.2fr)_minmax(180px,0.8fr)_minmax(380px,1.8fr)_minmax(160px,0.7fr)_56px] items-center gap-6">
                    <div className="min-w-0">
                      <div className="mb-1 flex min-w-0 items-center gap-2">
                        <span className="relative inline-flex min-w-0 items-center text-sm font-semibold text-gray-900">
                          <span className="truncate" title={p.address || '无地址'}>{p.address || '无地址'}</span>
                          {unreadUpdates > 0 && (
                            <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
                              {unreadUpdates > 99 ? '99+' : unreadUpdates}
                            </span>
                          )}
                          {pendingAccess > 0 && (
                            <span className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-4 text-white">
                              {pendingAccess > 9 ? '9+' : pendingAccess}
                            </span>
                          )}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[lifecycleStatus] || 'bg-gold-50 text-gold-600'}`}>{currentStageLabel}</span>
                      </div>
                      <div className="truncate text-xs text-gray-500" title={p.customer || '未命名'}>{p.customer || '未命名'}</div>
                    </div>

                    <div className="min-w-0 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {roleBadges.length > 0 ? roleBadges.map((person) => (
                          <span key={person.name} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600" title={`${person.name} ${person.roles.join('/')}`}>
                            {person.name} <span className="text-gray-400">{person.roles.join('/')}</span>
                          </span>
                        )) : <span className="text-gray-400">-</span>}
                      </div>
                    </div>

                    <div className="min-w-0">
                      {stageStatuses.length > 0 && (
                        <div className="w-full min-w-0">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-gray-500 font-medium">施工进度</span>
                            <span className="font-bold text-gold-600 text-xs">{progress}%</span>
                          </div>
                          <div
                            className="mt-1.5"
                            style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, stageStatuses.length)}, minmax(0, 1fr))` }}
                          >
                            {/* 圆点 + 连线行 */}
                            {stageStatuses.map((ns: any, i: number) => {
                                const isLast = i === stageStatuses.length - 1;
                                const isCompleted = ns.status === 'completed';
                                const isCurrent = ns.status === 'current';
                                return (
                                  <div key={`dot-${i}`} className="relative flex items-center">
                                    {/* 左侧连线（从左边中点到圆点） */}
                                    {i > 0 && (
                                      <div className="absolute right-1/2 left-0 top-1/2 h-0.5 -translate-y-px"
                                        style={{ background: isCompleted ? '#10b981' : '#f3f4f6' }} />
                                    )}
                                    {/* 圆点 */}
                                    <div className="relative z-10 mx-auto flex flex-col items-center group">
                                      <div className={`w-3 h-3 rounded-full flex items-center justify-center border-2 shrink-0 bg-white transition-all
                                        ${isCompleted ? 'border-emerald-500 bg-emerald-500' : isCurrent ? 'border-gold-500' : 'border-gray-200'}`}>
                                        {isCompleted && <CheckCircle size={7} className="text-white" />}
                                      </div>
                                      <div className="absolute opacity-0 group-hover:opacity-100 -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-20 transition-opacity shadow-lg">
                                        {ns.name || '阶段'}
                                      </div>
                                    </div>
                                    {/* 右侧连线（从圆点到右边中点） */}
                                    {!isLast && (
                                      <div className="absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-px"
                                        style={{ background: isCompleted ? '#10b981' : '#f3f4f6' }} />
                                    )}
                                  </div>
                                );
                              })}
                            {/* 文字标签行 */}
                            {stageStatuses.map((ns: any, i: number) => (
                              <span key={`label-${i}`} className="truncate text-center text-[10px] text-gray-400 mt-1">{ns.name || '阶段'}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 space-y-1 text-xs text-gray-500">
                      {dateMeta.startDate && <div>开工 {dateMeta.startDate}</div>}
                      {dateMeta.finishDate && <div>完工 {dateMeta.finishDate}</div>}
                      {dateMeta.pauseDate && <div>暂停 {dateMeta.pauseDate}</div>}
                      {dateMeta.days > 0 && <div className="text-gray-400">工期 {dateMeta.days} 天</div>}
                    </div>

                    <div className="flex items-center justify-end gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {isRelated && (
                        <>
                          <button onClick={() => setShowEdit({ ...p })} className="p-1.5 text-gray-400 hover:text-gold-500 rounded-lg hover:bg-gold-50 transition-colors"><Edit3 size={14} /></button>
                          {isAdmin && (
                            <button onClick={() => handleDelete(projectId)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
            {hasMoreProjects && (
              <div className="flex justify-center border-t border-gray-50 px-4 py-4">
                <button
                  type="button"
                  onClick={loadMoreProjects}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gold-300 hover:bg-gold-50 hover:text-gold-700 transition-colors"
                >
                  加载更多（已显示 {visibleProjectCount} / 共 {filtered.length}）
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========== 新建工地弹窗 ========== */}
      {showCreate && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setSelectedLead(null); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-visible" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100"><h2 className="text-lg font-bold">新建工地</h2></div>
            <div className="p-4 space-y-3 overflow-visible">
              {!selectedLead ? (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">关联客户 *</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder="搜索客户姓名、地址或电话..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400" autoFocus />
                  </div>
                  {filteredLeads.length > 0 && (
                    <div className="mt-2 max-h-60 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                      {filteredLeads.map((l: any) => (
                        <div key={l._id} onClick={() => handleSelectLead(l)} className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-gold-50 transition-colors">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-700">{getLeadName(l) || '-'}</span>
                              <span className="text-xs text-gray-400 font-mono">{getLeadNo(l)}</span>
                              {isSignedLead(l) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">已签单</span>}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{getLeadAddress(l)}{getLeadPhone(l) ? ` | ${getLeadPhone(l)}` : ''}</p>
                          </div>
                          <ChevronRight size={14} className="text-gray-300 shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-gold-50/50 rounded-xl border border-gold-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gold-700">已关联客户</span>
                    <button onClick={() => setSelectedLead(null)} className="text-xs text-gray-400 hover:text-gray-600">更换</button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-gray-500">姓名：<span className="text-gray-900 font-medium">{getLeadName(selectedLead)}</span></span>
                    <span className="text-gray-500">编号：<span className="text-gray-900 font-mono text-xs">{getLeadNo(selectedLead)}</span></span>
                    <span className="text-gray-500 col-span-2">地址：<span className="text-gray-900">{getLeadAddress(selectedLead)}</span></span>
                    {getLeadPhone(selectedLead) && <span className="text-gray-500">电话：<span className="text-gray-900">{getLeadPhone(selectedLead)}</span></span>}
                    {toText(selectedLead.designer) && <span className="text-gray-500">设计师：<span className="text-gray-900">{toText(selectedLead.designer)}</span></span>}
                  </div>
                </div>
              )}
              {selectedLead && (
                <>
                  <div><label className="text-xs text-gray-500 mb-1 block">项目经理 *</label><select value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"><option value="">未分配</option>{managerOptions.map(m => <option key={m}>{m}</option>)}</select></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">开工日期 *</label><DatePicker mode="single" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} placeholder="选择日期" dropUp /></div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => { setShowCreate(false); setSelectedLead(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate} disabled={saving || !selectedLead || !form.manager || !form.startDate} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== 编辑工地弹窗 ========== */}
      {showEdit && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowEdit(null)}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-visible" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100"><h2 className="text-lg font-bold">编辑工地</h2></div>
            <div className="p-4 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">客户姓名</label><input value={showEdit.customer || ''} onChange={e => setShowEdit({ ...showEdit, customer: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">联系电话</label><input value={showEdit.phone || ''} onChange={e => setShowEdit({ ...showEdit, phone: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">工地地址</label><input value={showEdit.address || ''} onChange={e => setShowEdit({ ...showEdit, address: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">状态</label><select value={showEdit.status === '进行中' ? '施工中' : (showEdit.status || '施工中')} onChange={e => setShowEdit({ ...showEdit, status: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400">{['施工中', '已完工', '已暂停'].map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label className="text-xs text-gray-500 mb-1 block">项目经理</label><select value={showEdit.manager || ''} onChange={e => setShowEdit({ ...showEdit, manager: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"><option value="">未分配</option>{managerOptions.map(m => <option key={m}>{m}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">开工日期</label><DatePicker mode="single" value={showEdit.startDate || ''} onChange={(v) => setShowEdit({ ...showEdit, startDate: v })} placeholder="选择日期" dropUp /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">预计完工</label><DatePicker mode="single" value={showEdit.endDate || ''} onChange={(v) => setShowEdit({ ...showEdit, endDate: v })} placeholder="选择日期" dropUp /></div>
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

      {/* ========== 模板库弹窗 ========== */}
      {showTemplateLib && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center md:p-4" onClick={requestCloseTemplateLib}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] md:max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <BookOpen className="w-4 h-4 md:w-5 md:h-5 text-gold-500 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-base md:text-lg font-bold text-gray-900">施工模板库</h2>
                  <p className="text-[10px] md:text-xs text-gray-400 truncate">管理全局施工流程模板，新建工地时将基于此模板生成节点</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                <button onClick={saveTemplateLib} disabled={templateSaving} className="px-3 md:px-4 py-1.5 text-xs md:text-sm bg-gray-900 text-white hover:bg-gray-800 rounded-lg disabled:opacity-50 whitespace-nowrap">
                  {templateSaving ? '保存中...' : '保存修改'}
                </button>
                <button onClick={requestCloseTemplateLib} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3 md:p-6">
              <div className="space-y-3 md:space-y-4">
                {/* 阶段列表 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs md:text-sm font-semibold text-gray-700">
                      施工阶段 <span className="text-gray-400 font-normal text-[10px] md:text-xs">{(templateData || []).length} 个</span>
                    </h3>
                    <button onClick={() => setShowAddStage(true)} className="text-[10px] md:text-xs text-gold-600 hover:text-gold-700"><Plus className="w-3 h-3 inline" /> 添加阶段</button>
                  </div>

                  {showAddStage && (
                    <div className="flex items-center gap-2 bg-gold-50 rounded-lg p-2 md:p-3">
                      <input value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="阶段名称" className="flex-1 px-2 md:px-3 py-1.5 text-xs md:text-sm border border-gray-200 rounded focus:outline-none focus:border-gold-400" autoFocus />
                      <button onClick={addStage} disabled={!newStageName.trim()} className="px-2 md:px-3 py-1.5 bg-gold-400 text-black text-xs md:text-sm rounded-lg hover:bg-gold-500 disabled:opacity-40 whitespace-nowrap">添加</button>
                      <button onClick={() => { setShowAddStage(false); setNewStageName(''); }} className="px-2 md:px-3 py-1.5 text-xs md:text-sm text-gray-400 hover:text-gray-600 whitespace-nowrap">取消</button>
                    </div>
                  )}

                  {(templateData || []).map((stage, stageIdx) => (
                    <div
                      key={stage._id || stageIdx}
                      data-move-key={`stage-${stage._id || stageIdx}`}
                      className={`bg-white rounded-xl border overflow-hidden transition-all duration-300 border-gray-200 ${
                        movedItem?.key === `stage-${stage._id || stageIdx}` ? 'ring-2 ring-gold-200 shadow-lg' : ''
                      }`}
                    >
                      {/* 桌面端：单行布局 */}
                      <div className="hidden md:flex items-center gap-3 px-4 py-3">
                        <button onClick={() => setExpandedStageIdx(expandedStageIdx === stageIdx ? null : stageIdx)} className="text-gray-400 hover:text-gray-600">
                          {expandedStageIdx === stageIdx ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <input
                          value={stage.name}
                          onChange={e => editStageName(stageIdx, e.target.value)}
                          className="flex-1 text-sm font-medium text-gray-800 border-b border-transparent hover:border-gray-200 focus:border-gold-400 focus:outline-none px-1"
                        />
                        <span className="text-xs text-gray-400 whitespace-nowrap">{(stage.sections || []).reduce((s: number, sec: any) => s + (sec.subNodes?.length || 0), 0)} 节点</span>
                        <button onClick={() => openCraftsmanshipEdit(stageIdx)} className="text-xs text-blue-500 hover:text-blue-600 px-2 py-1 rounded bg-blue-50 whitespace-nowrap">
                          工艺标准 ({stage.craftsmanship?.length || 0})
                        </button>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveStage(stageIdx, -1)} disabled={stageIdx === 0} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="上移阶段">上移</button>
                          <button onClick={() => moveStage(stageIdx, 1)} disabled={stageIdx === templateData.length - 1} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="下移阶段">下移</button>
                        </div>
                        <button onClick={() => { if (confirm('删除该阶段及所有节点？')) deleteStage(stageIdx); }} className="p-1 hover:bg-red-50 rounded">
                          <Trash2 className="w-3.5 h-3.5 text-gray-300 hover:text-red-400" />
                        </button>
                      </div>
                      {/* 移动端：双行布局 */}
                      <div className="md:hidden px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setExpandedStageIdx(expandedStageIdx === stageIdx ? null : stageIdx)} className="text-gray-400 hover:text-gray-600 shrink-0">
                            {expandedStageIdx === stageIdx ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <input
                            value={stage.name}
                            onChange={e => editStageName(stageIdx, e.target.value)}
                            className="flex-1 text-sm font-medium text-gray-800 border-b border-transparent hover:border-gray-200 focus:border-gold-400 focus:outline-none px-1 min-w-0"
                          />
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">{(stage.sections || []).reduce((s: number, sec: any) => s + (sec.subNodes?.length || 0), 0)}节点</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openCraftsmanshipEdit(stageIdx)} className="text-[10px] text-blue-500 hover:text-blue-600 px-1.5 py-0.5 rounded bg-blue-50 whitespace-nowrap">
                              工艺({stage.craftsmanship?.length || 0})
                            </button>
                            <button onClick={() => moveStage(stageIdx, -1)} disabled={stageIdx === 0} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">↑</button>
                            <button onClick={() => moveStage(stageIdx, 1)} disabled={stageIdx === templateData.length - 1} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">↓</button>
                          </div>
                          <button onClick={() => { if (confirm('删除该阶段及所有节点？')) deleteStage(stageIdx); }} className="p-1 hover:bg-red-50 rounded">
                            <Trash2 className="w-3 h-3 text-gray-300 hover:text-red-400" />
                          </button>
                        </div>
                      </div>

                      {expandedStageIdx === stageIdx && (
                        <div className="border-t border-gray-100 bg-gray-50/30 p-3 md:p-4">
                          <div className="flex items-center justify-between mb-2 md:mb-3">
                            <button onClick={() => { setShowAddSection(stageIdx); setNewSectionName(''); }} className="text-[10px] md:text-xs text-gold-600 hover:text-gold-700"><Plus className="w-3 h-3 inline" /> 添加子分组</button>
                          </div>

                          {showAddSection === stageIdx && (
                            <div className="flex items-center gap-2 mb-2 md:mb-3 bg-gold-50 rounded-lg p-2 md:p-3">
                              <input value={newSectionName} onChange={e => setNewSectionName(e.target.value)} placeholder="分组名称（如：材料、验收）" className="flex-1 px-2 md:px-3 py-1.5 text-xs md:text-sm border border-gray-200 rounded focus:outline-none focus:border-gold-400" autoFocus />
                              <button onClick={() => addSection(stageIdx)} disabled={!newSectionName.trim()} className="px-2 md:px-3 py-1.5 bg-gold-400 text-black text-xs md:text-sm rounded-lg hover:bg-gold-500 disabled:opacity-40 whitespace-nowrap">添加</button>
                              <button onClick={() => setShowAddSection(null)} className="px-2 md:px-3 py-1.5 text-xs md:text-sm text-gray-400 hover:text-gray-600 whitespace-nowrap">取消</button>
                            </div>
                          )}

                          <div className="space-y-2 md:space-y-3">
                            {(stage.sections || []).map((section: any, sectionIdx: number) => (
                              <div
                                key={section._id || sectionIdx}
                                data-move-key={`section-${section._id || `${stageIdx}-${sectionIdx}`}`}
                                className={`bg-white rounded-lg border p-2 md:p-3 transition-all duration-300 border-gray-100 ${
                                  movedItem?.key === `section-${section._id || `${stageIdx}-${sectionIdx}`}` ? 'ring-2 ring-gold-200 shadow-md' : ''
                                }`}
                              >
                                <div className="flex items-center gap-1 md:gap-2 mb-1.5 md:mb-2">
                                  <input
                                    value={section.name}
                                    onChange={e => {
                                      const updated = [...templateData];
                                      updated[stageIdx].sections[sectionIdx] = { ...updated[stageIdx].sections[sectionIdx], name: e.target.value };
                                      setTemplateData(updated);
                                    }}
                                    placeholder="子分组名称"
                                    className="flex-1 text-xs font-medium text-gray-600 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gold-400 focus:outline-none px-1 min-w-0"
                                  />
                                  <button onClick={() => moveSection(stageIdx, sectionIdx, -1)} disabled={sectionIdx === 0} className="px-1 py-0.5 text-[10px] md:text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="上移子分组">↑</button>
                                  <button onClick={() => moveSection(stageIdx, sectionIdx, 1)} disabled={sectionIdx === (stage.sections || []).length - 1} className="px-1 py-0.5 text-[10px] md:text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="下移子分组">↓</button>
                                  <button onClick={() => { if (confirm('删除该分组？')) deleteSection(stageIdx, sectionIdx); }} className="p-0.5 hover:bg-red-50 rounded">
                                    <Trash2 className="w-3 h-3 text-gray-300 hover:text-red-400" />
                                  </button>
                                </div>

                                {(section.subNodes || []).map((node: any, nodeIdx: number) => (
                                  <div
                                    key={node._id || nodeIdx}
                                    data-move-key={`node-${node._id || `${stageIdx}-${sectionIdx}-${nodeIdx}`}`}
                                    className={`flex items-start gap-1 md:gap-2 py-1 md:py-1.5 px-1.5 md:px-2 rounded hover:bg-gray-50 group transition-all duration-300 ${
                                      movedItem?.key === `node-${node._id || `${stageIdx}-${sectionIdx}-${nodeIdx}`}` ? 'bg-gold-50 ring-1 ring-gold-200' : ''
                                    }`}
                                  >
                                    <span className="text-[10px] md:text-xs text-gray-400 pt-1.5 md:pt-2">{nodeIdx + 1}.</span>
                                    <textarea
                                      value={node.name}
                                      onChange={e => updateNodeName(stageIdx, sectionIdx, nodeIdx, e.target.value)}
                                      className="flex-1 text-[11px] md:text-xs text-gray-700 bg-white border border-transparent hover:border-gray-200 focus:border-gold-400 focus:outline-none rounded px-1.5 md:px-2 py-1 md:py-1.5 resize-none min-h-[28px] md:min-h-[34px]"
                                      rows={1}
                                      onInput={(e) => {
                                        const target = e.target as HTMLTextAreaElement;
                                        target.style.height = 'auto';
                                        target.style.height = `${target.scrollHeight}px`;
                                      }}
                                    />
                                    <div className="flex items-center gap-0.5 md:gap-1 mt-0.5 md:mt-1 shrink-0">
                                      <button onClick={() => moveNode(stageIdx, sectionIdx, nodeIdx, -1)} disabled={nodeIdx === 0} className="px-1 py-0.5 text-[10px] md:text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="上移">↑</button>
                                      <button onClick={() => moveNode(stageIdx, sectionIdx, nodeIdx, 1)} disabled={nodeIdx === (section.subNodes || []).length - 1} className="px-1 py-0.5 text-[10px] md:text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="下移">↓</button>
                                    </div>
                                    <button onClick={() => deleteNode(stageIdx, sectionIdx, nodeIdx)} className="p-0.5 hover:bg-red-100 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <Trash2 className="w-3 h-3 text-gray-300 hover:text-red-400" />
                                    </button>
                                  </div>
                                ))}

                                <div className="mt-2">
                                  {showAddNode?.stageIdx === stageIdx && showAddNode?.sectionIdx === sectionIdx ? (
                                    <div className="bg-gold-50 rounded-lg p-2 md:p-3 space-y-2">
                                      <div className="flex items-center gap-2">
                                        <input value={newNodeForm.name} onChange={e => setNewNodeForm({ name: e.target.value })} placeholder="检查项名称" className="flex-1 px-2 py-1.5 text-[11px] md:text-xs border border-gray-200 rounded focus:outline-none focus:border-gold-400" autoFocus />
                                      </div>
                                      <div className="flex gap-2">
                                        <button onClick={() => addNode(stageIdx, sectionIdx)} disabled={!newNodeForm.name.trim()} className="px-2 md:px-3 py-1.5 bg-gold-400 text-black text-[11px] md:text-xs rounded-lg hover:bg-gold-500 disabled:opacity-40">添加</button>
                                        <button onClick={() => setShowAddNode(null)} className="px-2 md:px-3 py-1.5 text-[11px] md:text-xs text-gray-400 hover:text-gray-600">取消</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setShowAddNode({ stageIdx, sectionIdx }); setNewNodeForm({ name: '' }); }} className="w-full flex items-center justify-center gap-1 text-[10px] md:text-xs text-gray-400 hover:text-gold-600 py-1.5">
                                      <Plus className="w-3 h-3" /> 添加节点
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 编辑工艺标准弹窗 */}
                {editingCraftsmanship !== null && createPortal(
                  <div className="fixed inset-0 z-[60] bg-black/30 flex items-end md:items-center justify-center" onClick={() => setEditingCraftsmanship(null)}>
                    <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-2xl max-h-[85vh] md:max-h-[80vh] flex flex-col p-4 md:p-6" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mb-3 md:mb-4">
                        <h3 className="text-sm md:text-lg font-bold text-gray-900 truncate">
                          编辑工艺标准 - {templateData[editingCraftsmanship]?.name}
                        </h3>
                        <button onClick={addCraftsmanship} className="self-end md:self-auto px-2 md:px-3 py-1 md:py-1.5 text-[11px] md:text-sm bg-gold-50 text-gold-600 hover:bg-gold-100 rounded-lg flex items-center gap-1 whitespace-nowrap">
                          <Plus size={12} className="md:w-3.5 md:h-3.5" /> 添加标准
                        </button>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-3 md:space-y-4 pr-1 md:pr-2">
                        {craftsmanshipList.length === 0 ? (
                          <div className="text-center py-10 text-gray-400 text-xs md:text-sm">暂无工艺标准，点击右上角添加</div>
                        ) : (
                          craftsmanshipList.map((craft, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-3 md:p-4 border border-gray-100 relative">
                              <button onClick={() => removeCraftsmanship(idx)} className="absolute top-2 right-2 md:top-3 md:right-3 p-1 md:p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                <Trash2 size={12} className="md:w-3.5 md:h-3.5" />
                              </button>
                              <label className="block text-[10px] md:text-xs font-medium text-gray-500 mb-1.5 md:mb-2">标准 {idx + 1}</label>
                              <textarea
                                value={craft.text}
                                onChange={e => updateCraftsmanshipText(idx, e.target.value)}
                                rows={4}
                                className="w-full px-2 md:px-3 py-1.5 md:py-2 border border-gray-200 rounded-lg text-xs md:text-sm focus:outline-none focus:border-gold-400"
                                placeholder="输入工艺标准要求..."
                              />
                              <div className="mt-2 md:mt-3 space-y-1.5 md:space-y-2">
                                <div className="flex items-center gap-2">
                                  <label className="inline-flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg cursor-pointer">
                                    <ImagePlus className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                    {uploadingCraftIdx === idx ? '上传中...' : '添加图片'}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      className="hidden"
                                      disabled={uploadingCraftIdx === idx}
                                      onChange={e => {
                                        uploadCraftsmanshipImages(idx, e.target.files);
                                        e.currentTarget.value = '';
                                      }}
                                    />
                                  </label>
                                </div>
                                {craft.images && craft.images.length > 0 && (
                                  <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-2">
                                    {craft.images.map((img, imgIdx) => (
                                      <div key={`${img}_${imgIdx}`} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white">
                                        <button type="button" onClick={() => openCraftPreview(craft.images, imgIdx)} className="h-full w-full">
                                          <img src={resolveCloudImageSrc(img)} alt="工艺标准图" className="w-full h-full object-cover" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            const next = [...craftsmanshipList];
                                            next[idx] = {
                                              ...next[idx],
                                              images: next[idx].images.filter((_: string, currentIdx: number) => currentIdx !== imgIdx),
                                            };
                                            setCraftsmanshipList(next);
                                          }}
                                          className="absolute top-1 right-1 p-1 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Trash2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex justify-end gap-2 mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-100">
                        <button onClick={() => setEditingCraftsmanship(null)} className="px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
                        <button onClick={saveCraftsmanship} className="px-3 md:px-4 py-1.5 md:py-2 bg-gold-400 text-black text-xs md:text-sm font-medium rounded-lg hover:bg-gold-500">保存</button>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {craftPreview && (
        <ImagePreviewModal
          images={craftPreview.images}
          index={craftPreview.index}
          onIndexChange={(index) => setCraftPreview(prev => prev ? { ...prev, index } : prev)}
          onClose={() => setCraftPreview(null)}
        />
      )}

      {showTemplateCloseConfirm && createPortal(
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTemplateCloseConfirm(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">模板修改尚未保存</h3>
            <p className="text-sm text-gray-500 mt-2">当前模板库有未保存的修改。您可以选择保存后退出，或者直接放弃本次修改。</p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowTemplateCloseConfirm(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">继续编辑</button>
              <button onClick={discardTemplateChanges} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">放弃修改</button>
              <button onClick={saveTemplateLib} disabled={templateSaving} className="px-4 py-2 text-sm bg-gold-400 text-black rounded-lg font-medium hover:bg-gold-500 disabled:opacity-50">
                {templateSaving ? '保存中...' : '保存并退出'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
