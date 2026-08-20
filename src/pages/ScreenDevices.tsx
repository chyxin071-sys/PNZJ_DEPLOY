import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, MonitorSmartphone, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore, hasRole } from '@/store/authStore';
import {
  approveScreenPairing,
  loadScreenDevices,
  revokeScreenDevice,
  type ScreenDevice,
} from '@/services/operationsScreen';
import { useDialogStore } from '@/store/dialogStore';

function formatDateTime(value: string) {
  if (!value) return '尚未连接';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export default function ScreenDevices() {
  const user = useAuthStore((state) => state.user);
  const { showAlert, showConfirm } = useDialogStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCode = useMemo(() => (searchParams.get('code') || '').replace(/\D/g, '').slice(0, 6), [searchParams]);
  const [code, setCode] = useState(initialCode);
  const [deviceName, setDeviceName] = useState('公司运营大屏');
  const [devices, setDevices] = useState<ScreenDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);

  const refresh = useCallback(async () => {
    if (!user?.id || !isAdmin) return;
    setLoading(true);
    try {
      const result = await loadScreenDevices(user);
      setDevices(result.devices);
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : '大屏设备读取失败');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, showAlert, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleApprove = async () => {
    if (!user || code.length !== 6) return;
    setSubmitting(true);
    try {
      await approveScreenPairing(user, code, deviceName);
      setCode('');
      setSearchParams({}, { replace: true });
      await refresh();
      await showAlert('大屏已经开始同步运营数据。', { title: '授权成功' });
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : '大屏授权失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (device: ScreenDevice) => {
    if (!user) return;
    const confirmed = await showConfirm('解除后，该大屏会立即回到授权码页面，需要重新授权才能查看。', {
      title: `解除“${device.name}”授权？`,
      confirmText: '解除授权',
      confirmStyle: 'danger',
    });
    if (!confirmed) return;
    try {
      await revokeScreenDevice(user, device.id);
      await refresh();
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : '解除授权失败');
    }
  };

  if (!isAdmin) {
    return <div className="erp-page"><div className="erp-surface p-8 text-center text-sm text-gray-500">仅管理员可以授权和管理公司运营大屏。</div></div>;
  }

  return (
    <div className="erp-page-spaced">
      <header className="erp-page-header">
        <div><h1 className="erp-page-title">大屏设备</h1><p className="erp-page-subtitle">授权公司公共设备查看只读运营看板</p></div>
        <button type="button" onClick={() => void refresh()} title="刷新设备" className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="erp-surface p-5 md:p-6">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gold-50 text-gold-600"><ShieldCheck size={21} /></div><div><h2 className="text-base font-semibold text-gray-900">授权新大屏</h2><p className="mt-1 text-xs leading-5 text-gray-500">在大屏打开 pinnuozhujia.cn/erp/operations-screen，再输入屏幕上的 6 位授权码。</p></div></div>
          <div className="mt-6">
            <label className="text-xs font-medium text-gray-600">设备名称</label>
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={30} className="mt-2 h-11 w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100" />
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-gray-600">6 位授权码</label>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="请输入大屏上的授权码" className="mt-2 h-14 w-full rounded border border-gray-200 px-4 text-center text-2xl font-bold tracking-[0.35em] outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100" />
          </div>
          <button type="button" onClick={() => void handleApprove()} disabled={submitting || code.length !== 6} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded bg-gray-900 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"><MonitorSmartphone size={17} />{submitting ? '正在授权...' : '授权此大屏'}</button>
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-gray-400"><Clock3 size={13} />授权码有效期 5 分钟，过期后在大屏重新生成即可</p>
        </div>

        <div className="erp-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-gray-900">已授权设备</h2><p className="mt-0.5 text-[11px] text-gray-400">设备无需保存任何员工账号密码</p></div><span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">{devices.filter((device) => device.status === 'active').length} 台启用</span></div>
          {loading ? <div className="py-16 text-center text-sm text-gray-400">正在读取设备...</div> : devices.length === 0 ? <div className="py-16 text-center"><MonitorSmartphone className="mx-auto text-gray-300" /><p className="mt-3 text-sm text-gray-400">暂无已授权大屏</p></div> : (
            <div className="divide-y divide-gray-100">
              {devices.map((device) => <div key={device.id} className="flex items-center gap-3 px-5 py-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${device.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>{device.status === 'active' ? <CheckCircle2 size={18} /> : <MonitorSmartphone size={18} />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-gray-900">{device.name}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${device.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>{device.status === 'active' ? '已启用' : '已解除'}</span></div><p className="mt-1 truncate text-[11px] text-gray-400">最后连接：{formatDateTime(device.lastSeenAt)} · 授权人：{device.approvedByName || '-'}</p></div>{device.status === 'active' && <button type="button" title="解除授权" onClick={() => void handleRevoke(device)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={16} /></button>}</div>)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
