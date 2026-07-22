import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Camera, CalendarDays, IdCard, Lock, Save, ShieldCheck, User as UserIcon,
  Edit3, ChevronDown, ChevronRight, X, Check, Eye, EyeOff, LogOut, Bell,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useDialogStore } from '@/store/dialogStore';
import { usersAPI } from '@/db/api';
import { getTempFileURL, uploadFile } from '@/utils/cloudStorage';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import {
  isMiniProgramWebView,
  openNativeMediaPreview,
  openNativeSubscriptionSettings,
} from '@/utils/miniProgramPreview';
import { syncEmployeeName } from '@/db/sync';
import BottomDrawer from '@/components/BottomDrawer';
import { bindCurrentUserToWechat, buildWechatAccountLinkMessage, buildWechatRebindMessage } from '@/services/wechatBridge';

const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

const roleLabels: Record<string, { label: string; cls: string }> = {
  admin: { label: '管理员', cls: 'bg-purple-50 text-purple-700' },
  sales: { label: '销售', cls: 'bg-blue-50 text-blue-700' },
  designer: { label: '设计师', cls: 'bg-emerald-50 text-emerald-700' },
  manager: { label: '项目经理', cls: 'bg-amber-50 text-amber-700' },
  finance: { label: '财务', cls: 'bg-rose-50 text-rose-700' },
  employee: { label: '普通员工', cls: 'bg-gray-50 text-gray-700' },
};

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(String(value).replace(/-/g, '/'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN');
}

function tenureDays(value?: string) {
  if (!value) return 0;
  const start = new Date(String(value).replace(/-/g, '/'));
  if (Number.isNaN(start.getTime())) return 0;
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
}

function persistLocalUser(nextUser: any) {
  useAuthStore.setState({ user: nextUser });
  try {
    const erpUser = JSON.stringify(nextUser);
    const portalUser = JSON.stringify({
      _id: nextUser.id,
      name: nextUser.name,
      phone: nextUser.phone || '',
      role: nextUser.role,
      accessRole: nextUser.role === 'admin' ? 'admin' : nextUser.role === 'finance' ? 'finance' : 'staff',
      status: nextUser.status || 'active',
      account: nextUser.account || nextUser.username,
      joinDate: nextUser.joinDate || nextUser.createdAt,
      avatarUrl: nextUser.avatarUrl || '',
      bizTypes: nextUser.bizTypes || [],
      defaultEntry: nextUser.role === 'finance' ? '/erp/' : '/',
    });
    localStorage.setItem('pnzj_erp_user', erpUser);
    localStorage.setItem('pnzj_user', portalUser);
    localStorage.setItem('userInfo', portalUser);
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

export default function Profile() {
  const { user, changePassword, logout } = useAuthStore();
  const { showAlert, showConfirm } = useDialogStore();
  const [saving, setSaving] = useState(false);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [refreshedAvatarUrl, setRefreshedAvatarUrl] = useState<string>('');
  const [openingWechatNotifications, setOpeningWechatNotifications] = useState(false);

  // 表单数据（编辑态才使用）
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    account: user?.account || user?.username || '',
    joinDate: user?.joinDate || '',
    avatarUrl: user?.avatarUrl || '',
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [showPwd, setShowPwd] = useState({ old: false, new: false, confirm: false });
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const avatarImgKey = useRef(0);

  // 每次 displayAvatar 变化时重置失败状态并强制刷新 img key
  const displayAvatar = refreshedAvatarUrl || form.avatarUrl;
  useEffect(() => {
    setAvatarLoadFailed(false);
    avatarImgKey.current++;
  }, [displayAvatar]);

  // 加载最新用户数据并刷新头像临时链接
  useEffect(() => {
    let cancelled = false;
    async function loadFullUser() {
      if (!user?.id) return;
      const all = await usersAPI.toArray();
      const latest: any = all.find((item: any) => (item._id || item.id) === user.id);
      if (!latest || cancelled) return;
      const nextUser = {
        ...user,
        ...latest,
        id: latest._id || latest.id || user.id,
        username: latest.account || latest.username || user.username,
        account: latest.account || latest.username || user.account || '',
        phone: latest.phone || '',
        joinDate: latest.joinDate || user.joinDate || '',
        avatarUrl: latest.avatarUrl || '',
      };
      persistLocalUser(nextUser);
      setForm({
        name: nextUser.name || '',
        phone: nextUser.phone || '',
        account: nextUser.account || nextUser.username || '',
        joinDate: nextUser.joinDate || '',
        avatarUrl: nextUser.avatarUrl || '',
      });
      // 刷新云存储头像临时链接
      if (nextUser.avatarUrl && nextUser.avatarUrl.startsWith('cloud://')) {
        try {
          const urls = await getTempFileURL([nextUser.avatarUrl]);
          setRefreshedAvatarUrl(urls[nextUser.avatarUrl] || nextUser.avatarUrl);
        } catch {
          setRefreshedAvatarUrl(nextUser.avatarUrl);
        }
      } else {
        setRefreshedAvatarUrl(nextUser.avatarUrl || '');
      }
    }
    void loadFullUser();
    return () => { cancelled = true; };
  }, [user?.id]);

  const roles = useMemo(() => (
    (user?.roles && user.roles.length > 0 ? user.roles : [user?.role]).filter(Boolean) as string[]
  ), [user?.roles, user?.role]);
  const days = tenureDays(form.joinDate || user?.createdAt);

  const openAvatarPreview = () => {
    const url = displayAvatar;
    if (!url) return;
    if (openNativeMediaPreview([{ url, type: 'image' }])) return;
    setAvatarPreview(url);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setLoadingAvatar(true);
    try {
      const uploaded = await uploadFile(file, `avatars/${user.id}`);
      const urls = await getTempFileURL([uploaded.fileID]);
      const displayUrl = urls[uploaded.fileID] || uploaded.fileID;
      // 保存 cloud:// ID 到数据库（永久），同时缓存临时链接用于本次显示
      await usersAPI.update(user.id, { avatarUrl: uploaded.fileID } as any);
      const nextUser = { ...user, avatarUrl: uploaded.fileID };
      persistLocalUser(nextUser);
      setForm(prev => ({ ...prev, avatarUrl: uploaded.fileID }));
      setRefreshedAvatarUrl(displayUrl);
    } catch (error: any) {
      console.error('Avatar upload failed:', error);
      alert(error?.message || '头像上传失败');
    } finally {
      setLoadingAvatar(false);
      e.currentTarget.value = '';
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id || saving) return;
    if (!form.name.trim()) {
      alert('姓名不能为空');
      return;
    }
    setSaving(true);
    const oldName = user.name || '';
    const nextName = form.name.trim();
    try {
      await usersAPI.update(user.id, {
        name: nextName,
        phone: form.phone.trim(),
        joinDate: form.joinDate,
        avatarUrl: form.avatarUrl,
      } as any);
      if (oldName && oldName !== nextName) {
        await syncEmployeeName(oldName, nextName);
      }
      const nextUser = {
        ...user,
        name: nextName,
        phone: form.phone.trim(),
        joinDate: form.joinDate,
        avatarUrl: form.avatarUrl,
      };
      persistLocalUser(nextUser);
      setEditMode(false);
      alert('个人资料已保存');
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      alert(error?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm({
      name: user?.name || '',
      phone: user?.phone || '',
      account: user?.account || user?.username || '',
      joinDate: user?.joinDate || '',
      avatarUrl: user?.avatarUrl || '',
    });
    setEditMode(false);
  };

  const handleChangePassword = async () => {
    if (!user?.id) return;
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      alert('请填写旧密码、新密码和确认密码');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      alert('新密码至少 6 位');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('两次输入的新密码不一致');
      return;
    }
    const ok = await changePassword(user.id, passwordForm.oldPassword, passwordForm.newPassword);
    if (!ok) {
      alert('旧密码不正确');
      return;
    }
    setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    setShowPassword(false);
    alert('密码已修改，请使用新密码登录');
  };

  const handleOpenWechatNotifications = async () => {
    if (!user?.id || openingWechatNotifications) return;
    setOpeningWechatNotifications(true);
    try {
      let result = await bindCurrentUserToWechat(user.id);
      if (result.code === 'WECHAT_MANUALLY_UNBOUND') {
        const confirmed = await showConfirm(
          '当前微信已解除关联，是否重新关联当前登录的ERP账号？',
          {
            title: '关联当前微信',
            confirmText: '确认关联',
          },
        );
        if (!confirmed) return;
        result = await bindCurrentUserToWechat(user.id, { confirmRebind: true });
      }
      if (result.code === 'PERSON_REBIND_REQUIRED') {
        const confirmed = await showConfirm(buildWechatRebindMessage(result), {
          title: '迁移微信通知',
          confirmText: '迁移到当前微信',
          cancelText: '保留原微信',
        });
        if (!confirmed) return;
        result = await bindCurrentUserToWechat(user.id, { confirmRebind: true });
      }
      if (result.code === 'ACCOUNT_LINK_CONFIRMATION_REQUIRED') {
        const confirmed = await showConfirm(buildWechatAccountLinkMessage(result), {
          title: '确认账号关联',
          confirmText: '确认关联',
        });
        if (!confirmed) return;
        result = await bindCurrentUserToWechat(user.id, {
          confirmAccountLink: true,
          confirmRebind: true,
        });
      }
      if (!result.success) {
        await showAlert(result.message || '微信与ERP账号绑定失败，请稍后重试', { title: '无法打开微信通知' });
        return;
      }
      if (!openNativeSubscriptionSettings(user.id)) {
        await showAlert('请在新版微信小程序内打开此页面', { title: '无法打开微信通知' });
      }
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : '微信通知初始化失败，请稍后重试', { title: '无法打开微信通知' });
    } finally {
      setOpeningWechatNotifications(false);
    }
  };

  const togglePwd = (key: 'old' | 'new' | 'confirm') => {
    setShowPwd(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">个人中心</h1>
          <p className="erp-page-subtitle">管理个人资料与安全设置</p>
        </div>
        {!editMode && (
          <button onClick={() => setEditMode(true)} className="erp-btn-primary">
            <Edit3 size={16} /> 编辑资料
          </button>
        )}
      </div>

      {/* 统计卡片：仅桌面端 */}
      {!isMobile && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1"><ShieldCheck size={14} /> 角色</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {roles.map(role => {
                const meta = roleLabels[role] || { label: role, cls: 'bg-gray-50 text-gray-700' };
                return <span key={role} className={`text-xs px-2 py-0.5 rounded font-semibold ${meta.cls}`}>{meta.label}</span>;
              })}
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1"><CalendarDays size={14} /> 入职时间</div>
            <div className="text-lg font-bold text-gray-900">{formatDate(form.joinDate)}</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1"><IdCard size={14} /> 已入职</div>
            <div className="text-lg font-bold text-gray-900">{days ? `${days} 天` : '-'}</div>
          </div>
        </div>
      )}

      {/* 主要内容区域 */}
      {!isMobile ? (
        /* ---- 桌面端 ---- */
        <div className="flex gap-6">
          {/* 左侧头像 */}
          <div className="flex flex-col items-center gap-3 bg-white rounded-xl border border-gray-100 p-6 w-[200px] shrink-0 self-start">
            <button
              type="button"
              onClick={openAvatarPreview}
              disabled={!displayAvatar}
              className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-lg cursor-zoom-in"
            >
              {displayAvatar && !avatarLoadFailed ? (
                <img key={avatarImgKey.current} src={displayAvatar} alt="头像" className="h-full w-full object-cover" onError={() => setAvatarLoadFailed(true)} />
              ) : (
                <span className="text-4xl font-bold text-gray-300">{form.name?.[0] || 'U'}</span>
              )}
            </button>
            {editMode && (
              <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-gold-500 text-white shadow-md hover:bg-gold-600 -mt-8 mr-2 self-end relative z-10">
                <Camera size={15} />
                <input type="file" className="hidden" accept="image/*" disabled={loadingAvatar} onChange={handleAvatarUpload} />
              </label>
            )}
            <div className="text-sm font-bold text-gray-900">{form.name || '未设置'}</div>
            <div className="text-xs text-gray-400 font-mono">{form.account || '-'}</div>
          </div>

          {/* 右侧资料 */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><UserIcon size={16} className="text-gold-500" /> 基本信息</h2>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">姓名</label>
                {editMode ? (
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="erp-input" />
                ) : (
                  <p className="text-sm text-gray-900 py-2">{form.name || '-'}</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">手机号</label>
                {editMode ? (
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="erp-input" placeholder="请输入手机号" />
                ) : (
                  <p className="text-sm text-gray-900 py-2">{form.phone || '-'}</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">登录账号</label>
                <p className="text-sm text-gray-500 py-2 font-mono">{form.account || '-'}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">入职时间</label>
                {editMode ? (
                  <ProfileDatePicker value={form.joinDate} onChange={v => setForm({ ...form, joinDate: v })} />
                ) : (
                  <p className="text-sm text-gray-900 py-2">{formatDate(form.joinDate)}</p>
                )}
              </div>
            </div>
            {editMode && (
              <>
                <div className="flex justify-end gap-3 px-5 pb-5 border-t border-gray-100 pt-4">
                  <button onClick={handleCancelEdit} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
                  <button onClick={handleSaveProfile} disabled={saving} className="erp-btn-primary">
                    <Save size={16} /> {saving ? '保存中...' : '保存资料'}
                  </button>
                </div>
                {/* 修改密码 */}
                <div className="border-t border-gray-100">
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50">
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-900"><Lock size={16} className="text-gold-500" /> 修改密码</span>
                    <ChevronRight size={16} className={`text-gray-400 transition-transform ${showPassword ? 'rotate-90' : ''}`} />
                  </button>
                  {showPassword && (
                    <div className="px-5 pb-5 pt-2">
                      <p className="text-[11px] text-gray-400 mb-3">如忘记旧密码，请联系管理员重置密码。</p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-gray-500">旧密码</label>
                          <div className="relative">
                            <input type={showPwd.old ? 'text' : 'password'} value={passwordForm.oldPassword} onChange={e => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })} placeholder="输入旧密码" autoComplete="current-password" className="erp-input pr-8" />
                            <button type="button" onClick={() => togglePwd('old')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPwd.old ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-gray-500">新密码</label>
                          <div className="relative">
                            <input type={showPwd.new ? 'text' : 'password'} value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="至少6位" autoComplete="new-password" className="erp-input pr-8" />
                            <button type="button" onClick={() => togglePwd('new')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPwd.new ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-gray-500">确认新密码</label>
                          <div className="relative">
                            <input type={showPwd.confirm ? 'text' : 'password'} value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} placeholder="再次输入新密码" autoComplete="new-password" className="erp-input pr-8" />
                            <button type="button" onClick={() => togglePwd('confirm')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPwd.confirm ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end mt-4">
                        <button onClick={handleChangePassword} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800">
                          <Check size={16} /> 确认修改
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ---- 移动端 ---- */
        <div className="space-y-4">
          {/* 头像区域 */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col items-center">
            <div className="relative">
              <button
                type="button"
                onClick={openAvatarPreview}
                disabled={!displayAvatar}
                className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-md cursor-zoom-in"
              >
                {displayAvatar && !avatarLoadFailed ? (
                  <img key={avatarImgKey.current} src={displayAvatar} alt="头像" className="h-full w-full object-cover" onError={() => setAvatarLoadFailed(true)} />
                ) : (
                  <span className="text-3xl font-bold text-gray-300">{form.name?.[0] || 'U'}</span>
                )}
              </button>
              {editMode && (
                <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gold-500 text-white shadow-md hover:bg-gold-600">
                  <Camera size={14} />
                  <input type="file" className="hidden" accept="image/*" disabled={loadingAvatar} onChange={handleAvatarUpload} />
                </label>
              )}
            </div>
            <div className="mt-3 text-base font-bold text-gray-900">{form.name || '未设置'}</div>
            <div className="text-xs text-gray-400 font-mono">{form.account || '-'}</div>
          </div>

          {/* 基本信息 */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">姓名</label>
                {editMode ? (
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
                ) : (
                  <p className="text-sm text-gray-900">{form.name || '-'}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">手机号</label>
                {editMode ? (
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" placeholder="请输入手机号" />
                ) : (
                  <p className="text-sm text-gray-900">{form.phone || '-'}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">登录账号</label>
                <p className="text-sm text-gray-500 font-mono">{form.account || '-'}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">角色</label>
                <div className="flex flex-wrap gap-1">
                  {roles.map(role => {
                    const meta = roleLabels[role] || { label: role, cls: 'bg-gray-50 text-gray-700' };
                    return <span key={role} className={`text-xs px-2 py-0.5 rounded font-semibold ${meta.cls}`}>{meta.label}</span>;
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">入职时间</label>
                {editMode ? (
                  <ProfileDatePicker value={form.joinDate} onChange={v => setForm({ ...form, joinDate: v })} />
                ) : (
                  <p className="text-sm text-gray-900">{formatDate(form.joinDate)}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">已入职</label>
                <p className="text-sm text-gray-900">{days ? `${days} 天` : '-'}</p>
              </div>
            </div>
            {editMode && (
              <>
                <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
                  <button onClick={handleCancelEdit} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
                  <button onClick={handleSaveProfile} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
                    <Save size={14} /> {saving ? '保存中...' : '保存资料'}
                  </button>
                </div>
                {/* 修改密码 */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="w-full flex items-center justify-between text-left">
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-900"><Lock size={16} className="text-gold-500" /> 修改密码</span>
                    <ChevronRight size={16} className={`text-gray-400 transition-transform ${showPassword ? 'rotate-90' : ''}`} />
                  </button>
                  {showPassword && (
                    <div className="mt-3 space-y-3">
                      <p className="text-[11px] text-gray-400">如忘记旧密码，请联系管理员重置密码。</p>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-400">旧密码</label>
                        <div className="relative">
                          <input type={showPwd.old ? 'text' : 'password'} value={passwordForm.oldPassword} onChange={e => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })} placeholder="输入旧密码" autoComplete="current-password" className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
                          <button type="button" onClick={() => togglePwd('old')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPwd.old ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-400">新密码</label>
                        <div className="relative">
                          <input type={showPwd.new ? 'text' : 'password'} value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="至少6位" autoComplete="new-password" className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
                          <button type="button" onClick={() => togglePwd('new')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPwd.new ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-400">确认新密码</label>
                        <div className="relative">
                          <input type={showPwd.confirm ? 'text' : 'password'} value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} placeholder="再次输入新密码" autoComplete="new-password" className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
                          <button type="button" onClick={() => togglePwd('confirm')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPwd.confirm ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                        </div>
                      </div>
                      <button onClick={handleChangePassword} className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800">
                        <Check size={14} /> 确认修改
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isMiniProgramWebView() && (
        <div className="mt-4 px-1">
          <button
            type="button"
            onClick={handleOpenWechatNotifications}
            disabled={openingWechatNotifications}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Bell size={17} />
              </span>
              <span>
                <span className="block text-sm font-medium text-gray-800">{openingWechatNotifications ? '正在绑定微信...' : '微信通知设置'}</span>
                <span className="mt-0.5 block text-xs text-gray-400">接收与当前账号相关的业务提醒</span>
              </span>
            </span>
            <ChevronRight size={17} className="text-gray-400" />
          </button>
        </div>
      )}

      {/* 退出登录 */}
      <div className="mt-4 px-1">
        <button
          onClick={async () => {
            const ok = await showConfirm('确定要退出登录吗？', { confirmStyle: 'danger', confirmText: '退出', title: '退出登录' });
            if (ok) logout();
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-medium text-red-500 hover:bg-red-100 transition-colors"
        >
          <LogOut size={16} /> 退出登录
        </button>
      </div>

      {/* 头像预览 */}
      {avatarPreview && (
        <ImagePreviewModal
          images={[avatarPreview]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => setAvatarPreview(null)}
        />
      )}
    </div>
  );
}

// ========== ProfileDatePicker（桌面弹窗 + 移动端底部抽屉） ==========
function ProfileDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value.replace(/-/g, '/')) : new Date());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const openPicker = () => {
    setViewDate(value ? new Date(value.replace(/-/g, '/')) : new Date());
    setShowYearPicker(false);
    setShowMonthPicker(false);
    if (window.innerWidth < 768) { setMobileOpen(true); } else { setOpen(true); }
  };

  const selectDay = (day: number) => {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(d);
    setOpen(false);
    setMobileOpen(false);
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // 生成日历格子
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const renderCalendar = (compact = false) => (
    <div>
      {/* 年月导航 */}
      <div className={`flex items-center justify-between ${compact ? 'mb-2' : 'mb-2'}`}>
        <button type="button" onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronDown size={compact ? 14 : 16} className="rotate-90" /></button>
        <div className={`flex items-center gap-1 ${compact ? 'text-sm' : 'text-sm'} font-medium`}>
          <span className="cursor-pointer hover:text-gold-600 px-1" onClick={() => setShowYearPicker(!showYearPicker)}>{year}年</span>
          <span className="cursor-pointer hover:text-gold-600 px-1" onClick={() => setShowMonthPicker(!showMonthPicker)}>{month + 1}月</span>
        </div>
        <button type="button" onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={compact ? 14 : 16} /></button>
      </div>
      {/* 年份选择 */}
      {showYearPicker && (
        <div className={`mb-2 p-1 border border-gray-100 rounded-lg bg-white max-h-[140px] overflow-y-auto grid grid-cols-4 gap-1 ${compact ? '' : ''}`}>
          {Array.from({ length: 21 }, (_, i) => today.getFullYear() - 10 + i).map(y => (
            <button key={y} type="button" onClick={() => { setViewDate(new Date(y, month, 1)); setShowYearPicker(false); }}
              className={`text-xs py-1 rounded hover:bg-gray-100 ${y === year ? 'bg-gold-400 text-black font-bold' : ''}`}>{y}</button>
          ))}
        </div>
      )}
      {/* 月份选择 */}
      {showMonthPicker && (
        <div className="mb-2 p-1 border border-gray-100 rounded-lg bg-white grid grid-cols-4 gap-1">
          {MONTHS.map((m, i) => (
            <button key={m} type="button" onClick={() => { setViewDate(new Date(year, i, 1)); setShowMonthPicker(false); }}
              className={`text-xs py-1 rounded hover:bg-gray-100 ${i === month ? 'bg-gold-400 text-black font-bold' : ''}`}>{m}</button>
          ))}
        </div>
      )}
      {/* 星期头 */}
      <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
        {['日', '一', '二', '三', '四', '五', '六'].map(w => (
          <div key={w} className={`text-xs text-gray-400 ${compact ? 'py-0.5' : 'py-1'}`}>{w}</div>
        ))}
      </div>
      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {rows.map((row, ri) => (
          row.map((d, di) => {
            if (d === null) return <div key={`${ri}-${di}`} className={`${compact ? 'py-1' : 'py-1.5'}`} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = new Date(year, month, d).getTime() === today.getTime();
            const isSelected = value === dateStr;
            return (
              <button
                key={`${ri}-${di}`}
                type="button"
                onClick={() => selectDay(d)}
                className={`${compact ? 'py-1 text-xs' : 'py-1.5 text-xs'} rounded-full hover:bg-gray-100 transition-colors
                  ${isSelected ? 'bg-gold-400 text-black font-bold' : ''}
                  ${isToday && !isSelected ? 'font-bold text-gold-600' : 'text-gray-700'}
                `}
              >
                {d}
              </button>
            );
          })
        ))}
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={openPicker}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg bg-white px-3 py-2 text-xs transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gold-400">
        <span className={value ? 'text-gray-700' : 'text-gray-400'}>{value || '选择日期'}</span>
        <CalendarDays size={12} className="text-gray-400 shrink-0 ml-1" />
      </button>
      {/* 桌面端弹窗 */}
      {open && (
        <div className="hidden md:block absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 mt-1" style={{ width: 260 }}>
          {renderCalendar(false)}
        </div>
      )}
      {/* 移动端底部抽屉 */}
      <BottomDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} title="选择日期">
        {renderCalendar(true)}
      </BottomDrawer>
    </div>
  );
}
