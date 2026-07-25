import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { X, ChevronDown, ChevronRight, Bell, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useDialogStore } from '@/store/dialogStore';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { useNotificationStore } from '@/store/notificationStore';
import { getErpVisibleNavGroups, getErpVisibleBottomItems, ERP_NAV_TOP_ITEM } from './navConfig';
import logoUrl from '@/assets/logo.png';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { showConfirm } = useDialogStore();
  const { currentBizType } = useBizStore();
  const { reimbursements } = useFinanceStore();
  const { unreadCount } = useNotificationStore();
  const role = user?.role || 'employee';
  const roles = user?.roles;
  const userBizTypes = user?.bizTypes;
  const groups = getErpVisibleNavGroups(role, currentBizType, userBizTypes as any, roles);
  const bottomItems = getErpVisibleBottomItems(role, roles, currentBizType);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const pendingReimbursements = reimbursements.filter(r => r.status === '待审核').length;

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    const ok = await showConfirm('确定要退出登录吗？', { confirmStyle: 'danger', confirmText: '退出', title: '退出登录' });
    if (ok) {
      onClose();
      logout();
    }
  };

  const userName = user?.name || '';

  const navContent = (
    <nav className="flex-1 overflow-auto scrollbar-hide pt-10 pb-2">
      <div className="lg:hidden flex justify-between items-center px-4 mb-1">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="品诺筑家" className="w-5 h-5 rounded" />
          <span className="text-white text-[13px] font-semibold">{userName}</span>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white/80">
          <X size={18} />
        </button>
      </div>

      {ERP_NAV_TOP_ITEM.roles.some(r => (roles && roles.length > 0 ? (roles as string[]).includes(r) : r === role)) && (!ERP_NAV_TOP_ITEM.bizTypes || ERP_NAV_TOP_ITEM.bizTypes.includes(currentBizType)) && (() => {
        const item = ERP_NAV_TOP_ITEM;
        const isActive = location.pathname === '/';
        const Icon = item.icon;
        return (
          <NavLink
            to={item.path}
            onClick={onClose}
            className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded text-[13px] transition-colors duration-150 ${
              isActive ? 'bg-white/8 text-white font-medium' : 'text-white/45 hover:text-white/80 hover:bg-white/4'
            }`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        );
      })()}

      {groups.map((group) => {
        const isCollapsed = collapsedGroups[group.group];
        return (
          <div key={group.group} className="mb-1">
            <button
              onClick={() => toggleGroup(group.group)}
              className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wider text-white/40 font-medium hover:text-white/60 w-full text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <group.icon size={12} className="shrink-0" />
                <span>{group.group}</span>
              </div>
              {isCollapsed ? <ChevronRight size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
            </button>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded text-[13px] transition-colors duration-150 ${
                        isActive
                          ? 'bg-white/8 text-white font-medium'
                          : 'text-white/45 hover:text-white/80 hover:bg-white/4'
                      }`}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.path === '/reimbursement' && (role === 'admin' || role === 'finance') && pendingReimbursements > 0 && (
                        <span className="shrink-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {pendingReimbursements > 99 ? '99+' : pendingReimbursements}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const bottomContent = (
    <div className="px-2 pb-3 pt-2 space-y-1">
      {bottomItems.map(item => {
        const isActive = item.path === '/notifications'
          ? location.pathname === '/notifications'
          : location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded text-[13px] transition-colors duration-150 ${
              isActive
                ? 'bg-white/8 text-white font-medium'
                : 'text-white/45 hover:text-white/80 hover:bg-white/4'
            }`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="truncate flex-1">{item.label}</span>
            {item.path === '/notifications' && unreadCount > 0 && (
              <span className="shrink-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
        );
      })}

      {/* 退出登录 */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-[13px] transition-colors duration-150 text-white/40 hover:text-red-400 hover:bg-white/4"
      >
        <LogOut size={16} className="shrink-0" />
        <span>退出登录</span>
      </button>

      <p className="px-1 pt-3 text-[10px] text-white/15">品诺筑家 v1.0</p>
    </div>
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className="w-[160px] hidden lg:flex flex-col bg-[#0f0f0f] h-full shrink-0 sticky top-0">
        {navContent}
        {bottomContent}
      </aside>

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-[160px] bg-[#0f0f0f] flex flex-col shrink-0 transition-transform duration-300 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
        {bottomContent}
      </aside>
    </>
  );
}
