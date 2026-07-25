import cloudbase from '@cloudbase/js-sdk';

const ENV_ID = 'cloud1-8grodf5s3006f004';

const app = cloudbase.init({ env: ENV_ID });

export const cloudApp = app;
export const cloudAuth = app.auth();
export const cloudDB = app.database();

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
