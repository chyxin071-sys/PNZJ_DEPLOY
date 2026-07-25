import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/authStore';
import { hasRole } from '@/store/authStore';
import type { Role } from '@/store/authStore';
import { syncEmployeeName } from '@/db/sync';
import Select from '@/components/Select';
import { Trash2, Plus, X, Pencil, RefreshCw } from 'lucide-react';

const roleLabels: Record<Role, string> = {
  admin: '管理员',
  finance: '财务主管',
  sales: '销售',
  designer: '设计师',
  manager: '项目经理',
  employee: '普通员工',
};

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'finance', label: '财务主管' },
  { value: 'sales', label: '销售' },
  { value: 'designer', label: '设计师' },
  { value: 'manager', label: '项目经理' },
  { value: 'employee', label: '普通员工' },
];

const BIZ_OPTIONS = [
  { value: '家装', label: '家装' },
  { value: '工装', label: '工装' },
];

export default function UserManagement() {
  const { users, loadUsers, addUser, deleteUser, updateUser, resetPassword, user: currentUser } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<(typeof users)[0] | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('888888');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<Role>('employee');
  const [formBizTypes, setFormBizTypes] = useState<string[]>(['家装', '工装']);

  const [editUsername, setEditUsername] = useState('');
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<Role>('employee');
  const [editBizTypes, setEditBizTypes] = useState<string[]>(['家装', '工装']);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAdd = async () => {
    if (!formUsername.trim() || !formPassword.trim() || !formName.trim() || saving) return;
    setSaving(true);
    try {
      await addUser({
        username: formUsername.trim(),
        password: formPassword.trim(),
        name: formName.trim(),
        role: formRole,
        bizTypes: formBizTypes,
      });
      setShowModal(false);
      setFormUsername('');
      setFormPassword('888888');
      setFormName('');
      setFormRole('employee');
      setFormBizTypes(['家装', '工装']);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!delId || saving) return;
    setSaving(true);
    try {
      await deleteUser(delId);
      setDelId(null);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u: (typeof users)[0]) => {
    setEditingUser(u);
    setEditUsername(u.username);
    setEditName(u.name);
    setEditPassword('');
    setEditRole(u.role);
    setEditBizTypes(u.bizTypes || ['家装', '工装']);
  };

  const handleEditSave = async () => {
    if (!editingUser || !editUsername.trim() || !editName.trim() || saving) return;
    setSaving(true);
    try {
      const oldName = editingUser.name;
      const newName = editName.trim();
      const updates: { username: string; name: string; role: Role; bizTypes: string[]; password?: string } = {
        username: editUsername.trim(),
        name: newName,
        role: editRole,
        bizTypes: editBizTypes,
      };
      if (editPassword.trim()) {
        updates.password = editPassword.trim();
      }
      await updateUser(editingUser.id, updates);
      // 如果姓名变了，同步全系统所有数据
      if (oldName !== newName) {
        await syncEmployeeName(oldName, newName);
      }
      setEditingUser(null);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (u: (typeof users)[0]) => {
    if (!confirm(`确定要重置「${u.name}」的密码为 888888 吗？`)) return;
    await resetPassword(u.id);
    await loadUsers();
  };

  const toggleBizType = (type: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(type)) {
      if (current.length <= 1) return;
      setter(current.filter(t => t !== type));
    } else {
      setter([...current, type]);
    }
  };

  return (
    <div className="erp-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base md:text-lg font-bold text-gray-900">用户管理</h2>
          <p className="text-gold-500 text-xs md:text-sm mt-0.5">管理系统登录账号及角色权限</p>
        </div>
        <button onClick={() => setShowModal(true)} className="erp-btn-primary">
          <Plus size={15} />
          新增用户
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-100 overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">账号</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">姓名</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">角色</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">可见业务</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">创建时间</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-gray-700">{u.username}</td>
                <td className="px-4 py-3 text-gray-700">{u.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'admin' ? 'bg-amber-50 text-amber-700' :
                    u.role === 'finance' ? 'bg-blue-50 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {roleLabels[u.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {(u.bizTypes || ['家装', '工装']).map((bt) => (
                      <span key={bt} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {bt}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-CN') : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {hasRole(currentUser?.roles, 'admin', currentUser?.role) && (
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="text-gray-300 hover:text-amber-500 transition-colors"
                        title="重置密码"
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(u)}
                      className="erp-btn-secondary text-xs py-1 px-2.5"
                    >
                      <Pencil size={13} />
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        if (u.id === currentUser?.id) {
                          alert('不能删除自己的账号');
                          return;
                        }
                        setDelId(u.id);
                      }}
                      disabled={u.id === currentUser?.id}
                      className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title={u.id === currentUser?.id ? '不能删除自己' : '删除'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">暂无用户数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg border border-gray-100 w-full max-w-[400px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">新增用户</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">账号</label>
                <input
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="请输入登录账号"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">密码（默认 888888）</label>
                <input
                  type="text"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="默认密码 888888"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">姓名</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="请输入显示姓名"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">角色</label>
                <Select
                  value={formRole}
                  onChange={(v) => setFormRole(v as Role)}
                  options={ROLE_OPTIONS}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">可见业务</label>
                <div className="flex items-center gap-3">
                  {BIZ_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formBizTypes.includes(opt.value)}
                        onChange={() => toggleBizType(opt.value, formBizTypes, setFormBizTypes)}
                        className="w-4 h-4 text-gold-400 border-gray-300 rounded focus:ring-gold-400 focus:ring-1"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="erp-btn-secondary" disabled={saving}>取消</button>
              <button
                onClick={handleAdd}
                disabled={saving || !formUsername.trim() || !formPassword.trim() || !formName.trim()}
                className="erp-btn-primary"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit User Modal */}
      {editingUser && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-white rounded-lg border border-gray-100 w-full max-w-[400px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">编辑用户</h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">账号</label>
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="请输入登录账号"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">姓名</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="请输入显示姓名"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">密码（留空表示不修改）</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="留空则不修改密码"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">角色</label>
                <Select
                  value={editRole}
                  onChange={(v) => setEditRole(v as Role)}
                  options={ROLE_OPTIONS}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">可见业务</label>
                <div className="flex items-center gap-3">
                  {BIZ_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editBizTypes.includes(opt.value)}
                        onChange={() => toggleBizType(opt.value, editBizTypes, setEditBizTypes)}
                        className="w-4 h-4 text-gold-400 border-gray-300 rounded focus:ring-gold-400 focus:ring-1"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setEditingUser(null)} className="erp-btn-secondary" disabled={saving}>取消</button>
              <button
                onClick={handleEditSave}
                disabled={saving || !editName.trim()}
                className="erp-btn-primary"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirm Modal */}
      {delId && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDelId(null)}>
          <div className="bg-white rounded-lg border border-gray-100 w-full max-w-[340px] shadow-xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-xs text-gray-500 mb-5">删除后该用户将无法登录系统，确定要删除吗？</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => setDelId(null)} className="erp-btn-secondary" disabled={saving}>取消</button>
              <button onClick={handleDelete} disabled={saving} className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">{saving ? '删除中...' : '确认删除'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
