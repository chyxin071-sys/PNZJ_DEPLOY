import cloudbase from '@cloudbase/js-sdk';
import { cachedCloudQuery, invalidateCollectionCache, pruneQueryCache } from './queryCache';

const ENV_ID = 'cloud1-8grodf5s3006f004';

const app = cloudbase.init({ env: ENV_ID });

export const cloudApp = app;
export const cloudAuth = app.auth();
const rawCloudDB = app.database();

type QueryStep = { method: string; args: unknown[] };

function wrapCloudQuery(target: any, collectionName: string, steps: QueryStep[] = []): any {
  return new Proxy(target, {
    get(queryTarget, property, receiver) {
      if (property === 'get' || property === 'count') {
        return (...args: unknown[]) => cachedCloudQuery(
          collectionName,
          [...steps, { method: String(property), args }],
          () => queryTarget[property](...args),
        );
      }

      if (property === 'add') {
        return async (...args: unknown[]) => {
          const result = await queryTarget.add(...args);
          void invalidateCollectionCache(collectionName);
          return result;
        };
      }

      if (property === 'doc') {
        return (...args: unknown[]) => wrapCloudQuery(
          queryTarget.doc(...args),
          collectionName,
          [...steps, { method: 'doc', args }],
        );
      }

      if (property === 'set' || property === 'update' || property === 'remove') {
        return async (...args: unknown[]) => {
          const result = await queryTarget[property](...args);
          void invalidateCollectionCache(collectionName);
          return result;
        };
      }

      if (['where', 'orderBy', 'skip', 'limit', 'field'].includes(String(property))) {
        return (...args: unknown[]) => wrapCloudQuery(
          queryTarget[property](...args),
          collectionName,
          [...steps, { method: String(property), args }],
        );
      }

      const value = Reflect.get(queryTarget, property, receiver);
      return typeof value === 'function' ? value.bind(queryTarget) : value;
    },
  });
}

export const cloudDB = new Proxy(rawCloudDB as any, {
  get(target, property, receiver) {
    if (property === 'collection') {
      return (name: string) => wrapCloudQuery(target.collection(name), name);
    }
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as typeof rawCloudDB;

let initialized = false;

// 初始化 CloudBase
export async function initCloudBase() {
  if (initialized) return;
  try {
    await cloudAuth.signInAnonymously();
  } catch (err: any) {
    // 如果匿名登录失败，尝试获取已有的登录状态
    const loginState = await cloudAuth.getLoginState();
    if (!loginState) {
      throw new Error(`CloudBase 认证失败: ${err.message || err}`);
    }
  }
  initialized = true;
  void pruneQueryCache();
}

// 集合名称（加 erp_ 前缀，避免和小程序数据冲突）
export const COLLECTIONS = {
  contracts: 'erp_contracts',
  receipts: 'erp_receipts',
  expenses: 'erp_expenses',
  invoices: 'erp_invoices',
  reimbursements: 'erp_reimbursements',
  generalIncomes: 'erp_generalIncomes',
  generalExpenses: 'erp_generalExpenses',
  users: 'users',
  notifications: 'erp_notifications',
  quotations: 'erp_quotations',
  leads: 'leads',
  projects: 'projects',
  todos: 'todos',
  followUps: 'followUps',
  quotes: 'quotes',
  materials: 'materials',
  inventory_records: 'inventory_records',
  projectLogs: 'project_logs',
  projectInspections: 'project_inspections',
  system_configs: 'system_configs',
} as const;

// 确保所有集合存在（写入一条测试数据触发自动建表，再删除）
export async function ensureCollections() {
  const names = Object.values(COLLECTIONS);
  for (const name of names) {
    try {
      const { total } = await cloudDB.collection(name).count();
      if (total >= 0) continue; // 集合已存在
    } catch {
      // 集合不存在，写一条占位数据触发创建
      try {
        const res = await cloudDB.collection(name).add({ _placeholder: true });
        await cloudDB.collection(name).doc((res as any).id).remove();
      } catch {
        // 忽略创建失败，后续写入时会再次尝试
      }
    }
  }
}
