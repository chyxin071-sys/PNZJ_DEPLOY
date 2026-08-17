import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3,
  HardHat, Plus, Search, Trash2, UserRoundCog, UsersRound, X,
} from 'lucide-react';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import { projectsAPI } from '@/db/api';
import { findScheduleConflicts, workersAPI, workerSchedulesAPI } from '@/db/workerScheduleApi';
import { useAuthStore } from '@/store/authStore';
import type { Worker, WorkerSchedule, WorkerScheduleStatus, WorkerStatus } from '@/types/workerSchedule';
import { scheduleIdOf, workerIdOf, WORKER_TRADES } from '@/types/workerSchedule';

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

const emptyWorker = (): Omit<Worker, '_id' | 'id'> => ({
  name: '', phone: '', trades: [], maxConcurrent: 1, status: 'available', note: '',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

export default function WorkerSchedulePage() {
  const user = useAuthStore((state) => state.user);
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
  const [workerEditorOpen, setWorkerEditorOpen] = useState(false);
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerForm, setWorkerForm] = useState(emptyWorker());
  const [editingSchedule, setEditingSchedule] = useState<WorkerSchedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ workerId: '', projectId: '', stageId: '', startDate: toDateKey(new Date()), endDate: toDateKey(new Date()), status: 'confirmed' as WorkerScheduleStatus, note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
  const activeSchedules = useMemo(() => schedules.filter((item) => item.status !== 'cancelled' && item.startDate <= rangeEnd && item.endDate >= rangeStart), [schedules, rangeEnd, rangeStart]);
  const visibleWorkers = useMemo(() => workers
    .filter((worker) => worker.status !== 'inactive')
    .filter((worker) => !tradeFilter || worker.trades.includes(tradeFilter))
    .filter((worker) => !search || [worker.name, worker.phone, worker.trades.join(' ')].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')), [workers, tradeFilter, search]);

  const today = toDateKey(new Date());
  const upcomingCount = schedules.filter((item) => item.status !== 'cancelled' && item.startDate >= today && item.startDate <= toDateKey(addDays(new Date(), 7))).length;
  const inProgressCount = schedules.filter((item) => item.status === 'in_progress').length;
  const unassignedStages = projects.reduce((total, project) => total + (project.nodesData || []).filter((stage: any) => {
    const sections = stage.sections || [];
    const planned = sections.some((section: any) => section.startDate || section.endDate);
    return planned && !schedules.some((item) => item.projectId === recordId(project) && item.stageId === String(stage._id || stage.id));
  }).length, 0);

  const selectedProject = projects.find((item) => recordId(item) === scheduleForm.projectId);
  const stages = selectedProject?.nodesData || [];
  const selectedStage = stages.find((item: any) => String(item._id || item.id) === scheduleForm.stageId);
  const selectedWorker = workers.find((item) => workerIdOf(item) === scheduleForm.workerId);
  const conflicts = selectedWorker ? findScheduleConflicts(selectedWorker, scheduleForm, schedules, scheduleIdOf(editingSchedule || {} as WorkerSchedule)) : [];
  const tradeOptions = [{ value: '', label: '全部工种' }, ...WORKER_TRADES.map((trade) => ({ value: trade, label: trade }))];
  const workerStatusOptions = Object.entries(WORKER_STATUS_LABEL).map(([value, label]) => ({ value, label }));
  const scheduleStatusOptions = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
  const workerOptions = workers.filter((item) => item.status !== 'inactive').map((worker) => ({ value: workerIdOf(worker), label: worker.name, description: worker.trades.join('/') }));
  const projectOptions = projects.filter((item) => !['已完工', '已暂停'].includes(item.status)).map((project) => ({ value: recordId(project), label: project.address || project.customer || '未命名工地' }));
  const stageOptions = stages.map((stage: any) => ({ value: String(stage._id || stage.id), label: stage.name }));

  const openNewSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({ workerId: '', projectId: '', stageId: '', startDate: today, endDate: today, status: 'confirmed', note: '' });
    setError('');
    setScheduleEditorOpen(true);
  };

  const openEditSchedule = (schedule: WorkerSchedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({ workerId: schedule.workerId, projectId: schedule.projectId, stageId: schedule.stageId, startDate: schedule.startDate, endDate: schedule.endDate, status: schedule.status, note: schedule.note || '' });
    setError('');
    setScheduleEditorOpen(true);
  };

  const chooseProject = (projectId: string) => {
    const project = projects.find((item) => recordId(item) === projectId);
    const firstStage = project?.nodesData?.[0];
    const sectionDates = (firstStage?.sections || []).flatMap((section: any) => [section.startDate, section.endDate]).filter(Boolean).sort();
    setScheduleForm((current) => ({ ...current, projectId, stageId: String(firstStage?._id || firstStage?.id || ''), startDate: sectionDates[0] || current.startDate, endDate: sectionDates.at(-1) || sectionDates[0] || current.endDate }));
  };

  const chooseStage = (stageId: string) => {
    const stage = stages.find((item: any) => String(item._id || item.id) === stageId);
    const starts = (stage?.sections || []).map((item: any) => item.startDate).filter(Boolean).sort();
    const ends = (stage?.sections || []).map((item: any) => item.endDate).filter(Boolean).sort();
    setScheduleForm((current) => ({ ...current, stageId, startDate: starts[0] || current.startDate, endDate: ends.at(-1) || starts[0] || current.endDate }));
  };

  const saveSchedule = async () => {
    if (!selectedWorker || !selectedProject || !selectedStage || !scheduleForm.startDate || !scheduleForm.endDate) {
      setError('请选择工人、工地、施工阶段和排期日期'); return;
    }
    if (scheduleForm.endDate < scheduleForm.startDate) { setError('结束日期不能早于开始日期'); return; }
    if (conflicts.length > 0) { setError(`该工人与“${conflicts[0].schedule.projectAddress}”排期冲突`); return; }
    setSaving(true); setError('');
    const now = new Date().toISOString();
    const payload = {
      workerId: workerIdOf(selectedWorker), workerName: selectedWorker.name,
      projectId: recordId(selectedProject), projectAddress: selectedProject.address || '未填写地址', customerName: selectedProject.customerName || selectedProject.customer || '',
      stageId: String(selectedStage._id || selectedStage.id), stageName: selectedStage.name || '施工阶段', trade: selectedStage.name || selectedWorker.trades[0] || '其他',
      startDate: scheduleForm.startDate, endDate: scheduleForm.endDate, status: scheduleForm.status, note: scheduleForm.note,
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
      if (editingWorker) await workersAPI.update(workerIdOf(editingWorker), { ...workerForm, updatedAt: now });
      else await workersAPI.add({ ...workerForm, createdAt: now, updatedAt: now });
      setEditingWorker(null); setWorkerForm(emptyWorker()); await loadData();
    } catch (saveError) { console.error(saveError); setError('工人资料保存失败：请检查 erp_workers 集合及写入权限'); }
    finally { setSaving(false); }
  };

  const deleteSchedule = async (schedule: WorkerSchedule) => {
    if (!window.confirm(`确定删除“${schedule.workerName} · ${schedule.projectAddress}”的排期吗？`)) return;
    await workerSchedulesAPI.delete(scheduleIdOf(schedule)); await loadData();
  };

  const deleteWorker = async (worker: Worker) => {
    if (schedules.some((item) => item.workerId === workerIdOf(worker) && !['completed', 'cancelled'].includes(item.status))) {
      alert('该工人仍有未结束排期，请先处理排期'); return;
    }
    if (!window.confirm(`确定删除“${worker.name}”吗？历史排期仍会保留。`)) return;
    await workersAPI.delete(workerIdOf(worker)); await loadData();
  };

  return (
    <div className="erp-page pb-24 md:pb-6">
      <div className="erp-page-header items-start">
        <div><h1 className="erp-page-title">工人排期</h1><p className="erp-page-subtitle">统筹工人档期与工地施工安排</p></div>
        {canEdit && <div className="flex gap-2"><button onClick={() => setWorkerEditorOpen(true)} className="erp-btn-secondary h-10 w-10 justify-center px-0 sm:w-auto sm:px-3" title="工人管理"><UserRoundCog size={16} /><span className="hidden sm:inline">工人管理</span></button><button onClick={openNewSchedule} className="erp-btn-primary h-10 w-10 justify-center px-0 sm:w-auto sm:px-3" title="新增排期"><Plus size={16} /><span className="hidden sm:inline">新增排期</span></button></div>}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {[{ label: '未来7天进场', value: upcomingCount, icon: CalendarDays }, { label: '正在施工', value: inProgressCount, icon: HardHat }, { label: '待安排阶段', value: unassignedStages, icon: AlertTriangle }].map(({ label, value, icon: Icon }) => (
          <div key={label} className="erp-surface flex items-center justify-between p-3 md:p-4"><div><p className="text-[10px] text-gray-400 md:text-xs">{label}</p><p className="mt-1 text-xl font-bold text-gray-900 md:text-2xl">{value}</p></div><Icon size={19} className="hidden text-gold-500 md:block" /></div>
        ))}
      </div>

      <div className="mt-4 erp-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
          <div className="relative min-w-[180px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索工人、电话或工种" className="h-9 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-gold-400" /></div>
          <Select value={tradeFilter} onChange={setTradeFilter} options={tradeOptions} className="w-[118px]" sheetTitle="选择工种" />
          <div className="flex h-9 items-center rounded-lg border border-gray-200 bg-white"><button onClick={() => setAnchorDate(addDays(anchorDate, -viewDays))} className="h-full px-2 text-gray-500"><ChevronLeft size={16} /></button><button onClick={() => setAnchorDate(startOfWeek(new Date()))} className="border-x border-gray-200 px-3 text-xs font-medium">本周</button><button onClick={() => setAnchorDate(addDays(anchorDate, viewDays))} className="h-full px-2 text-gray-500"><ChevronRight size={16} /></button></div>
          <div className="hidden rounded-lg bg-gray-100 p-0.5 md:flex">{([7, 14, 30] as const).map((days) => <button key={days} onClick={() => setViewDays(days)} className={`rounded-md px-2.5 py-1.5 text-xs ${viewDays === days ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-500'}`}>{days === 7 ? '周' : days === 14 ? '双周' : '月'}</button>)}</div>
        </div>

        {error && !workerEditorOpen && !scheduleEditorOpen && <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-600">{error}</div>}
        {loading ? <div className="py-20 text-center text-sm text-gray-400">正在读取排期...</div> : workers.length === 0 ? <div className="py-20 text-center"><UsersRound size={28} className="mx-auto text-gray-300" /><p className="mt-3 text-sm text-gray-500">请先新增工人</p></div> : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <div style={{ minWidth: 180 + dates.length * 108 }}>
                <div className="sticky top-0 z-20 grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: `180px repeat(${dates.length}, 108px)` }}><div className="sticky left-0 z-30 flex h-12 items-center border-r border-gray-200 bg-gray-50 px-4 text-xs font-medium text-gray-500">工人</div>{dates.map((date) => { const key = toDateKey(date); return <div key={key} className={`flex h-12 flex-col items-center justify-center border-r border-gray-100 text-[11px] ${key === today ? 'bg-gold-50 text-gold-700' : 'text-gray-500'}`}><span>{date.getMonth() + 1}/{date.getDate()}</span><span className="mt-0.5 text-[10px]">周{'日一二三四五六'[date.getDay()]}</span></div>; })}</div>
                {visibleWorkers.map((worker) => { const rows = activeSchedules.filter((item) => item.workerId === workerIdOf(worker)); return <div key={workerIdOf(worker)} className="relative grid min-h-[72px] border-b border-gray-100" style={{ gridTemplateColumns: `180px repeat(${dates.length}, 108px)` }}><div className="sticky left-0 z-10 flex min-h-[72px] flex-col justify-center border-r border-gray-200 bg-white px-4"><div className="truncate text-sm font-medium text-gray-900">{worker.name}</div><div className="mt-1 truncate text-[10px] text-gray-400">{worker.trades.join(' / ')}</div></div>{dates.map((date) => <div key={toDateKey(date)} className={`border-r border-gray-100 ${toDateKey(date) === today ? 'bg-gold-50/40' : ''}`} />)}<div className="pointer-events-none absolute inset-y-0 left-[180px] right-0">{rows.map((schedule, rowIndex) => { const clippedStart = schedule.startDate < rangeStart ? rangeStart : schedule.startDate; const clippedEnd = schedule.endDate > rangeEnd ? rangeEnd : schedule.endDate; const left = Math.round((parseDate(clippedStart).getTime() - parseDate(rangeStart).getTime()) / DAY_MS) * 108 + 5; const width = daysBetween(clippedStart, clippedEnd) * 108 - 10; return <button key={scheduleIdOf(schedule)} onClick={() => canEdit && openEditSchedule(schedule)} className={`pointer-events-auto absolute h-11 overflow-hidden rounded-md border px-2 text-left shadow-sm ${STATUS_STYLE[schedule.status]}`} style={{ left, width, top: 13 + rowIndex * 3 }} title={`${schedule.projectAddress} · ${schedule.stageName}`}><span className="block truncate text-xs font-medium">{schedule.projectAddress}</span><span className="block truncate text-[10px] opacity-75">{schedule.stageName} · {STATUS_LABEL[schedule.status]}</span></button>; })}</div></div>; })}
              </div>
            </div>

            <div className="divide-y divide-gray-200 md:hidden">
              {activeSchedules.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">当前日期范围暂无排期</div> : activeSchedules.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)).map((schedule) => <button key={scheduleIdOf(schedule)} onClick={() => canEdit && openEditSchedule(schedule)} className="w-full px-4 py-3 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-gray-900">{schedule.projectAddress}</div><div className="mt-1 text-xs text-gray-500">{schedule.workerName} · {schedule.stageName}</div></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STATUS_STYLE[schedule.status]}`}>{STATUS_LABEL[schedule.status]}</span></div><div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500"><Clock3 size={13} />{formatShortDate(schedule.startDate)} 至 {formatShortDate(schedule.endDate)} · {daysBetween(schedule.startDate, schedule.endDate)}天</div></button>)}
            </div>
          </>
        )}
      </div>

      {scheduleEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => setScheduleEditorOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><h2 className="font-semibold">{editingSchedule ? '编辑排期' : '新增排期'}</h2><button onClick={() => setScheduleEditorOpen(false)} className="p-1.5 text-gray-400"><X size={18} /></button></div>
            <div className="space-y-4 p-4">
              <label className="block text-xs text-gray-500">工人 *<Select value={scheduleForm.workerId} onChange={(value) => setScheduleForm({ ...scheduleForm, workerId: value })} options={workerOptions} placeholder="请选择工人" searchable className="mt-1" sheetTitle="选择工人" /></label>
              <label className="block text-xs text-gray-500">工地 *<Select value={scheduleForm.projectId} onChange={chooseProject} options={projectOptions} placeholder="请选择工地" searchable className="mt-1" sheetTitle="选择工地" /></label>
              <label className="block text-xs text-gray-500">施工阶段 *<Select value={scheduleForm.stageId} onChange={chooseStage} options={stageOptions} placeholder="请选择施工阶段" className="mt-1" sheetTitle="选择施工阶段" /></label>
              <div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">开始日期<DatePicker value={scheduleForm.startDate} onChange={(value) => setScheduleForm({ ...scheduleForm, startDate: value })} className="mt-1" /></label><label className="text-xs text-gray-500">结束日期<DatePicker value={scheduleForm.endDate} onChange={(value) => setScheduleForm({ ...scheduleForm, endDate: value })} className="mt-1" /></label></div>
              <label className="block text-xs text-gray-500">排期状态<Select value={scheduleForm.status} onChange={(value) => setScheduleForm({ ...scheduleForm, status: value as WorkerScheduleStatus })} options={scheduleStatusOptions} className="mt-1" sheetTitle="选择排期状态" /></label>
              <label className="block text-xs text-gray-500">备注<textarea value={scheduleForm.note} onChange={(event) => setScheduleForm({ ...scheduleForm, note: event.target.value })} rows={2} className="mt-1 w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none" /></label>
              {conflicts.length > 0 && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600"><div className="flex items-center gap-1.5 font-medium"><AlertTriangle size={14} />排期冲突</div><p className="mt-1">已安排：{conflicts[0].schedule.projectAddress}，{formatShortDate(conflicts[0].schedule.startDate)}至{formatShortDate(conflicts[0].schedule.endDate)}</p></div>}
              {error && <p className="text-xs leading-5 text-red-500">{error}</p>}
              <div className="flex items-center justify-between border-t border-gray-100 pt-4"><div>{editingSchedule && <button onClick={() => void deleteSchedule(editingSchedule)} className="inline-flex items-center gap-1 text-xs text-red-500"><Trash2 size={14} />删除排期</button>}</div><div className="flex gap-2"><button onClick={() => setScheduleEditorOpen(false)} className="erp-btn-secondary">取消</button><button disabled={saving || conflicts.length > 0} onClick={() => void saveSchedule()} className="erp-btn-primary">保存排期</button></div></div>
            </div>
          </div>
        </div>
      )}

      {workerEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => setWorkerEditorOpen(false)}>
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div><h2 className="font-semibold text-gray-900">工人管理</h2><p className="text-xs text-gray-400">维护工种、联系方式和可用状态</p></div>
              <button onClick={() => setWorkerEditorOpen(false)} className="p-1.5 text-gray-400"><X size={18} /></button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {workers.length > 0 && (
                <div className="max-h-[30vh] shrink-0 overflow-y-auto border-b border-gray-100 md:max-h-none md:w-[280px] md:border-b-0 md:border-r">
                  <button onClick={() => { setEditingWorker(null); setWorkerForm(emptyWorker()); setError(''); }} className="flex w-full items-center gap-2 border-b border-gray-100 px-4 py-3 text-sm font-medium text-gold-600"><Plus size={15} />新增工人</button>
                  {workers.map((worker) => (
                    <div key={workerIdOf(worker)} className={`flex items-center gap-2 border-b border-gray-50 px-4 py-3 ${editingWorker && workerIdOf(editingWorker) === workerIdOf(worker) ? 'bg-gold-50' : ''}`}>
                      <button onClick={() => { setEditingWorker(worker); setWorkerForm({ name: worker.name, phone: worker.phone || '', trades: worker.trades || [], maxConcurrent: worker.maxConcurrent || 1, status: worker.status || 'available', note: worker.note || '', createdAt: worker.createdAt, updatedAt: worker.updatedAt }); setError(''); }} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-medium">{worker.name}</div><div className="mt-0.5 truncate text-[10px] text-gray-400">{worker.trades.join(' / ')} · {WORKER_STATUS_LABEL[worker.status]}</div>
                      </button>
                      <button onClick={() => void deleteWorker(worker)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {workers.length === 0 && <div className="mb-4 text-sm font-medium text-gold-600">新增工人</div>}
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-gray-500">姓名 *<input value={workerForm.name} onChange={(event) => setWorkerForm({ ...workerForm, name: event.target.value })} placeholder="例如：王师傅" className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-gold-400" /></label>
                  <label className="text-xs text-gray-500">联系电话<input value={workerForm.phone} onChange={(event) => setWorkerForm({ ...workerForm, phone: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-gold-400" /></label>
                  <label className="text-xs text-gray-500">最大并行任务<input type="number" min={1} value={workerForm.maxConcurrent} onChange={(event) => setWorkerForm({ ...workerForm, maxConcurrent: Math.max(1, Number(event.target.value)) })} className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none" /></label>
                  <label className="text-xs text-gray-500">状态<Select value={workerForm.status} onChange={(value) => setWorkerForm({ ...workerForm, status: value as WorkerStatus })} options={workerStatusOptions} className="mt-1" sheetTitle="选择工人状态" /></label>
                </div>
                <div className="mt-4"><p className="text-xs text-gray-500">工种 *</p><div className="mt-2 flex flex-wrap gap-2">{WORKER_TRADES.map((trade) => <button key={trade} onClick={() => setWorkerForm((current) => ({ ...current, trades: current.trades.includes(trade) ? current.trades.filter((item) => item !== trade) : [...current.trades, trade] }))} className={`rounded-full border px-3 py-1 text-xs ${workerForm.trades.includes(trade) ? 'border-gold-400 bg-gold-50 text-gold-700' : 'border-gray-200 text-gray-500'}`}>{trade}</button>)}</div></div>
                <label className="mt-4 block text-xs text-gray-500">备注<textarea value={workerForm.note} onChange={(event) => setWorkerForm({ ...workerForm, note: event.target.value })} rows={3} className="mt-1 w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gold-400" /></label>
                {error && <p className="mt-3 text-xs leading-5 text-red-500">{error}</p>}
                <div className="mt-4 flex justify-end"><button disabled={saving} onClick={() => void saveWorker()} className="erp-btn-primary">{editingWorker ? '保存修改' : '新增工人'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
