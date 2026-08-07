import { useState, useMemo, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, Receipt, Plus, Search, X, AlertTriangle, Loader2, Edit3, RotateCcw, Download, Settings } from 'lucide-react';
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
import type { AttachmentValue, Receipt as ReceiptType } from '@/types';
import { getAttachmentSummary, mergeAttachments, normalizeAttachments, openAttachment, uploadFinanceAttachments } from '@/utils/financeAttachments';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { notifyFinanceAuditAction, recordFinanceAuditAction } from '@/services/financeAuditLog';
import ExpenseCategoryManager from '@/components/ExpenseCategoryManager';
import ExpenseCategoryPicker from '@/components/ExpenseCategoryPicker';
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

const isActiveReceipt = (receipt: any) => !['deleted', 'voided', 'reversed'].includes(receipt.lifecycleStatus);

const PAYMENT_METHODS = ['银行转账', '微信', '支付宝', '现金', '其他'];
const incomeCategoryBadgeClass = (name: string) => name === '工程款项' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600';

function getStageReceiptStatus(stage: { amount: number; paid: number; due: number }) {
  if ((stage.amount || 0) <= 0) return 'unset';
  if (stage.due <= 0) return 'paid';
  if (stage.paid > 0) return 'partial';
  return 'pending';
}

export default function Income() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { receipts, expenses, contracts, addReceipt, updateReceipt } = useFinanceStore();
  const { user, users, loadUsers } = useAuthStore();
  const { showConfirm, showAlert } = useDialogStore();
  const myName = user?.name || '';
  const isAdmin = user?.role === 'admin';
  const canSeeAllFinancial = isAdmin || user?.role === 'finance';
  const { currentBizType } = useBizStore();

  const filteredContracts = useMemo(() => {
    let list = contracts.filter(c => c.bizType === currentBizType && c.status !== '已结算');
    if (!canSeeAllFinancial) list = list.filter(c => c.createdBy === myName);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [contracts, currentBizType, canSeeAllFinancial, myName]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonthFrom, setFilterMonthFrom] = useState('1');
  const [filterMonthTo, setFilterMonthTo] = useState('12');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [incomeCategories, setIncomeCategories] = useState<ExpenseCategory[]>(DEFAULT_INCOME_CATEGORIES);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [savingCategories, setSavingCategories] = useState(false);
  const [contractSearch, setContractSearch] = useState('');
  const [form, setForm] = useState({
    contractId: '',
    amount: '',
    paymentMethod: '银行转账',
    stage: '',
    primaryCategoryId: DEFAULT_INCOME_CATEGORIES[0].id,
    secondaryCategoryId: DEFAULT_INCOME_CATEGORIES[0].children[0].id,
    category: DEFAULT_INCOME_CATEGORIES[0].children[0].name,
    receiptDate: new Date().toISOString().slice(0, 10),
    remark: '',
    attachments: [] as string[],
  });
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reverseReceipt, setReverseReceipt] = useState<ReceiptType | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadIncomeCategories(currentBizType).then(setIncomeCategories).catch((error) => {
      console.error('加载收入类别失败', error);
      setIncomeCategories(DEFAULT_INCOME_CATEGORIES);
    });
    loadExpenseCategories(currentBizType).then(setExpenseCategories).catch((error) => {
      console.error('加载支出类别失败', error);
      setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
    });
  }, [currentBizType]);

  const adminUserIds = useMemo(() => users
    .filter((u: any) => u.role === 'admin' && u.status !== 'inactive' && u.isActive !== false)
    .map((u: any) => String(u._id || u.id || '').trim())
    .filter(Boolean), [users]);

  const filtered = useMemo(() => {
    let list = [...receipts.filter(r => r.bizType === currentBizType && isActiveReceipt(r))];
    if (dateFrom) list = list.filter((r) => r.receiptDate >= dateFrom);
    if (dateTo) list = list.filter((r) => r.receiptDate <= dateTo);
    if (filterYear) {
      const minM = (filterMonthFrom || '1').padStart(2, '0');
      const maxM = (filterMonthTo || '12').padStart(2, '0');
      const minDate = `${filterYear}-${minM}-01`;
      const maxDate = dayjs(`${filterYear}-${maxM}-01`).endOf('month').format('YYYY-MM-DD');
      list = list.filter((r) => r.receiptDate >= minDate && r.receiptDate <= maxDate);
    }
    if (search) {
      const q = search.toLowerCase();
      const matchedContractIds = new Set(
        contracts
          .filter(c => c.houseAddress.toLowerCase().includes(q) || c.customerName.toLowerCase().includes(q) || c.contractNo.toLowerCase().includes(q))
          .flatMap(c => [c.id, (c as any)._id].filter(Boolean) as string[])
      );
      list = list.filter(r => matchedContractIds.has(r.contractId));
    }
    // 非管理员只看自己创建的
    if (!canSeeAllFinancial) list = list.filter(r => r.createdBy === myName);
    if (sortField) {
      list.sort((a, b) => {
        const va = String(a[sortField as keyof typeof a] ?? '');
        const vb = String(b[sortField as keyof typeof b] ?? '');
        const cmp = va.localeCompare(vb, 'zh-CN');
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.receiptDate.localeCompare(a.receiptDate));
    return list;
  }, [receipts, currentBizType, dateFrom, dateTo, filterYear, filterMonthFrom, filterMonthTo, search, sortField, sortOrder, contracts, canSeeAllFinancial, myName]);

  const MONTH_OPTS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` }));

  const totalIncome = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthIncome = useMemo(() => filtered.filter((r) => r.receiptDate >= monthStart).reduce((s, r) => s + r.amount, 0), [filtered, monthStart]);

  const handleReverseReceipt = async () => {
    if (!reverseReceipt) return;
    const reason = reverseReason.trim();
    if (!reason) {
      await showAlert('收款冲销必须填写原因。');
      return;
    }
    const confirmed = await showConfirm(
      `客户：${reverseReceipt.customerName || '-'}\n金额：${formatMoney(reverseReceipt.amount || 0)}`,
      { title: '确认冲销该收款记录吗？', confirmStyle: 'danger', confirmText: '确认冲销' },
    );
    if (!confirmed) return;
    try {
      const now = new Date().toISOString();
      const next = { ...reverseReceipt, lifecycleStatus: 'reversed', reversedAt: now, reversedBy: myName, reverseReason: reason } as any;
      await updateReceipt(next);
      await recordFinanceAuditAction({
        module: 'receipt',
        action: 'reverse',
        recordId: String(reverseReceipt._id || reverseReceipt.id),
        recordName: `${reverseReceipt.customerName || '-'}-${reverseReceipt.stage || '收款'}`,
        bizType: currentBizType,
        amount: reverseReceipt.amount,
        reason,
        operatorId: user?.id,
        operatorName: myName,
        before: reverseReceipt,
        after: next,
      });
      await notifyFinanceAuditAction({
        module: 'receipt',
        action: 'reverse',
        recordId: String(reverseReceipt._id || reverseReceipt.id),
        recordName: `${reverseReceipt.customerName || '-'}-${reverseReceipt.stage || '收款'}`,
        bizType: currentBizType,
        amount: reverseReceipt.amount,
        reason,
        operatorId: user?.id,
        operatorName: myName,
        recipientUserIds: adminUserIds,
      });
      setReverseReceipt(null);
      setReverseReason('');
    } catch (e: any) { await showAlert('冲销失败：' + (e?.message || '未知错误')); }
  };

  const openEditReceipt = (row: Record<string, unknown>) => {
    setEditingId(row.id as string);
    const ct = filteredContracts.find(c => c.id === row.contractId);
    setContractSearch(ct ? `${ct.houseAddress} - ${ct.customerName}` : '');
    const path = resolveExpenseCategory({
      primaryCategoryId: row.primaryCategoryId as string,
      primaryCategory: row.primaryCategory as string,
      secondaryCategoryId: row.secondaryCategoryId as string,
      secondaryCategory: row.secondaryCategory as string,
      category: (row.secondaryCategory as string) || (row.stage as string),
    }, incomeCategories);
    setForm({
      contractId: (row.contractId as string) || '',
      amount: String(row.amount || ''),
      paymentMethod: (row.paymentMethod as string) || '银行转账',
      stage: (row.stage as string) || '',
      primaryCategoryId: path.primaryId || incomeCategories[0]?.id || DEFAULT_INCOME_CATEGORIES[0].id,
      secondaryCategoryId: path.secondaryId || incomeCategories[0]?.children[0]?.id || DEFAULT_INCOME_CATEGORIES[0].children[0].id,
      category: path.secondaryName || (row.stage as string) || DEFAULT_INCOME_CATEGORIES[0].children[0].name,
      receiptDate: (row.receiptDate as string)?.slice(0, 10) || '',
      remark: (row.remark as string) || '',
      attachments: Array.isArray(row.attachments) ? (row.attachments as any[]) : [],
    });
    setAttachmentFiles([]);
    setShowModal(true);
  };

  const handleSort = (field: string) => {
    if (sortField === field) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortOrder('asc'); }
  };

  const selectedContract = useMemo(() => contracts.find((c) => c.id === form.contractId), [contracts, form.contractId]);

  const contractPaymentInfo = useMemo(() => {
    if (!selectedContract) return null;
    const contractReceipts = receipts.filter(r => r.contractId === selectedContract.id);
    const totalReceived = contractReceipts.reduce((s, r) => s + r.amount, 0);
    const totalAmount = selectedContract.contractAmount || 0;
    const stages = selectedContract.paymentStages.map(s => {
      const stagePaid = contractReceipts.filter(r => r.stage === s.name).reduce((sum, r) => sum + r.amount, 0);
      return { ...s, paid: stagePaid, due: s.amount - stagePaid };
    });
    const nextStage = stages.find(s => s.due > 0);
    return { totalReceived, totalAmount, stages, nextStage, progress: totalAmount > 0 ? totalReceived / totalAmount : 0 };
  }, [selectedContract, receipts]);

  const filteredContractList = useMemo(() => {
    if (!contractSearch) return filteredContracts;
    const q = contractSearch.toLowerCase();
    return filteredContracts.filter(c => c.houseAddress.toLowerCase().includes(q) || c.customerName.toLowerCase().includes(q));
  }, [filteredContracts, contractSearch]);

  const handleSelectContract = useCallback((contractId: string) => {
    const c = contracts.find(ct => ct.id === contractId);
    if (!c) return;
    const contractReceipts = receipts.filter(r => r.contractId === contractId);
    const nextStage = c.paymentStages.find(s => {
      const paid = contractReceipts.filter(r => r.stage === s.name).reduce((sum, r) => sum + r.amount, 0);
      return s.amount - paid > 0;
    });
    const defaultStage = nextStage || c.paymentStages[0];
    const stagePaid = defaultStage
      ? contractReceipts.filter(r => r.stage === defaultStage.name).reduce((sum, r) => sum + r.amount, 0)
      : 0;
    
    setContractSearch(`${c.houseAddress} - ${c.customerName}`);
    setForm((prevForm) => ({
      ...prevForm,
      contractId,
      stage: defaultStage ? defaultStage.name : '',
      secondaryCategoryId: incomeCategories[0]?.children.find((child) => child.name === defaultStage?.name)?.id || prevForm.secondaryCategoryId,
      category: defaultStage?.name || prevForm.category,
      amount: defaultStage ? String(Math.max(defaultStage.amount - stagePaid, 0)) : '',
    }));
  }, [contracts, receipts, incomeCategories]);

  const handleCategorySave = async (categories: ExpenseCategory[]) => {
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

  const handleExpenseCategorySave = async (categories: ExpenseCategory[]) => {
    setSavingCategories(true);
    try {
      const normalized = await saveExpenseCategories(categories, currentBizType);
      setExpenseCategories(normalized);
      setShowCategoryManager(false);
    } catch (error: any) {
      alert(error?.message || '支出类别保存失败，请重试');
    } finally {
      setSavingCategories(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      const contractId = searchParams.get('contractId');
      if (contractId) {
        handleSelectContract(contractId);
      }
      setShowModal(true);
      // clear search params so it doesn't reopen on refresh
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, handleSelectContract]);

  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId) return;
    const target = receipts.find((receipt: any) => receipt.id === focusId || receipt._id === focusId);
    if (!target) return;
    setFilterYear('');
    setDateFrom('');
    setDateTo('');
    setSearch(target.contractNo || target.customerName || '');
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [receipts, searchParams, setSearchParams]);

  const getAmountWarning = () => {
    if (!contractPaymentInfo || !form.stage || !form.amount) return null;
    const stage = contractPaymentInfo.stages.find(s => s.name === form.stage);
    if (!stage) return null;
    const inputAmount = Number(form.amount);
    if (inputAmount > stage.due) {
      return { type: 'over', msg: `超出应收 ${formatMoney(stage.due)}，超出 ${formatMoney(inputAmount - stage.due)}` };
    }
    if (inputAmount < stage.due) {
      return { type: 'under', msg: `不足应收 ${formatMoney(stage.due)}，还差 ${formatMoney(stage.due - inputAmount)}` };
    }
    return null;
  };

  const warning = getAmountWarning();

  const handleSubmit = async () => {
    if (!selectedContract || !form.amount || !form.stage || submitting) return;
    setSubmitting(true);
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (attachmentFiles.length > 0) {
        try {
          uploadedAttachments = await uploadFinanceAttachments(
            attachmentFiles,
            `finance/receipts/${selectedContract.id}`,
            myName || 'ERP'
          );
        } catch (uploadError: any) {
          const shouldContinue = window.confirm(
            `${uploadError?.message || '附件上传失败'}\n\n是否先不带附件保存这条收款？后续可再编辑补传。`
          );
          if (!shouldContinue) {
            throw uploadError;
          }
        }
      }
      const existingReceipt = editingId ? receipts.find((item) => item.id === editingId) : undefined;
      const primary = incomeCategories.find((category) => category.id === form.primaryCategoryId) || incomeCategories[0];
      const secondary = primary?.children.find((child) => child.id === form.secondaryCategoryId) || primary?.children[0];
      const categoryPath = {
        primaryId: primary?.id || '',
        primaryName: primary?.name || '工程款项',
        secondaryId: secondary?.id || '',
        secondaryName: secondary?.name || form.stage || '合同款',
      };
      const receiptData: Record<string, any> = {
        id: editingId || generateId(),
        contractId: form.contractId,
        contractNo: selectedContract.contractNo,
        bizType: currentBizType,
        customerName: selectedContract.customerName,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        receiptDate: form.receiptDate,
        stage: form.stage,
        ...expenseCategoryPayload(categoryPath),
        remark: form.remark,
        createdAt: existingReceipt?.createdAt || new Date().toISOString(),
        attachments: mergeAttachments(form.attachments, uploadedAttachments),
      };
      if (editingId) await updateReceipt(receiptData as any);
      else {
        receiptData.createdBy = myName;
        await addReceipt(receiptData as any);
      }
      setShowModal(false);
      setEditingId(null);
      setContractSearch('');
      setAttachmentFiles([]);
      setForm({
        contractId: '',
        amount: '',
        paymentMethod: '银行转账',
        stage: '',
        primaryCategoryId: incomeCategories[0]?.id || DEFAULT_INCOME_CATEGORIES[0].id,
        secondaryCategoryId: incomeCategories[0]?.children[0]?.id || DEFAULT_INCOME_CATEGORIES[0].children[0].id,
        category: incomeCategories[0]?.children[0]?.name || DEFAULT_INCOME_CATEGORIES[0].children[0].name,
        receiptDate: new Date().toISOString().slice(0, 10),
        remark: '',
        attachments: [],
      });
    } catch (error: any) {
      console.error('收款保存失败', error);
      alert(error?.message || '收款保存失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const getContractProgress = (c: typeof filteredContracts[0]) => {
    const contractReceipts = receipts.filter(r => r.contractId === c.id);
    const received = contractReceipts.reduce((s, r) => s + r.amount, 0);
    const total = c.contractAmount || 0;
    if (total === 0) return 0;
    return Math.min(received / total, 1);
  };

  const columns = [
    { key: 'contractNo', title: '合同编号', sortable: true, width: '140px' },
    { key: 'contractId', title: '项目地址', render: (row: Record<string, unknown>) => {
      const ct = filteredContracts.find((c) => c.id === row.contractId as string);
      return <span>{ct?.houseAddress || '-'}</span>;
    }},
    { key: 'amount', title: '金额', sortable: true, align: 'right' as const, render: (row: Record<string, unknown>) => (
      <span className="text-emerald-600 font-medium">{formatMoney(row.amount as number)}</span>
    )},
    { key: 'paymentMethod', title: '收款方式', sortable: true },
    {
      key: 'category',
      title: '收入类别',
      render: (row: Record<string, unknown>) => {
        const path = resolveExpenseCategory(row as any, incomeCategories);
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${incomeCategoryBadgeClass(path.primaryName)}`}>
              {path.primaryName || '工程款项'}
            </span>
            <span className="text-[11px] text-gray-400">{path.secondaryName || (row.stage as string) || '-'}</span>
          </div>
        );
      },
    },
    { key: 'stage', title: '收款阶段', sortable: true },
    { key: 'receiptDate', title: '日期', sortable: true, render: (row: Record<string, unknown>) => formatDate(row.receiptDate as string) },
    {
      key: 'attachments',
      title: '附件',
      render: (row: Record<string, unknown>) => (
        <AttachmentCell 
          attachments={row.attachments as AttachmentValue[] | undefined} 
          onUploadClick={() => openEditReceipt(row)} 
          onDelete={async (idx) => {
            try {
              const r = row as unknown as ReceiptType;
              const newAttachments = [...(r.attachments || [])];
              newAttachments.splice(idx, 1);
              await useFinanceStore.getState().updateReceipt({ ...r, attachments: newAttachments });
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
      width: '80px',
      render: (row: Record<string, unknown>) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEditReceipt(row)} className="p-1 text-gray-400 hover:text-gold-500 rounded" title="编辑">
            <Edit3 size={12} />
          </button>
          <button onClick={() => { setReverseReceipt(row as unknown as ReceiptType); setReverseReason(''); }} className="p-1 text-gray-400 hover:text-red-500 rounded" title="冲销">
            <RotateCcw size={12} />
          </button>
        </div>
      ),
    },
  ];

  const mobileColumns = [
    {
      key: 'receiptDate',
      title: '日期',
      render: (row: Record<string, unknown>) => {
        const ct = filteredContracts.find((c) => c.id === row.contractId as string);
        return (
          <div>
            <div className="text-[11px] font-medium text-gray-400">{formatDate(row.receiptDate as string)}</div>
            <div className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-gray-900">
              {ct?.houseAddress || '-'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'amount',
      title: '收入',
      render: (row: Record<string, unknown>) => (
        <div className="shrink-0 text-right">
          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">收入</span>
          <div className="mt-1 text-[15px] font-bold text-emerald-600">+{formatMoney(row.amount as number)}</div>
        </div>
      ),
    },
    {
      key: 'stage',
      title: '收款阶段',
      render: (row: Record<string, unknown>) => (
        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-400">收款阶段</span>
            <span className="font-medium text-gray-700">{(row.stage as string) || '-'}</span>
          </div>
          {row.remark ? (
            <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-400">备注：{row.remark as string}</div>
          ) : null}
        </div>
      ),
    },
  ];

  const clearFinanceFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFilterYear('');
    setFilterMonthFrom('1');
    setFilterMonthTo('12');
    setSearch('');
  };

  const filterCurrentMonth = () => {
    const month = String(now.getMonth() + 1);
    setDateFrom('');
    setDateTo('');
    setFilterYear(String(now.getFullYear()));
    setFilterMonthFrom(month);
    setFilterMonthTo(month);
    setSearch('');
  };

  return (
    <div className="erp-page-spaced">
      <div className="flex items-center justify-between">
        <div><h1 className="text-base md:text-lg font-bold text-gray-900">收入管理</h1><p className="text-gold-500 text-xs md:text-sm">管理所有收款记录</p></div>
        <div className="hidden items-center gap-2 md:flex">
          <button onClick={() => setShowCategoryManager(true)} className="erp-btn-secondary"><Settings size={15} /> 收入类别</button>
          <button onClick={() => setShowModal(true)} className="erp-btn-primary"><Plus size={16} /> 新增收款</button>
        </div>
      </div>

      {canSeeAllFinancial && (
        <div className="erp-finance-stats">
          <button type="button" onClick={clearFinanceFilters} className={`erp-finance-stat-button ${!filterYear && !search ? 'is-active' : ''}`}>
            <StatCard title="收款总额" value={formatMoney(totalIncome)} icon={DollarSign} accent="emerald" sub="点击查看全部收款" />
          </button>
          <button type="button" onClick={filterCurrentMonth} className={`erp-finance-stat-button ${filterYear === String(now.getFullYear()) && filterMonthFrom === String(now.getMonth() + 1) && filterMonthTo === String(now.getMonth() + 1) ? 'is-active' : ''}`}>
            <StatCard title="本月收款" value={formatMoney(monthIncome)} icon={TrendingUp} accent="emerald" sub="点击筛选本月" />
          </button>
          <button type="button" onClick={clearFinanceFilters} className={`erp-finance-stat-button ${!filterYear && !search ? 'is-active' : ''}`}>
            <StatCard title="收款笔数" value={`${filtered.length} 笔`} icon={Receipt} accent="emerald" sub="点击查看全部记录" />
          </button>
        </div>
      )}

      <div className="erp-surface overflow-visible">
        <div className="erp-finance-date-row">
          <Select value={filterYear} onChange={v => { setFilterYear(v); }} options={[{ value: '', label: '年份' }, ...Array.from(new Set(receipts.map(r => r.receiptDate ? String(dayjs(r.receiptDate).year()) : '').filter(Boolean))).sort((a,b) => parseInt(b)-parseInt(a)).map(y => ({ value: y, label: y }))]} className="w-auto shrink min-w-0" />
          <Select value={filterMonthFrom} onChange={setFilterMonthFrom} options={MONTH_OPTS} className="w-auto shrink min-w-0" />
          <span className="shrink-0 text-xs text-gray-400">至</span>
          <Select value={filterMonthTo} onChange={setFilterMonthTo} options={MONTH_OPTS} className="w-auto shrink min-w-0" />
          {(filterYear) && <button onClick={() => { setDateFrom(''); setDateTo(''); setFilterYear(''); setFilterMonthFrom('1'); setFilterMonthTo('12'); }} className="text-xs text-gold-500 hover:text-gold-600 font-medium shrink-0">清除</button>}
        </div>
        <div className="erp-finance-action-row">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索地址/客户/合同号" className="erp-search-input" />
          {search && <button onClick={() => setSearch('')} className="text-xs text-gold-500 hover:text-gold-600 font-medium shrink-0">清除</button>}
          <button onClick={() => setShowModal(true)} className="erp-btn-primary shrink-0"><Plus size={15} /> 收款</button>
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

      {/* 新增收款 Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingId(null); setContractSearch(''); setAttachmentFiles([]); setForm(f => ({
        ...f,
        contractId: '',
        amount: '',
        stage: '',
        primaryCategoryId: incomeCategories[0]?.id || DEFAULT_INCOME_CATEGORIES[0].id,
        secondaryCategoryId: incomeCategories[0]?.children[0]?.id || DEFAULT_INCOME_CATEGORIES[0].children[0].id,
        category: incomeCategories[0]?.children[0]?.name || DEFAULT_INCOME_CATEGORIES[0].children[0].name,
      })); }} title={editingId ? '编辑收款' : '新增收款'} size="lg">
        <div className="space-y-4">
          {/* 合同选择 - 可搜索列表 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">选择合同</label>
            {!form.contractId ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={contractSearch} onChange={(e) => setContractSearch(e.target.value)} placeholder="搜索项目地址 / 客户姓名..." className="erp-input pl-9" autoFocus />
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {filteredContractList.map(c => {
                    const pct = getContractProgress(c);
                    const color = pct >= 0.8 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-400' : 'bg-blue-400';
                    return (
                      <button key={c.id} type="button" onClick={() => handleSelectContract(c.id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{c.houseAddress}</p>
                            <p className="text-xs text-gray-400">{c.customerName} · {formatMoney(c.contractAmount || 0)}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct * 100}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-8">{(pct * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredContractList.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-gray-400">无匹配合同</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-800">{selectedContract?.houseAddress}</span>
                  <button onClick={() => { setForm({ ...form, contractId: '', stage: '', amount: '' }); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
                <p className="text-xs text-gray-400">{selectedContract?.customerName} · {formatMoney(selectedContract?.contractAmount || 0)}</p>
              </div>
            )}
          </div>

          {/* 收款阶段选择 + 提示 */}
          {contractPaymentInfo && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>合同总额 {formatMoney(contractPaymentInfo.totalAmount)}</span>
                <span>已收 {formatMoney(contractPaymentInfo.totalReceived)}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(contractPaymentInfo.progress * 100, 100)}%` }} />
                  </div>
                  <span>{(contractPaymentInfo.progress * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="space-y-1">
                {contractPaymentInfo.stages.map((s, i) => {
                  const status = getStageReceiptStatus(s);
                  return (
                    <div key={i} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                      status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                      status === 'partial' ? 'bg-amber-50 text-amber-600' :
                      status === 'unset' ? 'bg-gray-100 text-gray-400' :
                      'text-gray-400'
                    }`}>
                      <span>{s.name}</span>
                      <span>
                        {status === 'paid' ? '✓ 已收齐' :
                          status === 'partial' ? `${formatMoney(s.paid)} / ${formatMoney(s.amount)}` :
                          status === 'unset' ? '待设置金额' :
                          `应收 ${formatMoney(s.amount)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款阶段</label>
              <Select value={form.stage} onChange={(v) => {
                const stage = contractPaymentInfo?.stages.find(s => s.name === v);
                const categoryChild = incomeCategories[0]?.children.find((child) => child.name === v);
                setForm({
                  ...form,
                  stage: v,
                  amount: stage ? String(stage.due) : form.amount,
                  secondaryCategoryId: categoryChild?.id || form.secondaryCategoryId,
                  category: categoryChild?.name || v || form.category,
                });
              }} options={(selectedContract?.paymentStages || []).map(s => ({ value: s.name, label: `${s.name}（${formatMoney(s.amount)}）` }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">收入类别 *</label>
              <ExpenseCategoryPicker
                kind="income"
                categories={incomeCategories}
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
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款金额</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="erp-input" />
            </div>
          </div>

          {warning && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${warning.type === 'over' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
              <AlertTriangle size={14} />{warning.msg}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款方式</label>
              <Select value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款日期</label>
              <DatePicker mode="single" value={form.receiptDate} onChange={(v) => setForm({ ...form, receiptDate: v })} placeholder="选择日期" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">备注</label>
            <textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} rows={2} placeholder="备注信息（选填）" className="erp-input resize-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">追加凭证附件</label>
            <input type="file" multiple onChange={(e) => {
              setAttachmentFiles(Array.from(e.target.files || []));
            }} className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200" />
            <p className="text-xs text-amber-600 mt-1">附件非必填，可先登记收款，凭证稍后补传。</p>
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
            <button onClick={handleSubmit} disabled={!form.contractId || !form.amount || !form.stage || submitting}
              className="erp-btn-primary min-w-[220px] justify-center disabled:opacity-40">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {submitting ? '提交中...' : editingId ? '确认修改' : '确认新增'}
            </button>
          </div>
        </div>
      </Modal>
      <ExpenseCategoryManager
        open={showCategoryManager}
        initialKind="income"
        categories={expenseCategories}
        incomeCategories={incomeCategories}
        expenses={expenses.filter((expense: any) => expense.bizType === currentBizType && isActiveReceipt(expense))}
        incomes={receipts.filter((receipt: any) => receipt.bizType === currentBizType && isActiveReceipt(receipt))}
        saving={savingCategories}
        onClose={() => setShowCategoryManager(false)}
        onSave={handleExpenseCategorySave}
        onSaveIncome={handleCategorySave}
      />
      <Modal
        open={!!reverseReceipt}
        onClose={() => { setReverseReceipt(null); setReverseReason(''); }}
        title="冲销收款记录"
      >
        {reverseReceipt && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              已入账的收款不能直接删除。冲销后该记录不再计入收款汇总，但会保留原始记录和操作痕迹。
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-600">
              <div>客户：<span className="font-medium text-gray-900">{reverseReceipt.customerName || '-'}</span></div>
              <div className="mt-1">金额：<span className="font-medium text-emerald-600">{formatMoney(reverseReceipt.amount || 0)}</span></div>
              <div className="mt-1">阶段：<span className="font-medium text-gray-900">{reverseReceipt.stage || '-'}</span></div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">冲销原因</label>
              <textarea
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                rows={3}
                placeholder="请填写冲销原因，便于后续查账"
                className="erp-input resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setReverseReceipt(null); setReverseReason(''); }} className="erp-btn-secondary">取消</button>
              <button onClick={handleReverseReceipt} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
                确认冲销
              </button>
            </div>
          </div>
        )}
      </Modal>
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
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
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
