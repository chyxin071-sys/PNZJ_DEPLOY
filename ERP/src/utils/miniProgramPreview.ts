export type NativePreviewItem = {
  url: string;
  type?: 'image' | 'video';
  poster?: string;
};

type MiniProgramBridge = {
  navigateTo: (options: {
    url: string;
    fail?: (error: unknown) => void;
  }) => void;
  postMessage?: (options: { data: unknown }) => void;
  reLaunch?: (options: {
    url: string;
    fail?: (error: unknown) => void;
  }) => void;
};

declare global {
  interface Window {
    wx?: {
      miniProgram?: MiniProgramBridge;
    };
  }
}

const PREVIEW_PAGE = '/pages/native-media-preview/index';
const FILE_PAGE = '/pages/native-file/index';
const SUBSCRIPTION_PAGE = '/pages/subscribe/subscribe';
const MAX_ROUTE_LENGTH = 7000;
const MAX_PREVIEW_ITEMS = 20;
const MINI_PROGRAM_SESSION_KEY = 'pnzj:mini-program-webview';
const SUBSCRIPTION_OPENED_SESSION_KEY = 'pnzj:wechat-subscription-opened';

function hasMiniProgramQuery() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('embed') === '1' || params.get('from') === 'mp';
}

export function captureMiniProgramContext() {
  if (typeof window === 'undefined') return false;
  if (hasMiniProgramQuery()) {
    window.sessionStorage.setItem(MINI_PROGRAM_SESSION_KEY, '1');
    return true;
  }
  return window.sessionStorage.getItem(MINI_PROGRAM_SESSION_KEY) === '1';
}

export function isMiniProgramWebView() {
  return captureMiniProgramContext();
}

export function hasOpenedWechatSubscriptionThisSession() {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(SUBSCRIPTION_OPENED_SESSION_KEY) === '1';
}

captureMiniProgramContext();

export function openNativeMiniProgramRoute(route: string) {
  if (!isMiniProgramWebView()) return false;

  const bridge = window.wx?.miniProgram;
  if (!bridge?.navigateTo || !route.startsWith('/')) return false;
  if (route.length > MAX_ROUTE_LENGTH) return false;

  bridge.navigateTo({
    url: route,
    fail: (error) => console.warn('[mini-program-route] navigateTo failed', error),
  });
  return true;
}

function buildRoute(items: NativePreviewItem[], currentIndex: number) {
  const payload = encodeURIComponent(JSON.stringify({
    items,
    currentIndex: Math.max(0, Math.min(currentIndex, items.length - 1)),
  }));
  return `${PREVIEW_PAGE}?payload=${payload}`;
}

export function openNativeMediaPreview(
  inputItems: NativePreviewItem[],
  currentIndex = 0,
) {
  if (!isMiniProgramWebView()) return false;

  const bridge = window.wx?.miniProgram;
  if (!bridge?.navigateTo) return false;

  const validItems = inputItems
    .filter((item) => /^(https?:\/\/|cloud:\/\/)/i.test(item.url))
    .map((item) => ({
      url: item.url,
      type: item.type === 'video' ? 'video' as const : 'image' as const,
      ...(item.poster ? { poster: item.poster } : {}),
    }));

  if (validItems.length === 0) return false;

  const selectedUrl = inputItems[currentIndex]?.url;
  let nativeIndex = Math.max(0, validItems.findIndex((item) => item.url === selectedUrl));
  let items = validItems.slice(0, MAX_PREVIEW_ITEMS);
  nativeIndex = Math.min(nativeIndex, items.length - 1);

  let route = buildRoute(items, nativeIndex);
  if (route.length > MAX_ROUTE_LENGTH) {
    const current = validItems[nativeIndex] || validItems[0];
    items = [current];
    nativeIndex = 0;
    route = buildRoute(items, nativeIndex);
  }

  bridge.navigateTo({
    url: route,
    fail: (error) => console.warn('[mini-program-preview] navigateTo failed', error),
  });
  return true;
}

export function openNativeFile(
  url: string,
  name: string,
  action: 'open' | 'download' = 'open',
) {
  if (!isMiniProgramWebView() || !/^https?:\/\//i.test(url)) return false;

  const bridge = window.wx?.miniProgram;
  if (!bridge?.navigateTo) return false;

  const payload = encodeURIComponent(JSON.stringify({ url, name, action }));
  const route = `${FILE_PAGE}?payload=${payload}`;
  if (route.length > MAX_ROUTE_LENGTH) return false;

  bridge.navigateTo({
    url: route,
    fail: (error) => console.warn('[mini-program-file] navigateTo failed', error),
  });
  return true;
}

export function openNativeSubscriptionSettings(currentUserId = '') {
  if (!isMiniProgramWebView()) return false;
  const bridge = window.wx?.miniProgram;
  if (!bridge?.navigateTo) return false;
  window.sessionStorage.setItem(SUBSCRIPTION_OPENED_SESSION_KEY, '1');
  const route = currentUserId
    ? `${SUBSCRIPTION_PAGE}?currentUserId=${encodeURIComponent(currentUserId)}`
    : SUBSCRIPTION_PAGE;
  bridge.navigateTo({
    url: route,
    fail: (error) => {
      window.sessionStorage.removeItem(SUBSCRIPTION_OPENED_SESSION_KEY);
      console.warn('[mini-program-subscription] navigateTo failed', error);
    },
  });
  return true;
}

export function notifyMiniProgramAuthState(
  loggedIn: boolean,
  user?: { id?: string; name?: string; role?: string } | null,
) {
  if (!isMiniProgramWebView()) return false;
  const bridge = window.wx?.miniProgram;
  if (!bridge?.postMessage) return false;
  bridge.postMessage({
    data: {
      type: 'pnzj-erp-auth',
      loggedIn,
      user: user || null,
    },
  });
  return true;
}

export function returnToMiniProgramAfterLogout() {
  if (!isMiniProgramWebView()) return false;
  const bridge = window.wx?.miniProgram;
  notifyMiniProgramAuthState(false);
  if (!bridge?.reLaunch) return false;
  bridge.reLaunch({
    url: '/pages/index/index?erpLoggedOut=1',
    fail: (error) => console.warn('[mini-program-auth] return after logout failed', error),
  });
  return true;
}
