import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFinanceStore } from '@/store/financeStore';
import { useAuthStore, menuPermissions, canViewFinancialData } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { cloudDB, initCloudBase } from '@/db/cloudbase';
import { installNativeImageUploadBridge } from '@/utils/nativeImageUploadBridge';
import logoUrl from '@/assets/logo.png';
import Layout from '@/components/Layout';
import LoginPage from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Contracts from '@/pages/Contracts';
import ContractDetail from '@/pages/ContractDetail';
import Income from '@/pages/Income';
import Expense from '@/pages/Expense';
import Receivable from '@/pages/Receivable';
import Payable from '@/pages/Payable';
import ProjectCost from '@/pages/ProjectCost';
import ProjectDetail from '@/pages/ProjectDetail';
import CashFlow from '@/pages/CashFlow';
import Reimbursement from '@/pages/Reimbursement';
import Reports from '@/pages/Reports';
import Leads from '@/pages/Leads';
import LeadDetail from '@/pages/LeadDetail';
import SignedContracts from '@/pages/SignedContracts';
import Todos from '@/pages/Todos';
import ProjectsBiz from '@/pages/ProjectsBiz';
import ProjectBizDetail from '@/pages/ProjectBizDetail';
import ProjectShareAccess from '@/pages/ProjectShareAccess';
import TemplateLibrary from '@/pages/TemplateLibrary';
import QuotesBiz from '@/pages/QuotesBiz';
import QuoteBizDetail from '@/pages/QuoteBizDetail';
import QuotationBuilder from '@/pages/QuotationBuilder';
import Notifications from '@/pages/Notifications';
import EmployeeManagement from '@/pages/EmployeeManagement';
import Materials from '@/pages/Materials';
import MaterialDetail from '@/pages/MaterialDetail';
import InventoryRecords from '@/pages/InventoryRecords';
import Profile from '@/pages/Profile';
import GlobalDialog from '@/components/GlobalDialog';
import {
  bindCurrentUserToWechat,
  buildWechatAccountLinkMessage,
  buildWechatRebindMessage,
  isWechatBridgeAvailable,
  needsWechatSubscriptionAuthorization,
} from '@/services/wechatBridge';
import { useDialogStore } from '@/store/dialogStore';
import {
  hasOpenedWechatSubscriptionThisSession,
  openNativeSubscriptionSettings,
} from '@/utils/miniProgramPreview';
import { WECHAT_SUBSCRIPTION_NEEDED_EVENT } from '@/services/notificationService';

const INIT_TIMEOUT_MS = 25000;
const SUBSCRIPTION_LOGIN_PROMPT_KEY = 'pnzj:wechat-subscription-login-prompt';
const SUBSCRIPTION_OPERATION_PROMPT_KEY = 'pnzj:wechat-subscription-operation-prompt';

function withTimeout<T>(promise: Promise<T>, message: string, timeout = INIT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeout);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

function LoadingScreen({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 animate-pulse shadow-lg shadow-gold-400/10 border border-gold-100 overflow-hidden">
          <img src={logoUrl} alt="品诺筑家" className="w-9 h-9 object-contain" />
        </div>
        <p className="text-gray-400 text-sm">{message}</p>
      </div>
    </div>
  );
}

function RoleGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, user } = useAuthStore();
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  const allowedPaths = menuPermissions[user?.role || 'employee'];
  if (allowedPaths && location.pathname !== '/login') {
    const isContractDetail = /^\/contracts\/[^/]+$/.test(location.pathname);
    const isAllowed = isContractDetail || allowedPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
    if (!isAllowed) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}

function FinanceGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user } = useAuthStore();
  const { init, initialized, contracts } = useFinanceStore();
  const [financeError, setFinanceError] = useState<string | null>(null);
  const hasData = contracts.length > 0; // 内存中已有数据，视为已就绪
  const isReady = initialized || hasData;

  const isContractDetail = /^\/contracts\/[^/]+$/.test(location.pathname);
  const canViewFinance = canViewFinancialData(user?.roles, user?.role);

  const financePathMatched = [
    '/income',
    '/expense',
    '/receivable',
    '/payable',
    '/projects',
    '/cashflow',
    '/reimbursement',
    '/reports',
    '/quotes-biz',
    '/quotation-builder',
  ].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const needsFinanceData = (isContractDetail && canViewFinance) || (financePathMatched && !isContractDetail);

  useEffect(() => {
    if (!needsFinanceData || isReady) return;
    setFinanceError(null);
    withTimeout(init(), '系统数据初始化超时，请重试')
      .catch((err) => setFinanceError(err.message || '数据初始化失败'));
  }, [init, isReady, needsFinanceData]);

  if (!needsFinanceData) {
    return <>{children}</>;
  }

  if (!isReady) {
    if (financeError) {
      return (
        <div className="h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-3">{financeError}</p>
            <button
              onClick={() => {
                setFinanceError(null);
                withTimeout(init(), '系统数据初始化超时，请重试')
                  .catch((err) => setFinanceError(err.message || '数据初始化失败'));
              }}
              className="px-4 py-2 bg-gold-400 text-black rounded text-sm hover:bg-gold-500"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    // 不挡白屏：直接渲染页面，init 在后台执行，数据到了自动更新
    return <>{children}</>;
  }

  return <>{children}</>;
}

function AppInit() {
  const { isLoggedIn, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);
  const { showAlert, showConfirm } = useDialogStore();
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const subscriptionPromptBusy = useRef(false);

  const promptForWechatSubscription = useCallback(async (source: 'login' | 'operation') => {
    if (!cloudReady || !isLoggedIn || !user?.id || !isWechatBridgeAvailable()) return;
    if (!needsWechatSubscriptionAuthorization(user.id)) return;
    if (subscriptionPromptBusy.current || hasOpenedWechatSubscriptionThisSession()) return;

    const storageKey = source === 'login'
      ? `${SUBSCRIPTION_LOGIN_PROMPT_KEY}:${user.id}`
      : `${SUBSCRIPTION_OPERATION_PROMPT_KEY}:${user.id}`;
    if (window.sessionStorage.getItem(storageKey) === '1') return;

    window.sessionStorage.setItem(storageKey, '1');
    subscriptionPromptBusy.current = true;
    try {
      const confirmed = await showConfirm(
        source === 'login'
          ? '开启后，你可以在微信中收到与自己相关的项目进度、待办整改和客户查看工地申请提醒。'
          : '这项操作会产生业务通知。为了确保你也能收到与自己相关的后续提醒，是否现在补充微信授权？',
        {
          title: '开启微信通知',
          confirmText: '去授权',
          cancelText: source === 'login' ? '稍后' : '暂不',
        },
      );
      if (!confirmed) return;
      if (!openNativeSubscriptionSettings(user.id)) {
        window.sessionStorage.removeItem(storageKey);
        await showAlert('请在新版微信小程序内打开并授权微信通知。', { title: '无法打开微信通知' });
      }
    } finally {
      subscriptionPromptBusy.current = false;
    }
  }, [cloudReady, isLoggedIn, showAlert, showConfirm, user?.id]);

  useEffect(() => {
    document.title = '品诺筑家整装';
    let favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.type = 'image/png';
    favicon.href = `${logoUrl}?v=pnzj-20260531`;
  }, []);

  const connectCloud = () =>
    withTimeout(initCloudBase(), '数据库连接超时，请检查网络后重试')
      .then(() => setCloudReady(true));

  useEffect(() => {
    connectCloud()
      .catch((err) => setCloudError(err.message || 'CloudBase 初始化失败'));
  }, []);

  useEffect(() => installNativeImageUploadBridge(), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpRoute = params.get('mpRoute');
    if (!mpRoute || !isLoggedIn) return;

    const normalizedRoute = mpRoute.startsWith('/') ? mpRoute : `/${mpRoute}`;
    if (location.pathname !== normalizedRoute) {
      navigate(normalizedRoute, { replace: true });
    }
  }, [isLoggedIn, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!cloudReady || !isLoggedIn || !user?.id) return;

    let disposed = false;
    let refreshing = false;
    let refreshQueued = false;
    let watcher: { close?: () => void } | null = null;

    const refresh = async () => {
      if (disposed) return;
      if (refreshing) {
        refreshQueued = true;
        return;
      }
      refreshing = true;
      try {
        await loadNotifications(user.id);
      } catch (error) {
        console.warn('[notifications] refresh failed', error);
      } finally {
        refreshing = false;
        if (refreshQueued && !disposed) {
          refreshQueued = false;
          void refresh();
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const handleFocus = () => void refresh();

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 10000);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    try {
      watcher = (cloudDB.collection('notifications') as any).watch({
        onChange: () => void refresh(),
        onError: (error: unknown) => console.warn('[notifications] realtime listener unavailable, polling remains active', error),
      });
    } catch (error) {
      console.warn('[notifications] failed to start realtime listener, polling remains active', error);
    }

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      watcher?.close?.();
    };
  }, [cloudReady, isLoggedIn, user?.id, loadNotifications]);

  useEffect(() => {
    if (!cloudReady || !isLoggedIn || !user?.id || !isWechatBridgeAvailable()) return;
    bindCurrentUserToWechat(user.id)
      .then(async (initialResult) => {
        let result = initialResult;
        if (result.code === 'WECHAT_MANUALLY_UNBOUND') {
          const confirmed = await showConfirm(
            '当前微信尚未绑定此ERP账号。绑定后，业务通知才会发送到这个微信。',
            { title: '绑定当前微信', confirmText: '确认绑定', cancelText: '暂不绑定' },
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
          if (confirmed) {
            const linkedResult = await bindCurrentUserToWechat(user.id, { confirmAccountLink: true });
            if (!linkedResult.success) {
              console.warn('[wechat-binding]', linkedResult.code, linkedResult.message);
              return;
            }
            if (linkedResult.needsSubscriptionAuthorization !== false) {
              await promptForWechatSubscription('login');
            }
          }
          return;
        }
        if (!result.success && result.code !== 'BRIDGE_NOT_AVAILABLE') {
          console.warn('[wechat-binding]', result.code, result.message);
          return;
        }
        if (result.success && result.needsSubscriptionAuthorization !== false) {
          await promptForWechatSubscription('login');
        }
      })
      .catch((error) => console.error('[wechat-binding] failed', error));
  }, [cloudReady, isLoggedIn, promptForWechatSubscription, showConfirm, user?.id]);

  useEffect(() => {
    const handleSubscriptionNeeded = () => {
      void promptForWechatSubscription('operation');
    };
    window.addEventListener(WECHAT_SUBSCRIPTION_NEEDED_EVENT, handleSubscriptionNeeded);
    return () => window.removeEventListener(WECHAT_SUBSCRIPTION_NEEDED_EVENT, handleSubscriptionNeeded);
  }, [promptForWechatSubscription]);

  if (cloudError) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded bg-red-400 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-sm">!</span>
          </div>
          <p className="text-gray-600 text-sm mb-2">数据库连接失败</p>
          <p className="text-gray-400 text-xs">{cloudError}</p>
          <button
            onClick={() => {
              setCloudError(null);
              if (!cloudReady) {
                connectCloud().catch((err) => setCloudError(err.message || 'CloudBase 初始化失败'));
                return;
              }
              connectCloud().catch((err) => setCloudError(err.message || 'CloudBase 初始化失败'));
            }}
            className="mt-4 px-4 py-2 bg-gold-400 text-black rounded text-sm hover:bg-gold-500"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!cloudReady) {
    return <LoadingScreen message="正在连接数据库..." />;
  }

  return (
    <>
      <GlobalDialog />
      <Routes>
        <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route
        element={
          <RoleGuard>
            <FinanceGuard>
              <Layout />
            </FinanceGuard>
          </RoleGuard>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/contracts/:id" element={<ContractDetail />} />
        <Route path="/income" element={<Income />} />
        <Route path="/expense" element={<Expense />} />
        <Route path="/receivable" element={<Receivable />} />
        <Route path="/payable" element={<Payable />} />
        <Route path="/projects" element={<ProjectCost />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/cashflow" element={<CashFlow />} />
        <Route path="/reimbursement" element={<Reimbursement />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/leads/:id/:section" element={<LeadDetail />} />
        <Route path="/signed-contracts" element={<SignedContracts />} />
        <Route path="/todos" element={<Todos />} />
        <Route path="/projects-biz" element={<ProjectsBiz />} />
        <Route path="/projects-biz/:id/share-access" element={<ProjectShareAccess />} />
        <Route path="/projects-biz/:id" element={<ProjectBizDetail />} />
        <Route path="/projects-biz/:id/:section" element={<ProjectBizDetail />} />
        <Route path="/template-library" element={<TemplateLibrary />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/materials/:id" element={<MaterialDetail />} />
        <Route path="/inventory-records" element={<InventoryRecords />} />
        
        <Route path="/quotes-biz" element={<QuotesBiz />} />
        <Route path="/quotes-biz/:id" element={<QuoteBizDetail />} />
        <Route path="/quotation-builder/:sourceType/:sourceId/:quotationId" element={<QuotationBuilder />} />
        <Route path="/employees" element={<EmployeeManagement />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <Router basename="/erp">
      <AppInit />
    </Router>
  );
}
