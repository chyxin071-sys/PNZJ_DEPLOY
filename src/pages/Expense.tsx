import { useState, useMemo, useEffect } from 'react';
import { TrendingDown, DollarSign, FileText, Plus, Loader2, Paperclip, Edit3, Trash2, Download, X, Settings, RotateCcw } from 'lucide-react';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import StatCard from '@/components/StatCard';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { useAuthStore } from '@/store/authStore';
import { useDialogStore } from '@/store/dialogStore';
import FormAttachmentList from '@/components/FormAttachmentList';
import { formatMoney, formatDate, generateId } from '@/utils/format';
import type { AttachmentValue } from '@/types';
import { getAttachmentSummary, mergeAttachments, normalizeAttachments, openAttachment, uploadFinanceAttachments } from '@/utils/financeAttachments';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import ExpenseCategoryManager from '@/components/ExpenseCategoryManager';
import ExpenseCategoryPicker from '@/components/ExpenseCategoryPicker';
import {
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  expenseCategoryPayload,
  loadIncomeCategories,
  loadExpenseCategories,
  resolveExpenseCategory,
  saveIncomeCategories,
  saveExpenseCategories,
  type ExpenseCategory,
} from '@/services/expenseCategories';
import { notifyFinanceAuditAction, recordFinanceAuditAction } from '@/services/financeAuditLog';

const CATEGORY_BADGE: Record<string, string> = {
  '材料费': 'bg-blue-50 text-blue-600',
  '人工费': 'bg-purple-50 text-purple-600',
  '外包费': 'bg-amber-50 text-amber-600',
  '管理费': 'bg-gray-100 text-gray-600',
  '其他': 'bg-slate-100 text-slate-600',
};

const categoryBadgeClass = (name: string) => CATEGORY_BADGE[name] || 'bg-gray-100 text-gray-600';

const isActiveExpense = (expense: any) => !['deleted', 'voided', 'reversed'].includes(expense.lifecycleStatus);
const shouldReverseExpense = (expense: any) => ['已付', '已付款'].includes(String(expense.status || '').trim());

export default function Expense() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { receipts, expenses, contracts, addExpense, updateExpense } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { user, users, loadUsers } = useAuthStore();
  const { showConfirm, showAlert } = useDialogStore();
  const myName = user?.name || '';
  const isAdmin = user?.role === 'admin';
  const canSeeAllFinancial = isAdmin || user?.role === 'finance';

  const filteredContracts = useMemo(() => contracts.filter(c => c.bizType === currentBizType), [contracts, currentBizType]);

  const [activeTab, setActiveTab] = useState<string>('全部');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonthFrom, setFilterMonthFrom] = useState('1');
  const [filterMonthTo, setFilterMonthTo] = useState('12');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [incomeCategories, setIncomeCategories] = useState<ExpenseCategory[]>(DEFAULT_INCOME_CATEGORIES);
  const [savingCategories, setSavingCategories] = useState(false);
  const [form, setForm] = useState({
    contractId: '',
    primaryCategoryId: DEFAULT_EXPENSE_CATEGORIES[0].id,
    secondaryCategoryId: DEFAULT_EXPENSE_CATEGORIES[0].children[0].id,
    category: DEFAULT_EXPENSE_CATEGORIES[0].children[0].name,
    amount: '',
    supplier: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    status: '已付' as '已付' | '未付',
    remark: '',
    attachments: [] as string[],
  });
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [controlAction, setControlAction] = useState<{ type: 'delete' | 'reverse'; item: any } | null>(null);
  const [controlReason, setControlReason] = useState('');

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const adminUserIds = useMemo(() => users
    .filter((u: any) => u.role === 'admin' && u.status !== 'inactive' && u.isActive !== false)
    .map((u: any) => String(u._id || u.id || '').trim())
    .filter(Boolean), [users]);

  useEffect(() => {
    loadExpenseCategories(currentBizType)
      .then((categories) => setExpenseCategories(categories))
      .catch((error) => {
        console.error('加载支出类别失败', error);
        setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
      });
    loadIncomeCategories(currentBizType)
      .then(setIncomeCategories)
      .catch((error) => {
        console.error('加载收入类别失败', error);
        setIncomeCategories(DEFAULT_INCOME_CATEGORIES);
      });
    setActiveTab('全部');
  }, [currentBizType]);

  const activeCategories = useMemo(() => ['全部', ...expenseCategories.map((category) => category.name)], [expenseCategories]);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      const contractId = searchParams.get('contractId');
      if (contractId) {
        const contract = filteredContracts.find((c) => c.id === contractId || c._id === contractId);
        setForm(f => ({ ...f, contractId, supplier: currentBizType === '家装' && contract ? contract.customerName : f.supplier }));
      }
      setShowModal(true);
      // clear search params so it doesn't reopen on refresh
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, filteredContracts, currentBizType]);

  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId) return;
    const target = expenses.find((expense: any) => expense.id === focusId || expense._id === focusId);
    if (!target) return;
    setActiveTab('全部');
    setFilterYear('');
    setDateFrom('');
    setDateTo('');
    setSearch(target.contractNo || target.supplier || '');
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [expenses, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    let list = [...expenses.filter(e => e.bizType === currentBizType && isActiveExpense(e))];
    if (dateFrom) list = list.filter((e) => e.expenseDate >= dateFrom);
    if (dateTo) list = list.filter((e) => e.expenseDate <= dateTo);
    if (filterYear) {
      const minM = (filterMonthFrom || '1').padStart(2, '0');
      const maxM = (filterMonthTo || '12').padStart(2, '0');
      const minDate = `${filterYear}-${minM}-01`;
      const maxDate = dayjs(`${filterYear}-${maxM}-01`).endOf('month').format('YYYY-MM-DD');
      list = list.filter((e) => e.expenseDate >= minDate && e.expenseDate <= maxDate);
    }
    if (search) {
      const q = search.toLowerCase();
      const matchedContractIds = new Set(
        contracts.filter(c => 
          c.houseAddress.toLowerCase().includes(q) || 
          c.customerName.toLowerCase().includes(q) ||
          c.contractNo.toLowerCase().includes(q)
        ).flatMap(c => [c.id, (c as any)._id].filter(Boolean) as string[])
      );
      list = list.filter(e => matchedContractIds.has(e.contractId));
    }
    if (activeTab !== '全部') list = list.filter((e) => resolveExpenseCategory(e, expenseCategories).primaryName === activeTab);
    // 非管理员只看自己创建的
    if (!canSeeAllFinancial) list = list.filter(e => e.createdBy === myName);
    if (sortField) {
      list.sort((a, b) => {
        const va = String(a[sortField as keyof typeof a] ?? '');
        const vb = String(b[sortField as keyof typeof b] ?? '');
        const cmp = va.localeCompare(vb, 'zh-CN');
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    } else {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return list;
  }, [expenses, currentBizType, dateFrom, dateTo, filterYear, filterMonthFrom, filterMonthTo, search, contracts, activeTab, sortField, sortOrder, canSeeAllFinancial, myName, expenseCategories]);

  const totalExpense = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthExpense = useMemo(
    () => filtered.filter((e) => e.expenseDate >= monthStart).reduce((s, e) => s + e.amount, 0),
    [filtered, monthStart],
  );

  const openExpenseControlAction = (item: any) => {
    setControlAction({ type: shouldReverseExpense(item) ? 'reverse' : 'delete', item });
    setControlReason('');
  };

  const handleExpenseControlAction = async () => {
    if (!controlAction) return;
    const { type, item } = controlAction;
    const reason = controlReason.trim();
    if (type === 'reverse' && !reason) {
      await showAlert('已付款支出冲销必须填写原因。');
      return;
    }
    const title = type === 'reverse' ? '确认冲销该支出记录吗？' : '确认删除该支出记录吗？';
    const confirmed = await showConfirm(
      `收款方：${item.supplier || '-'}\n金额：${formatMoney(item.amount || 0)}`,
      { title, confirmStyle: 'danger', confirmText: type === 'reverse' ? '确认冲销' : '确认删除' },
    );
    if (!confirmed) return;
    try {
      const now = new Date().toISOString();
      const next = type === 'reverse'
        ? { ...item, lifecycleStatus: 'reversed', reversedAt: now, reversedBy: myName, reverseReason: reason }
        : { ...item, lifecycleStatus: 'deleted', deletedAt: now, deletedBy: myName, voidReason: reason };
      await updateExpense(next as any);
      setControlAction(null);
      setControlReason('');
      await recordFinanceAuditAction({
        module: 'expense',
        action: type,
        recordId: String(item._id || item.id),
        recordName: item.supplier || item.contractNo || item.id,
        bizType: currentBizType,
        amount: item.amount,
        reason,
        operatorId: user?.id,
        operatorName: myName,
        before: item,
        after: next,
      });
      await notifyFinanceAuditAction({
        module: 'expense',
        action: type,
        recordId: String(item._id || item.id),
        recordName: item.supplier || item.contractNo || item.id,
        bizType: currentBizType,
        amount: item.amount,
        reason,
        operatorId: user?.id,
        operatorName: myName,
        recipientUserIds: adminUserIds,
      });
    } catch (e: any) { await showAlert((type === 'reverse' ? '冲销失败：' : '删除失败：') + (e?.message || '未知错误')); }
  };

  const openEditExpense = (row: Record<string, unknown>) => {
    const path = resolveExpenseCategory(row as any, expenseCategories);
    setEditingId(row.id as string);
    setForm({
      contractId: (row.contractId as string) || '',
      primaryCategoryId: path.primaryId || expenseCategories[0]?.id || '',
      secondaryCategoryId: path.secondaryId || expenseCategories[0]?.children[0]?.id || '',
      category: path.secondaryName || expenseCategories[0]?.children[0]?.name || '',
      amount: String(row.amount || ''),
      supplier: (row.supplier as string) || '',
      expenseDate: (row.expenseDate as string)?.slice(0, 10) || '',
      status: (row.status as '已付' | '未付') || '已付',
      remark: (row.remark as string) || '',
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
    });
    setAttachmentFiles([]);
    setShowModal(true);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFilterYear('');
    setFilterMonthFrom('1');
    setFilterMonthTo('12');
    setSearch('');
    setActiveTab('全部');
  };

  const handleCategorySave = async (categories: ExpenseCategory[]) => {
    setSavingCategories(true);
    try {
      const previous = expenseCategories;
      const normalized = await saveExpenseCategories(categories, currentBizType);
      const updates = expenses.flatMap((expense: any) => {
        if (expense.bizType !== currentBizType || !isActiveExpense(expense)) return [];
        const oldPath = resolveExpenseCategory(expense, previous);
        const primary = normalized.find((category) => category.id === oldPath.primaryId);
        const secondary = primary?.children.find((child) => child.id === oldPath.secondaryId);
        if (!expense.id || !primary || !secondary) return [];
        const nextPath = {
          primaryId: primary.id,
          primaryName: primary.name,
          secondaryId: secondary.id,
          secondaryName: secondary.name,
        };
        return [{ ...expense, ...expenseCategoryPayload(nextPath) }];
      });
      for (const update of updates) {
        await updateExpense(update as any);
      }
      setExpenseCategories(normalized);
      const activeStillExists = activeTab === '全部' || normalized.some((category) => category.name === activeTab);
      if (!activeStillExists) setActiveTab('全部');
      setShowCategoryManager(false);
    } catch (error: any) {
      alert(error?.message || '支出类别保存失败，请重试');
    } finally {
      setSavingCategories(false);
    }
  };

  const handleIncomeCategorySave = async (categories: ExpenseCategory[]) => {
    setSavingCategories(true);
    try {
      const normalized = await saveIncomeCategories(categories, currentBizType);
      setIncomeCategories(normalized);
      setShowCategoryManager(false);
    } catch (error: any) {
      alert(error?.message || '收入类别保存失败，请重试');
    } finally {
      setSavingCategories(false);
    }
  };

  const filterCurrentMonth = () => {
    const month = String(now.getMonth() + 1);
    setDateFrom('');
    setDateTo('');
    setFilterYear(String(now.getFullYear()));
    setFilterMonthFrom(month);
    setFilterMonthTo(month);
    setSearch('');
    setActiveTab('全部');
  };

  const MONTH_OPTS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` }));

  // 年份选项
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    expenses.forEach(e => { if (e.expenseDate) years.add(String(dayjs(e.expenseDate).year())); });
    return [{ value: '', label: '全部年份' }, ...Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)).map(y => ({ value: y, label: y }))];
  }, [expenses]);

  const selectedContract = useMemo(
    () => filteredContracts.find((c) => c.id === form.contractId),
    [filteredContracts, form.contractId],
  );

  const handleSubmit = async () => {
    if (!form.amount || !form.supplier || submitting) return;
    setSubmitting(true);
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (attachmentFiles.length > 0) {
        try {
          uploadedAttachments = await uploadFinanceAttachments(
            attachmentFiles,
            `finance/expenses/${selectedContract?.id || 'general'}`,
            myName || 'ERP'
          );
        } catch (uploadError: any) {
          const shouldContinue = window.confirm(
            `${uploadError?.message || '附件上传失败'}\n\n是否先不带附件保存这条支出？后续可再编辑补传。`
          );
          if (!shouldContinue) {
            throw uploadError;
          }
        }
      }
      const existingExpense = editingId ? expenses.find((item) => item.id === editingId) : undefined;
      const primary = expenseCategories.find((category) => category.id === form.primaryCategoryId) || expenseCategories[0];
      const secondary = primary?.children.find((child) => child.id === form.secondaryCategoryId) || primary?.children[0];
      const categoryPath = {
        primaryId: primary?.id || '',
        primaryName: primary?.name || '',
        secondaryId: secondary?.id || '',
        secondaryName: secondary?.name || form.category || '其他支出',
      };
      const payload: any = {
        id: editingId || generateId(),
        contractId: form.contractId,
        contractNo: selectedContract?.contractNo ?? '',
        bizType: currentBizType,
        ...expenseCategoryPayload(categoryPath),
        amount: Number(form.amount),
        supplier: form.supplier,
        payMethod: '银行转账',
        expenseDate: form.expenseDate,
        status: form.status,
        remark: form.remark,
        createdAt: existingExpense?.createdAt || new Date().toISOString(),
        attachments: mergeAttachments(form.attachments, uploadedAttachments),
      };
      if (!editingId) payload.createdBy = myName;
      await (editingId ? updateExpense : addExpense)(payload);
      setShowModal(false);
      setEditingId(null);
      setAttachmentFiles([]);
      setForm({
        contractId: '',
        primaryCategoryId: expenseCategories[0]?.id || DEFAULT_EXPENSE_CATEGORIES[0].id,
        secondaryCategoryId: expenseCategories[0]?.children[0]?.id || DEFAULT_EXPENSE_CATEGORIES[0].children[0].id,
        category: expenseCategories[0]?.children[0]?.name || DEFAULT_EXPENSE_CATEGORIES[0].children[0].name,
        amount: '',
        supplier: '',
        expenseDate: new Date().toISOString().slice(0, 10),
        status: '已付',
        remark: '',
        attachments: [],
      });
    } catch (error: any) {
      console.error('支出保存失败', error);
      alert(error?.message || '支出保存失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: 'contractId', title: '项目地址', render: (row: Record<string, unknown>) => {
      const ct = filteredContracts.find((c) => c.id === row.contractId as string);
      return <div className="max-w-[160px] md:max-w-[200px] truncate" title={ct?.houseAddress}>{ct?.houseAddress || '-'}</div>;
    }},
    {
      key: 'category', title: '类别',
      render: (row: Record<string, unknown>) => {
        const path = resolveExpenseCategory(row as any, expenseCategories);
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${categoryBadgeClass(path.primaryName)}`}>
              {path.primaryName || '-'}
            </span>
            <span className="text-[11px] text-gray-400">{path.secondaryName || '-'}</span>
          </div>
        );
      },
    },
    {
      key: 'amount', title: '金额', sortable: true, align: 'right' as const,
      render: (row: Record<string, unknown>) => (
        <span className="text-red-500 font-medium">{formatMoney(row.amount as number)}</span>
      ),
    },
    { key: 'supplier', title: '收款方', sortable: true, render: (row: Record<string, unknown>) => <div className="max-w-[120px] truncate" title={row.supplier as string}>{row.supplier as string}</div> },
    {
      key: 'expenseDate', title: '日期', sortable: true,
      render: (row: Record<string, unknown>) => formatDate(row.expenseDate as string),
    },
    {
      key: 'status', title: '状态', sortable: true,
      render: (row: Record<string, unknown>) => {
        const s = row.status as string;
        return (
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            s === '已付'
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-amber-50 text-amber-600'
          }`}>
            {s}
          </span>
        );
      },
    },
    {
      key: 'attachments',
      title: '凭证',
      render: (row: Record<string, unknown>) => (
        <AttachmentCell 
          attachments={row.attachments as AttachmentValue[] | undefined} 
          onUploadClick={() => openEditExpense(row)} 
          onDelete={async (idx) => {
            try {
              const r = row as any;
              const newAttachments = [...(r.attachments || [])];
              newAttachments.splice(idx, 1);
              await useFinanceStore.getState().updateExpense({ ...r, attachments: newAttachments });
            } catch (e: any) {
              alert('删除附件失败: ' + (e?.message || '未知错误'));
            }
          }}
        />
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '70px',
      render: (row: Record<string, unknown>) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEditExpense(row)} className="p-1 text-gray-400 hover:text-gold-500 rounded" title="编辑">
            <Edit3 size={12} />
          </button>
          <button
            onClick={() => openExpenseControlAction(row)}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            title={shouldReverseExpense(row) ? '冲销' : '删除'}
          >
            {shouldReverseExpense(row) ? <RotateCcw size={12} /> : <Trash2 size={12} />}
          </button>
        </div>
      ),
    },
  ];

  const mobileColumns = [
    {
      key: 'expenseDate',
      title: '日期',
      render: (row: Record<string, unknown>) => {
        const ct = filteredContracts.find((c) => c.id === row.contractId as string);
        return (
          <div>
            <div className="text-[11px] font-medium text-gray-400">{formatDate(row.expenseDate as string)}</div>
            <div className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-gray-900">
              {ct?.houseAddress || '-'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'amount',
      title: '支出',
      render: (row: Record<string, unknown>) => (
        <div className="shrink-0 text-right">
          <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-500">支出</span>
          <div className="mt-1 text-[15px] font-bold text-red-500">-{formatMoney(row.amount as number)}</div>
        </div>
      ),
    },
    {
      key: 'category',
      title: '支出类别',
      render: (row: Record<string, unknown>) => (
        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-400">支出类别</span>
            <span className={`rounded px-2 py-0.5 font-medium ${categoryBadgeClass(resolveExpenseCategory(row as any, expenseCategories).primaryName)}`}>
              {resolveExpenseCategory(row as any, expenseCategories).primaryName || '-'} / {resolveExpenseCategory(row as any, expenseCategories).secondaryName || '-'}
            </span>
          </div>
          {row.remark ? (
            <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-400">备注：{row.remark as string}</div>
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
          <h1 className="text-base md:text-lg font-bold text-gray-900">支出管理</h1>
          <p className="text-gold-500 text-xs md:text-sm">管理所有支出记录</p>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <button
            onClick={() => setShowCategoryManager(true)}
            className="erp-btn-secondary"
          >
            <Settings size={15} /> 支出类别
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="erp-btn-primary"
          >
            <Plus size={16} /> 新增支出
          </button>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="erp-finance-stats">
        <button type="button" onClick={clearFilters} className={`erp-finance-stat-button ${activeTab === '全部' && !filterYear && !search ? 'is-active' : ''}`}>
          <StatCard title="支出总额" value={formatMoney(totalExpense)} icon={TrendingDown} accent="red" sub="点击查看全部支出" />
        </button>
        <button type="button" onClick={filterCurrentMonth} className={`erp-finance-stat-button ${filterYear === String(now.getFullYear()) && filterMonthFrom === String(now.getMonth() + 1) && filterMonthTo === String(now.getMonth() + 1) ? 'is-active' : ''}`}>
          <StatCard title="本月支出" value={formatMoney(monthExpense)} icon={DollarSign} accent="red" sub="点击筛选本月" />
        </button>
        <button type="button" onClick={clearFilters} className={`erp-finance-stat-button ${activeTab === '全部' && !filterYear && !search ? 'is-active' : ''}`}>
          <StatCard title="支出笔数" value={`${filtered.length} 笔`} icon={FileText} accent="red" sub="点击查看全部记录" />
        </button>
      </div>

      {/* 分类Tab */}
      <div>
        <div className="flex flex-wrap items-center gap-0 border-b border-gray-200">
          {activeCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === cat
                  ? 'text-gold-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {cat}
              {activeTab === cat && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 日期筛选 + 搜索 */}
      <div className="erp-surface overflow-visible">
        <div className="erp-finance-date-row">
          <Select value={filterYear} onChange={setFilterYear} options={yearOptions} className="w-auto shrink min-w-0" />
          <Select value={filterMonthFrom} onChange={setFilterMonthFrom} options={MONTH_OPTS} className="w-auto shrink min-w-0" />
          <span className="shrink-0 text-xs text-gray-400">至</span>
          <Select value={filterMonthTo} onChange={setFilterMonthTo} options={MONTH_OPTS} className="w-auto shrink min-w-0" />
          {(filterYear) && (
            <button onClick={() => { setFilterYear(''); setFilterMonthFrom('1'); setFilterMonthTo('12'); setDateFrom(''); setDateTo(''); }}
              className="text-xs text-gold-500 hover:text-gold-600 font-medium shrink-0">清除</button>
          )}
        </div>
        <div className="erp-finance-action-row">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索地址/客户/合同号"
            className="erp-search-input"
          />
          {search && (
            <button onClick={clearFilters}
              className="text-xs text-gold-500 hover:text-gold-600 font-medium shrink-0">清除</button>
          )}
          <button onClick={() => setShowModal(true)} className="erp-btn-primary shrink-0"><Plus size={15} /> 支出</button>
          <button onClick={() => setShowCategoryManager(true)} className="erp-btn-secondary shrink-0 md:hidden"><Settings size={15} /> 类别</button>
        </div>
        <DataTable
            columns={columns}
            data={filtered as unknown as Record<string, unknown>[]}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            rowKey={(row) => row.id as string}
            onRowClick={(row) => {
              if (row.contractId) {
                navigate(`/contracts/${row.contractId}`);
              }
            }}
            mobileCardColumns={mobileColumns}
        />
      </div>

      {/* 新增Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingId(null); setAttachmentFiles([]); }} title={editingId ? '编辑支出' : '新增支出'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">选择合同</label>
            <Select
              value={form.contractId}
              onChange={(v) => {
                const contract = filteredContracts.find((c) => c.id === v);
                setForm({ ...form, contractId: v, supplier: currentBizType === '家装' && contract ? contract.customerName : form.supplier });
              }}
              options={[
                { value: '', label: '请选择合同（可选）' },
                ...filteredContracts.map((c) => ({ value: c.id, label: `${c.contractNo} - ${c.customerName}` })),
              ]}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">支出类别</label>
            <ExpenseCategoryPicker
              categories={expenseCategories}
              primaryId={form.primaryCategoryId}
              secondaryId={form.secondaryCategoryId}
              onChange={(selection) => setForm({
                ...form,
                primaryCategoryId: selection.primaryId,
                secondaryCategoryId: selection.secondaryId,
                category: selection.secondaryName,
              })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">金额</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="请输入支出金额"
              className="erp-input"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款方</label>
            <input
              type="text"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              placeholder={selectedContract?.customerName || '请输入收款方名称'}
              className="erp-input"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">日期</label>
            <DatePicker
              mode="single"
              value={form.expenseDate}
              onChange={(v) => setForm({ ...form, expenseDate: v })}
              placeholder="选择日期"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">状态</label>
            <Select
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as '已付' | '未付' })}
              options={[
                { value: '已付', label: '已付' },
                { value: '未付', label: '未付' },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">备注</label>
            <textarea
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
              rows={2}
              placeholder="备注信息（选填）"
              className="erp-input resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">追加凭证附件</label>
            <input
              type="file"
              multiple
              onChange={(e) => {
                setAttachmentFiles(Array.from(e.target.files || []));
              }}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200"
            />
            <p className="text-xs text-amber-600 mt-1">附件非必填，可先登记支出，后续再补上传票据或收据。</p>
            {attachmentFiles.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">{attachmentFiles.length} 个新文件待上传</p>
            )}
            <FormAttachmentList 
              attachments={form.attachments as any[]} 
              onRemove={(idx) => {
                const newAtt = (form.attachments as any[]).filter((_, i) => i !== idx);
                setForm(prev => ({ ...prev, attachments: newAtt }));
              }} 
            />
          </div>
          <div className="flex justify-center pt-2">
            <button
              onClick={handleSubmit}
              disabled={!form.amount || !form.supplier || submitting}
              className="erp-btn-primary min-w-[220px] justify-center disabled:opacity-40"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {submitting ? '提交中...' : editingId ? '确认修改' : '确认新增'}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!controlAction}
        onClose={() => { setControlAction(null); setControlReason(''); }}
        title={controlAction?.type === 'reverse' ? '冲销支出记录' : '删除支出记录'}
      >
        {controlAction && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              {controlAction.type === 'reverse'
                ? '已付款的支出不能直接删除。冲销后该记录不再计入支出汇总，但会保留原始记录和操作痕迹。'
                : '删除会从业务列表中移除该记录，并写入财务操作日志。'}
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-600">
              <div>收款方：<span className="font-medium text-gray-900">{controlAction.item.supplier || '-'}</span></div>
              <div className="mt-1">金额：<span className="font-medium text-red-500">{formatMoney(controlAction.item.amount || 0)}</span></div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">
                {controlAction.type === 'reverse' ? '冲销原因' : '删除原因'}
              </label>
              <textarea
                value={controlReason}
                onChange={(e) => setControlReason(e.target.value)}
                rows={3}
                placeholder={controlAction.type === 'reverse' ? '请填写冲销原因，便于后续查账' : '可填写删除原因，便于后续追溯'}
                className="erp-input resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setControlAction(null); setControlReason(''); }} className="erp-btn-secondary">取消</button>
              <button onClick={handleExpenseControlAction} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
                {controlAction.type === 'reverse' ? '确认冲销' : '确认删除'}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <ExpenseCategoryManager
        open={showCategoryManager}
        initialKind="expense"
        categories={expenseCategories}
        incomeCategories={incomeCategories}
        expenses={expenses.filter((expense: any) => expense.bizType === currentBizType && isActiveExpense(expense))}
        incomes={receipts.filter((receipt: any) => receipt.bizType === currentBizType && isActiveExpense(receipt))}
        saving={savingCategories}
        onClose={() => setShowCategoryManager(false)}
        onSave={handleCategorySave}
        onSaveIncome={handleIncomeCategorySave}
      />
    </div>
  );
}

import AttachmentViewerModal from '@/components/AttachmentViewerModal';

function AttachmentCell({ attachments, onUploadClick, onDelete }: { attachments?: AttachmentValue[]; onUploadClick?: () => void; onDelete?: (idx: number) => void }) {
  const [showModal, setShowModal] = useState(false);
  const files = normalizeAttachments(attachments);
  if (files.length === 0) {
    return (
      <button 
        type="button" 
        onClick={(e) => { e.stopPropagation(); onUploadClick?.(); }}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-gray-50 px-2 py-1 text-[11px] text-gray-500 hover:text-gold-600 hover:border-gold-300 transition-colors"
      >
        <Plus size={10} /> 上传
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(true);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
        title={files.map((file) => file.name).join('、')}
      >
        <Download size={12} />
        {getAttachmentSummary(files)}
      </button>
      <AttachmentViewerModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        attachments={files} 
        title="凭证附件"
        onDelete={onDelete}
      />
    </>
  );
}
