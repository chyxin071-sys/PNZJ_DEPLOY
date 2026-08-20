import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3,
  Camera, HardHat, ImagePlus, Pencil, Plus, Search, Trash2, UserRoundCog, UsersRound, X,
} from 'lucide-react';
import DatePicker from '@/components/DatePicker';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { OverlayHistoryBridge } from '@/hooks/useOverlayHistory';
import Select from '@/components/Select';
import WorkerAvatar from '@/components/WorkerAvatar';
import { projectsAPI } from '@/db/api';
import { findScheduleConflicts, workersAPI, workerSchedulesAPI } from '@/db/workerScheduleApi';
import { useAuthStore } from '@/store/authStore';
import { useDialogStore } from '@/store/dialogStore';
import type { Worker, WorkerSchedule, WorkerScheduleStatus, WorkerStatus } from '@/types/workerSchedule';
import { scheduleIdOf, stageTradeLabel, tradeForStage, workerIdOf, workerMatchesStage, WORKER_TRADES } from '@/types/workerSchedule';
import { buildProjectProgressSummary } from '@/utils/projectProgress';
import { getFileDataURL, getTempFileURL, uploadFile } from '@/utils/cloudStorage';

const DAY_MS = 86_400_000;
const STATUS_LABEL: Record<WorkerScheduleStatus, string> = {
  planned: '待确认', confirmed: '已排期', in_progress: '施工中', completed: '已完成', cancelled: '已取消',
};
const STATUS_STYLE: Record<WorkerScheduleStatus, string> = {
  planned: 'border-sky-200 bg-sky-50 text-sky-700',
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  in_progress: 'border-amber-300 bg-amber-50 text-amber-700',
  completed: 'border-gray-200 bg-gray-100 text-gray-500',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-500',
};
const WORKER_STATUS_LABEL: Record<WorkerStatus, string> = {
  available: '可安排', busy: '施工中', resting: '休息', inactive: '暂停合作',
};

const pad = (value: number) => String(value).padStart(2, '0');
const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const startOfWeek = (date: Date) => {
  const day = date.getDay() || 7;
  return addDays(date, 1 - day);
};
const daysBetween = (start: string, end: string) => Math.max(1, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS) + 1);
const formatShortDate = (value: string) => value ? `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` : '-';
const recordId = (value: { _id?: string; id?: string }) => String(value._id || value.id || '');
const readImagePreview = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
  reader.readAsDataURL(file);
});

type ScheduleFilter = 'all' | 'upcoming' | 'in_progress';
type BacklogFilter = 'ready' | 'overdue' | 'all';
type WorkerEditorMode = 'list' | 'preview' | 'edit' | 'create';
type UnassignedStage = {
  project: any;
  projectId: string;
  projectAddress: string;
  stage: any;
  stageId: string;
  stageName: string;
  trade: string;
  startDate: string;
  endDate: string;
  hasPlanDate: boolean;
  readiness: 'ready' | 'overdue' | 'upcoming';
};

const stageDates = (stage: any) => {
  const starts = (stage?.sections || []).map((item: any) => item.startDate).filter(Boolean).sort();
  const ends = (stage?.sections || []).map((item: any) => item.endDate).filter(Boolean).sort();
  return { startDate: starts[0] || '', endDate: ends.at(-1) || starts[0] || '' };
};

const emptyWorker = (): Omit<Worker, '_id' | 'id'> => ({
  name: '', phone: '', photoFileID: '', experienceYears: 0, trades: [], maxConcurrent: 1, status: 'available', note: '',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

export default function WorkerSchedulePage() {
  const user = useAuthStore((state) => state.user);
  const { showConfirm } = useDialogStore();
  const isAdmin = user?.role === 'admin' || user?.roles?.includes('admin');
  const canEdit = isAdmin || user?.role === 'manager' || user?.roles?.includes('manager');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [schedules, setSchedules] = useState<WorkerSchedule[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchorDate, setAnchorDate] = useState(startOfWeek(new Date()));
  const [viewDays, setViewDays] = useState<7 | 14 | 30>(14);
  const [search, setSearch] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [backlogFilter, setBacklogFilter] = useState<BacklogFilter>('ready');
  const [preserveScheduleDates, setPreserveScheduleDates] = useState(false);
  const [workerEditorOpen, setWorkerEditorOpen] = useState(false);
  const [workerEditorMode, setWorkerEditorMode] = useState<WorkerEditorMode>('list');
  const [workerManagerSearch, setWorkerManagerSearch] = useState('');
  const [profileWorker, setProfileWorker] = useState<Worker | null>(null);
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerForm, setWorkerForm] = useState(emptyWorker());
  const [workerPhotoFile, setWorkerPhotoFile] = useState<File | null>(null);
  const [workerPhotoPreview, setWorkerPhotoPreview] = useState('');
  const [workerPhotoViewer, setWorkerPhotoViewer] = useState<string[]>([]);
  const [editingSchedule, setEditingSchedule] = useState<WorkerSchedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ workerId: '', projectId: '', stageId: '', startDate: toDateKey(new Date()), endDate: toDateKey(new Date()), status: 'confirmed' as WorkerScheduleStatus, note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currentWeekKey = toDateKey(startOfWeek(new Date()));
  const visibleRangeEnd = addDays(anchorDate, viewDays - 1);
  const rangeNavigationLabel = viewDays === 7 && toDateKey(anchorDate) === currentWeekKey
    ? '本周'
    : `${anchorDate.getMonth() + 1}/${anchorDate.getDate()}-${visibleRangeEnd.getMonth() + 1}/${visibleRangeEnd.getDate()}`;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [workerRows, scheduleRows, projectRows] = await Promise.all([
        workersAPI.toArray(), workerSchedulesAPI.toArray(), projectsAPI.toArray(),
      ]);
      setWorkers(workerRows.filter((item: any) => !item._placeholder));
      setSchedules(scheduleRows.filter((item: any) => !item._placeholder));
      setProjects(projectRows.filter((item: any) => !item._placeholder));
    } catch (loadError) {
      console.error('[worker-schedule] load failed', loadError);
      setError('工人排期读取失败：请确认已创建 erp_workers、erp_worker_schedules 集合并开放读写权限');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const dates = useMemo(() => Array.from({ length: viewDays }, (_, index) => addDays(anchorDate, index)), [anchorDate, viewDays]);
  const rangeStart = toDateKey(dates[0]);
  const rangeEnd = toDateKey(dates[dates.length - 1]);
  const activeSchedules = useMemo(() => schedules.filter((item) => {
    if (item.status === 'cancelled' || item.startDate > rangeEnd || item.endDate < rangeStart) return false;
    if (scheduleFilter === 'in_progress') return item.status === 'in_progress';
    if (scheduleFilter === 'upcoming') return item.startDate >= toDateKey(new Date()) && item.startDate <= toDateKey(addDays(new Date(), 7));
    return true;
  }), [schedules, rangeEnd, rangeStart, scheduleFilter]);
  const visibleWorkers = useMemo(() => workers
    .filter((worker) => worker.status !== 'inactive')
    .filter((worker) => !tradeFilter || worker.trades.includes(tradeFilter))
    .filter((worker) => !search || [worker.name, worker.phone, worker.trades.join(' ')].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')), [workers, tradeFilter, search]);

  const today = toDateKey(new Date());
  const upcomingCount = schedules.filter((item) => item.status !== 'cancelled' && item.startDate >= today && item.startDate <= toDateKey(addDays(new Date(), 7))).length;
  const inProgressCount = schedules.filter((item) => item.status === 'in_progress').length;
  const unassignedStages = useMemo<UnassignedStage[]>(() => {
    const horizon = toDateKey(addDays(new Date(), 30));
    const scheduledKeys = new Set(schedules.filter((item) => item.status !== 'cancelled').map((item) => `${item.projectId}::${item.stageId}`));
    return projects.flatMap((project) => {
      if (['已完工', '已暂停'].includes(project.status)) return [];
      const projectId = recordId(project);
      const stages = Array.isArray(project.nodesData) ? project.nodesData : [];
      const progress = buildProjectProgressSummary(stages);
      const candidates = stages.flatMap((stage: any, index: number) => {
        const stageId = String(stage._id || stage.id || '');
        if (!stageId || scheduledKeys.has(`${projectId}::${stageId}`) || progress.stageStatuses[index]?.status === 'completed') return [];
        const dates = stageDates(stage);
        const previousCompleted = index === 0 || progress.stageStatuses[index - 1]?.status === 'completed';
        const started = progress.stageStatuses[index]?.status === 'current';
        const withinHorizon = Boolean(dates.startDate && dates.startDate <= horizon);
        if (!started && !previousCompleted && !withinHorizon) return [];
        const startDate = dates.startDate || today;
        const endDate = dates.endDate || startDate;
        const readiness: UnassignedStage['readiness'] = startDate < today ? 'overdue' : (started || previousCompleted ? 'ready' : 'upcoming');
        return [{
          project, projectId, projectAddress: project.address || project.customer || '未命名工地',
          stage, stageId, stageName: stage.name || `阶段${index + 1}`,
          trade: tradeForStage(stage.name || ''), startDate, endDate, hasPlanDate: Boolean(dates.startDate), readiness,
        }];
      });
      return candidates.slice(0, 1);
    }).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [projects, schedules, today]);

  const selectedProject = projects.find((item) => recordId(item) === scheduleForm.projectId);
  const stages = selectedProject?.nodesData || [];
  const selectedStage = stages.find((item: any) => String(item._id || item.id) === scheduleForm.stageId);
  const selectedStageTrade = selectedStage ? tradeForStage(selectedStage.name || '') : '';
  const selectedWorker = workers.find((item) => workerIdOf(item) === scheduleForm.workerId);
  const conflicts = selectedWorker ? findScheduleConflicts(selectedWorker, scheduleForm, schedules, scheduleIdOf(editingSchedule || {} as WorkerSchedule)) : [];
  const tradeOptions = [{ value: '', label: '全部工种' }, ...WORKER_TRADES.map((trade) => ({ value: trade, label: trade }))];
  const eligibleWorkers = workers.filter((worker) => worker.status !== 'inactive' && (!selectedStage || workerMatchesStage(worker, selectedStage.name || '')));
  const workerOptions = eligibleWorkers.map((worker) => ({ value: workerIdOf(worker), label: worker.name, description: worker.trades.join('/') }));
  const projectOptions = projects.filter((item) => !['已完工', '已暂停'].includes(item.status)).map((project) => ({ value: recordId(project), label: project.address || project.customer || '未命名工地' }));
  const stageOptions = stages.map((stage: any) => ({ value: String(stage._id || stage.id), label: stage.name }));
  const visibleBacklog = unassignedStages.filter((item) => backlogFilter === 'all' || item.readiness === backlogFilter);
  const workerById = (id: string) => workers.find((worker) => workerIdOf(worker) === id);
  const workerNameForSchedule = (schedule: WorkerSchedule) => workerById(schedule.workerId)?.name || schedule.workerName;
  const managedWorkers = workers
    .filter((worker) => !workerManagerSearch || [worker.name, worker.phone, worker.trades.join(' ')].join(' ').toLowerCase().includes(workerManagerSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const groupedManagedWorkers = [...WORKER_TRADES, '未分类'].map((trade) => ({
    trade,
    workers: managedWorkers.filter((worker) => trade === '未分类' ? worker.trades.length === 0 : worker.trades.includes(trade)),
  })).filter((group) => group.workers.length > 0);

  const recommendWorker = (task: UnassignedStage) => workers
    .filter((worker) => !['inactive', 'resting'].includes(worker.status))
    .filter((worker) => worker.trades.includes(task.trade))
    .filter((worker) => findScheduleConflicts(worker, task, schedules).length === 0)
    .sort((a, b) => {
      const statusScore = (worker: Worker) => worker.status === 'available' ? 0 : 1;
      const load = (worker: Worker) => schedules.filter((item) => item.workerId === workerIdOf(worker) && !['completed', 'cancelled'].includes(item.status)).length;
      return statusScore(a) - statusScore(b) || load(a) - load(b) || a.name.localeCompare(b.name, 'zh-CN');
    })[0];

  const openNewSchedule = () => {
    setEditingSchedule(null);
    setPreserveScheduleDates(false);
    setScheduleForm({ workerId: '', projectId: '', stageId: '', startDate: today, endDate: today, status: 'confirmed', note: '' });
    setError('');
    setScheduleEditorOpen(true);
  };

  const selectWorkerForPreview = (worker: Worker) => {
    setEditingWorker(worker);
    setWorkerForm({
      name: worker.name,
      phone: worker.phone || '',
      photoFileID: worker.photoFileID || '',
      experienceYears: worker.experienceYears || 0,
      trades: worker.trades || [],
      maxConcurrent: worker.maxConcurrent || 1,
      status: worker.status || 'available',
      note: worker.note || '',
      createdAt: worker.createdAt,
      updatedAt: worker.updatedAt,
    });
    setWorkerPhotoFile(null);
    setWorkerPhotoPreview('');
    setWorkerEditorMode('preview');
    setError('');
  };

  const openWorkerManager = () => {
    setWorkerManagerSearch('');
    setEditingWorker(null);
    setWorkerForm(emptyWorker());
    setWorkerEditorMode('list');
    setError('');
    setWorkerEditorOpen(true);
  };

  const openWorkerManagerFor = (worker: Worker) => {
    setProfileWorker(null);
    setWorkerManagerSearch('');
    setWorkerEditorOpen(true);
    selectWorkerForPreview(worker);
  };

  const startCreatingWorker = () => {
    setEditingWorker(null);
    setWorkerForm(emptyWorker());
    setWorkerPhotoFile(null);
    setWorkerPhotoPreview('');
    setWorkerEditorMode('create');
    setError('');
  };

  const openWorkerPhoto = async (source: string) => {
    if (!source) return;
    setError('');
    try {
      if (!source.startsWith('cloud://')) {
        setWorkerPhotoViewer([source]);
        return;
      }
      const urls = await getTempFileURL([source]);
      const resolved = urls[source] || await getFileDataURL(source);
      setWorkerPhotoViewer([resolved]);
    } catch (previewError) {
      console.error('[worker-schedule] worker photo preview failed', previewError);
      try {
        setWorkerPhotoViewer([await getFileDataURL(source)]);
      } catch (fallbackError) {
        console.error('[worker-schedule] worker photo fallback failed', fallbackError);
        setError('工人照片加载失败，请稍后重试');
      }
    }
  };

  const chooseWorkerPhoto = async (file: File) => {
    try {
      const preview = await readImagePreview(file);
      setWorkerPhotoFile(file);
      setWorkerPhotoPreview(preview);
      setError('');
    } catch (previewError) {
      console.error('[worker-schedule] local worker photo preview failed', previewError);
      setError('所选照片无法读取，请重新选择');
    }
  };

  const openEditSchedule = (schedule: WorkerSchedule) => {
    setEditingSchedule(schedule);
    setPreserveScheduleDates(true);
    setScheduleForm({ workerId: schedule.workerId, projectId: schedule.projectId, stageId: schedule.stageId, startDate: schedule.startDate, endDate: schedule.endDate, status: schedule.status, note: schedule.note || '' });
    setError('');
    setScheduleEditorOpen(true);
  };

  const openScheduleAt = (worker: Worker, date: string) => {
    if (!canEdit) return;
    setEditingSchedule(null);
    setPreserveScheduleDates(true);
    setScheduleForm({ workerId: workerIdOf(worker), projectId: '', stageId: '', startDate: date, endDate: date, status: 'confirmed', note: '' });
    setError('');
    setScheduleEditorOpen(true);
  };

  const openBacklogSchedule = (task: UnassignedStage) => {
    const recommended = recommendWorker(task);
    setEditingSchedule(null);
    setPreserveScheduleDates(true);
    setScheduleForm({
      workerId: recommended ? workerIdOf(recommended) : '',
      projectId: task.projectId,
      stageId: task.stageId,
      startDate: task.startDate,
      endDate: task.endDate,
      status: 'confirmed',
      note: '',
    });
    setBacklogOpen(false);
    setError('');
    setScheduleEditorOpen(true);
  };

  const chooseProject = (projectId: string) => {
    const project = projects.find((item) => recordId(item) === projectId);
    const firstStage = project?.nodesData?.[0];
    const sectionDates = (firstStage?.sections || []).flatMap((section: any) => [section.startDate, section.endDate]).filter(Boolean).sort();
    setScheduleForm((current) => ({
      ...current,
      workerId: workers.find((worker) => workerIdOf(worker) === current.workerId && firstStage && workerMatchesStage(worker, firstStage.name || '')) ? current.workerId : '',
      projectId,
      stageId: String(firstStage?._id || firstStage?.id || ''),
      startDate: preserveScheduleDates ? current.startDate : sectionDates[0] || current.startDate,
      endDate: preserveScheduleDates ? current.endDate : sectionDates.at(-1) || sectionDates[0] || current.endDate,
    }));
  };

  const chooseStage = (stageId: string) => {
    const stage = stages.find((item: any) => String(item._id || item.id) === stageId);
    const starts = (stage?.sections || []).map((item: any) => item.startDate).filter(Boolean).sort();
    const ends = (stage?.sections || []).map((item: any) => item.endDate).filter(Boolean).sort();
    setScheduleForm((current) => ({
      ...current,
      workerId: workers.find((worker) => workerIdOf(worker) === current.workerId && stage && workerMatchesStage(worker, stage.name || '')) ? current.workerId : '',
      stageId,
      startDate: preserveScheduleDates ? current.startDate : starts[0] || current.startDate,
      endDate: preserveScheduleDates ? current.endDate : ends.at(-1) || starts[0] || current.endDate,
    }));
  };

  const saveSchedule = async () => {
    if (!selectedWorker || !selectedProject || !selectedStage || !scheduleForm.startDate || !scheduleForm.endDate) {
      setError('请选择工人、工地、施工阶段和排期日期'); return;
    }
    if (!workerMatchesStage(selectedWorker, selectedStage.name || '')) {
      setError(`该阶段需要${selectedStageTrade}工人，请重新选择匹配工种的师傅`); return;
    }
    const duplicateStage = schedules.find((item) => item.status !== 'cancelled'
      && item.projectId === recordId(selectedProject)
      && item.stageId === String(selectedStage._id || selectedStage.id)
      && scheduleIdOf(item) !== scheduleIdOf(editingSchedule || {} as WorkerSchedule));
    if (duplicateStage) { setError(`该施工阶段已安排给${workerNameForSchedule(duplicateStage)}，请直接编辑原排期`); return; }
    if (scheduleForm.endDate < scheduleForm.startDate) { setError('结束日期不能早于开始日期'); return; }
    if (conflicts.length > 0) { setError(`该工人与“${conflicts[0].schedule.projectAddress}”排期冲突`); return; }
    setSaving(true); setError('');
    const now = new Date().toISOString();
    const payload = {
      workerId: workerIdOf(selectedWorker), workerName: selectedWorker.name,
      projectId: recordId(selectedProject), projectAddress: selectedProject.address || '未填写地址', customerName: selectedProject.customerName || selectedProject.customer || '',
      stageId: String(selectedStage._id || selectedStage.id), stageName: selectedStage.name || '施工阶段', trade: tradeForStage(selectedStage.name || ''),
      startDate: scheduleForm.startDate, endDate: scheduleForm.endDate, status: editingSchedule?.status || 'confirmed', note: scheduleForm.note,
      createdBy: user?.name || '', createdAt: editingSchedule?.createdAt || now, updatedAt: now,
    };
    try {
      if (editingSchedule) await workerSchedulesAPI.update(scheduleIdOf(editingSchedule), payload);
      else await workerSchedulesAPI.add(payload);
      setScheduleEditorOpen(false); await loadData();
    } catch (saveError) {
      console.error(saveError); setError('排期保存失败，请稍后重试');
    } finally { setSaving(false); }
  };

  const saveWorker = async () => {
    if (!workerForm.name.trim() || workerForm.trades.length === 0) { setError('请填写工人姓名，并至少选择一个工种'); return; }
    setSaving(true); setError('');
    try {
      const now = new Date().toISOString();
      let photoFileID = workerForm.photoFileID || '';
      if (workerPhotoFile) {
        photoFileID = (await uploadFile(workerPhotoFile, `erp/workers/${editingWorker ? workerIdOf(editingWorker) : Date.now()}`)).fileID;
      }
      const payload = { ...workerForm, photoFileID, name: workerForm.name.trim(), updatedAt: now };
      let savedWorker: Worker;
      if (editingWorker) {
        const id = workerIdOf(editingWorker);
        await workersAPI.update(id, payload);
        if (editingWorker.name !== payload.name) {
          await workerSchedulesAPI.syncWorkerName(id, payload.name).catch((syncError) => console.warn('[worker-schedule] legacy name sync failed', syncError));
        }
        savedWorker = { ...editingWorker, ...payload, _id: id } as Worker;
      }
      else savedWorker = await workersAPI.add({ ...payload, createdAt: now });
      setWorkerPhotoFile(null); setWorkerPhotoPreview(''); await loadData();
      selectWorkerForPreview(savedWorker);
    } catch (saveError) { console.error(saveError); setError('工人资料保存失败：请检查 erp_workers 集合及写入权限'); }
    finally { setSaving(false); }
  };

  const deleteSchedule = async (schedule: WorkerSchedule) => {
    if (!window.confirm(`确定删除“${workerNameForSchedule(schedule)} · ${schedule.projectAddress}”的排期吗？`)) return;
    await workerSchedulesAPI.delete(scheduleIdOf(schedule)); await loadData();
  };

  const deleteWorker = async (worker: Worker) => {
    if (schedules.some((item) => item.workerId === workerIdOf(worker) && !['completed', 'cancelled'].includes(item.status))) {
      alert('该工人仍有未结束排期，请先处理排期'); return;
    }
    const confirmed = await showConfirm('删除后该工人档案无法恢复，历史排期仍会保留。', {
      title: `确认删除“${worker.name}”？`,
      confirmStyle: 'danger',
      confirmText: '删除',
    });
    if (!confirmed) return;
    await workersAPI.delete(workerIdOf(worker));
    await loadData();
    setEditingWorker(null);
    setWorkerEditorMode('list');
  };

  return (
    <div className="erp-page pb-24 md:pb-6">
      <OverlayHistoryBridge open={backlogOpen} onClose={() => setBacklogOpen(false)} stateKey="pnzjWorkerBacklogId" />
      <OverlayHistoryBridge open={scheduleEditorOpen} onClose={() => setScheduleEditorOpen(false)} stateKey="pnzjWorkerScheduleEditorId" />
      <OverlayHistoryBridge open={Boolean(profileWorker)} onClose={() => setProfileWorker(null)} stateKey="pnzjWorkerProfileId" />
      <OverlayHistoryBridge open={workerEditorOpen} onClose={() => setWorkerEditorOpen(false)} stateKey="pnzjWorkerEditorId" />
      <div className="erp-page-header items-start">
        <div><h1 className="erp-page-title">工人排期</h1><p className="erp-page-subtitle">统筹工人档期与工地施工安排</p></div>
        {canEdit && <div className="flex gap-2"><button onClick={openWorkerManager} className="erp-btn-secondary h-10 w-10 justify-center px-0 sm:w-auto sm:px-3" title="工人管理"><UserRoundCog size={16} /><span className="hidden sm:inline">工人管理</span></button><button onClick={openNewSchedule} className="erp-btn-primary h-10 w-10 justify-center px-0 sm:w-auto sm:px-3" title="新增排期"><Plus size={16} /><span className="hidden sm:inline">新增排期</span></button></div>}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {[
          { key: 'upcoming' as const, label: '未来7天进场', value: upcomingCount, icon: CalendarDays, action: () => { setScheduleFilter((current) => current === 'upcoming' ? 'all' : 'upcoming'); setAnchorDate(new Date()); setViewDays(7); } },
          { key: 'in_progress' as const, label: '正在施工', value: inProgressCount, icon: HardHat, action: () => { setScheduleFilter((current) => current === 'in_progress' ? 'all' : 'in_progress'); setAnchorDate(new Date()); } },
          { key: 'backlog' as const, label: '近期待排期', value: unassignedStages.length, icon: AlertTriangle, action: () => setBacklogOpen(true) },
        ].map(({ key, label, value, icon: Icon, action }) => (
          <button key={key} onClick={action} className={`erp-surface flex items-center justify-between p-3 text-left transition-colors hover:border-gold-300 md:p-4 ${scheduleFilter === key ? 'border-gold-400 bg-gold-50/40' : ''}`}>
            <div><p className="text-[10px] text-gray-400 md:text-xs">{label}</p><p className="mt-1 text-xl font-bold text-gray-900 md:text-2xl">{value}</p></div><Icon size={19} className="hidden text-gold-500 md:block" />
          </button>
        ))}
      </div>

      <div className="mt-4 erp-surface overflow-hidden">
        <div className="sticky top-0 z-40 grid grid-cols-[minmax(0,1fr)_7.25rem] items-center gap-2 border-b border-gray-100 bg-white/95 p-2 backdrop-blur md:flex md:flex-wrap md:p-2.5">
          <div className="relative h-9 min-w-0 md:h-10 md:flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 md:size-[15px]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索工人、电话或工种" className="h-full w-full rounded border border-gray-200 pl-8 pr-2.5 text-xs outline-none focus:border-gold-400 md:pl-9 md:pr-3 md:text-sm" /></div>
          <Select value={tradeFilter} onChange={setTradeFilter} options={tradeOptions} className="h-9 w-full min-w-0 [&>.erp-select]:h-full [&>.erp-select]:px-2.5 [&>.erp-select]:text-xs md:h-10 md:w-[132px] md:[&>.erp-select]:px-3 md:[&>.erp-select]:text-sm" sheetTitle="选择工种" />
          <div className="col-span-2 flex h-9 w-full items-center rounded border border-gray-200 bg-white md:col-span-1 md:h-10 md:w-auto"><button onClick={() => setAnchorDate(addDays(anchorDate, -viewDays))} className="h-full shrink-0 px-3 text-gray-500" title="上一时间段" aria-label="上一时间段"><ChevronLeft size={16} /></button><button onClick={() => setAnchorDate(startOfWeek(new Date()))} className="min-w-0 flex-1 border-x border-gray-200 px-3 text-xs font-medium md:min-w-[92px] md:flex-none" title="返回本周">{rangeNavigationLabel}</button><button onClick={() => setAnchorDate(addDays(anchorDate, viewDays))} className="h-full shrink-0 px-3 text-gray-500" title="下一时间段" aria-label="下一时间段"><ChevronRight size={16} /></button></div>
          <div className="hidden h-10 rounded bg-gray-100 p-0.5 md:flex">{([7, 14, 30] as const).map((days) => <button key={days} onClick={() => setViewDays(days)} className={`rounded-md px-2.5 text-xs ${viewDays === days ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-500'}`}>{days === 7 ? '周' : days === 14 ? '双周' : '月'}</button>)}</div>
        </div>

        {error && !workerEditorOpen && !scheduleEditorOpen && <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-600">{error}</div>}
        {loading ? <div className="py-20 text-center text-sm text-gray-400">正在读取排期...</div> : workers.length === 0 ? <div className="py-20 text-center"><UsersRound size={28} className="mx-auto text-gray-300" /><p className="mt-3 text-sm text-gray-500">请先新增工人</p></div> : (
          <>
            <div className="overflow-x-auto overscroll-x-contain [--day-col:88px] [--worker-col:124px] md:[--day-col:108px] md:[--worker-col:180px]">
              <div style={{ minWidth: `calc(var(--worker-col) + ${dates.length} * var(--day-col))` }}>
                <div className="sticky top-0 z-20 grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: `var(--worker-col) repeat(${dates.length}, var(--day-col))` }}><div className="sticky left-0 z-30 flex h-12 items-center border-r border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-500 md:px-4">工人</div>{dates.map((date) => { const key = toDateKey(date); return <div key={key} className={`flex h-12 flex-col items-center justify-center border-r border-gray-100 text-[11px] ${key === today ? 'bg-gold-50 text-gold-700' : 'text-gray-500'}`}><span>{date.getMonth() + 1}/{date.getDate()}</span><span className="mt-0.5 text-[10px]">周{'日一二三四五六'[date.getDay()]}</span></div>; })}</div>
                {visibleWorkers.map((worker) => { const rows = activeSchedules.filter((item) => item.workerId === workerIdOf(worker)); return <div key={workerIdOf(worker)} className="relative grid min-h-[72px] border-b border-gray-100" style={{ gridTemplateColumns: `var(--worker-col) repeat(${dates.length}, var(--day-col))` }}><button type="button" onClick={() => setProfileWorker(worker)} className="sticky left-0 z-10 flex min-h-[72px] items-center gap-2 border-r border-gray-200 bg-white px-2 text-left transition-colors hover:bg-gold-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400 md:px-3" title={`查看${worker.name}的工人档案`}><WorkerAvatar name={worker.name} fileID={worker.photoFileID} className="h-8 w-8 md:h-9 md:w-9" /><div className="min-w-0"><div className="truncate text-xs font-medium text-gray-900 md:text-sm">{worker.name}</div><div className="mt-1 truncate text-[9px] text-gray-400 md:text-[10px]">{worker.trades.join(' / ')}</div></div></button>{dates.map((date) => { const dateKey = toDateKey(date); return <button key={dateKey} disabled={!canEdit} onClick={() => openScheduleAt(worker, dateKey)} className={`group border-r border-gray-100 transition-colors ${dateKey === today ? 'bg-gold-50/40' : ''} ${canEdit ? 'hover:bg-gold-50/70' : ''}`} title={canEdit ? `为${worker.name}安排${formatShortDate(dateKey)}的任务` : ''}><Plus size={14} className="mx-auto text-gold-400 opacity-0 transition-opacity group-hover:opacity-100" /></button>; })}<div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: 'var(--worker-col)' }}>{rows.map((schedule, rowIndex) => { const clippedStart = schedule.startDate < rangeStart ? rangeStart : schedule.startDate; const clippedEnd = schedule.endDate > rangeEnd ? rangeEnd : schedule.endDate; const offsetDays = Math.round((parseDate(clippedStart).getTime() - parseDate(rangeStart).getTime()) / DAY_MS); const durationDays = daysBetween(clippedStart, clippedEnd); return <button key={scheduleIdOf(schedule)} onClick={() => canEdit && openEditSchedule(schedule)} className={`pointer-events-auto absolute h-11 overflow-hidden rounded-md border px-2 text-left shadow-sm ${STATUS_STYLE[schedule.status]}`} style={{ left: `calc(${offsetDays} * var(--day-col) + 5px)`, width: `calc(${durationDays} * var(--day-col) - 10px)`, top: 13 + rowIndex * 3 }} title={`${schedule.projectAddress} · ${schedule.stageName}`}><span className="block truncate text-xs font-medium">{schedule.projectAddress}</span><span className="block truncate text-[10px] opacity-75">{schedule.stageName} · {STATUS_LABEL[schedule.status]}</span></button>; })}</div></div>; })}
              </div>
            </div>
          </>
        )}
      </div>

      {backlogOpen && createPortal(
        <div className="fixed inset-0 z-[150] bg-black/35" onClick={() => setBacklogOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[82vh] flex-col rounded-t-2xl bg-white shadow-2xl md:bottom-auto md:left-auto md:top-0 md:h-full md:max-h-none md:w-[520px] md:rounded-none" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div><h2 className="font-semibold text-gray-900">近期待排期</h2><p className="mt-1 text-xs text-gray-400">已到计划期、30天内开始或已具备进场条件的阶段</p></div>
              <button onClick={() => setBacklogOpen(false)} className="p-1.5 text-gray-400"><X size={18} /></button>
            </div>
            <div className="flex gap-1 border-b border-gray-100 px-4 py-3">
              {([
                { value: 'ready', label: '可安排', count: unassignedStages.filter((item) => item.readiness === 'ready').length },
                { value: 'overdue', label: '已逾期', count: unassignedStages.filter((item) => item.readiness === 'overdue').length },
                { value: 'all', label: '全部', count: unassignedStages.length },
              ] as const).map((item) => <button key={item.value} onClick={() => setBacklogFilter(item.value)} className={`rounded px-3 py-1.5 text-xs ${backlogFilter === item.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{item.label} {item.count}</button>)}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visibleBacklog.length === 0 ? <div className="py-20 text-center text-sm text-gray-400">当前没有符合条件的待排阶段</div> : visibleBacklog.map((task) => {
                const recommended = recommendWorker(task);
                const readinessLabel = task.readiness === 'overdue' ? '已逾期' : task.readiness === 'ready' ? '可安排' : '即将开始';
                return (
                  <div key={`${task.projectId}-${task.stageId}`} className="border-b border-gray-100 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="truncate text-sm font-medium text-gray-900">{task.projectAddress}</div><div className="mt-1 text-xs text-gray-500">{stageTradeLabel(task.stageName)}</div></div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${task.readiness === 'overdue' ? 'bg-red-50 text-red-600' : task.readiness === 'ready' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{readinessLabel}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500"><Clock3 size={13} />{task.hasPlanDate ? '计划' : '建议'} {formatShortDate(task.startDate)} 至 {formatShortDate(task.endDate)}</div>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded bg-gray-50 px-3 py-2.5">
                      <div className="min-w-0"><div className="text-[10px] text-gray-400">推荐工人</div><div className={`mt-0.5 truncate text-xs font-medium ${recommended ? 'text-gray-800' : 'text-amber-600'}`}>{recommended ? `${recommended.name} · 当前档期可安排` : `暂无无冲突的${task.trade}工人`}</div></div>
                      {canEdit && <button onClick={() => openBacklogSchedule(task)} className="erp-btn-primary h-8 shrink-0 px-3 text-xs">安排</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {scheduleEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => setScheduleEditorOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><h2 className="font-semibold">{editingSchedule ? '编辑排期' : '新增排期'}</h2><button onClick={() => setScheduleEditorOpen(false)} className="p-1.5 text-gray-400"><X size={18} /></button></div>
            <div className="space-y-4 p-4">
              <label className="block text-xs text-gray-500">工地 *<Select value={scheduleForm.projectId} onChange={chooseProject} options={projectOptions} placeholder="请选择工地" searchable className="mt-1" sheetTitle="选择工地" /></label>
              <label className="block text-xs text-gray-500">施工阶段 *<Select value={scheduleForm.stageId} onChange={chooseStage} options={stageOptions} placeholder="请选择施工阶段" className="mt-1" sheetTitle="选择施工阶段" /></label>
              <label className="block text-xs text-gray-500">工人 *<Select value={scheduleForm.workerId} onChange={(value) => setScheduleForm({ ...scheduleForm, workerId: value })} options={workerOptions} placeholder={selectedStage ? `请选择${selectedStageTrade}工人` : '请先选择工地和施工阶段'} searchable className="mt-1" sheetTitle="选择匹配工种的工人" /></label>
              {selectedStage && eligibleWorkers.length === 0 && <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">暂无可用的{selectedStageTrade}工人，请先在工人管理中为师傅添加对应工种。</div>}
              <div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">开始日期<DatePicker value={scheduleForm.startDate} onChange={(value) => setScheduleForm({ ...scheduleForm, startDate: value })} className="mt-1" /></label><label className="text-xs text-gray-500">结束日期<DatePicker value={scheduleForm.endDate} onChange={(value) => setScheduleForm({ ...scheduleForm, endDate: value })} className="mt-1" /></label></div>
              <label className="block text-xs text-gray-500">备注<textarea value={scheduleForm.note} onChange={(event) => setScheduleForm({ ...scheduleForm, note: event.target.value })} rows={2} className="mt-1 w-full resize-none rounded border border-gray-200 p-3 text-sm outline-none" /></label>
              {conflicts.length > 0 && <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-600"><div className="flex items-center gap-1.5 font-medium"><AlertTriangle size={14} />排期冲突</div><p className="mt-1">已安排：{conflicts[0].schedule.projectAddress}，{formatShortDate(conflicts[0].schedule.startDate)}至{formatShortDate(conflicts[0].schedule.endDate)}</p></div>}
              {error && <p className="text-xs leading-5 text-red-500">{error}</p>}
              <div className="flex items-center justify-between border-t border-gray-100 pt-4"><div>{editingSchedule && <button onClick={() => void deleteSchedule(editingSchedule)} className="inline-flex items-center gap-1 text-xs text-red-500"><Trash2 size={14} />删除排期</button>}</div><div className="flex gap-2"><button onClick={() => setScheduleEditorOpen(false)} className="erp-btn-secondary">取消</button><button disabled={saving || conflicts.length > 0} onClick={() => void saveSchedule()} className="erp-btn-primary">保存排期</button></div></div>
            </div>
          </div>
        </div>
      )}

      {profileWorker && (
        <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/40 p-4" onClick={() => setProfileWorker(null)}>
          <div className="w-full max-w-md overflow-hidden rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="font-semibold text-gray-900">工人档案</h2>
              <button onClick={() => setProfileWorker(null)} className="p-1.5 text-gray-400" title="关闭"><X size={18} /></button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-4">
                <button type="button" disabled={!profileWorker.photoFileID} onClick={() => void openWorkerPhoto(profileWorker.photoFileID || '')} className={profileWorker.photoFileID ? 'shrink-0 cursor-zoom-in rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400' : 'shrink-0'} title={profileWorker.photoFileID ? '查看大图' : undefined}>
                  <WorkerAvatar name={profileWorker.name} fileID={profileWorker.photoFileID} className="h-20 w-20" />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xl font-semibold text-gray-900">{profileWorker.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">{profileWorker.phone || '未填写联系电话'}</p>
                  <span className="mt-2 inline-flex rounded-full bg-gold-50 px-2.5 py-1 text-xs text-gold-700">{WORKER_STATUS_LABEL[profileWorker.status]}</span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 border-y border-gray-100 py-4">
                <div><div className="text-xs text-gray-400">工龄</div><div className="mt-1 text-sm font-medium text-gray-800">{profileWorker.experienceYears ? `${profileWorker.experienceYears} 年` : '未填写'}</div></div>
                <div><div className="text-xs text-gray-400">最大并行任务</div><div className="mt-1 text-sm font-medium text-gray-800">{profileWorker.maxConcurrent || 1} 个</div></div>
                <div className="col-span-2"><div className="text-xs text-gray-400">工种</div><div className="mt-1 text-sm font-medium text-gray-800">{profileWorker.trades.join('、') || '未填写'}</div></div>
              </div>
              {profileWorker.note && <div className="pt-4"><div className="text-xs text-gray-400">备注</div><div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{profileWorker.note}</div></div>}
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setProfileWorker(null)} className="erp-btn-secondary">关闭</button>
                {canEdit && <button onClick={() => openWorkerManagerFor(profileWorker)} className="erp-btn-primary"><Pencil size={14} />管理档案</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {workerEditorOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-black/40 p-3" onClick={() => setWorkerEditorOpen(false)}>
          <div className="flex h-[min(90vh,760px)] max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div><h2 className="font-semibold text-gray-900">工人管理</h2><p className="text-xs text-gray-400">按工种查找并维护工人档案</p></div>
              <button onClick={() => setWorkerEditorOpen(false)} className="p-1.5 text-gray-400"><X size={18} /></button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <div className={`${workerEditorMode !== 'list' ? 'hidden md:flex' : 'flex'} min-h-0 flex-1 flex-col overflow-hidden border-b border-gray-100 md:w-[320px] md:flex-none md:border-b-0 md:border-r`}>
                  <div className="border-b border-gray-100 p-3">
                    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 md:grid-cols-[7rem_minmax(0,1fr)]">
                      <button onClick={startCreatingWorker} className="flex h-9 w-full items-center justify-center gap-1.5 rounded border border-gold-200 bg-gold-50 px-2.5 text-xs font-medium text-gold-700 md:h-10 md:px-3 md:text-sm"><Plus size={14} className="md:size-[15px]" />新增工人</button>
                      <div className="relative h-9 min-w-0 md:h-10"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={workerManagerSearch} onChange={(event) => setWorkerManagerSearch(event.target.value)} placeholder="搜索姓名、电话或工种" className="h-full w-full rounded border border-gray-200 pl-8 pr-2.5 text-xs outline-none focus:border-gold-400 md:pl-9 md:pr-3" /></div>
                    </div>
                  </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
                  {groupedManagedWorkers.map((group) => (
                    <section key={group.trade}>
                      <div className="mb-1.5 flex items-center justify-between px-1"><h3 className="text-xs font-medium text-gray-500">{group.trade}</h3><span className="text-[10px] text-gray-400">{group.workers.length} 人</span></div>
                      <div className="overflow-hidden rounded border border-gray-100">
                        {group.workers.map((worker) => (
                          <button key={`${group.trade}-${workerIdOf(worker)}`} onClick={() => selectWorkerForPreview(worker)} className={`flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-gray-50 ${editingWorker && workerIdOf(editingWorker) === workerIdOf(worker) ? 'bg-gold-50' : ''}`}>
                            <WorkerAvatar name={worker.name} fileID={worker.photoFileID} className="h-9 w-9" />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{worker.name}</span><span className="mt-0.5 block truncate text-[10px] text-gray-400">{WORKER_STATUS_LABEL[worker.status]}{worker.experienceYears ? ` · ${worker.experienceYears}年工龄` : ''}</span></span>
                            <ChevronRight size={15} className="text-gray-300" />
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                  {managedWorkers.length === 0 && <div className="py-10 text-center text-xs text-gray-400">该工种暂无工人</div>}
                  </div>
                </div>
              <div className={`${workerEditorMode === 'list' ? 'hidden md:block' : 'block'} min-h-0 flex-1 overflow-y-auto overscroll-contain p-4`}>
                {workerEditorMode === 'list' ? (
                  <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center"><UsersRound size={32} className="text-gray-200" /><p className="mt-3 text-sm font-medium text-gray-500">从左侧选择一位师傅</p><p className="mt-1 text-xs text-gray-400">点击后查看完整档案，再进入编辑</p></div>
                ) : workerEditorMode === 'preview' && editingWorker ? (
                  <div className="mx-auto max-w-xl">
                    <button onClick={() => { setEditingWorker(null); setWorkerEditorMode('list'); }} className="mb-4 inline-flex items-center gap-1 text-xs text-gray-500 md:hidden"><ChevronLeft size={15} />返回工人列表</button>
                    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-5">
                      <div className="flex min-w-0 items-center gap-4">
                        <button type="button" disabled={!editingWorker.photoFileID} onClick={() => void openWorkerPhoto(editingWorker.photoFileID || '')} className={editingWorker.photoFileID ? 'shrink-0 cursor-zoom-in rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400' : 'shrink-0'} title={editingWorker.photoFileID ? '查看大图' : undefined}>
                          <WorkerAvatar name={editingWorker.name} fileID={editingWorker.photoFileID} className="h-20 w-20" />
                        </button>
                        <div className="min-w-0"><h3 className="truncate text-xl font-semibold text-gray-900">{editingWorker.name}</h3><p className="mt-1 text-sm text-gray-500">{editingWorker.phone || '未填写联系电话'}</p><span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">{WORKER_STATUS_LABEL[editingWorker.status]}</span></div>
                      </div>
                      <button onClick={() => setWorkerEditorMode('edit')} className="erp-btn-secondary h-9 shrink-0 px-3 text-xs"><Pencil size={14} />编辑</button>
                    </div>
                    <div className="grid gap-5 py-5 sm:grid-cols-2">
                      <div><div className="text-xs text-gray-400">工种身份</div><div className="mt-2 text-sm font-medium text-gray-800">{editingWorker.trades.join('、') || '未填写'}</div></div>
                      <div><div className="text-xs text-gray-400">工龄</div><div className="mt-2 text-sm font-medium text-gray-800">{editingWorker.experienceYears ? `${editingWorker.experienceYears} 年` : '未填写'}</div></div>
                      <div><div className="text-xs text-gray-400">最大并行任务</div><div className="mt-2 text-sm font-medium text-gray-800">{editingWorker.maxConcurrent || 1} 个</div></div>
                      <div className="sm:col-span-2"><div className="text-xs text-gray-400">备注</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{editingWorker.note || '暂无备注'}</div></div>
                    </div>
                    <div className="flex justify-end border-t border-gray-100 pt-4"><button onClick={() => void deleteWorker(editingWorker)} className="inline-flex items-center gap-1.5 text-xs text-red-500"><Trash2 size={14} />删除工人</button></div>
                  </div>
                ) : (
                <>
                <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><button onClick={() => editingWorker ? selectWorkerForPreview(editingWorker) : (setWorkerEditorMode('list'), setEditingWorker(null))} className="inline-flex items-center text-gray-400 md:hidden" title="返回"><ChevronLeft size={17} /></button><div className="text-sm font-medium text-gray-900">{workerEditorMode === 'create' ? '新增工人' : `编辑 ${editingWorker?.name || ''}`}</div></div>{workerEditorMode === 'edit' && editingWorker && <button onClick={() => selectWorkerForPreview(editingWorker)} className="text-xs text-gray-500">取消编辑</button>}</div>
                <div className="mb-4 flex items-center gap-3 rounded border border-gray-100 bg-gray-50 p-3">
                  {(workerPhotoPreview || workerForm.photoFileID) ? (
                    <button type="button" onClick={() => void openWorkerPhoto(workerPhotoPreview || workerForm.photoFileID || '')} className="shrink-0 cursor-zoom-in rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400" title="查看大图">
                      {workerPhotoPreview ? <img src={workerPhotoPreview} alt="工人照片预览" className="h-16 w-16 rounded-full object-cover" /> : <WorkerAvatar name={workerForm.name || '工'} fileID={workerForm.photoFileID} className="h-16 w-16" />}
                    </button>
                  ) : <WorkerAvatar name={workerForm.name || '工'} className="h-16 w-16" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800">工人照片</div>
                    <div className="mt-1 text-[11px] text-gray-400">用于排期、工地节点及后续客户查看</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-gold-300 hover:text-gold-700">
                        <ImagePlus size={14} />{workerForm.photoFileID || workerPhotoFile ? '更换照片' : '上传照片'}
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void chooseWorkerPhoto(file); }} />
                      </label>
                      {(workerForm.photoFileID || workerPhotoFile) && <button type="button" onClick={() => { setWorkerPhotoFile(null); setWorkerPhotoPreview(''); setWorkerForm((current) => ({ ...current, photoFileID: '' })); }} className="inline-flex items-center gap-1 text-xs text-red-500"><Trash2 size={13} />移除</button>}
                    </div>
                  </div>
                  <Camera size={18} className="shrink-0 text-gray-300" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-gray-500">姓名 *<input value={workerForm.name} onChange={(event) => setWorkerForm({ ...workerForm, name: event.target.value })} placeholder="例如：王师傅" className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-gold-400" /></label>
                  <label className="text-xs text-gray-500">联系电话<input value={workerForm.phone} onChange={(event) => setWorkerForm({ ...workerForm, phone: event.target.value })} className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-gold-400" /></label>
                  <label className="text-xs text-gray-500">工龄（年）<input type="number" min={0} max={60} value={workerForm.experienceYears || ''} onChange={(event) => setWorkerForm({ ...workerForm, experienceYears: Math.max(0, Number(event.target.value) || 0) })} placeholder="例如：8" className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-gold-400" /></label>
                  <label className="text-xs text-gray-500">最大并行任务<input type="number" min={1} value={workerForm.maxConcurrent} onChange={(event) => setWorkerForm({ ...workerForm, maxConcurrent: Math.max(1, Number(event.target.value)) })} className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm outline-none" /></label>
                </div>
                <div className="mt-4"><p className="text-xs text-gray-500">工种 * <span className="text-gray-400">（可多选）</span></p><div className="mt-2 flex flex-wrap gap-2">{WORKER_TRADES.map((trade) => <button type="button" key={trade} onClick={() => setWorkerForm((current) => ({ ...current, trades: current.trades.includes(trade) ? current.trades.filter((item) => item !== trade) : [...current.trades, trade] }))} className={`rounded-full border px-3 py-1 text-xs ${workerForm.trades.includes(trade) ? 'border-gold-400 bg-gold-50 text-gold-700' : 'border-gray-200 text-gray-500'}`}>{trade}</button>)}</div></div>
                <label className="mt-4 block text-xs text-gray-500">备注<textarea value={workerForm.note} onChange={(event) => setWorkerForm({ ...workerForm, note: event.target.value })} rows={3} className="mt-1 w-full resize-none rounded border border-gray-200 p-3 text-sm outline-none focus:border-gold-400" /></label>
                {error && <p className="mt-3 text-xs leading-5 text-red-500">{error}</p>}
                <div className="mt-4 flex justify-end gap-2"><button onClick={() => editingWorker ? selectWorkerForPreview(editingWorker) : (setEditingWorker(null), setWorkerEditorMode('list'))} className="erp-btn-secondary">取消</button><button disabled={saving} onClick={() => void saveWorker()} className="erp-btn-primary">{workerEditorMode === 'edit' ? '保存修改' : '新增工人'}</button></div>
                </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {workerPhotoViewer.length > 0 && (
        <ImagePreviewModal images={workerPhotoViewer} index={0} onIndexChange={() => undefined} onClose={() => setWorkerPhotoViewer([])} layerClassName="z-[220]" />
      )}

    </div>
  );
}
