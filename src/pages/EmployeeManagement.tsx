import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Users, Shield, CheckCircle2, XCircle,
  MoreVertical, Edit, Ban, KeyRound, Loader2, X, ChevronDown, ChevronRight, Clock, Briefcase, Calendar,
} from 'lucide-react';
import { getHighestRole, hasRole, normalizeRoles, useAuthStore, type Role } from '@/store/authStore';
import dayjs from 'dayjs';

const ROLE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  admin: { label: '管理员', color: 'text-purple-700', bg: 'bg-purple-50' },
  operations: { label: '运营', color: 'text-cyan-700', bg: 'bg-cyan-50' },
  sales: { label: '销售', color: 'text-blue-700', bg: 'bg-blue-50' },
  designer: { label: '设计师', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  manager: { label: '项目经理', color: 'text-amber-700', bg: 'bg-amber-50' },
  finance: { label: '财务', color: 'text-rose-700', bg: 'bg-rose-50' },
  employee: { label: '普通员工', color: 'text-gray-700', bg: 'bg-gray-50' },
};

const INIT_FORM = {
  name: '', account: '', phone: '', roles: ['sales'] as Role[],
  bizTypes: ['家装'] as string[], joinDate: '',
};

const employeeRoles = (employee: { roles?: Role[]; role?: Role }) => normalizeRoles(employee.roles, employee.role || 'employee');

export default function EmployeeManagement() {
  const navigate = useNavigate();
  const { user, users, loadUsers, addUser, updateUser, resetPassword } = useAuthStore();
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);
  const myId = user?.id || '';

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form, setForm] = useState(INIT_FORM);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    await loadUsers();
    setLoading(false);
  }, [loadUsers]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleOpenAdd = () => {
    setEditingUser(null);
    setForm(INIT_FORM);
    setShowAddModal(true);
  };

  const handleOpenEdit = (u: any) => {
    setEditingUser(u);
    setForm({
      name: u.name || '', account: u.account || u.username || '', phone: u.phone || '',
      roles: employeeRoles(u),
      bizTypes: (u.bizTypes && u.bizTypes.length > 0) ? u.bizTypes : (employeeRoles(u).some(role => role === 'admin' || role === 'finance') ? ['家装', '工装'] : ['家装']), joinDate: u.joinDate || '',
    });
    setShowAddModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.account) return;
    setSubmitting(true);
    try {
      if (editingUser) {
        const uid = editingUser._id || editingUser.id;
        const oldAccount = editingUser.account || editingUser.username || '';
        const oldRoles = employeeRoles(editingUser).slice().sort();
        const nextRoles = normalizeRoles(form.roles, 'employee');
        const roleChanged = oldRoles.join('|') !== nextRoles.slice().sort().join('|');
        const accountChanged = form.account !== oldAccount;

        await updateUser(uid, {
          name: form.name, account: form.account, username: form.account, phone: form.phone,
          role: getHighestRole(nextRoles), roles: nextRoles,
          bizTypes: form.bizTypes, joinDate: form.joinDate,
        });
        setShowAddModal(false);

        if (uid === myId) {
          alert('自己的账号信息已更新，请重新登录后生效');
          const { logout } = useAuthStore.getState();
          logout();
          navigate('/login', { replace: true });
        } else if (roleChanged || accountChanged) {
            alert(`已修改 ${form.name || editingUser.name} 的${roleChanged && accountChanged ? '角色和账号' : roleChanged ? '角色' : '账号'}，该员工需重新登录后生效。`);
        }
      } else {
        await addUser({
          username: form.account, account: form.account, phone: form.phone,
          password: '888888', passwordPlain: '888888', name: form.name,
          role: getHighestRole(form.roles), roles: form.roles,
          bizTypes: form.bizTypes, joinDate: form.joinDate,
          status: 'active', createdAt: new Date().toISOString(),
        });
        setShowAddModal(false);
      }
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setSubmitting(true);
    try {
      if (confirmAction.action === '停用') {
        await updateUser(confirmAction.id, { status: 'inactive' });
      } else if (confirmAction.action === '启用') {
        await updateUser(confirmAction.id, { status: 'active' });
      }
      setConfirmAction(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwdUser || !newPassword) return;
    setSubmitting(true);
    try {
      await updateUser(resetPwdUser.id, { password: newPassword, passwordPlain: newPassword });
      setResetPwdUser(null);
      setNewPassword('');
      if (resetPwdUser.id === myId) {
        alert('密码已修改，请使用新密码重新登录');
        const { logout } = useAuthStore.getState();
        logout();
      } else {
        alert('密码重置成功');
      }
    } catch (err: any) {
      alert(err.message || '重置失败');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = users.filter(u => {
    if (activeTab !== 'all' && !employeeRoles(u).includes(activeTab as Role)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!u.name?.toLowerCase().includes(q) && !u.account?.toLowerCase().includes(q) && !u.phone?.includes(q) && !u.username?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: users.length,
    operations: users.filter(u => employeeRoles(u).includes('operations')).length,
    sales: users.filter(u => employeeRoles(u).includes('sales')).length,
    designer: users.filter(u => employeeRoles(u).includes('designer')).length,
    manager: users.filter(u => employeeRoles(u).includes('manager')).length,
    admin: users.filter(u => employeeRoles(u).includes('admin')).length,
    finance: users.filter(u => employeeRoles(u).includes('finance')).length,
  };

  const STAT_CARDS = [
    { key: 'all', label: '全部', count: stats.total, color: 'text-gray-900', activeColor: 'bg-gray-900 text-white', border: 'border-gray-400' },
    { key: 'operations', label: '运营', count: stats.operations, color: 'text-cyan-600', activeColor: 'bg-cyan-500 text-white', border: 'border-cyan-400' },
    { key: 'sales', label: '销售', count: stats.sales, color: 'text-blue-600', activeColor: 'bg-blue-500 text-white', border: 'border-blue-400' },
    { key: 'designer', label: '设计', count: stats.designer, color: 'text-emerald-600', activeColor: 'bg-emerald-500 text-white', border: 'border-emerald-400' },
    { key: 'manager', label: '工程', count: stats.manager, color: 'text-amber-600', activeColor: 'bg-amber-500 text-white', border: 'border-amber-400' },
    { key: 'admin', label: '管理', count: stats.admin, color: 'text-purple-600', activeColor: 'bg-purple-500 text-white', border: 'border-purple-400' },
    { key: 'finance', label: '财务', count: stats.finance, color: 'text-rose-600', activeColor: 'bg-rose-500 text-white', border: 'border-rose-400' },
  ];

  if (!isAdmin) {
    return (
      <div className="erp-page">
        <div className="mb-6">
          <h1 className="text-base md:text-lg font-bold text-gray-900">公司成员</h1>
          <p className="mt-1 text-gold-500 text-xs md:text-sm">查看团队成员信息</p>
        </div>
        <div className="space-y-4">
          {['admin', 'operations', 'sales', 'designer', 'manager', 'finance'].map(role => {
            const members = users.filter(u => employeeRoles(u).includes(role as Role) && u.status !== 'inactive');
            if (members.length === 0) return null;
            return (
              <div key={role} className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${ROLE_MAP[role]?.bg} ${ROLE_MAP[role]?.color} border-current/20`}>
                    {ROLE_MAP[role]?.label}
                  </span>
                  <span className="text-xs text-gray-400">{members.length} 人</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 divide-gray-50">
                  {members.map(emp => (
                    <div key={emp.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-900 font-bold text-sm shrink-0">
                        {emp.name?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {emp.name}
                          {emp.id === myId && <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-900 text-white">我</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{emp.phone || '暂无电话'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const daysWorked = (joinDate: string) => {
    if (!joinDate) return '-';
    const d = dayjs(joinDate);
    return d.isValid() ? dayjs().diff(d, 'day') : '-';
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">用户管理</h1>
          <p className="erp-page-subtitle">管理员工账号与系统权限</p>
        </div>
        <button onClick={handleOpenAdd} className="erp-btn-primary">
          <Plus size={16} /> 添加员工
        </button>
      </div>

      {/* 统计卡片：点击即可筛选 */}
      {isMobile ? (
        <div className="flex overflow-x-auto gap-2 mb-4 scrollbar-hide -mx-2 px-2">
          {STAT_CARDS.map(card => {
            const isActive = activeTab === card.key;
            return (
              <button key={card.key} type="button"
                onClick={() => { setActiveTab(isActive && activeTab !== 'all' ? 'all' : card.key); setExpandedId(null); }}
                className={`flex-shrink-0 w-[calc((100%-16px)/3)] rounded-xl p-3 border-2 text-left transition-all ${isActive ? `bg-white ${card.border}` : 'border-transparent bg-white'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] ${isActive ? card.color : 'text-gray-400'}`}>{card.label}</span>
                </div>
                <p className={`text-xl font-bold ${isActive ? card.color : 'text-gray-900'}`}>{card.count}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3 mb-6">
          {STAT_CARDS.map(card => {
            const isActive = activeTab === card.key;
            const activeBg = card.key === 'all' ? 'bg-gray-900' : card.activeColor.split(' ')[0];
            return (
              <button key={card.key} type="button"
                onClick={() => { setActiveTab(isActive && activeTab !== 'all' ? 'all' : card.key); setExpandedId(null); }}
                className={`rounded-xl p-4 border-2 text-left transition-all cursor-pointer ${isActive ? `${activeBg} text-white ${card.border}` : 'bg-white border-transparent hover:bg-gray-50'}`}>
                <p className="text-xs mb-1 opacity-80">{card.label}</p>
                <p className="text-2xl font-bold">{card.count}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* 筛选与搜索 */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索员工姓名 / 账号 / 手机号"
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 员工列表：桌面端表格 / 移动端卡片 */}
      {isMobile ? (
        <div className="space-y-2">
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-sm"><Loader2 size={16} className="animate-spin mx-auto mb-2" />加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">没有找到匹配的员工</div>
          ) : filtered.map(emp => {
            const isExpanded = expandedId === emp.id;
            return (
              <div key={emp.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {/* 卡片头部 */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 font-bold text-sm shrink-0">
                    {emp.name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                      {emp.name || '未知'}
                      {emp.id === myId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-900 text-white">我</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {employeeRoles(emp).map(role => (
                        <span key={role} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${ROLE_MAP[role]?.bg} ${ROLE_MAP[role]?.color}`}>
                          {ROLE_MAP[role]?.label || role}
                        </span>
                      ))}
                      {emp.status === 'inactive' ? (
                        <span className="inline-flex items-center text-[10px] text-rose-500"><XCircle size={11} className="mr-0.5" />已停用</span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] text-emerald-600"><CheckCircle2 size={11} className="mr-0.5" />在职</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className={`text-gray-300 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-400">登录账号</span>
                        <p className="text-gray-900 font-mono mt-0.5">{emp.account || emp.username || '-'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">手机号</span>
                        <p className="text-gray-900 mt-0.5">{emp.phone || '-'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">入职时间</span>
                        <p className="text-gray-900 mt-0.5 flex items-center gap-1">
                          <Calendar size={11} className="text-gray-400" />
                          {emp.joinDate ? dayjs(emp.joinDate).format('YYYY/MM/DD') : '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">在职天数</span>
                        <p className="text-gray-900 mt-0.5 flex items-center gap-1">
                          <Clock size={11} className="text-gray-400" />
                          {daysWorked(emp.joinDate)} 天
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-400">业务范围</span>
                      <div className="flex gap-1.5 mt-1">
                        {(emp.bizTypes || ['家装']).map((b: string) => (
                          <span key={b} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{b}</span>
                        ))}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-50">
                      <button onClick={() => { handleOpenEdit(emp); setExpandedId(null); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                        <Edit size={12} /> 编辑
                      </button>
                      <button onClick={() => { setResetPwdUser({ id: emp.id, name: emp.name }); setExpandedId(null); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                        <KeyRound size={12} /> 重置密码
                      </button>
                      {emp.id !== myId && (
                          <button onClick={() => { setConfirmAction({ id: emp.id, action: emp.status === 'active' ? '停用' : '启用' }); setExpandedId(null); }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50">
                            <Ban size={12} /> {emp.status === 'active' ? '停用' : '启用'}
                          </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* 桌面端表格 */
        <div className="bg-white rounded-xl border border-gray-100 overflow-visible">
          <div className="overflow-visible">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                  <th className="py-3 px-4 font-medium">员工</th>
                  <th className="py-3 px-4 font-medium">手机号</th>
                  <th className="py-3 px-4 font-medium">业务范围</th>
                  <th className="py-3 px-4 font-medium">角色</th>
                  <th className="py-3 px-4 font-medium">入职时间</th>
                  <th className="py-3 px-4 font-medium">状态</th>
                  <th className="py-3 px-4 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm"><Loader2 size={16} className="animate-spin mx-auto mb-2 text-gray-400" />加载中...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">没有找到匹配的员工</td></tr>
                ) : filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 font-bold text-xs shrink-0">
                          {emp.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                            {emp.name || '未知'}
                            {emp.id === myId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-900 text-white">我</span>}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">{emp.account || emp.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm font-mono text-gray-700">{emp.phone || '-'}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1.5">
                        {(emp.bizTypes || ['家装']).map((b: string) => (
                          <span key={b} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{b}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {employeeRoles(emp).map(role => (
                          <span key={role} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${ROLE_MAP[role]?.bg} ${ROLE_MAP[role]?.color}`}>
                            <Shield size={10} className="mr-1" />
                            {ROLE_MAP[role]?.label || role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString('zh-CN') : '-'}</td>
                    <td className="py-3 px-4">
                      {emp.status === 'inactive' ? (
                        <span className="inline-flex items-center text-xs text-rose-500"><XCircle size={13} className="mr-1" />已停用</span>
                      ) : (
                        <span className="inline-flex items-center text-xs text-emerald-600"><CheckCircle2 size={13} className="mr-1" />在职</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <UserActionMenu emp={emp} myId={myId} onEdit={handleOpenEdit} onToggleStatus={(id: string, status: string) => setConfirmAction({ id, action: status === 'active' ? '停用' : '启用' })} onResetPwd={(id: string, name: string) => setResetPwdUser({ id, name })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <h2 className="text-lg font-bold mb-4">{editingUser ? '编辑员工' : '添加员工'}</h2>
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="text-xs text-gray-500 mb-1 block">姓名 *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" required /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">登录账号 *</label><input value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" required />{!editingUser && <p className="text-xs text-gray-400 mt-1">默认初始密码: 888888</p>}</div>
            <div><label className="text-xs text-gray-500 mb-1 block">手机号</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">角色（可多选）</label>
              <div className="relative">
                <button type="button" onClick={() => setShowRoleDropdown(!showRoleDropdown)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-left flex items-center justify-between">
                  <span className="flex flex-wrap gap-1">
                    {form.roles.map(role => (
                      <span key={role} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${ROLE_MAP[role]?.bg} ${ROLE_MAP[role]?.color}`}>{ROLE_MAP[role]?.label}</span>
                    ))}
                  </span>
                  <ChevronDown size={14} className="text-gray-400" />
                </button>
                {showRoleDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-30">
                    {Object.entries(ROLE_MAP).filter(([key]) => key !== 'employee').map(([key, role]) => (
                      <button key={key} type="button" onClick={() => {
                        const typedRole = key as Role;
                        const selected = form.roles.includes(typedRole);
                        if (selected && form.roles.length === 1) return;
                        setForm({ ...form, roles: selected ? form.roles.filter(item => item !== typedRole) : [...form.roles, typedRole] });
                      }}
                        className="w-full px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${role.bg} ${role.color}`}>{role.label}</span>
                        {form.roles.includes(key as Role) && <CheckCircle2 size={15} className="text-emerald-600" />}
                      </button>
                    ))}
                    <div className="px-3 pt-1 pb-2 text-[11px] text-gray-400">权限按所选角色合并；系统同时保留最高权限角色兼容原有功能。</div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">业务范围</label>
              <div className="flex gap-2">
                {['家装', '工装'].map(biz => (
                  <button key={biz} type="button" onClick={() => setForm({ ...form, bizTypes: form.bizTypes.includes(biz) ? form.bizTypes.filter(b => b !== biz) : [...form.bizTypes, biz] })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.bizTypes.includes(biz) ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-500'}`}>{biz}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">入职时间</label>
              <CustomDatePicker value={form.joinDate} onChange={v => setForm({ ...form, joinDate: v })} placeholder="选择入职日期" />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">{submitting ? '保存中...' : '保存'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* 确认弹窗 */}
      {confirmAction && (
        <Modal onClose={() => setConfirmAction(null)}>
          <h2 className="text-lg font-bold mb-2">
            确认{confirmAction.action}？
          </h2>
          <p className="text-sm text-gray-500 mb-2">
            {confirmAction.action === '停用'
              ? '停用后该员工将无法登录系统，但数据仍然保留。'
              : '启用后该员工可以重新登录系统。'}
          </p>
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4">
            此操作将立即生效。
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmAction(null)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50" disabled={submitting}>取消</button>
            <button onClick={handleConfirmAction} disabled={submitting}
              className="flex-1 px-4 py-2 text-sm text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {submitting ? '处理中...' : '确定'}
            </button>
          </div>
        </Modal>
      )}

      {/* 重置密码弹窗 */}
      {resetPwdUser && (
        <Modal onClose={() => { setResetPwdUser(null); setNewPassword(''); }}>
          <h2 className="text-lg font-bold mb-2">重置密码</h2>
          <p className="text-sm text-gray-500 mb-4">为 <span className="font-bold text-gray-900">{resetPwdUser.name}</span> 设置新密码</p>
          <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="请输入新密码" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-gray-900/10" autoFocus />
          <div className="flex gap-3">
            <button onClick={() => { setResetPwdUser(null); setNewPassword(''); }} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50" disabled={submitting}>取消</button>
            <button onClick={handleResetPassword} disabled={submitting || !newPassword} className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">{submitting ? '处理中...' : '确认修改'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function UserActionMenu({ emp, myId, onEdit, onToggleStatus, onResetPwd }: any) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><MoreVertical size={14} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20">
            <button onClick={() => { onEdit(emp); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"><Edit size={12} />编辑</button>
            <button onClick={() => { onResetPwd(emp.id, emp.name); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 border-t border-gray-50"><KeyRound size={12} />重置密码</button>
            {emp.id !== myId && (
                <button onClick={() => { onToggleStatus(emp.id, emp.status); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 text-amber-700 flex items-center gap-2 border-t border-gray-50"><Ban size={12} />{emp.status === 'active' ? '停用' : '启用'}</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-auto p-5" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function CustomDatePicker({ value, onChange, placeholder = '选择日期' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(value ? new Date(value).getFullYear() : new Date().getFullYear());
  const [month, setMonth] = useState(value ? new Date(value).getMonth() : new Date().getMonth());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectDate = (day: number) => {
    const y = String(year);
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-gray-900/10">
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || placeholder}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3" style={{ width: 260 }}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setMonth(m => m <= 0 ? (setYear(y => y - 1), 11) : m - 1)} className="p-1 hover:bg-gray-100 rounded">‹</button>
            <span className="text-sm font-medium text-gray-700">{year}年 {monthNames[month]}</span>
            <button type="button" onClick={() => setMonth(m => m >= 11 ? (setYear(y => y + 1), 0) : m + 1)} className="p-1 hover:bg-gray-100 rounded">›</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {dayNames.map((d, i) => <div key={i} className="text-center text-[10px] text-gray-400 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => d === null ? (
              <div key={i} />
            ) : (
              <button key={i} type="button" onClick={() => selectDate(d)}
                className={`h-7 rounded-full text-xs flex items-center justify-center transition-colors ${
                  value === `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    ? 'bg-gray-900 text-white'
                    : today.getFullYear() === year && today.getMonth() === month && today.getDate() === d
                    ? 'bg-gold-50 text-gold-600 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}>
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { const now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth()); selectDate(now.getDate()); }}
              className="flex-1 text-center text-xs text-gold-500 hover:bg-gold-50 py-1 rounded transition-colors">今天</button>
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}
              className="flex-1 text-center text-xs text-gray-400 hover:bg-gray-50 py-1 rounded transition-colors">清除</button>
          </div>
        </div>
      )}
    </div>
  );
}
