import { create } from 'zustand';
import { contractsAPI, receiptsAPI, expensesAPI, reimbursementsAPI,
  generalIncomesAPI, generalExpensesAPI, quotationsAPI, invoicesAPI,
} from '@/db/api';
import { ensureCollections } from '@/db/cloudbase';
import type { Contract, Receipt, Expense, Reimbursement, GeneralIncome, GeneralExpense, ProjectProfit, Quotation, InvoiceRecord } from '@/types';
import { isActiveFinanceRecord } from '@/utils/financeLifecycle';

export type FinanceDataset = 'contracts' | 'receipts' | 'expenses' | 'invoices' | 'reimbursements' | 'generalIncomes' | 'generalExpenses' | 'quotations';
const ALL_FINANCE_DATASETS: FinanceDataset[] = ['contracts', 'receipts', 'expenses', 'invoices', 'reimbursements', 'generalIncomes', 'generalExpenses', 'quotations'];

type FinanceDoc = { id: string; _id?: string };

const sameDoc = (a: FinanceDoc, b: FinanceDoc) => {
  const aDocId = a._id || a.id;
  const bDocId = b._id || b.id;
  return aDocId === bDocId || a.id === b.id || (!!a._id && a._id === b.id) || (!!b._id && b._id === a.id);
};

const findDoc = <T extends FinanceDoc>(items: T[], id: string) => (
  items.find((item) => item.id === id || item._id === id)
);

const docId = (item: FinanceDoc | undefined, fallback: string) => item?._id || item?.id || fallback;

const mergeDocId = <T extends FinanceDoc>(existing: T | undefined, next: T): T => ({
  ...next,
  _id: next._id || existing?._id,
});

interface FinanceState {
  initialized: boolean;
  contracts: Contract[];
  receipts: Receipt[];
  expenses: Expense[];
  invoices: InvoiceRecord[];
  reimbursements: Reimbursement[];
  generalIncomes: GeneralIncome[];
  generalExpenses: GeneralExpense[];
  quotations: Quotation[];
  loading: boolean;
  loadedDatasets: FinanceDataset[];

  init: (datasets?: FinanceDataset[]) => Promise<void>;
  refreshAll: () => Promise<void>;
  _refreshSilent: (datasets?: FinanceDataset[], force?: boolean) => Promise<void>;
  reset: () => void;

  addContract: (c: Contract) => Promise<void>;
  updateContract: (c: Contract) => Promise<void>;
  deleteContract: (id: string) => Promise<void>;

  addReceipt: (r: Receipt) => Promise<void>;
  updateReceipt: (r: Receipt) => Promise<void>;
  deleteReceipt: (id: string) => Promise<void>;

  addExpense: (e: Expense) => Promise<void>;
  updateExpense: (e: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  addInvoice: (i: InvoiceRecord) => Promise<void>;
  updateInvoice: (i: InvoiceRecord) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;

  addReimbursement: (r: Reimbursement) => Promise<void>;
  updateReimbursement: (r: Reimbursement) => Promise<void>;
  deleteReimbursement: (id: string) => Promise<void>;

  addGeneralIncome: (gi: GeneralIncome) => Promise<void>;
  deleteGeneralIncome: (id: string) => Promise<void>;
  addGeneralExpense: (ge: GeneralExpense) => Promise<void>;
  deleteGeneralExpense: (id: string) => Promise<void>;

  addQuotation: (q: Quotation) => Promise<void>;
  updateQuotation: (q: Quotation) => Promise<void>;
  deleteQuotation: (id: string) => Promise<void>;

  getProjectProfits: () => ProjectProfit[];
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  initialized: false,
  contracts: [],
  receipts: [],
  expenses: [],
  invoices: [],
  reimbursements: [],
  generalIncomes: [],
  generalExpenses: [],
  quotations: [],
  loading: false,
  loadedDatasets: [],

  init: async (datasets = ALL_FINANCE_DATASETS) => {
    try {
      if (import.meta.env.DEV) {
        await ensureCollections();
      }
      await get()._refreshSilent(datasets);
      set({ initialized: true });
    } catch (err: any) {
      console.error('初始化失败:', err.message || err);
      // 尝试直接读取数据（可能 seed 失败但已有数据）
      try {
        await get()._refreshSilent(datasets);
        set({ initialized: true });
      } catch {
        // 完全失败，抛出给上层
        throw err;
      }
    }
  },

  refreshAll: async () => {
    set({ loading: true });
    await get()._refreshSilent(ALL_FINANCE_DATASETS, true);
    set({ loading: false });
  },

  _refreshSilent: async (datasets = ALL_FINANCE_DATASETS, force = false) => {
    try {
      const requested = Array.from(new Set(datasets));
      const missing = force ? requested : requested.filter((dataset) => !get().loadedDatasets.includes(dataset));
      if (missing.length === 0) return;
      const loaders: Record<FinanceDataset, () => Promise<any[]>> = {
        contracts: contractsAPI.toArray,
        receipts: receiptsAPI.toArray,
        expenses: expensesAPI.toArray,
        invoices: invoicesAPI.toArray,
        reimbursements: reimbursementsAPI.toArray,
        generalIncomes: generalIncomesAPI.toArray,
        generalExpenses: generalExpensesAPI.toArray,
        quotations: quotationsAPI.toArray,
      };
      const entries = await Promise.all(missing.map(async (dataset) => [dataset, await loaders[dataset]()] as const));
      set((state) => ({
        ...Object.fromEntries(entries),
        loadedDatasets: Array.from(new Set([...state.loadedDatasets, ...missing])),
      }));
    } catch (e) {
      console.error('静默刷新失败:', e);
    }
  },

  reset: () => set({
    initialized: false,
    contracts: [], receipts: [], expenses: [], invoices: [], reimbursements: [],
    generalIncomes: [], generalExpenses: [], quotations: [], loadedDatasets: [], loading: false,
  }),

  addContract: async (c) => { 
    const created = await contractsAPI.add(c); 
    set(state => ({ contracts: [created, ...state.contracts] }));
  },
  updateContract: async (c) => { 
    const next = mergeDocId(findDoc(get().contracts, c.id), c);
    await contractsAPI.put(next); 
    set(state => ({ contracts: state.contracts.map(item => sameDoc(item, next) ? next : item) }));
  },
  deleteContract: async (id) => { 
    const state = get();
    const contract = findDoc(state.contracts, id);
    const contractDocId = docId(contract, id);
    const relatedContractIds = new Set([id, contract?.id, contract?._id].filter(Boolean));
    const relatedReceipts = state.receipts.filter(r => relatedContractIds.has(r.contractId));
    const relatedExpenses = state.expenses.filter(e => relatedContractIds.has(e.contractId));
    const relatedInvoices = state.invoices.filter(i => relatedContractIds.has(i.contractId));
    if (relatedReceipts.length > 0 || relatedExpenses.length > 0 || relatedInvoices.length > 0) {
      throw new Error('该合同下已有财务记录，请先按财务流程处理收款、支出或开票记录后再删除合同。');
    }
    // 删除关联的报价记录
    const relatedQuotations = state.quotations.filter(q => q.contractId ? relatedContractIds.has(q.contractId) : false);
    for (const q of relatedQuotations) {
      await quotationsAPI.delete(docId(q, q.id)).catch(() => {});
    }
    await contractsAPI.delete(contractDocId); 
    set(state => ({ 
      contracts: state.contracts.filter(item => item.id !== id && item._id !== id),
      receipts: state.receipts.filter(r => !relatedContractIds.has(r.contractId)),
      expenses: state.expenses.filter(e => !relatedContractIds.has(e.contractId)),
      invoices: state.invoices.filter(i => !relatedContractIds.has(i.contractId)),
      quotations: state.quotations.filter(q => !q.contractId || !relatedContractIds.has(q.contractId)),
    }));
    
  },

  addReceipt: async (r) => { 
    const created = await receiptsAPI.add(r); 
    set(state => ({ receipts: [created, ...state.receipts] }));
    
  },
  updateReceipt: async (r) => { 
    const next = mergeDocId(findDoc(get().receipts, r.id), r);
    await receiptsAPI.put(next); 
    set(state => ({ receipts: state.receipts.map(item => sameDoc(item, next) ? next : item) }));
    
  },
  deleteReceipt: async (id) => { 
    const receipt = findDoc(get().receipts, id);
    await receiptsAPI.delete(docId(receipt, id)); 
    set(state => ({ receipts: state.receipts.filter(item => item.id !== id && item._id !== id) }));
    
  },

  addExpense: async (e) => { 
    const created = await expensesAPI.add(e); 
    set(state => ({ expenses: [created, ...state.expenses] }));
    
  },
  updateExpense: async (e) => { 
    const next = mergeDocId(findDoc(get().expenses, e.id), e);
    await expensesAPI.put(next); 
    set(state => ({ expenses: state.expenses.map(item => sameDoc(item, next) ? next : item) }));
    
  },
  deleteExpense: async (id) => { 
    const expense = findDoc(get().expenses, id);
    await expensesAPI.delete(docId(expense, id)); 
    set(state => ({ expenses: state.expenses.filter(item => item.id !== id && item._id !== id) }));
    
  },

  addInvoice: async (i) => {
    const created = await invoicesAPI.add(i);
    set(state => ({ invoices: [created, ...state.invoices] }));
  },
  updateInvoice: async (i) => {
    const next = mergeDocId(findDoc(get().invoices, i.id), i);
    await invoicesAPI.put(next);
    set(state => ({ invoices: state.invoices.map(item => sameDoc(item, next) ? next : item) }));
  },
  deleteInvoice: async (id) => {
    const invoice = findDoc(get().invoices, id);
    await invoicesAPI.delete(docId(invoice, id));
    set(state => ({ invoices: state.invoices.filter(item => item.id !== id && item._id !== id) }));
  },

  addReimbursement: async (r) => { 
    const created = await reimbursementsAPI.add(r); 
    set(state => ({ reimbursements: [created, ...state.reimbursements] }));
    // 不再等待 refreshAll，保持静默更新
    
  },
  updateReimbursement: async (r) => { 
    const next = mergeDocId(findDoc(get().reimbursements, r.id), r);
    await reimbursementsAPI.put(next); 
    set(state => ({ reimbursements: state.reimbursements.map(item => sameDoc(item, next) ? next : item) }));
    
  },
  deleteReimbursement: async (id) => {
    const reimbursement = findDoc(get().reimbursements, id);
    await reimbursementsAPI.delete(docId(reimbursement, id));
    set(state => ({ reimbursements: state.reimbursements.filter(item => item.id !== id && item._id !== id) }));
  },

  addGeneralIncome: async (gi) => { 
    const created = await generalIncomesAPI.add(gi); 
    set(state => ({ generalIncomes: [created, ...state.generalIncomes] }));
    
  },
  deleteGeneralIncome: async (id) => { 
    const income = findDoc(get().generalIncomes, id);
    await generalIncomesAPI.delete(docId(income, id)); 
    set(state => ({ generalIncomes: state.generalIncomes.filter(item => item.id !== id && item._id !== id) }));
    
  },
  addGeneralExpense: async (ge) => { 
    const created = await generalExpensesAPI.add(ge); 
    set(state => ({ generalExpenses: [created, ...state.generalExpenses] }));
    
  },
  deleteGeneralExpense: async (id) => { 
    const expense = findDoc(get().generalExpenses, id);
    await generalExpensesAPI.delete(docId(expense, id)); 
    set(state => ({ generalExpenses: state.generalExpenses.filter(item => item.id !== id && item._id !== id) }));
    
  },

  addQuotation: async (q) => { 
    const created = await quotationsAPI.add(q); 
    set(state => ({ quotations: [created, ...state.quotations] }));
    
  },
  updateQuotation: async (q) => { 
    const next = mergeDocId(findDoc(get().quotations, q.id), q);
    await quotationsAPI.put(next); 
    set(state => ({ quotations: state.quotations.map(item => sameDoc(item, next) ? next : item) }));
    
  },
  deleteQuotation: async (id) => { 
    const quotation = findDoc(get().quotations, id);
    await quotationsAPI.delete(docId(quotation, id)); 
    set(state => ({ quotations: state.quotations.filter(item => item.id !== id && item._id !== id) }));
    
  },

  getProjectProfits: () => {
    const { contracts, receipts, expenses } = get();
    return contracts.map((c) => {
      const contractIds = new Set([c.id, c._id].filter(Boolean));
      const contractReceipts = receipts.filter((r) => contractIds.has(r.contractId) && isActiveFinanceRecord(r));
      const contractExpenses = expenses.filter((e) => contractIds.has(e.contractId) && isActiveFinanceRecord(e));
      const receivedAmount = contractReceipts.reduce((sum, r) => sum + r.amount, 0);
      const totalCost = contractExpenses.reduce((sum, e) => sum + e.amount, 0);
      const grossProfit = receivedAmount - totalCost;
      const grossMargin = receivedAmount > 0 ? grossProfit / receivedAmount : 0;
      return { id: c.id, contractNo: c.contractNo, houseAddress: c.houseAddress, customerName: c.customerName, contractAmount: c.contractAmount, receivedAmount, totalCost, grossProfit, grossMargin };
    });
  },
}));
