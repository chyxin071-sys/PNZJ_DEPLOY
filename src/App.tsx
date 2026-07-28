import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useFinanceStore, type FinanceDataset } from '@/store/financeStore';
import { useAuthStore, menuPermissions, canViewFinancialData } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { initCloudBase } from '@/db/cloudbase';
import { installNativeImageUploadBridge } from '@/utils/nativeImageUploadBridge';
import logoUrl from '@/assets/logo.png';
import Layout from '@/components/Layout';
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

const LoginPage = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Contracts = lazy(() => import('@/pages/Contracts'));
const ContractDetail = lazy(() => import('@/pages/ContractDetail'));
const Income = lazy(() => import('@/pages/Income'));
const Expense = lazy(() => import('@/pages/Expense'));
const Receivable = lazy(() => import('@/pages/Receivable'));
const Payable = lazy(() => import('@/pages/Payable'));
const ProjectCost = lazy(() => import('@/pages/ProjectCost'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const CashFlow = lazy(() => import('@/pages/CashFlow'));
const Reimbursement = lazy(() => import('@/pages/Reimbursement'));
const Reports = lazy(() => import('@/pages/Reports'));
const Leads = lazy(() => import('@/pages/Leads'));
const LeadDetail = lazy(() => import('@/pages/LeadDetail'));
const SignedContracts = lazy(() => import('@/pages/SignedContracts'));
const Todos = lazy(() => import('@/pages/Todos'));
const ProjectsBiz = lazy(() => import('@/pages/ProjectsBiz'));
const ProjectBizDetail = lazy(() => import('@/pages/ProjectBizDetail'));
const ProjectShareAccess = lazy(() => import('@/pages/ProjectShareAccess'));
const TemplateLibrary = lazy(() => import('@/pages/TemplateLibrary'));
const QuotesBiz = lazy(() => import('@/pages/QuotesBiz'));
const QuoteBizDetail = lazy(() => import('@/pages/QuoteBizDetail'));
const QuotationBuilder = lazy(() => import('@/pages/QuotationBuilder'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const EmployeeManagement = lazy(() => import('@/pages/EmployeeManagement'));
const Materials = lazy(() => import('@/pages/Materials'));
const MaterialDetail = lazy(() => import('@/pages/MaterialDetail'));
const InventoryRecords = lazy(() => import('@/pages/InventoryRecords'));
const Profile = lazy(() => import('@/pages/Profile'));

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
  const { init, loadedDatasets } = useFinanceStore();
  const [financeError, setFinanceError] = useState<string | null>(null);
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
  const datasetsForPath = (): FinanceDataset[] => {
    const path = location.pathname;
    if (isContractDetail) return ['contracts', 'receipts', 'expenses', 'quotations'];
    if (path.startsWith('/income')) return ['contracts', 'receipts'];
    if (path.startsWith('/expense')) return ['contracts', 'expenses'];
    if (path.startsWith('/reimbursement')) return ['contracts', 'reimbursements'];
    if (path.startsWith('/quotes-biz') || path.startsWith('/quotation-builder')) return ['contracts', 'quotations'];
    if (path.startsWith('/cashflow')) return ['contracts', 'receipts', 'expenses', 'generalIncomes', 'generalExpenses', 'reimbursements'];
    if (path.startsWith('/reports')) return ['receipts', 'expenses', 'generalIncomes', 'generalExpenses', 'invoices'];
    if (path.startsWith('/projects')) return ['contracts', 'receipts', 'expenses'];
    if (path.startsWith('/receivable')) return ['contracts', 'receipts'];
    if (path.startsWith('/payable')) return ['contracts', 'expenses'];
    return ['contracts', 'receipts'];
  };
  const requiredDatasets = datasetsForPath();
  const isReady = requiredDatasets.every((dataset) => loadedDatasets.includes(dataset));

  useEffect(() => {
    if (!needsFinanceData || isReady) return;
    setFinanceError(null);
    withTimeout(init(requiredDatasets), '系统数据初始化超时，请重试')
      .catch((err) => setFinanceError(err.message || '数据初始化失败'));
  }, [init, isReady, location.pathname, needsFinanceData]);

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
                withTimeout(init(requiredDatasets), '系统数据初始化超时，请重试')
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
  const resetFinance = useFinanceStore((s) => s.reset);
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

  useEffect(() => {
    if (!isLoggedIn) resetFinance();
  }, [isLoggedIn, resetFinance]);

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
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 45_000);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [cloudReady, isLoggedIn, user?.id, loadNotifications]);

  useEffect(() => {
    if (!cloudReady || !isLoggedIn || !user?.id || !isWechatBridgeAvailable()) return;
    bindCurrentUserToWechat(user.id)
      .then(async (initialResult) => {
        let result = initialResult;
        if (result.code === 'WECHAT_MANUALLY_UNBOUND') {
          console.info('[wechat-binding] current WeChat was manually unbound; skip automatic rebind');
          return;
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
      <Suspense fallback={<LoadingScreen message="正在加载页面..." />}>
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
      </Suspense>
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
