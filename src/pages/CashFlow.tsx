import { useEffect, useState, useMemo } from 'react';
import { Download, TrendingUp, TrendingDown, DollarSign, ExternalLink, Paperclip, Settings, Upload } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { useAuthStore } from '@/store/authStore';
import { useDialogStore } from '@/store/dialogStore';
import { formatMoney, formatDate } from '@/utils/format';
import { exportToExcel } from '@/utils/export';
import { downloadAttachment, normalizeAttachments } from '@/utils/financeAttachments';
import { notifyFinanceAuditAction, recordFinanceAuditAction } from '@/services/financeAuditLog';
import dayjs from 'dayjs';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import Modal from '@/components/Modal';
import FinanceImportModal from '@/components/FinanceImportModal';
import ExpenseCategoryManager from '@/components/ExpenseCategoryManager';
import { useIncrementalList } from '@/hooks/useListViewportState';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AttachmentValue } from '@/types';
import { isActiveFinanceRecord } from '@/utils/financeLifecycle';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  expenseCategoryPayload,
  loadExpenseCategories,
  loadIncomeCategories,
  resolveExpenseCategory,
  saveExpenseCategories,
  saveIncomeCategories,
  type ExpenseCategory,
} from '@/services/expenseCategories';

interface FlowItem {
  id: string;
  sourceId: string;
  date: string;
  type: '收款' | '支出';
  amount: number;
  contractId?: string;
  contractNo: string;
  relatedParty: string;
  summary: string;
  address?: string;
  stage?: string;
  category?: string;
  primaryCategory?: string;
  secondaryCategory?: string;
  paymentMethod?: string;
  status?: string;
  remark?: string;
  attachments?: AttachmentValue[];
  source?: any;
}

const shouldReverseExpense = (expense: any) => ['已付', '已付款'].includes(String(expense?.status || '').trim());

export default function CashFlow() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { receipts, expenses, contracts, updateReceipt, updateExpense } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { user, users, loadUsers } = useAuthStore();
  const { showConfirm, showAlert } = useDialogStore();
  const myName = user?.name || '';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flowType, setFlowType] = useState<'全部' | '收款' | '支出'>('全部');
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonthFrom, setFilterMonthFrom] = useState('1');
  const [filterMonthTo, setFilterMonthTo] = useState('12');
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedFlow, setSelectedFlow] = useState<FlowItem | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [incomeCategories, setIncomeCategories] = useState<ExpenseCategory[]>(DEFAULT_INCOME_CATEGORIES);
  const [savingCategories, setSavingCategories] = useState(false);
  const [controlFlow, setControlFlow] = useState<FlowItem | null>(null);
  const [controlReason, setControlReason] = useState('');

  const MONTH_OPTS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` }));

  useEffect(() => {
    if (users.length === 0) void loadUsers().catch(() => {});
  }, [loadUsers, users.length]);

  useEffect(() => {
    loadExpenseCategories(currentBizType).then(setExpenseCategories).catch(() => setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES));
    loadIncomeCategories(currentBizType).then(setIncomeCategories).catch(() => setIncomeCategories(DEFAULT_INCOME_CATEGORIES));
  }, [currentBizType]);

  const handleExpenseCategorySave = async (categories: ExpenseCategory[]) => {
    setSavingCategories(true);
    try {
      const previous = expenseCategories;
      const normalized = await saveExpenseCategories(categories, currentBizType);
      const updates = expenses.flatMap((expense: any) => {
        if (expense.bizType !== currentBizType || !isActiveFinanceRecord(expense)) return [];
        const oldPath = resolveExpenseCategory(expense, previous);
        const primary = normalized.find((category) => category.id === oldPath.primaryId);
        const secondary = primary?.children.find((child) => child.id === oldPath.secondaryId);
        if (!expense.id || !primary || !secondary) return [];
        return [{
          ...expense,
          ...expenseCategoryPayload({
            primaryId: primary.id,
            primaryName: primary.name,
            secondaryId: secondary.id,
            secondaryName: secondary.name,
          }),
        }];
      });
      for (const update of updates) await updateExpense(update as any);
      setExpenseCategories(normalized);
    } catch (error: any) {
      await showAlert(error?.message || '支出类别保存失败，请重试');
      throw error;
    } finally {
      setSavingCategories(false);
    }
  };

  const handleIncomeCategorySave = async (categories: ExpenseCategory[]) => {
    setSavingCategories(true);
    try {
      setIncomeCategories(await saveIncomeCategories(categories, currentBizType));
    } catch (error: any) {
      await showAlert(error?.message || '收入类别保存失败，请重试');
      throw error;
    } finally {
      setSavingCategories(false);
    }
  };

  const adminUserIds = useMemo(() => users
    .filter((u: any) => u.role === 'admin' && u.status !== 'inactive' && u.isActive !== false)
    .map((u: any) => String(u._id || u.id || '').trim())
    .filter(Boolean), [users]);

  useEffect(() => {
    const yearParam = searchParams.get('year');
    const monthFromParam = searchParams.get('monthFrom');
    const monthToParam = searchParams.get('monthTo');
    const typeParam = searchParams.get('type');
    let consumed = false;

    if (yearParam && /^\d{4}$/.test(yearParam)) {
      setFilterYear(yearParam);
      consumed = true;
    }
    if (monthFromParam && Number(monthFromParam) >= 1 && Number(monthFromParam) <= 12) {
      setFilterMonthFrom(String(Number(monthFromParam)));
      consumed = true;
    }
    if (monthToParam && Number(monthToParam) >= 1 && Number(monthToParam) <= 12) {
      setFilterMonthTo(String(Number(monthToParam)));
      consumed = true;
    }
    if (typeParam === '收款' || typeParam === '支出' || typeParam === '全部') {
      setFlowType(typeParam);
      consumed = true;
    }

    if (consumed) {
      const next = new URLSearchParams(searchParams);
      ['year', 'monthFrom', 'monthTo', 'type'].forEach((key) => next.delete(key));
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 年份选项：从所有收付款记录中提取
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    receipts.forEach(r => { if (r.receiptDate) years.add(String(dayjs(r.receiptDate).year())); });
    expenses.forEach(e => { if (e.expenseDate) years.add(String(dayjs(e.expenseDate).year())); });
    return [{ value: '', label: '全部年份' }, ...Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)).map(y => ({ value: y, label: y }))];
  }, [receipts, expenses]);

  const filteredReceipts = useMemo(
    () => receipts.filter(r => r.bizType === currentBizType && isActiveFinanceRecord(r)),
    [receipts, currentBizType],
  );
  const filteredExpenses = useMemo(
    () => expenses.filter(e => e.bizType === currentBizType && isActiveFinanceRecord(e)),
    [expenses, currentBizType],
  );

  const getContractByNo = (contractNo: string) => contracts.find((ct) => ct.contractNo === contractNo);
  const getContractId = (contractId: string | undefined, contractNo: string) => {
    const contract = contractId
      ? contracts.find((ct) => ct.id === contractId || (ct as any)._id === contractId)
      : getContractByNo(contractNo);
    return contract?.id || (contract as any)?._id || contractId || '';
  };
  const getHouseAddress = (contractNo: string) => getContractByNo(contractNo)?.houseAddress || '';

  const flowList = useMemo(() => {
    const flows: FlowItem[] = [
      ...filteredReceipts.map((r) => {
        const categoryPath = resolveExpenseCategory(r, incomeCategories);
        return {
          id: `receipt-${r._id || r.id}`,
          sourceId: r._id || r.id,
          date: r.receiptDate,
          type: '收款' as const,
          amount: r.amount,
          contractId: getContractId(r.contractId, r.contractNo),
          contractNo: r.contractNo,
          relatedParty: r.customerName,
          address: getHouseAddress(r.contractNo),
          stage: r.stage,
          category: categoryPath.secondaryName,
          primaryCategory: categoryPath.primaryName,
          secondaryCategory: categoryPath.secondaryName,
          paymentMethod: r.paymentMethod,
          remark: r.remark,
          attachments: r.attachments || [],
          source: r,
          summary: `${r.stage} - ${r.paymentMethod}${r.remark ? ' - ' + r.remark : ''}`,
        };
      }),
      ...filteredExpenses.map((e) => {
        const categoryPath = resolveExpenseCategory(e, expenseCategories);
        return {
          id: `expense-${e._id || e.id}`,
          sourceId: e._id || e.id,
          date: e.expenseDate,
          type: '支出' as const,
          amount: e.amount,
          contractId: getContractId(e.contractId, e.contractNo),
          contractNo: e.contractNo,
          relatedParty: e.supplier,
          address: getHouseAddress(e.contractNo),
          category: categoryPath.secondaryName,
          primaryCategory: categoryPath.primaryName,
          secondaryCategory: categoryPath.secondaryName,
          paymentMethod: e.payMethod,
          status: e.status,
          remark: e.remark,
          attachments: e.attachments || [],
          source: e,
          summary: `${categoryPath.primaryName} - ${categoryPath.secondaryName}${e.remark ? ' - ' + e.remark : ''}`,
        };
      }),
    ];
    return flows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [filteredReceipts, filteredExpenses, contracts, incomeCategories, expenseCategories]);

  const filtered = useMemo(() => {
    let list = [...flowList];
    if (filterYear) {
      const minM = filterMonthFrom.padStart(2, '0');
      const maxM = filterMonthTo.padStart(2, '0');
      const minDate = `${filterYear}-${minM}-01`;
      const maxDate = dayjs(`${filterYear}-${maxM}-01`).endOf('month').format('YYYY-MM-DD');
      list = list.filter((f) => f.date >= minDate && f.date <= maxDate);
    }
    if (flowType !== '全部') list = list.filter((f) => f.type === flowType);
    if (search) {
      const q = search.toLowerCase();
      const matchedAddresses = new Set(
        contracts.filter(c => 
          c.houseAddress.toLowerCase().includes(q) || 
          c.customerName.toLowerCase().includes(q)
        ).map(c => c.contractNo)
      );
      list = list.filter(f => matchedAddresses.has(f.contractNo) || (f.address || '').toLowerCase().includes(q) || (f.relatedParty || '').toLowerCase().includes(q));
    }
    if (sortField) {
      list.sort((a, b) => {
        const va = String(a[sortField as keyof FlowItem] ?? '');
        const vb = String(b[sortField as keyof FlowItem] ?? '');
        const cmp = va.localeCompare(vb, 'zh-CN');
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    } else {
      list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    }
    return list;
  }, [flowList, filterYear, filterMonthFrom, filterMonthTo, flowType, search, contracts, sortField, sortOrder]);

  const incomeTotal = filtered.filter((f) => f.type === '收款').reduce((s, f) => s + f.amount, 0);
  const expenseTotal = filtered.filter((f) => f.type === '支出').reduce((s, f) => s + f.amount, 0);
  const netTotal = incomeTotal - expenseTotal;
  const flowListKey = [filterYear, filterMonthFrom, filterMonthTo, flowType, search.trim().toLowerCase(), sortField, sortOrder].join('|');
  const {
    visibleItems: visibleFlows,
    visibleCount: visibleFlowCount,
    hasMore: hasMoreFlows,
    loadMore: loadMoreFlows,
  } = useIncrementalList(filtered, 'cash_flow_visible_count', flowListKey, 20, 20);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleExport = () => {
    const data = filtered.map((f) => currentBizType === '工装'
      ? {
        记账日期: formatDate(f.date),
        收支类型: f.type,
        记账金额: f.amount,
        合同编号: f.contractNo,
        项目名称: f.address || '',
        '甲方/收款方': f.relatedParty,
        收款阶段或支出类别: f.stage || f.category || '',
        收支账户: f.paymentMethod || '',
        说明: f.summary,
      }
      : {
        记账日期: formatDate(f.date),
        收支类型: f.type,
        记账金额: f.amount,
        合同编号: f.contractNo,
        归属项目: f.address || '',
        客户或收款方: f.relatedParty,
        收款阶段或支出类别: f.stage || f.category || '',
        收支账户: f.paymentMethod || '',
        说明: f.summary,
      });
    const dateSuffix = dateFrom || dateTo ? `_${dateFrom || '起'}至${dateTo || '今'}` : '';
    exportToExcel(data, [], `${currentBizType}资金流水明细${dateSuffix}`);
  };

  const getControlType = (row: FlowItem) => {
    if (row.type === '收款') return 'reverse';
    return shouldReverseExpense(row.source) ? 'reverse' : 'delete';
  };

  const getControlLabel = (row: FlowItem) => {
    if (row.type === '收款') return '冲销';
    return getControlType(row) === 'reverse' ? '冲销' : '删除';
  };

  const openFlowControl = (row: FlowItem) => {
    setSelectedFlow(null);
    setControlFlow(row);
    setControlReason('');
  };

  const handleFlowControl = async () => {
    if (!controlFlow?.source) return;
    const action = getControlType(controlFlow);
    const reason = controlReason.trim();
    if (action === 'reverse' && !reason) {
      await showAlert(`${controlFlow.type === '收款' ? '收款' : '已付款支出'}冲销必须填写原因。`);
      return;
    }
    const confirmed = await showConfirm(
      `${controlFlow.type === '收款' ? '客户' : '收款方'}：${controlFlow.relatedParty || '-'}\n金额：${formatMoney(controlFlow.amount || 0)}`,
      { title: `确认${getControlLabel(controlFlow)}该${controlFlow.type}记录吗？`, confirmStyle: 'danger', confirmText: `确认${getControlLabel(controlFlow)}` },
    );
    if (!confirmed) return;
    try {
      const now = new Date().toISOString();
      const item = controlFlow.source;
      const next = controlFlow.type === '收款'
        ? { ...item, lifecycleStatus: 'reversed', reversedAt: now, reversedBy: myName, reverseReason: reason }
        : action === 'reverse'
          ? { ...item, lifecycleStatus: 'reversed', reversedAt: now, reversedBy: myName, reverseReason: reason }
          : { ...item, lifecycleStatus: 'deleted', deletedAt: now, deletedBy: myName, voidReason: reason };
      if (controlFlow.type === '收款') {
        await updateReceipt(next as any);
      } else {
        await updateExpense(next as any);
      }
      setControlFlow(null);
      setControlReason('');
      await recordFinanceAuditAction({
        module: controlFlow.type === '收款' ? 'receipt' : 'expense',
        action,
        recordId: String(item._id || item.id),
        recordName: controlFlow.type === '收款'
          ? `${item.customerName || '-'}-${item.stage || '收款'}`
          : item.supplier || item.contractNo || item.id,
        bizType: currentBizType,
        amount: item.amount,
        reason,
        operatorId: user?.id,
        operatorName: myName,
        before: item,
        after: next,
      });
      await notifyFinanceAuditAction({
        module: controlFlow.type === '收款' ? 'receipt' : 'expense',
        action,
        recordId: String(item._id || item.id),
        recordName: controlFlow.type === '收款'
          ? `${item.customerName || '-'}-${item.stage || '收款'}`
          : item.supplier || item.contractNo || item.id,
        bizType: currentBizType,
        amount: item.amount,
        reason,
        operatorId: user?.id,
        operatorName: myName,
        recipientUserIds: adminUserIds,
      });
    } catch (error: any) {
      await showAlert(`${getControlLabel(controlFlow)}失败：${error?.message || '未知错误'}`);
    }
  };

  const columns = [
    {
      key: 'date',
      title: '日期',
      width: '120px',
      sortable: true,
      render: (row: FlowItem) => formatDate(row.date),
    },
    {
      key: 'type',
      title: '类型',
      width: '90px',
      sortable: true,
      render: (row: FlowItem) => {
        const isIncome = row.type === '收款';
        return (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
            }`}
          >
            {row.type}
          </span>
        );
      },
    },
    {
      key: 'amount',
      title: '金额',
      width: '140px',
      sortable: true,
      render: (row: FlowItem) => {
        const isIncome = row.type === '收款';
        return (
          <span className={`font-medium ${isIncome ? 'text-emerald-600' : 'text-red-500'}`}>
            {isIncome ? '+' : '-'}
            {formatMoney(row.amount)}
          </span>
        );
      },
    },
    {
      key: 'address',
      title: '地址',
      width: '220px',
      sortable: true,
      render: (row: FlowItem) => (
        <span className="block max-w-[220px] truncate font-medium text-gray-900" title={row.address || '-'}>
          {row.address || '-'}
        </span>
      ),
    },
    {
      key: 'primaryCategory',
      title: '一级分类',
      width: '150px',
      render: (row: FlowItem) => (
        <span className="block truncate text-gray-700" title={row.primaryCategory || '-'}>
          {row.primaryCategory || '-'}
        </span>
      ),
    },
    {
      key: 'secondaryCategory',
      title: '二级分类',
      width: '180px',
      render: (row: FlowItem) => (
        <span className="block truncate font-medium text-gray-800" title={row.secondaryCategory || '-'}>
          {row.secondaryCategory || '-'}
        </span>
      ),
    },
    {
      key: 'remark',
      title: '备注',
      width: '240px',
      render: (row: FlowItem) => (
        <span className="block truncate text-gray-600" title={row.remark || '-'}>
          {row.remark || '-'}
        </span>
      ),
    },
    {
      key: 'detailAction',
      title: '详情',
      width: '100px',
      render: (row: FlowItem) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedFlow(row);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-gold-50 px-2 py-1 text-xs font-medium text-gold-700 hover:bg-gold-100"
        >
          <ExternalLink size={12} />
          查看
        </button>
      ),
    },
  ];

  const mobileColumns = [
    {
      key: 'date',
      title: '日期',
      render: (row: FlowItem) => (
        <div>
          <div className="text-[11px] font-medium text-gray-400">{formatDate(row.date)}</div>
          <div className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-gray-900">
            {row.address || row.relatedParty || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      title: '金额',
      render: (row: FlowItem) => {
        const isIncome = row.type === '收款';
        return (
          <div className="shrink-0 text-right">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
              {row.type}
            </span>
            <div className={`mt-1 text-[15px] font-bold ${isIncome ? 'text-emerald-600' : 'text-red-500'}`}>
              {isIncome ? '+' : '-'}{formatMoney(row.amount)}
            </div>
          </div>
        );
      },
    },
    {
      key: 'categorySummary',
      title: '分类与备注',
      render: (row: FlowItem) => (
        <div className="mt-2 rounded bg-gray-50 px-3 py-2">
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="shrink-0 text-gray-400">分类</span>
            <span className="text-right font-medium text-gray-700">{row.primaryCategory || '-'} / {row.secondaryCategory || '-'}</span>
          </div>
          {row.remark ? (
            <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-400">备注：{row.remark}</div>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="erp-page-spaced">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base md:text-lg font-bold text-gray-900">资金流水</h1>
          <p className="text-gold-500 text-xs md:text-sm">所有收付款记录汇总</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCategoryManager(true)}
            className="erp-btn-secondary hidden md:inline-flex"
          >
            <Settings size={15} />
            收支类别
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="erp-btn-primary"
          >
            <Upload size={14} />
            导入
          </button>
          <button
            onClick={handleExport}
            className="erp-btn-secondary"
          >
            <Download size={14} />
            导出Excel
          </button>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="erp-finance-stats">
        <button type="button" onClick={() => setFlowType('收款')} className={`erp-finance-stat-button ${flowType === '收款' ? 'is-active' : ''}`}>
          <StatCard
            title="收入总额"
            value={formatMoney(incomeTotal)}
            icon={TrendingUp}
            accent="emerald"
            sub="点击查看收入流水"
          />
        </button>
        <button type="button" onClick={() => setFlowType('支出')} className={`erp-finance-stat-button ${flowType === '支出' ? 'is-active' : ''}`}>
          <StatCard
            title="支出总额"
            value={formatMoney(expenseTotal)}
            icon={TrendingDown}
            accent="red"
            sub="点击查看支出流水"
          />
        </button>
        <button type="button" onClick={() => setFlowType('全部')} className={`erp-finance-stat-button ${flowType === '全部' ? 'is-active' : ''}`}>
          <StatCard
            title="净额"
            value={formatMoney(netTotal)}
            icon={DollarSign}
            accent={netTotal >= 0 ? 'gold' : 'red'}
            sub={netTotal >= 0 ? '点击查看全部流水' : '点击查看全部流水'}
          />
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="erp-surface overflow-visible">
      <div className="erp-finance-date-row">
        <Select value={filterYear} onChange={setFilterYear} options={yearOptions} className="w-auto shrink min-w-0" />
        <Select value={filterMonthFrom} onChange={setFilterMonthFrom} options={MONTH_OPTS} className="w-auto shrink min-w-0" />
        <span className="shrink-0 text-xs text-gray-400">至</span>
        <Select value={filterMonthTo} onChange={setFilterMonthTo} options={MONTH_OPTS} className="w-auto shrink min-w-0" />
        {(filterYear) && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setFilterYear('');
              setFilterMonthFrom('1');
              setFilterMonthTo('12');
            }}
            className="shrink-0 text-xs font-medium text-gold-500 hover:text-gold-600"
          >
            清除
          </button>
        )}
      </div>
      <div className="erp-finance-action-row">
          <Select
            value={flowType}
            onChange={(v) => setFlowType(v as '全部' | '收款' | '支出')}
            options={[
              { value: '全部', label: '全部类型' },
              { value: '收款', label: '收入' },
              { value: '支出', label: '支出' },
            ]}
            className="erp-finance-type-select"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目地址/客户姓名"
            className="erp-search-input"
          />
        {search && (
          <button
            onClick={() => {
              setSearch('');
            }}
            className="shrink-0 text-xs font-medium text-gold-500 hover:text-gold-600"
          >
            清除
          </button>
        )}
      </div>
        <DataTable
            columns={columns}
            data={visibleFlows}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            rowKey={(row) => row.id}
            onRowClick={(row) => setSelectedFlow(row)}
            emptyText="暂无流水记录"
            mobileCardColumns={mobileColumns}
            horizontalScroll
            fixedLeft={1}
        />
        {hasMoreFlows && (
          <div className="flex justify-center border-t border-gray-50 px-4 py-4">
            <button
              type="button"
              onClick={loadMoreFlows}
              className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gold-300 hover:bg-gold-50 hover:text-gold-700 transition-colors"
            >
              加载更多（已显示 {visibleFlowCount} / 共 {filtered.length}）
            </button>
          </div>
        )}
      </div>
      <Modal open={!!selectedFlow} onClose={() => setSelectedFlow(null)} title="流水详情">
        {selectedFlow && (
          <div className="space-y-4">
            <div className="rounded border border-gray-100 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400">{formatDate(selectedFlow.date)}</p>
                  <p className="mt-1 break-words text-base font-semibold leading-6 text-gray-900">
                    {selectedFlow.address || selectedFlow.relatedParty || '-'}
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${selectedFlow.type === '收款' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {selectedFlow.type}
                  </span>
                  <p className={`mt-1 break-all text-xl font-bold leading-7 ${selectedFlow.type === '收款' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {selectedFlow.type === '收款' ? '+' : '-'}{formatMoney(selectedFlow.amount)}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <DetailItem label="合同编号" value={selectedFlow.contractNo || '-'} />
              <DetailItem label={selectedFlow.type === '收款' ? '客户姓名' : '收款方/供应商'} value={selectedFlow.relatedParty || '-'} />
              <DetailItem label="项目地址" value={selectedFlow.address || '-'} wide />
              {selectedFlow.type === '收款' ? <DetailItem label="收款阶段" value={selectedFlow.stage || '-'} /> : null}
              <DetailItem label="一级分类" value={selectedFlow.primaryCategory || '-'} />
              <DetailItem label="二级分类" value={selectedFlow.secondaryCategory || '-'} />
              <DetailItem label={selectedFlow.type === '收款' ? '收款方式' : '支出方式'} value={selectedFlow.paymentMethod || '-'} />
              {selectedFlow.status ? <DetailItem label="状态" value={selectedFlow.status} /> : null}
              <DetailItem label="备注" value={selectedFlow.remark || '-'} wide />
            </div>
            <AttachmentSection attachments={selectedFlow.attachments || []} />
            {selectedFlow.type === '支出' ? (
              <div className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                专业处理方式：未付款的测试支出可以删除；已付款支出不建议直接删除，应做冲销，系统会保留原记录和冲销痕迹，且不再计入资金流水汇总。
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                openFlowControl(selectedFlow);
              }}
              className="erp-btn-secondary w-full justify-center"
            >
              {getControlLabel(selectedFlow)}该记录
            </button>
            {selectedFlow.contractId ? (
              <button
                type="button"
                onClick={() => {
                  const target = selectedFlow.contractId;
                  setSelectedFlow(null);
                  navigate(`/contracts/${target}`);
                }}
                className="erp-btn-primary w-full justify-center"
              >
                跳转到合同页面
              </button>
            ) : null}
          </div>
        )}
      </Modal>
      <Modal
        open={!!controlFlow}
        onClose={() => { setControlFlow(null); setControlReason(''); }}
        title={controlFlow ? `${getControlLabel(controlFlow)}${controlFlow.type}记录` : '处理流水'}
      >
        {controlFlow && (
          <div className="space-y-4">
            <div className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              {controlFlow.type === '收款'
                ? '收款记录不直接删除。冲销后该记录不再计入收入和资金流水汇总，但会保留原始记录、冲销原因和操作日志。'
                : getControlType(controlFlow) === 'reverse'
                  ? '已付款支出不直接删除。冲销后该记录不再计入支出和资金流水汇总，但会保留原始记录、冲销原因和操作日志。'
                  : '未付款或测试类支出可删除。删除后该记录不再出现在业务列表中，并写入财务操作日志。'}
            </div>
            <div className="rounded bg-gray-50 px-3 py-3 text-sm text-gray-600">
              <div>{controlFlow.type === '收款' ? '客户' : '收款方'}：<span className="font-medium text-gray-900">{controlFlow.relatedParty || '-'}</span></div>
              <div className="mt-1">合同编号：<span className="font-medium text-gray-900">{controlFlow.contractNo || '-'}</span></div>
              <div className="mt-1">金额：<span className={`font-medium ${controlFlow.type === '收款' ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(controlFlow.amount || 0)}</span></div>
              <div className="mt-1">说明：<span className="font-medium text-gray-900">{controlFlow.summary || '-'}</span></div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">
                {getControlLabel(controlFlow)}原因{getControlType(controlFlow) === 'reverse' ? ' *' : ''}
              </label>
              <textarea
                value={controlReason}
                onChange={(event) => setControlReason(event.target.value)}
                rows={3}
                placeholder={getControlType(controlFlow) === 'reverse' ? '请填写冲销原因，便于后续查账' : '可填写删除原因，便于后续追溯'}
                className="erp-input resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { setControlFlow(null); setControlReason(''); }} className="erp-btn-secondary">取消</button>
              <button type="button" onClick={handleFlowControl} className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600">
                确认{getControlLabel(controlFlow)}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <FinanceImportModal open={showImportModal} onClose={() => setShowImportModal(false)} />
      <ExpenseCategoryManager
        open={showCategoryManager}
        initialKind="expense"
        categories={expenseCategories}
        incomeCategories={incomeCategories}
        expenses={expenses.filter((expense: any) => expense.bizType === currentBizType && isActiveFinanceRecord(expense))}
        incomes={receipts.filter((receipt: any) => receipt.bizType === currentBizType && isActiveFinanceRecord(receipt))}
        saving={savingCategories}
        onClose={() => setShowCategoryManager(false)}
        onSave={handleExpenseCategorySave}
        onSaveIncome={handleIncomeCategorySave}
      />
    </div>
  );
}

function DetailItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded border border-gray-100 bg-white px-3 py-2.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function AttachmentSection({ attachments }: { attachments: AttachmentValue[] }) {
  const files = normalizeAttachments(attachments);
  return (
    <div className="rounded border border-gray-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Paperclip size={14} />
          凭证附件
        </div>
        <span className="text-xs text-gray-400">{files.length} 个</span>
      </div>
      {files.length === 0 ? (
        <p className="py-3 text-center text-xs text-gray-400">暂无凭证附件</p>
      ) : (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div key={`${file.fileID || file.name}-${index}`} className="flex items-center justify-between gap-3 rounded bg-gray-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800" title={file.name}>{file.name}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">{file.uploader || '-'}{file.sizeStr ? ` · ${file.sizeStr}` : ''}</p>
              </div>
              <button
                type="button"
                onClick={() => void downloadAttachment(file)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                <Download size={13} />
                下载
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
