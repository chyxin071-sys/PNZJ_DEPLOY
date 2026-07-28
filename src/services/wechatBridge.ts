import { cloudApp } from '@/db/cloudbase';
import { readCloudFunctionResult } from '@/utils/cloudFunctionResult';

const SESSION_STORAGE_KEY = 'pnzj:wechat-bridge-session';
const BOUND_USER_KEY = 'pnzj:wechat-bridge-bound-user';
const SUBSCRIPTION_NEEDED_KEY = 'pnzj:wechat-subscription-needed';

export type WechatBindingResult = {
  success: boolean;
  code?: string;
  message?: string;
  personId?: string;
  userIds?: string[];
  openidMasked?: string;
  previousOpenidMasked?: string;
  reboundFromOpenidMasked?: string;
  linkedAccounts?: WechatAccountSummary[];
  requestedAccount?: WechatAccountSummary | null;
  needsSubscriptionAuthorization?: boolean;
  templates?: Record<string, { status?: string }>;
};

export type WechatAccountSummary = {
  userId: string;
  name: string;
  account: string;
  role: string;
};

function accountLabel(account?: WechatAccountSummary | null) {
  if (!account) return '未能读取';
  const name = account.name || '未命名员工';
  return account.account && account.account !== name
    ? `${name}（登录账号：${account.account}）`
    : name;
}

export function buildWechatAccountLinkMessage(result: WechatBindingResult) {
  const linkedAccounts = result.linkedAccounts?.length
    ? result.linkedAccounts.map(accountLabel).join('、')
    : '历史关联记录存在，但原账号资料未能读取';

  return [
    `当前微信：${result.openidMasked || '当前打开小程序的微信'}`,
    `已关联ERP账号：${linkedAccounts}`,
    `本次登录ERP账号：${accountLabel(result.requestedAccount)}`,
    '',
    '仅当上述账号属于同一位员工时才确认关联；如果不是同一人，请取消。',
  ].join('\n');
}

export function buildWechatRebindMessage(result: WechatBindingResult) {
  return [
    `原接收微信：${result.previousOpenidMasked || '其他微信'}`,
    `当前打开微信：${result.openidMasked || '当前微信'}`,
    '',
    '确认迁移后，后续ERP订阅消息只发送到当前微信，原微信将立即停止接收。',
  ].join('\n');
}

function captureBridgeSessionFromUrl() {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get('wxBridgeSession') || '';
  if (sessionId) {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    url.searchParams.delete('wxBridgeSession');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return sessionId || window.sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
}

export function getWechatBridgeSession() {
  return captureBridgeSessionFromUrl();
}

export function needsWechatSubscriptionAuthorization(userId: string) {
  if (typeof window === 'undefined' || !userId) return true;
  return window.sessionStorage.getItem(`${SUBSCRIPTION_NEEDED_KEY}:${userId}`) !== '0';
}

export function isWechatBridgeAvailable() {
  return Boolean(getWechatBridgeSession());
}

export async function bindCurrentUserToWechat(
  userId: string,
  options: { confirmAccountLink?: boolean; confirmRebind?: boolean } = {},
): Promise<WechatBindingResult> {
  const sessionId = getWechatBridgeSession();
  if (!sessionId || !userId) return { success: false, code: 'BRIDGE_NOT_AVAILABLE' };

  const boundKey = `${sessionId}:${userId}`;

  const response = await cloudApp.callFunction({
    name: 'notificationService',
    parse: true,
    data: {
      action: 'bindBridgeSession',
      sessionId,
      userId,
      confirmAccountLink: Boolean(options.confirmAccountLink),
      confirmRebind: Boolean(options.confirmRebind),
    },
  });

  const result = readCloudFunctionResult<WechatBindingResult>(response)
    || { success: false, code: 'EMPTY_CLOUD_RESPONSE', message: '微信绑定服务未返回结果' };
  if (result.success) {
    window.sessionStorage.setItem(BOUND_USER_KEY, boundKey);
    if (typeof result.needsSubscriptionAuthorization === 'boolean') {
      window.sessionStorage.setItem(
        `${SUBSCRIPTION_NEEDED_KEY}:${userId}`,
        result.needsSubscriptionAuthorization ? '1' : '0',
      );
    }
  }
  return result;
}

captureBridgeSessionFromUrl();
