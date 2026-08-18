import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, Building2, CalendarClock, CheckCircle2, Clock3,
  ListTodo, Maximize2, RefreshCw, UserPlus, UsersRound, UserX, Wifi, WifiOff,
  type LucideIcon,
} from 'lucide-react';
import QRCode from 'qrcode';
import logoUrl from '@/assets/logo.png';
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
const PROJECT_PAGE_SIZE = 7;

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
      <section className="w-full max-w-[1180px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl shadow-black/10">
        <div className="grid min-h-[680px] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center gap-24 bg-[#111111] px-8 py-10 text-white md:px-14 md:py-14">
            <div className="flex items-center gap-4">
              <img src={logoUrl} alt="品诺筑家" className="h-14 w-14 rounded-lg bg-white object-contain p-1" />
              <div>
                <div className="text-2xl font-bold">品诺筑家</div>
                <div className="mt-1 text-sm text-white/50">全链路管理系统</div>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[#d4a843]">公司运营大屏</p>
              <h1 className="mt-4 max-w-xl text-4xl font-bold leading-tight md:text-5xl">请使用管理员手机授权此设备</h1>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center px-8 py-10 md:px-14">
            {pairing && remaining > 0 ? (
              <>
                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
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
  return <div className="min-w-0 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"><div className="flex items-center justify-between gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-md ${iconColors[tone]}`}><Icon size={17} /></span>{badge && <span className={`truncate rounded-full px-2 py-1 text-[10px] ${badgeColors[badgeTone]}`}>{badge}</span>}</div><div className={`mt-2 text-2xl font-bold tabular-nums ${colors[tone]}`}>{value}</div><div className="mt-0.5 text-[11px] text-gray-400">{label}</div></div>;
}

function DashboardView({ token }: { token: string }) {
  const [data, setData] = useState<OperationsScreenData | null>(null);
  const [lastSuccess, setLastSuccess] = useState('');
  const [stale, setStale] = useState(false);
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(new Date());
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const result = await loadOperationsScreenData(token);
      setData(result.data);
      setLastSuccess(result.data.generatedAt);
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

  const pageCount = Math.max(1, Math.ceil((data?.projects.length || 0) / PROJECT_PAGE_SIZE));
  useEffect(() => {
    if (page >= pageCount) setPage(0);
    const timer = window.setInterval(() => setPage((value) => (value + 1) % pageCount), 15_000);
    return () => window.clearInterval(timer);
  }, [pageCount, page]);

  const projects = useMemo(() => data?.projects.slice(page * PROJECT_PAGE_SIZE, (page + 1) * PROJECT_PAGE_SIZE) || [], [data, page]);
  const maxStage = Math.max(1, ...(data?.stageDistribution.map((item) => item.value) || [1]));
  const signedRate = data.stats.totalCustomers > 0 ? Math.round(data.stats.signedCustomers / data.stats.totalCustomers * 100) : 0;
  const lostRate = data.stats.totalCustomers > 0 ? Math.round(data.stats.lostCustomers / data.stats.totalCustomers * 100) : 0;

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6]"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-[#d4a843]" /><p className="mt-4 text-sm text-gray-500">正在同步运营数据...</p></div></div>;
  }

  return (
    <main className="h-screen min-h-[720px] overflow-hidden bg-[#f3f4f6] p-4 text-gray-900 xl:p-6">
      <div className="mx-auto flex h-full max-w-[1920px] flex-col gap-4">
        <header className="flex h-[72px] shrink-0 items-center justify-between rounded-lg bg-[#111111] px-6 text-white">
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

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.72fr)_minmax(340px,0.78fr)] gap-4">
          <section className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-5"><div><h2 className="text-base font-semibold">在施工地进度</h2><p className="text-[11px] text-gray-400">优先显示有待办及进度较慢的工地</p></div><span className="text-xs text-gray-400">{page + 1} / {pageCount}</span></div>
            <div className="grid grid-cols-[minmax(220px,1.45fr)_0.75fr_0.75fr_1.1fr_0.72fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-2 text-[11px] text-gray-400"><span>工地 / 负责人</span><span>当前阶段</span><span>下一阶段</span><span>施工进度</span><span>待解决</span></div>
            <div className="min-h-0 flex-1">
              {projects.length > 0 ? projects.map((project) => (
                <div key={project.id} className="grid h-[calc((100%)/7)] min-h-[62px] grid-cols-[minmax(220px,1.45fr)_0.75fr_0.75fr_1.1fr_0.72fr] items-center gap-4 border-b border-gray-100 px-5 last:border-b-0">
                  <div className="min-w-0"><div className="truncate text-sm font-medium text-gray-900">{project.address}</div><div className="mt-1 truncate text-[11px] text-gray-400">{project.people.join(' · ') || '暂未设置负责人'}</div></div>
                  <div className="truncate text-sm font-medium">{project.currentStage}</div>
                  <div className="truncate text-sm text-gray-500">{project.nextStage}</div>
                  <div className="flex items-center gap-3"><div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#d4a843]" style={{ width: `${project.progress}%` }} /></div><span className="w-9 text-right text-xs font-semibold tabular-nums text-[#a37816]">{project.progress}%</span></div>
                  <div>{project.pendingTodos > 0 ? <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600"><AlertTriangle size={12} />{project.pendingTodos} 项</span> : <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={13} />正常</span>}</div>
                </div>
              )) : <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无施工中工地</div>}
            </div>
          </section>

          <div className="grid min-h-0 grid-rows-2 gap-4">
            <section className="min-h-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">当前阶段分布</h2><span className="text-[11px] text-gray-400">共 {data.stats.activeProjects} 个工地</span></div>
              <div className="mt-4 space-y-3 overflow-hidden">
                {data.stageDistribution.slice(0, 6).map((item) => <div key={item.name} className="grid grid-cols-[70px_1fr_26px] items-center gap-3"><span className="truncate text-xs text-gray-600">{item.name}</span><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${item.value / maxStage * 100}%` }} /></div><span className="text-right text-xs font-semibold tabular-nums">{item.value}</span></div>)}
              </div>
            </section>
            <section className="min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex h-12 items-center justify-between border-b border-gray-100 px-5"><h2 className="text-sm font-semibold">近期工人进场</h2><CalendarClock size={16} className="text-[#d4a843]" /></div>
              <div className="divide-y divide-gray-100">
                {data.schedules.slice(0, 5).map((schedule) => <div key={schedule.id} className="grid grid-cols-[72px_1fr] gap-3 px-5 py-2.5"><div><div className="text-xs font-semibold text-gray-800">{schedule.workerName}</div><div className="mt-0.5 text-[10px] text-[#a37816]">{schedule.stageName}</div></div><div className="min-w-0"><div className="truncate text-xs text-gray-600">{schedule.projectAddress}</div><div className="mt-0.5 text-[10px] text-gray-400">{formatShortDate(schedule.startDate)} - {formatShortDate(schedule.endDate)}</div></div></div>)}
                {data.schedules.length === 0 && <div className="px-5 py-8 text-center text-xs text-gray-400">未来 7 天暂无工人进场安排</div>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function OperationsScreen() {
  const token = getScreenDeviceToken();
  return token ? <DashboardView token={token} /> : <PairingView />;
}
