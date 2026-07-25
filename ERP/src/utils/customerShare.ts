import { openNativeMiniProgramRoute } from './miniProgramPreview';

export type CustomerShareParams = {
  id: string;
  title: string;
  desc?: string;
  imageUrl?: string;
  shareType?: string;
  majorIdx?: number | string;
  secIdx?: number | string;
  subIdx?: number | string;
  shareMajor?: number | string;
  shareSec?: number | string;
  shareSubs?: string;
  logId?: string;
  tab?: string;
  categories?: string;
};

const SHARE_BRIDGE_PAGE = '/pages/shareBridge/index';
const SHARE_ACCESS_PAGE = '/pages/shareAccessManage/index';

function getStaffContext() {
  if (typeof window === 'undefined') return {};
  const keys = ['pnzj_erp_user', 'userInfo', 'pnzj_user'];
  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const user = JSON.parse(raw);
      const role = user.role || user.accessRole;
      if (user?.name && role) {
        return {
          staffName: user.name,
          staffRole: role === 'staff' ? (user.role || 'employee') : role,
        };
      }
    } catch {
      // ignore malformed cache
    }
  }
  return {};
}

function toQuery(params: Record<string, unknown>) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export function buildProjectSharePath(params: CustomerShareParams) {
  const query = toQuery({
    id: params.id,
    shareType: params.shareType,
    majorIdx: params.majorIdx,
    secIdx: params.secIdx,
    subIdx: params.subIdx,
    shareMajor: params.shareMajor,
    shareSec: params.shareSec,
    shareSubs: params.shareSubs,
    logId: params.logId,
    tab: params.tab,
    categories: params.categories,
  });
  return `/pages/projectShare/index?${query}`;
}

export function buildShareBridgePath(params: CustomerShareParams) {
  return `${SHARE_BRIDGE_PAGE}?${toQuery({ ...params, ...getStaffContext() })}`;
}

export async function openCustomerShare(params: CustomerShareParams) {
  const bridgePath = buildShareBridgePath(params);
  if (openNativeMiniProgramRoute(bridgePath)) return true;

  const sharePath = buildProjectSharePath(params);
  try {
    await navigator.clipboard?.writeText(sharePath);
    alert('已复制小程序分享路径。请在微信小程序内打开 ERP 时使用原生分享卡片发送给客户。');
  } catch (e) {
    alert(`请手动复制分享路径：\n${sharePath}`);
  }
  return false;
}

export async function openShareAccessManage(projectId: string) {
  const route = `${SHARE_ACCESS_PAGE}?projectId=${encodeURIComponent(projectId)}`;
  if (openNativeMiniProgramRoute(route)) return true;

  try {
    await navigator.clipboard?.writeText(route);
    alert('已复制查看申请管理路径。请在微信小程序内打开 ERP 时进入原生审批页。');
  } catch (e) {
    alert(`请手动复制查看申请管理路径：\n${route}`);
  }
  return false;
}
