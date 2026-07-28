import { cloudDB, COLLECTIONS } from './cloudbase';
import type {
  Contract, Receipt, Expense, Reimbursement,
  GeneralIncome, GeneralExpense, Quotation, Notification, InvoiceRecord,
} from '@/types';
import type { UserRecord } from './index';

type CloudDoc = { id?: string; _id?: string };

// 辅助函数：清洗 payload，移除 undefined 和 _id
const sanitize = (payload: any) => {
  const { _id, ...rest } = payload;
  return JSON.parse(JSON.stringify(rest));
};

const docIdOf = (item: CloudDoc, label: string): string => {
  const id = item?._id || item?.id;
  if (!id) throw new Error(`${label} 缺少可用于保存的 _id/id`);
  return id;
};

const addedIdOf = (result: any, label: string): string => {
  const id = result?.id || result?._id;
  if (!id) throw new Error(`${label} 新增成功但未返回文档 _id`);
  return id;
};

const withDocId = <T extends CloudDoc>(item: T, docId: string): T => ({
  ...item,
  _id: docId,
} as T);

// ============ 合同 ============
export const contractsAPI = {
  toArray: async (): Promise<Contract[]> => {
    try {
      const { data } = await cloudDB.collection(COLLECTIONS.contracts).limit(1000).get();
      return (data || []) as Contract[];
    } catch {
      return [];
    }
  },
  count: async (): Promise<number> => {
    try {
      const { total } = await cloudDB.collection(COLLECTIONS.contracts).count();
      return total;
    } catch {
      return 0;
    }
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<Contract[]> => {
      try {
        const { data } = await cloudDB.collection(COLLECTIONS.contracts).where(conditions).limit(1000).get();
        return (data || []) as Contract[];
      } catch {
        return [];
      }
    },
  }),
  doc: (id: string) => ({
    get: async (): Promise<Contract | null> => {
      try {
        const { data } = await cloudDB.collection(COLLECTIONS.contracts).doc(id).get();
        return (Array.isArray(data) ? data[0] : data) as Contract | null;
      } catch {
        return null;
      }
    },
  }),
  add: async (c: Contract): Promise<Contract> => {
    const res = await cloudDB.collection(COLLECTIONS.contracts).add(sanitize(c));
    return withDocId(c, addedIdOf(res, '合同'));
  },
  countByBizType: async (bizType: string): Promise<number> => {
    try {
      const { total } = await cloudDB.collection(COLLECTIONS.contracts).where({ bizType }).count();
      return total;
    } catch {
      return 0;
    }
  },
  pageByBizType: async (bizType: string, page: number, pageSize: number): Promise<Contract[]> => {
    const offset = Math.max(0, (page - 1) * pageSize);
    try {
      const { data } = await cloudDB.collection(COLLECTIONS.contracts)
        .where({ bizType })
        .orderBy('createdAt', 'desc')
        .skip(offset)
        .limit(pageSize)
        .get();
      return (data || []) as Contract[];
    } catch {
      try {
        const { data } = await cloudDB.collection(COLLECTIONS.contracts)
          .where({ bizType })
          .skip(offset)
          .limit(pageSize)
          .get();
        return (data || []) as Contract[];
      } catch {
        return [];
      }
    }
  },
  recentByBizType: async (bizType: string, n: number): Promise<Contract[]> => {
    try {
      const { data } = await cloudDB.collection(COLLECTIONS.contracts)
        .where({ bizType })
        .orderBy('createdAt', 'desc')
        .limit(n)
        .get();
      return (data || []) as Contract[];
    } catch {
      try {
        const { data } = await cloudDB.collection(COLLECTIONS.contracts)
          .where({ bizType })
          .limit(n)
          .get();
        return (data || []) as Contract[];
      } catch {
        return [];
      }
    }
  },
  put: async (c: Contract): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.contracts).doc(docIdOf(c, '合同')).set(sanitize(c));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.contracts).doc(id).remove();
  },
  bulkAdd: async (list: Contract[]): Promise<void> => {
    // CloudBase 不支持原生批量添加，分批执行
    for (const item of list) {
      await cloudDB.collection(COLLECTIONS.contracts).add(sanitize(item));
    }
  },
  clear: async (): Promise<void> => {
    // 逐条删除（生产环境不建议频繁清空）
    const all = await contractsAPI.toArray();
    for (const item of all) {
      await cloudDB.collection(COLLECTIONS.contracts).doc(docIdOf(item, '合同')).remove();
    }
  },
  limit: async (n: number): Promise<Contract[]> => {
    try {
      const { data } = await cloudDB.collection(COLLECTIONS.contracts).limit(n).get();
      return (data || []) as Contract[];
    } catch {
      return [];
    }
  },
};

// ============ 收款 ============
export const receiptsAPI = {
  toArray: async (): Promise<Receipt[]> => {
    try { const { data } = await cloudDB.collection(COLLECTIONS.receipts).limit(1000).get(); return (data || []) as Receipt[]; }
    catch { return []; }
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<Receipt[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.receipts).where(conditions).limit(1000).get(); return (data || []) as Receipt[]; }
      catch { return []; }
    },
  }),
  whereContractIds: async (contractIds: string[]): Promise<Receipt[]> => {
    const ids = Array.from(new Set(contractIds.filter(Boolean)));
    if (ids.length === 0) return [];
    try {
      const _ = cloudDB.command;
      const { data } = await cloudDB.collection(COLLECTIONS.receipts)
        .where({ contractId: _.in(ids) })
        .limit(1000)
        .get();
      return (data || []) as Receipt[];
    } catch {
      return [];
    }
  },
  add: async (r: Receipt): Promise<Receipt> => {
    const res = await cloudDB.collection(COLLECTIONS.receipts).add(sanitize(r));
    return withDocId(r, addedIdOf(res, '收款'));
  },
  put: async (r: Receipt): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.receipts).doc(docIdOf(r, '收款')).set(sanitize(r));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.receipts).doc(id).remove();
  },
  bulkAdd: async (list: Receipt[]): Promise<void> => {
    for (const item of list) {
      await cloudDB.collection(COLLECTIONS.receipts).add(sanitize(item));
    }
  },
  clear: async (): Promise<void> => {
    const all = await receiptsAPI.toArray();
    for (const item of all) {
      await cloudDB.collection(COLLECTIONS.receipts).doc(docIdOf(item, '收款')).remove();
    }
  },
};

// ============ 支出 ============
export const expensesAPI = {
  toArray: async (): Promise<Expense[]> => {
    try { const { data } = await cloudDB.collection(COLLECTIONS.expenses).limit(1000).get(); return (data || []) as Expense[]; }
    catch { return []; }
  },
  add: async (e: Expense): Promise<Expense> => {
    const res = await cloudDB.collection(COLLECTIONS.expenses).add(sanitize(e));
    return withDocId(e, addedIdOf(res, '支出'));
  },
  put: async (e: Expense): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.expenses).doc(docIdOf(e, '支出')).set(sanitize(e));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.expenses).doc(id).remove();
  },
  bulkAdd: async (list: Expense[]): Promise<void> => {
    for (const item of list) {
      await cloudDB.collection(COLLECTIONS.expenses).add(sanitize(item));
    }
  },
  clear: async (): Promise<void> => {
    const all = await expensesAPI.toArray();
    for (const item of all) {
      await cloudDB.collection(COLLECTIONS.expenses).doc(docIdOf(item, '支出')).remove();
    }
  },
};

// ============ 开票记录 ============
export const invoicesAPI = {
  toArray: async (): Promise<InvoiceRecord[]> => {
    try { const { data } = await cloudDB.collection(COLLECTIONS.invoices).limit(1000).get(); return (data || []) as InvoiceRecord[]; }
    catch { return []; }
  },
  add: async (i: InvoiceRecord): Promise<InvoiceRecord> => {
    const res = await cloudDB.collection(COLLECTIONS.invoices).add(sanitize(i));
    return withDocId(i, addedIdOf(res, '开票记录'));
  },
  put: async (i: InvoiceRecord): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.invoices).doc(docIdOf(i, '开票记录')).set(sanitize(i));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.invoices).doc(id).remove();
  },
  clear: async (): Promise<void> => {
    const all = await invoicesAPI.toArray();
    for (const item of all) {
      await cloudDB.collection(COLLECTIONS.invoices).doc(docIdOf(item, '开票记录')).remove();
    }
  },
};

// ============ 报销 ============
export const reimbursementsAPI = {
  toArray: async (): Promise<Reimbursement[]> => {
    try { const { data } = await cloudDB.collection(COLLECTIONS.reimbursements).limit(1000).get(); return (data || []) as Reimbursement[]; }
    catch { return []; }
  },
  add: async (r: Reimbursement): Promise<Reimbursement> => {
    const res = await cloudDB.collection(COLLECTIONS.reimbursements).add(sanitize(r));
    return withDocId(r, addedIdOf(res, '报销'));
  },
  put: async (r: Reimbursement): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.reimbursements).doc(docIdOf(r, '报销')).set(sanitize(r));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.reimbursements).doc(id).remove();
  },
  bulkAdd: async (list: Reimbursement[]): Promise<void> => {
    for (const item of list) {
      await cloudDB.collection(COLLECTIONS.reimbursements).add(sanitize(item));
    }
  },
  clear: async (): Promise<void> => {
    const all = await reimbursementsAPI.toArray();
    for (const item of all) {
      await cloudDB.collection(COLLECTIONS.reimbursements).doc(docIdOf(item, '报销')).remove();
    }
  },
};

// ============ 总店收入 ============
export const generalIncomesAPI = {
  toArray: async (): Promise<GeneralIncome[]> => {
    try { const { data } = await cloudDB.collection(COLLECTIONS.generalIncomes).limit(1000).get(); return (data || []) as GeneralIncome[]; }
    catch { return []; }
  },
  add: async (gi: GeneralIncome): Promise<GeneralIncome> => {
    const res = await cloudDB.collection(COLLECTIONS.generalIncomes).add(sanitize(gi));
    return withDocId(gi, addedIdOf(res, '总店收入'));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.generalIncomes).doc(id).remove();
  },
  bulkAdd: async (list: GeneralIncome[]): Promise<void> => {
    for (const item of list) {
      await cloudDB.collection(COLLECTIONS.generalIncomes).add(sanitize(item));
    }
  },
  clear: async (): Promise<void> => {
    const all = await generalIncomesAPI.toArray();
    for (const item of all) {
      await cloudDB.collection(COLLECTIONS.generalIncomes).doc(docIdOf(item, '总店收入')).remove();
    }
  },
};

// ============ 总店支出 ============
export const generalExpensesAPI = {
  toArray: async (): Promise<GeneralExpense[]> => {
    try { const { data } = await cloudDB.collection(COLLECTIONS.generalExpenses).limit(1000).get(); return (data || []) as GeneralExpense[]; }
    catch { return []; }
  },
  add: async (ge: GeneralExpense): Promise<GeneralExpense> => {
    const res = await cloudDB.collection(COLLECTIONS.generalExpenses).add(sanitize(ge));
    return withDocId(ge, addedIdOf(res, '总店支出'));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.generalExpenses).doc(id).remove();
  },
  bulkAdd: async (list: GeneralExpense[]): Promise<void> => {
    for (const item of list) {
      await cloudDB.collection(COLLECTIONS.generalExpenses).add(sanitize(item));
    }
  },
  clear: async (): Promise<void> => {
    const all = await generalExpensesAPI.toArray();
    for (const item of all) {
      await cloudDB.collection(COLLECTIONS.generalExpenses).doc(docIdOf(item, '总店支出')).remove();
    }
  },
};

// ============ 报价 ============
export const quotationsAPI = {
  toArray: async (): Promise<Quotation[]> => {
    try { const { data } = await cloudDB.collection(COLLECTIONS.quotations).limit(1000).get(); return (data || []) as Quotation[]; }
    catch { return []; }
  },
  add: async (q: Quotation): Promise<Quotation> => {
    const res = await cloudDB.collection(COLLECTIONS.quotations).add(sanitize(q));
    return withDocId(q, addedIdOf(res, '报价'));
  },
  put: async (q: Quotation): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.quotations).doc(docIdOf(q, '报价')).set(sanitize(q));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.quotations).doc(id).remove();
  },
  bulkAdd: async (list: Quotation[]): Promise<void> => {
    for (const item of list) {
      await cloudDB.collection(COLLECTIONS.quotations).add(sanitize(item));
    }
  },
  clear: async (): Promise<void> => {
    const all = await quotationsAPI.toArray();
    for (const item of all) {
      await cloudDB.collection(COLLECTIONS.quotations).doc(docIdOf(item, '报价')).remove();
    }
  },
};

// ============ 用户 ============
export const usersAPI = {
  count: async (): Promise<number> => {
    try {
      const { total } = await cloudDB.collection(COLLECTIONS.users).count();
      return total;
    } catch {
      return 0;
    }
  },
  toArray: async (fields?: Record<string, boolean>): Promise<UserRecord[]> => {
    try {
      let query: any = cloudDB.collection(COLLECTIONS.users);
      if (fields) query = query.field(fields);
      const { data } = await query.limit(1000).get();
      return (data || []) as UserRecord[];
    } catch {
      return [];
    }
  },
  where: async (conditions: Record<string, unknown>): Promise<{ first: () => Promise<UserRecord | undefined> }> => {
    const query = cloudDB.collection(COLLECTIONS.users).where(conditions);
    // 返回类似 Dexie 的接口
    return {
      first: async () => {
        try {
          const { data } = await query.limit(1).get();
          return (data?.[0] || undefined) as UserRecord | undefined;
        } catch {
          return undefined;
        }
      },
    };
  },
  add: async (u: UserRecord): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.users).add(sanitize(u));
  },
  bulkAdd: async (list: UserRecord[]): Promise<void> => {
    for (const item of list) {
      await cloudDB.collection(COLLECTIONS.users).add(sanitize(item));
    }
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.users).doc(id).remove();
  },
  update: async (id: string, data: Partial<UserRecord>): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.users).doc(id).update(data as any);
  },
};

// ============ 通知 ============
export const notificationsAPI = {
  orderBy: (field: string, direction: 'asc' | 'desc') => ({
    toArray: async (): Promise<Notification[]> => {
      try {
        const { data } = await cloudDB.collection(COLLECTIONS.notifications)
          .orderBy(field, direction)
          .limit(1000)
          .get();
        return (data || []) as Notification[];
      } catch {
        return [];
      }
    },
  }),
  add: async (n: Notification): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.notifications).add(sanitize(n));
  },
  update: async (id: string, data: Partial<Notification>): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.notifications).doc(id).update(sanitize(data));
  },
};

// ============ 客户线索 ============
export const leadsAPI = {
  toArray: async (fields?: Record<string, boolean>): Promise<any[]> => {
    try {
      let query: any = cloudDB.collection(COLLECTIONS.leads);
      if (fields) query = query.field(fields);
      const { data } = await query.limit(1000).get();
      return (data || []) as any[];
    }
    catch { return []; }
  },
  count: async (): Promise<number> => {
    try { const { total } = await cloudDB.collection(COLLECTIONS.leads).count(); return total; }
    catch { return 0; }
  },
  add: async (l: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.leads).add({ _id: l._id, ...l } as any);
  },
  update: async (id: string, data: any): Promise<void> => {
    const payload = JSON.parse(JSON.stringify(data));
    delete payload._id;
    await cloudDB.collection(COLLECTIONS.leads).doc(id).update(payload as any);
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.leads).doc(id).remove();
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<any[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.leads).where(conditions).limit(1000).get(); return (data || []) as any[]; }
      catch { return []; }
    },
    orderBy: (field: string, direction: 'asc' | 'desc') => ({
      toArray: async (): Promise<any[]> => {
        try { const { data } = await cloudDB.collection(COLLECTIONS.leads).where(conditions).orderBy(field, direction).limit(1000).get(); return (data || []) as any[]; }
        catch { return []; }
      },
    }),
  }),
  doc: (id: string) => ({
    get: async (): Promise<any> => {
      try { 
        const { data } = await cloudDB.collection(COLLECTIONS.leads).doc(id).get(); 
        return Array.isArray(data) ? data[0] : data; 
      }
      catch { return null; }
    },
    update: async (data: any): Promise<void> => {
      const payload = JSON.parse(JSON.stringify(data));
      delete payload._id;
      await cloudDB.collection(COLLECTIONS.leads).doc(id).update(payload as any);
    },
    remove: async (): Promise<void> => {
      await cloudDB.collection(COLLECTIONS.leads).doc(id).remove();
    },
  }),
};

export const materialsAPI = {
  toArray: async (): Promise<any[]> => {
    try { const { data } = await cloudDB.collection(COLLECTIONS.materials).limit(1000).get(); return (data || []) as any[]; }
    catch { return []; }
  },
  count: async (): Promise<number> => {
    try { const { total } = await cloudDB.collection(COLLECTIONS.materials).count(); return total; }
    catch { return 0; }
  },
  add: async (m: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.materials).add({ _id: m._id, ...m } as any);
  },
  update: async (id: string, data: any): Promise<void> => {
    const payload = JSON.parse(JSON.stringify(data));
    delete payload._id;
    await cloudDB.collection(COLLECTIONS.materials).doc(id).update(payload as any);
  },
  get: async (id: string): Promise<any> => {
    try {
      const { data } = await cloudDB.collection(COLLECTIONS.materials).doc(id).get();
      return Array.isArray(data) ? data[0] : data;
    } catch {
      return null;
    }
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.materials).doc(id).remove();
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<any[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.materials).where(conditions).limit(1000).get(); return (data || []) as any[]; }
      catch { return []; }
    },
  }),
};
// ============ 出入库记录 ============
export const inventoryRecordsAPI = {
  toArray: async (): Promise<any[]> => {
    try {
      const { data } = await cloudDB.collection(COLLECTIONS.inventory_records).orderBy('createdAt', 'desc').limit(1000).get();
      return (data || []) as any[];
    } catch { return []; }
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<any[]> => {
      try {
        const { data } = await cloudDB.collection(COLLECTIONS.inventory_records).where(conditions).orderBy('createdAt', 'desc').limit(1000).get();
        return (data || []) as any[];
      } catch { return []; }
    },
  }),
  add: async (record: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.inventory_records).add(sanitize(record));
  },
};
// ============ 系统配置 ============
export const systemConfigsAPI = {
  doc: (id: string) => ({
    get: async (): Promise<any> => {
      try { 
        const { data } = await cloudDB.collection(COLLECTIONS.system_configs).doc(id).get(); 
        return Array.isArray(data) ? data[0] : data; 
      }
      catch { return null; }
    },
    set: async (data: any): Promise<void> => {
      await cloudDB.collection(COLLECTIONS.system_configs).doc(id).set(sanitize(data));
    },
    update: async (data: any): Promise<void> => {
      await cloudDB.collection(COLLECTIONS.system_configs).doc(id).update(sanitize(data));
    },
  }),
};

// ============ 项目日志 ============
export const projectLogsAPI = {
  recent: async (limit: number, fields?: Record<string, boolean>): Promise<any[]> => {
    try {
      let query: any = cloudDB.collection(COLLECTIONS.projectLogs).orderBy('createdAt', 'desc');
      if (fields) query = query.field(fields);
      const { data } = await query.limit(limit).get();
      return (data || []) as any[];
    } catch { return []; }
  },
  where: (conditions: Record<string, unknown>) => ({
    orderBy: (field: string, direction: 'asc' | 'desc') => ({
      toArray: async (): Promise<any[]> => {
        try { 
          const { data } = await cloudDB.collection(COLLECTIONS.projectLogs).where(conditions).orderBy(field, direction).limit(1000).get(); 
          return (data || []) as any[]; 
        } catch { return []; }
      },
    }),
    toArray: async (): Promise<any[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.projectLogs).where(conditions).limit(1000).get(); return (data || []) as any[]; }
      catch { return []; }
    },
  }),
  add: async (log: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.projectLogs).add({ _id: log.id || log._id, ...sanitize(log) } as any);
  },
  update: async (id: string, data: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.projectLogs).doc(id).update(sanitize(data));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.projectLogs).doc(id).remove();
  },
};

// ============ 工地巡检 ============
export const projectInspectionsAPI = {
  where: (conditions: Record<string, unknown>) => ({
    orderBy: (field: string, direction: 'asc' | 'desc') => ({
      toArray: async (): Promise<any[]> => {
        try { 
          const { data } = await cloudDB.collection(COLLECTIONS.projectInspections).where(conditions).orderBy(field, direction).limit(1000).get(); 
          return (data || []) as any[]; 
        } catch { return []; }
      },
    }),
    toArray: async (): Promise<any[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.projectInspections).where(conditions).limit(1000).get(); return (data || []) as any[]; }
      catch { return []; }
    },
  }),
  add: async (inspection: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.projectInspections).add({ _id: inspection.id || inspection._id, ...sanitize(inspection) } as any);
  },
  update: async (id: string, data: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.projectInspections).doc(id).update(sanitize(data));
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.projectInspections).doc(id).remove();
  },
};

// ============ 工地项目 ============
export const projectsAPI = {
  toArray: async (fields?: Record<string, boolean>): Promise<any[]> => {
    try {
      let query: any = cloudDB.collection(COLLECTIONS.projects);
      if (fields) query = query.field(fields);
      const { data } = await query.limit(1000).get();
      return (data || []) as any[];
    }
    catch { return []; }
  },
  count: async (): Promise<number> => {
    try { const { total } = await cloudDB.collection(COLLECTIONS.projects).count(); return total; }
    catch { return 0; }
  },
  add: async (p: any): Promise<string> => {
    const docId = p?._id || Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    try {
      const payload = JSON.parse(JSON.stringify(p)); // 移除所有 undefined
      await cloudDB.collection(COLLECTIONS.projects).add({ ...payload, _id: docId } as any);
      return docId;
    } catch (e) {
      console.error('API.add projects error:', e);
      throw e;
    }
  },
  update: async (id: string, data: any): Promise<void> => {
    const payload = JSON.parse(JSON.stringify(data));
    delete payload._id;
    await cloudDB.collection(COLLECTIONS.projects).doc(id).update(payload as any);
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.projects).doc(id).remove();
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<any[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.projects).where(conditions).limit(1000).get(); return (data || []) as any[]; }
      catch { return []; }
    },
    orderBy: (field: string, direction: 'asc' | 'desc') => ({
      toArray: async (): Promise<any[]> => {
        try { const { data } = await cloudDB.collection(COLLECTIONS.projects).where(conditions).orderBy(field, direction).limit(1000).get(); return (data || []) as any[]; }
        catch { return []; }
      },
    }),
  }),
  doc: (id: string) => ({
    get: async (): Promise<any> => {
      try { 
        const { data } = await cloudDB.collection(COLLECTIONS.projects).doc(id).get(); 
        return Array.isArray(data) ? data[0] : data; 
      }
      catch { return null; }
    },
    update: async (data: any): Promise<void> => {
      const payload = JSON.parse(JSON.stringify(data));
      delete payload._id;
      await cloudDB.collection(COLLECTIONS.projects).doc(id).update(payload as any);
    },
    remove: async (): Promise<void> => {
      await cloudDB.collection(COLLECTIONS.projects).doc(id).remove();
    },
  }),
};

// ============ 待办事项 ============
export const todosAPI = {
  toArray: async (fields?: Record<string, boolean>): Promise<any[]> => {
    try {
      let query: any = cloudDB.collection(COLLECTIONS.todos);
      if (fields) query = query.field(fields);
      const { data } = await query.limit(1000).get();
      return (data || []) as any[];
    }
    catch { return []; }
  },
  count: async (): Promise<number> => {
    try { const { total } = await cloudDB.collection(COLLECTIONS.todos).count(); return total; }
    catch { return 0; }
  },
  add: async (t: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.todos).add({ _id: t._id, ...t } as any);
  },
  update: async (id: string, data: any): Promise<void> => {
    const payload = JSON.parse(JSON.stringify(data));
    delete payload._id;
    // 使用 _.set 来覆盖对象，避免因 null 合并导致 500 报错
    const _ = cloudDB.command;
    if (payload.relatedTo !== undefined) {
      payload.relatedTo = _.set(payload.relatedTo);
    }
    await cloudDB.collection(COLLECTIONS.todos).doc(id).update(payload as any);
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.todos).doc(id).remove();
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<any[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.todos).where(conditions).limit(1000).get(); return (data || []) as any[]; }
      catch { return []; }
    },
    orderBy: (field: string, direction: 'asc' | 'desc') => ({
      toArray: async (): Promise<any[]> => {
        try { const { data } = await cloudDB.collection(COLLECTIONS.todos).where(conditions).orderBy(field, direction).limit(1000).get(); return (data || []) as any[]; }
        catch { return []; }
      },
    }),
  }),
  doc: (id: string) => ({
    get: async (): Promise<any> => {
      try { 
        const { data } = await cloudDB.collection(COLLECTIONS.todos).doc(id).get(); 
        return Array.isArray(data) ? data[0] : data; 
      }
      catch { return null; }
    },
    update: async (data: any): Promise<void> => {
      const payload = JSON.parse(JSON.stringify(data));
      delete payload._id;
      const _ = cloudDB.command;
      if (payload.relatedTo !== undefined) {
        payload.relatedTo = _.set(payload.relatedTo);
      }
      await cloudDB.collection(COLLECTIONS.todos).doc(id).update(payload as any);
    },
    remove: async (): Promise<void> => {
      await cloudDB.collection(COLLECTIONS.todos).doc(id).remove();
    },
  }),
};

// ============ 跟进记录 ============
export const followUpsAPI = {
  toArray: async (fields?: Record<string, boolean>): Promise<any[]> => {
    try {
      let query: any = cloudDB.collection(COLLECTIONS.followUps);
      if (fields) query = query.field(fields);
      const { data } = await query.limit(1000).get();
      return (data || []) as any[];
    }
    catch { return []; }
  },
  recent: async (limit: number, fields?: Record<string, boolean>): Promise<any[]> => {
    try {
      let query: any = cloudDB.collection(COLLECTIONS.followUps).orderBy('createdAt', 'desc');
      if (fields) query = query.field(fields);
      const { data } = await query.limit(limit).get();
      return (data || []) as any[];
    } catch { return []; }
  },
  add: async (f: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.followUps).add({ _id: f._id, ...f } as any);
  },
  update: async (id: string, data: any): Promise<void> => {
    const payload = JSON.parse(JSON.stringify(data));
    delete payload._id;
    await cloudDB.collection(COLLECTIONS.followUps).doc(id).update(payload as any);
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.followUps).doc(id).remove();
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<any[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.followUps).where(conditions).limit(1000).get(); return (data || []) as any[]; }
      catch { return []; }
    },
    orderBy: (field: string, direction: 'asc' | 'desc') => ({
      toArray: async (): Promise<any[]> => {
        try { const { data } = await cloudDB.collection(COLLECTIONS.followUps).where(conditions).orderBy(field, direction).limit(1000).get(); return (data || []) as any[]; }
        catch { return []; }
      },
    }),
  }),
  doc: (id: string) => ({
    get: async (): Promise<any> => {
      try { 
        const { data } = await cloudDB.collection(COLLECTIONS.followUps).doc(id).get(); 
        return Array.isArray(data) ? data[0] : data; 
      }
      catch { return null; }
    },
    update: async (data: any): Promise<void> => {
      const payload = JSON.parse(JSON.stringify(data));
      delete payload._id;
      await cloudDB.collection(COLLECTIONS.followUps).doc(id).update(payload as any);
    },
    remove: async (): Promise<void> => {
      await cloudDB.collection(COLLECTIONS.followUps).doc(id).remove();
    },
  }),
};

// ============ 报价单 ============
export const quotesAPI = {
  toArray: async (fields?: Record<string, boolean>): Promise<any[]> => {
    try {
      let query: any = cloudDB.collection(COLLECTIONS.quotes);
      if (fields) query = query.field(fields);
      const { data } = await query.limit(1000).get();
      return (data || []) as any[];
    }
    catch { return []; }
  },
  count: async (): Promise<number> => {
    try { const { total } = await cloudDB.collection(COLLECTIONS.quotes).count(); return total; }
    catch { return 0; }
  },
  add: async (q: any): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.quotes).add({ _id: q._id, ...q } as any);
  },
  update: async (id: string, data: any): Promise<void> => {
    const payload = JSON.parse(JSON.stringify(data));
    delete payload._id;
    await cloudDB.collection(COLLECTIONS.quotes).doc(id).update(payload as any);
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.quotes).doc(id).remove();
  },
  where: (conditions: Record<string, unknown>) => ({
    toArray: async (): Promise<any[]> => {
      try { const { data } = await cloudDB.collection(COLLECTIONS.quotes).where(conditions).limit(1000).get(); return (data || []) as any[]; }
      catch { return []; }
    },
    orderBy: (field: string, direction: 'asc' | 'desc') => ({
      toArray: async (): Promise<any[]> => {
        try { const { data } = await cloudDB.collection(COLLECTIONS.quotes).where(conditions).orderBy(field, direction).limit(1000).get(); return (data || []) as any[]; }
        catch { return []; }
      },
    }),
  }),
  doc: (id: string) => ({
    get: async (): Promise<any> => {
      try { 
        const { data } = await cloudDB.collection(COLLECTIONS.quotes).doc(id).get(); 
        return Array.isArray(data) ? data[0] : data; 
      }
      catch { return null; }
    },
    update: async (data: any): Promise<void> => {
      const payload = JSON.parse(JSON.stringify(data));
      delete payload._id;
      await cloudDB.collection(COLLECTIONS.quotes).doc(id).update(payload as any);
    },
    remove: async (): Promise<void> => {
      await cloudDB.collection(COLLECTIONS.quotes).doc(id).remove();
    },
  }),
};
