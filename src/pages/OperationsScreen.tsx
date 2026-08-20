import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck, Building2, CalendarClock, CheckCircle2, Clock3,
  ListTodo, Maximize2, RefreshCw, UserPlus, UsersRound, UserX, Wifi, WifiOff,
  type LucideIcon,
} from 'lucide-react';
import QRCode from 'qrcode';
import logoUrl from '@/assets/logo.png';
import Modal from '@/components/Modal';
import {
  clearScreenDeviceToken,
  createScreenPairing,
  getScreenDeviceToken,
  getScreenPairing,
  loadOperationsScreenData,
  saveScreenDeviceToken,
  type OperationsScreenData,
} from '@/services/operationsScreen';

const REFRESH_MS = 15_000;
const PROJECT_ROW_HEIGHT = 76;
const AUTO_SCROLL_MS = 8_000;

type ProjectSortKey = 'updatedAt' | 'project' | 'currentStage' | 'nextStage' | 'progress' | 'pendingTodos';
type SortDirection = 'asc' | 'desc';

function sortableTimestamp(value?: string) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const timestamp = new Date(value.replace(/-/g, '/')).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

const EMPTY_STATS: OperationsScreenData['stats'] = {
  totalCustomers: 0,
  monthCustomers: 0,
  signedCustomers: 0,
  lostCustomers: 0,
  totalProjects: 0,
  activeProjects: 0,
  updatedToday: 0,
  pendingTodos: 0,
  overdueTodos: 0,
  arrivalsNext7Days: 0,
};

function normalizeScreenData(value: OperationsScreenData | null | undefined): OperationsScreenData {
  const source = value || ({} as Partial<OperationsScreenData>);
  return {
    generatedAt: source.generatedAt || new Date().toISOString(),
    stats: { ...EMPTY_STATS, ...(source.stats || {}) },
    projects: Array.isArray(source.projects)
      ? source.projects.map((project) => ({ ...project, todoItems: Array.isArray(project.todoItems) ? project.todoItems : [] }))
      : [],
    stageDistribution: Array.isArray(source.stageDistribution) ? source.stageDistribution : [],
    schedules: Array.isArray(source.schedules) ? source.schedules : [],
  };
}

function formatTime(value?: string) {
  if (!value) return '--:--:--';
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
}

function formatShortDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value.replace(/-/g, '/'));
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value.replace(/-/g, '/'));
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function PairingView() {
  const [pairing, setPairing] = useState<{ pairingId: string; code: string; expiresAt: string } | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [remaining, setRemaining] = useState(300);
  const [error, setError] = useState('');

  const startPairing = useCallback(async () => {
    setError('');
    try {
      const created = await createScreenPairing();
      setPairing(created);
      const approveUrl = `${window.location.origin}/erp/screen-devices?code=${created.code}`;
      setQrUrl(await QRCode.toDataURL(approveUrl, { width: 360, margin: 1, color: { dark: '#111111', light: '#ffffff' } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '大屏授权服务暂时不可用');
    }
  }, []);

  useEffect(() => { void startPairing(); }, [startPairing]);

  useEffect(() => {
    if (!pairing) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  useEffect(() => {
    if (!pairing || remaining <= 0) return;
    let disposed = false;
    const poll = async () => {
      try {
        const result = await getScreenPairing(pairing.pairingId);
        if (!disposed && result.status === 'approved' && result.deviceToken) {
          saveScreenDeviceToken(result.deviceToken);
          window.location.reload();
        }
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        if (!disposed && status !== 410 && status !== 404) setError('授权状态读取失败，正在自动重试');
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [pairing, remaining]);

  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');

  return (
    <main className="min-h-screen bg-[#f3f4f6] text-gray-900 flex items-center justify-center p-5 md:p-10">
      <section className="w-full max-w-[1180px] overflow-hidden rounded border border-gray-200 bg-white shadow-2xl shadow-black/10">
        <div className="grid min-h-[680px] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center gap-24 bg-[#111111] px-8 py-10 text-white md:px-14 md:py-14">
            <div className="flex items-center gap-4">
              <img src={logoUrl} alt="品诺筑家" className="h-14 w-14 rounded bg-white object-contain p-1" />
              <div>
                <div className="text-2xl font-bold">品诺筑家</div>
                <div className="mt-1 text-sm text-white/50">全链路管理系统</div>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[#d4a843]">公司运营大屏</p>
              <h1 className="mt-4 max-w-xl text-2xl font-bold leading-tight md:text-3xl">请使用管理员手机授权此设备</h1>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center px-8 py-10 md:px-14">
            {pairing && remaining > 0 ? (
              <>
                <div className="rounded border border-gray-200 bg-white p-3 shadow-sm">
                  {qrUrl ? <img src={qrUrl} alt="大屏授权二维码" className="h-56 w-56 md:h-64 md:w-64" /> : <div className="h-64 w-64 animate-pulse bg-gray-100" />}
                </div>
                <p className="mt-6 text-sm text-gray-500">微信扫码后使用已登录的管理员账号确认</p>
                <div className="mt-8 flex items-center gap-3">
                  {pairing.code.split('').map((digit, index) => <span key={`${digit}-${index}`} className="flex h-14 w-12 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-2xl font-bold tabular-nums">{digit}</span>)}
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm text-gray-400"><Clock3 size={15} />授权码 {minutes}:{seconds} 后失效</p>
              </>
            ) : (
              <button type="button" onClick={() => void startPairing()} className="rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white">重新生成授权码</button>
            )}
            {error && <p className="mt-5 flex items-center gap-2 text-sm text-red-500"><AlertTriangle size={15} />{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, icon: Icon, tone = 'dark', badge, badgeTone = 'neutral' }: { label: string; value: number; icon: LucideIcon; tone?: 'dark' | 'gold' | 'red' | 'green'; badge?: string; badgeTone?: 'neutral' | 'green' | 'red' | 'gold' }) {
  const colors = { dark: 'text-gray-950', gold: 'text-[#b78618]', red: 'text-red-500', green: 'text-emerald-600' };
  const iconColors = { dark: 'bg-slate-50 text-slate-500', gold: 'bg-amber-50 text-amber-500', red: 'bg-rose-50 text-rose-500', green: 'bg-emerald-50 text-emerald-600' };
  const badgeColors = { neutral: 'bg-gray-100 text-gray-500', green: 'bg-emerald-50 text-emerald-600', red: 'bg-rose-50 text-rose-500', gold: 'bg-amber-50 text-amber-600' };
  return <div className="min-w-0 rounded border border-gray-200 bg-white px-4 py-3 shadow-sm"><div className="flex items-center justify-between gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-md ${iconColors[tone]}`}><Icon size={17} /></span>{badge && <span className={`truncate rounded-full px-2 py-1 text-[10px] ${badgeColors[badgeTone]}`}>{badge}</span>}</div><div className={`mt-2 text-2xl font-bold tabular-nums ${colors[tone]}`}>{value}</div><div className="mt-0.5 text-[11px] text-gray-400">{label}</div></div>;
}

function ProjectSortButton({ label, sortKey, activeKey, direction, onSort }: { label: string; sortKey: ProjectSortKey; activeKey: ProjectSortKey; direction: SortDirection; onSort: (key: ProjectSortKey) => void }) {
  const active = sortKey === activeKey;
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-left transition-colors hover:text-gray-700 ${active ? 'font-medium text-[#a37816]' : ''}`}
    >
      <span>{label}</span><Icon size={11} />
    </button>
  );
}

function DashboardView({ token }: { token: string }) {
  const [data, setData] = useState<OperationsScreenData | null>(null);
  const [lastSuccess, setLastSuccess] = useState('');
  const [stale, setStale] = useState(false);
  const [projectRange, setProjectRange] = useState({ start: 1, end: 1 });
  const [projectSort, setProjectSort] = useState<{ key: ProjectSortKey; direction: SortDirection }>({ key: 'updatedAt', direction: 'desc' });
  const [todoProjectId, setTodoProjectId] = useState('');
  const [now, setNow] = useState(new Date());
  const refreshingRef = useRef(false);
  const projectScrollRef = useRef<HTMLDivElement>(null);
  const projectHorizontalRef = useRef<HTMLDivElement>(null);
  const interactionPauseUntilRef = useRef(0);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const result = await loadOperationsScreenData(token);
      const nextData = normalizeScreenData(result.data);
      setData(nextData);
      setLastSuccess(nextData.generatedAt);
      setStale(false);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        clearScreenDeviceToken();
        window.location.reload();
        return;
      }
      setStale(true);
    } finally {
      refreshingRef.current = false;
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = data?.stats || EMPTY_STATS;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const container = projectScrollRef.current;
      if (!container || Date.now() < interactionPauseUntilRef.current || container.scrollHeight <= container.clientHeight) return;
      const nextTop = container.scrollTop + container.clientHeight;
      container.scrollTo({ top: nextTop >= container.scrollHeight - 8 ? 0 : nextTop, behavior: 'smooth' });
    }, AUTO_SCROLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const projects = useMemo(() => {
    const source = [...(data?.projects || [])];
    const direction = projectSort.direction === 'asc' ? 1 : -1;
    return source.sort((a, b) => {
      let comparison = 0;
      if (projectSort.key === 'updatedAt') comparison = sortableTimestamp(a.updatedAt) - sortableTimestamp(b.updatedAt);
      if (projectSort.key === 'project') comparison = `${a.address} ${a.people.join(' ')}`.localeCompare(`${b.address} ${b.people.join(' ')}`, 'zh-CN');
      if (projectSort.key === 'currentStage') comparison = a.currentStage.localeCompare(b.currentStage, 'zh-CN');
      if (projectSort.key === 'nextStage') comparison = a.nextStage.localeCompare(b.nextStage, 'zh-CN');
      if (projectSort.key === 'progress') comparison = a.progress - b.progress;
      if (projectSort.key === 'pendingTodos') comparison = a.pendingTodos - b.pendingTodos;
      return comparison * direction || sortableTimestamp(b.updatedAt) - sortableTimestamp(a.updatedAt) || a.address.localeCompare(b.address, 'zh-CN');
    });
  }, [data?.projects, projectSort]);
  const updateProjectRange = useCallback((container = projectScrollRef.current) => {
    if (!container || projects.length === 0) {
      setProjectRange({ start: 0, end: 0 });
      return;
    }
    const start = Math.min(projects.length, Math.floor(container.scrollTop / PROJECT_ROW_HEIGHT) + 1);
    const end = Math.min(projects.length, Math.ceil((container.scrollTop + container.clientHeight) / PROJECT_ROW_HEIGHT));
    setProjectRange({ start, end: Math.max(start, end) });
  }, [projects.length]);

  useEffect(() => {
    const container = projectScrollRef.current;
    if (!container) return undefined;
    updateProjectRange(container);
    const observer = new ResizeObserver(() => updateProjectRange(container));
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateProjectRange]);
  const todoProject = useMemo(
    () => (data?.projects || []).find((project) => project.id === todoProjectId) || null,
    [data?.projects, todoProjectId],
  );

  const changeProjectSort = useCallback((key: ProjectSortKey) => {
    setProjectSort((current) => ({
      key,
      direction: current.key === key
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : (key === 'progress' || key === 'pendingTodos' || key === 'updatedAt' ? 'desc' : 'asc'),
    }));
    setProjectRange({ start: projects.length > 0 ? 1 : 0, end: projects.length > 0 ? 1 : 0 });
    projectScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    interactionPauseUntilRef.current = Date.now() + 15_000;
  }, [projects.length]);

  const resetProjectSort = useCallback(() => {
    setProjectSort({ key: 'updatedAt', direction: 'desc' });
    setProjectRange({ start: projects.length > 0 ? 1 : 0, end: projects.length > 0 ? 1 : 0 });
    projectScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    interactionPauseUntilRef.current = Date.now() + 15_000;
  }, [projects.length]);
  const scheduleDays = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, index) => addDays(today, index));
  }, []);
  const scheduleRangeStart = scheduleDays[0];
  const scheduleRangeEnd = scheduleDays[scheduleDays.length - 1];
  const visibleSchedules = useMemo(() => (data?.schedules || []).filter((schedule) => {
    const start = parseDate(schedule.startDate);
    const end = parseDate(schedule.endDate) || start;
    return Boolean(start && end && start <= scheduleRangeEnd && end >= scheduleRangeStart);
  }).slice(0, 8), [data?.schedules, scheduleRangeEnd, scheduleRangeStart]);
  const signedRate = stats.totalCustomers > 0 ? Math.round(stats.signedCustomers / stats.totalCustomers * 100) : 0;
  const lostRate = stats.totalCustomers > 0 ? Math.round(stats.lostCustomers / stats.totalCustomers * 100) : 0;

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6]"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-[#d4a843]" /><p className="mt-4 text-sm text-gray-500">正在同步运营数据...</p></div></div>;
  }

  return (
    <main className="h-screen min-h-[720px] overflow-hidden bg-[#f3f4f6] p-4 text-gray-900 xl:p-6">
      <div className="mx-auto flex h-full max-w-[1920px] flex-col gap-4">
        <header className="flex h-[72px] shrink-0 items-center justify-between rounded bg-[#111111] px-6 text-white">
          <div className="flex items-center gap-4"><img src={logoUrl} alt="品诺筑家" className="h-11 w-11 rounded-md bg-white object-contain p-0.5" /><div><h1 className="text-xl font-bold">品诺筑家运营中心</h1><p className="mt-0.5 text-xs text-white/45">工地进度与资源协同</p></div></div>
          <div className="flex items-center gap-5">
            <div className={`flex items-center gap-2 text-xs ${stale ? 'text-amber-300' : 'text-emerald-300'}`}>{stale ? <WifiOff size={15} /> : <Wifi size={15} />}{stale ? '同步稍有延迟' : `已同步 ${formatTime(lastSuccess)}`}</div>
            <div className="text-right"><div className="text-2xl font-semibold tabular-nums">{now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })}</div><div className="text-xs text-white/45">{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</div></div>
            <button type="button" title="全屏显示" onClick={() => void document.documentElement.requestFullscreen?.()} className="flex h-10 w-10 items-center justify-center rounded-md border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"><Maximize2 size={18} /></button>
          </div>
        </header>

        <section className="grid h-[112px] shrink-0 grid-cols-6 gap-3">
          <Stat label="客户总数" value={data.stats.totalCustomers} icon={UsersRound} badge={`本月 +${data.stats.monthCustomers}`} badgeTone="green" />
          <Stat label="本月新增" value={data.stats.monthCustomers} icon={UserPlus} badge="团队" />
          <Stat label="已签约" value={data.stats.signedCustomers} icon={BadgeCheck} tone="green" badge={`${signedRate}%`} badgeTone="green" />
          <Stat label="已流失" value={data.stats.lostCustomers} icon={UserX} tone="red" badge={`${lostRate}%`} badgeTone="red" />
          <Stat label="工地总数" value={data.stats.totalProjects} icon={Building2} tone="gold" badge={`施工中 ${data.stats.activeProjects}`} badgeTone="gold" />
          <Stat label="待办事项" value={data.stats.pendingTodos} icon={ListTodo} badge={`逾期 ${data.stats.overdueTodos}`} badgeTone={data.stats.overdueTodos > 0 ? 'red' : 'neutral'} />
        </section>

        <div className="grid min-h-0 flex-1 grid-cols-6 gap-3">
          <section className="col-span-4 flex min-h-0 flex-col overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-5">
              <div><h2 className="text-base font-semibold">在施工地进度</h2><p className="text-[11px] text-gray-400">待办与施工进度总览</p></div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={resetProjectSort} className={`inline-flex items-center gap-1 text-xs ${projectSort.key === 'updatedAt' ? 'font-medium text-[#a37816]' : 'text-gray-400 hover:text-gray-700'}`}><Clock3 size={13} />最近更新</button>
                <span className="text-xs tabular-nums text-gray-400">
                  {projects.length > 0 ? `${projectRange.start}-${projectRange.end} / ${projects.length}` : '0 / 0'}
                </span>
              </div>
            </div>
            <div ref={projectHorizontalRef} className="min-h-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex h-full min-w-[900px] flex-col">
                <div
                  className="grid shrink-0 grid-cols-[minmax(240px,1.45fr)_0.75fr_0.75fr_1.1fr_0.72fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-2 text-[11px] text-gray-400"
                  onWheel={(event) => {
                    const container = projectHorizontalRef.current;
                    if (!container || container.scrollWidth <= container.clientWidth) return;
                    event.preventDefault();
                    container.scrollLeft += event.deltaX || event.deltaY;
                    interactionPauseUntilRef.current = Date.now() + 15_000;
                  }}
                >
                  <ProjectSortButton label="工地 / 负责人" sortKey="project" activeKey={projectSort.key} direction={projectSort.direction} onSort={changeProjectSort} />
                  <ProjectSortButton label="当前阶段" sortKey="currentStage" activeKey={projectSort.key} direction={projectSort.direction} onSort={changeProjectSort} />
                  <ProjectSortButton label="下一阶段" sortKey="nextStage" activeKey={projectSort.key} direction={projectSort.direction} onSort={changeProjectSort} />
                  <ProjectSortButton label="施工进度" sortKey="progress" activeKey={projectSort.key} direction={projectSort.direction} onSort={changeProjectSort} />
                  <ProjectSortButton label="待解决" sortKey="pendingTodos" activeKey={projectSort.key} direction={projectSort.direction} onSort={changeProjectSort} />
                </div>
                <div
                  ref={projectScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  onWheel={() => { interactionPauseUntilRef.current = Date.now() + 15_000; }}
                  onPointerDown={() => { interactionPauseUntilRef.current = Date.now() + 15_000; }}
                  onTouchStart={() => { interactionPauseUntilRef.current = Date.now() + 15_000; }}
                  onScroll={(event) => updateProjectRange(event.currentTarget)}
                >
                  {projects.length > 0 ? projects.map((project) => (
                    <div key={project.id} className="grid h-[76px] grid-cols-[minmax(240px,1.45fr)_0.75fr_0.75fr_1.1fr_0.72fr] items-center gap-4 border-b border-gray-100 px-5 last:border-b-0">
                      <div className="min-w-0"><div className="truncate text-sm font-medium text-gray-900">{project.address}</div><div className="mt-1 truncate text-[11px] text-gray-400">{project.people.join(' · ') || '暂未设置负责人'}</div></div>
                      <div className="truncate text-sm font-medium">{project.currentStage}</div>
                      <div className="truncate text-sm text-gray-500">{project.nextStage}</div>
                      <div className="flex items-center gap-3"><div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#d4a843]" style={{ width: `${project.progress}%` }} /></div><span className="w-9 text-right text-xs font-semibold tabular-nums text-[#a37816]">{project.progress}%</span></div>
                      <div>{project.pendingTodos > 0 ? <button type="button" title="查看待解决事项" onClick={() => { setTodoProjectId(project.id); interactionPauseUntilRef.current = Date.now() + 30_000; }} className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"><AlertTriangle size={12} />{project.pendingTodos} 项</button> : <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={13} />正常</span>}</div>
                    </div>
                  )) : <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无施工中工地</div>}
                </div>
              </div>
            </div>
          </section>

          <section className="col-span-2 flex min-h-0 flex-col overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-5"><div><h2 className="text-base font-semibold">近期工人进场</h2><p className="text-[11px] text-gray-400">未来 7 天施工安排</p></div><CalendarClock size={17} className="text-[#d4a843]" /></div>
            <div className="grid shrink-0 grid-cols-[92px_repeat(7,minmax(30px,1fr))] border-b border-gray-100 bg-gray-50 text-center text-[10px] text-gray-400">
              <div className="px-2 py-2 text-left">工人 / 工种</div>
              {scheduleDays.map((day) => <div key={day.toISOString()} className="border-l border-gray-100 px-1 py-2"><div>{day.getMonth() + 1}/{day.getDate()}</div><div className="mt-0.5">{['日', '一', '二', '三', '四', '五', '六'][day.getDay()]}</div></div>)}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleSchedules.map((schedule) => {
                const start = parseDate(schedule.startDate) || scheduleRangeStart;
                const end = parseDate(schedule.endDate) || start;
                const startIndex = Math.max(0, Math.round((start.getTime() - scheduleRangeStart.getTime()) / 86_400_000));
                const endIndex = Math.min(6, Math.round((end.getTime() - scheduleRangeStart.getTime()) / 86_400_000));
                return <div key={schedule.id} className="grid min-h-[72px] grid-cols-[92px_1fr] border-b border-gray-100 last:border-b-0">
                  <div className="min-w-0 px-3 py-3"><div className="truncate text-xs font-semibold text-gray-800">{schedule.workerName}</div><div className="mt-1 truncate text-[10px] text-[#a37816]">{schedule.stageName}</div></div>
                  <div className="relative grid grid-cols-7">
                    {scheduleDays.map((day) => <div key={day.toISOString()} className="border-l border-gray-100" />)}
                    <div className="absolute inset-y-3 flex items-center rounded border border-amber-300 bg-amber-50 px-2 text-[10px] text-amber-700" style={{ left: `${startIndex / 7 * 100}%`, width: `${Math.max(1, endIndex - startIndex + 1) / 7 * 100}%` }}>
                      <span className="truncate">{schedule.projectAddress}</span>
                    </div>
                  </div>
                </div>;
              })}
              {visibleSchedules.length === 0 && <div className="flex h-full min-h-40 items-center justify-center px-5 text-center text-xs text-gray-400">未来 7 天暂无工人进场安排</div>}
            </div>
          </section>
        </div>
      </div>
      <Modal open={Boolean(todoProject)} onClose={() => setTodoProjectId('')} title={`${todoProject?.address || '工地'} · 待解决事项`} size="md">
        <div className="space-y-3">
          {(todoProject?.todoItems || []).map((todo, index) => (
            <div key={todo.id || `${todo.title}-${index}`} className="rounded border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <p className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-gray-900">{todo.title}</p>
                {todo.overdue && <span className="shrink-0 rounded bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600">已逾期</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} />截止日期：{todo.dueDate || '未设置'}</span>
                <span className="inline-flex items-center gap-1.5"><UsersRound size={13} />负责人：{todo.assignees.join('、') || '未分配'}</span>
              </div>
            </div>
          ))}
          {todoProject && todoProject.todoItems.length === 0 && <div className="py-8 text-center text-sm text-gray-400">暂无待解决事项明细</div>}
        </div>
      </Modal>
    </main>
  );
}

export default function OperationsScreen() {
  const token = getScreenDeviceToken();
  return token ? <DashboardView token={token} /> : <PairingView />;
}
