import { useState, useRef, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, ChevronDown, HardHat, LayoutDashboard, ListTodo, LogOut, Menu, Users } from 'lucide-react';
import Sidebar from './Sidebar';
import { getErpDefaultPath } from './navConfig';
import { useAuthStore } from '@/store/authStore';
import { useDialogStore } from '@/store/dialogStore';
import { useNotificationStore } from '@/store/notificationStore';
import logoUrl from '@/assets/logo.png';
import { useBizStore } from '@/store/bizStore';
import { isMiniProgramWebView } from '@/utils/miniProgramPreview';
import { useSmartBack } from '@/hooks/useSmartBack';
import type { BizType } from '@/types';
import RouteErrorBoundary from './RouteErrorBoundary';

const roleLabel: Record<string, string> = {
  admin: '管理员',
  finance: '财务',
  employee: '员工',
};

const mobileTabs = [
  { path: '/', label: '首页', icon: LayoutDashboard },
  { path: '/leads', label: '客户', icon: Users },
  { path: '/projects-biz', label: '工地', icon: HardHat },
  { path: '/todos', label: '待办', icon: ListTodo },
  { path: '/notifications', label: '消息', icon: Bell },
];

const topLevelRoutes = new Set([
  '/',
  '/leads',
  '/signed-contracts',
  '/projects-biz',
  '/todos',
  '/notifications',
  '/contracts',
  '/materials',
  '/reimbursement',
  '/reports',
  '/expense',
  '/income',
  '/quotes-biz',
  '/employees',
  '/template-library',
]);

function getMobileRouteState(pathname: string) {
  if (pathname === '/') return { title: '品诺筑家整装', canBack: false, backPath: '', showBottomTab: true };
  if (pathname === '/leads') return { title: '客户', canBack: false, backPath: '', showBottomTab: true };
  if (pathname.startsWith('/leads/')) return { title: '客户详情', canBack: true, backPath: '/leads', showBottomTab: true };
  if (pathname === '/signed-contracts') return { title: '签单管理', canBack: false, backPath: '', showBottomTab: true };
  if (pathname === '/projects-biz') return { title: '工地', canBack: false, backPath: '', showBottomTab: true };
  if (pathname.startsWith('/projects-biz/')) return { title: '工地详情', canBack: true, backPath: '/projects-biz', showBottomTab: true };
  if (pathname === '/todos') return { title: '待办', canBack: false, backPath: '', showBottomTab: true };
  if (pathname === '/notifications') return { title: '消息', canBack: false, backPath: '', showBottomTab: true };
  if (pathname.startsWith('/contracts/')) return { title: '合同详情', canBack: true, backPath: '/contracts', showBottomTab: true };
  if (pathname.startsWith('/quotes-biz/')) return { title: '报价详情', canBack: true, backPath: '/quotes-biz', showBottomTab: true };
  if (pathname.startsWith('/quotation-builder/')) return { title: '报价单', canBack: true, backPath: '/quotes-biz', showBottomTab: false };

  const menuTitles: Record<string, string> = {
    '/signed-contracts': '签单管理',
    '/contracts': '合同',
    '/materials': '库存',
    '/reimbursement': '报销',
    '/reports': '报表',
    '/expense': '支出',
    '/income': '收入',
    '/quotes-biz': '报价',
    '/employees': '组织架构',
    '/template-library': '工地模板',
  };

  return {
    title: menuTitles[pathname] || '品诺筑家整装',
    canBack: !topLevelRoutes.has(pathname),
    backPath: '/',
    showBottomTab: true,
  };
}

function shouldHideMobileTabBar(pathname: string) {
  return [
    '/quotation-builder/',
  ].some((path) => pathname.startsWith(path));
}

function MobileTabBar() {
  const location = useLocation();
  const { currentBizType } = useBizStore();
  const { unreadCount } = useNotificationStore();
  const routeState = getMobileRouteState(location.pathname);

  if (shouldHideMobileTabBar(location.pathname) || !routeState.showBottomTab) return null;

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur mobile-safe-bottom">
      <div className="grid grid-cols-5 h-14">
        {mobileTabs.filter(item => currentBizType === '家装' || item.path !== '/notifications').map((item) => {
          const Icon = item.icon;
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname === item.path || location.pathname.startsWith(item.path + '/');

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-gold-600' : 'text-gray-400'
              }`}
            >
              <span className="relative">
                <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                {item.path === '/notifications' && unreadCount > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-[16px] h-[16px] rounded-full bg-red-500 px-1 text-[9px] font-bold leading-[16px] text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { showConfirm } = useDialogStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
  const { currentBizType, setBizType, bizTypes } = useBizStore();
  const mobileRouteState = useMemo(() => getMobileRouteState(location.pathname), [location.pathname]);
  const smartBack = useSmartBack(mobileRouteState.backPath || '/');

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const role = user?.role || 'employee';
  const userName = user?.name || '';
  const isEmbeddedWebView = useMemo(() => {
    return isMiniProgramWebView();
  }, [location.search]);
  const handleLogout = async () => {
    const ok = await showConfirm('确定要退出登录吗？', { confirmStyle: 'danger', confirmText: '退出', title: '退出登录' });
    if (ok) {
      setUserMenuOpen(false);
      logout();
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  const handleNotifClick = (notification: any) => {
    markAsRead(notification.id);
    setNotifOpen(false);
    const relatedId = notification.relatedTo?.id;
    let target = notification.link || '';
    if (target.startsWith('/erp/')) target = target.slice(4);
    if (!target && relatedId) {
      if (notification.relatedTo?.type === 'lead' || notification.relatedTo?.type === 'customer') target = `/leads/${relatedId}`;
      if (notification.relatedTo?.type === 'project') target = `/projects-biz/${relatedId}`;
      if (notification.relatedTo?.type === 'contract') target = `/contracts/${relatedId}`;
      if (notification.relatedTo?.type === 'todo') target = `/todos?todoId=${encodeURIComponent(relatedId)}`;
    }
    if (target && target !== '/notifications') navigate(target);
  };

  const handleBizTypeSwitch = (nextBizType: BizType) => {
    if (nextBizType === currentBizType) return;
    setBizType(nextBizType);
    const targetPath = getErpDefaultPath(role, nextBizType, bizTypes);
    navigate(targetPath);
  };

  const handleBackToPortal = () => {
    if (typeof window === 'undefined') return;
    const returnTo = window.sessionStorage.getItem('pnzj_finance_return_to') || '/';
    window.location.href = returnTo;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="h-screen flex bg-[#f5f6f8]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 w-full h-full overflow-hidden">
        {/* 黑色顶栏；小程序 web-view 模式下隐藏，入口统一收进首页「全部功能」。 */}
        {!isEmbeddedWebView && <header className="flex h-[42px] md:h-12 items-center justify-between shrink-0 bg-[#0f0f0f] z-[150]">
          <div className="flex items-center gap-1.5 min-w-0 pl-2 md:pl-4">
            {/* 手机端：汉堡菜单按钮 */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white/90 hover:bg-white/8 transition-colors shrink-0"
            >
              <Menu size={18} />
            </button>
            {/* 手机端非底部Tab页：返回按钮 */}
            {(() => {
              if (!mobileRouteState.showBottomTab && mobileRouteState.canBack) {
                return (
                  <button
                    onClick={() => smartBack()}
                    className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white/90 hover:bg-white/8 transition-colors shrink-0"
                  >
                    <ArrowLeft size={18} />
                  </button>
                );
              }
              return null;
            })()}
            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <img src={logoUrl} alt="品诺筑家" className="w-[22px] h-[22px] md:w-[25px] md:h-[25px] rounded shrink-0" />
              <span className="text-white text-[13px] md:text-[14px] font-semibold">品诺筑家</span>
            </div>
            <div className="w-px h-4 md:h-5 bg-white/10 hidden md:block" />
            <span className="text-white/45 text-[11px] md:text-[12px] hidden md:block">全链路管理系统</span>
          </div>

          {/* 桌面端右侧：业务类型切换、通知、用户菜单 */}
          <div className="hidden md:flex items-center gap-1 pr-3">
            {bizTypes.length > 1 && (
              <div className="flex items-center bg-white/8 rounded-lg mr-2">
                {bizTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleBizTypeSwitch(t)}
                    className={`text-[12px] px-3 py-1.5 rounded-lg font-medium transition-all ${
                      currentBizType === t
                        ? 'bg-gold-400 text-black'
                        : 'text-white/60 hover:text-white/90'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {currentBizType === '家装' && <div ref={notifRef} className="relative">
              <button
                onClick={() => { setNotifOpen(!notifOpen); setUserMenuOpen(false); }}
                className="relative w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white/90 hover:bg-white/8 transition-colors"
              >
                <Bell size={17} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-[14px] h-[14px] bg-red-500 rounded-full flex items-center justify-center text-[9px] text-white font-bold leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-100 z-[170]">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-800">消息通知</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-gold-500 hover:text-gold-600 font-medium"
                      >
                        全部已读
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-auto">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-gray-400 text-sm">暂无消息</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotifClick(n)}
                          className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                            !n.isRead ? 'bg-amber-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                n.isRead ? 'bg-gray-300' : 'bg-gold-400'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-gray-800 truncate">{n.title}</p>
                              <p className="text-[12px] text-gray-500 truncate mt-0.5">{n.content}</p>
                              <p className="text-[11px] text-gray-400 mt-1">{formatTime(n.createdAt)}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>}

            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifOpen(false); }}
                className="flex items-center gap-1.5 h-8 px-2 rounded-lg text-white/80 hover:text-white hover:bg-white/8 transition-colors"
              >
                <div className="w-[22px] h-[22px] rounded-full bg-gold-400 flex items-center justify-center shrink-0">
                  <span className="text-black font-bold text-[10px]">{userName.charAt(0) || 'U'}</span>
                </div>
                <span className="text-[12px] hidden sm:block max-w-[80px] truncate">{userName}</span>
                <ChevronDown size={13} className="hidden sm:block text-white/40" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-lg shadow-lg border border-gray-100 z-[170] py-1">
                  <div className="px-3 py-2 border-b border-gray-50">
                    <p className="text-[13px] font-medium text-gray-800 truncate">{userName}</p>
                    <p className="text-[11px] text-gray-400">{roleLabel[role]}</p>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={14} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>}

        <div data-scroll="main" className="flex-1 overflow-y-auto overflow-x-hidden pb-16 lg:pb-0">
          <RouteErrorBoundary key={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </div>
        <MobileTabBar />
      </main>
    </div>
  );
}

