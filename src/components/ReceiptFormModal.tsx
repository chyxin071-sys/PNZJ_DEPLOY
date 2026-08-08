import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import FormAttachmentList from '@/components/FormAttachmentList';
import UploadProgressList, { createUploadProgressItem, type UploadProgressItem } from '@/components/UploadProgressList';
import { formatMoney, generateId } from '@/utils/format';
import { uploadFinanceAttachments, mergeAttachments } from '@/utils/financeAttachments';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { useAuthStore } from '@/store/authStore';
import type { AttachmentValue, Contract, Receipt } from '@/types';
import { addLeadAuditFollowUp } from '@/utils/leadAudit';
import ExpenseCategoryPicker from '@/components/ExpenseCategoryPicker';
import {
  DEFAULT_INCOME_CATEGORIES,
  expenseCategoryPayload,
  loadIncomeCategories,
  resolveExpenseCategory,
  type ExpenseCategory,
} from '@/services/expenseCategories';

type PendingUpload = UploadProgressItem & { file: File };

const PAYMENT_METHODS = ['银行转账', '微信', '支付宝', '现金', '其他'];

function getStageReceiptStatus(stage: { amount: number; paid: number; due: number }) {
  if ((stage.amount || 0) <= 0) return 'unset';
  if (stage.due <= 0) return 'paid';
  if (stage.paid > 0) return 'partial';
  return 'pending';
}

function focusNextOnEnter(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Enter' || event.shiftKey) return;
  const target = event.target as HTMLElement;
  if (target.tagName === 'TEXTAREA') return;
  event.preventDefault();
  const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input, textarea, button'))
    .filter((el) => !el.hasAttribute('disabled') && !(el as HTMLInputElement).readOnly);
  const index = fields.indexOf(target);
  fields[index + 1]?.focus();
}

interface ReceiptFormModalProps {
  open: boolean;
  onClose: () => void;
  defaultContractId?: string;
  defaultStage?: string;
  editingReceipt?: Receipt | null;
  onSuccess?: () => void;
  defaultContract?: Contract;
  receiptsOverride?: Receipt[];
  onDirectAdd?: (receipt: Receipt) => Promise<void>;
  onDirectUpdate?: (receipt: Receipt) => Promise<void>;
  /** 是否为简化模式（从客户详情页打开，合同固定） */
  compact?: boolean;
}

export default function ReceiptFormModal({ open, onClose, defaultContractId, defaultStage, editingReceipt, onSuccess, defaultContract, receiptsOverride, onDirectAdd, onDirectUpdate, compact }: ReceiptFormModalProps) {
  const { receipts, contracts, addReceipt, updateReceipt } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { user } = useAuthStore();
  const effectiveContracts = useMemo(() => {
    if (!defaultContract || contracts.some((c) => c.id === defaultContract.id)) return contracts;
    return [defaultContract, ...contracts];
  }, [contracts, defaultContract]);
  const effectiveReceipts = receiptsOverride || receipts;
  const [submitting, setSubmitting] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [contractSearch, setContractSearch] = useState('');
  const [incomeCategories, setIncomeCategories] = useState<ExpenseCategory[]>(DEFAULT_INCOME_CATEGORIES);

  const blankForm = () => ({
    contractId: '',
    amount: '',
    paymentMethod: '银行转账',
    customPaymentMethod: '',
    stage: '',
    stageType: 'contract' as 'contract' | 'custom',
    primaryCategoryId: DEFAULT_INCOME_CATEGORIES[0].id,
    secondaryCategoryId: DEFAULT_INCOME_CATEGORIES[0].children[0].id,
    category: DEFAULT_INCOME_CATEGORIES[0].children[0].name,
    receiptDate: new Date().toISOString().slice(0, 10),
    remark: '',
    attachments: [] as any[],
  });
  const [form, setForm] = useState(blankForm);

  const filteredContracts = useMemo(() => {
    return effectiveContracts
      .filter(c => c.bizType === currentBizType && c.status !== '已结算')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [effectiveContracts, currentBizType]);

  useEffect(() => {
    if (!open) return;
    loadIncomeCategories(currentBizType)
      .then(setIncomeCategories)
      .catch((error) => {
        console.error('加载收入类别失败', error);
        setIncomeCategories(DEFAULT_INCOME_CATEGORIES);
      });
  }, [currentBizType, open]);

  const handleSelectContract = (contractId: string, presetStage?: string) => {
    const c = effectiveContracts.find(ct => ct.id === contractId);
    if (!c) return;
    const contractReceipts = effectiveReceipts.filter(r => r.contractId === contractId);

    // 如果有预设阶段，优先使用；否则找下一个待收阶段
    let targetStage;
    if (presetStage) {
      targetStage = c.paymentStages.find(s => s.name === presetStage);
    }
    if (!targetStage) {
      const nextStage = c.paymentStages.find(s => {
        const paid = contractReceipts.filter(r => r.stage === s.name).reduce((sum, r) => sum + r.amount, 0);
        return s.amount - paid > 0;
      });
      targetStage = nextStage || c.paymentStages[0];
    }

    const stagePaid = targetStage
      ? contractReceipts.filter(r => r.stage === targetStage.name).reduce((sum, r) => sum + r.amount, 0)
      : 0;

    setContractSearch(`${c.contractNo} - ${c.customerName}`);
    setForm((prevForm) => ({
      ...prevForm,
      contractId,
      stage: targetStage ? targetStage.name : '',
      stageType: 'contract',
      secondaryCategoryId: incomeCategories[0]?.children.find((child) => child.name === targetStage?.name)?.id || prevForm.secondaryCategoryId,
      category: targetStage?.name || prevForm.category,
      amount: editingReceipt ? prevForm.amount : targetStage ? String(Math.max(targetStage.amount - stagePaid, 0)) : '',
    }));
  };

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setPendingUploads([]);
    if (editingReceipt) {
      const method = editingReceipt.paymentMethod || '银行转账';
      const c = effectiveContracts.find(ct => ct.id === editingReceipt.contractId || ct._id === editingReceipt.contractId);
      const stageType = editingReceipt.stageType || (c?.paymentStages.some((stage) => stage.name === editingReceipt.stage) ? 'contract' : 'custom');
      const path = resolveExpenseCategory({
        primaryCategoryId: editingReceipt.primaryCategoryId,
        primaryCategory: editingReceipt.primaryCategory,
        secondaryCategoryId: editingReceipt.secondaryCategoryId,
        secondaryCategory: editingReceipt.secondaryCategory,
        category: editingReceipt.secondaryCategory || editingReceipt.stage,
      }, incomeCategories);
      setForm({
        contractId: editingReceipt.contractId,
        amount: String(editingReceipt.amount || ''),
        paymentMethod: PAYMENT_METHODS.includes(method) ? method : '其他',
        customPaymentMethod: PAYMENT_METHODS.includes(method) ? '' : method,
        stage: editingReceipt.stage || '',
        stageType,
        primaryCategoryId: path.primaryId || incomeCategories[0]?.id || DEFAULT_INCOME_CATEGORIES[0].id,
        secondaryCategoryId: path.secondaryId || incomeCategories[0]?.children[0]?.id || DEFAULT_INCOME_CATEGORIES[0].children[0].id,
        category: path.secondaryName || editingReceipt.stage || DEFAULT_INCOME_CATEGORIES[0].children[0].name,
        receiptDate: editingReceipt.receiptDate || new Date().toISOString().slice(0, 10),
        remark: editingReceipt.remark || '',
        attachments: editingReceipt.attachments || [],
      });
      setContractSearch(c ? `${c.contractNo} - ${c.customerName}` : '');
      return;
    }
    const base = blankForm();
    setForm(base);
    setContractSearch('');
    if (defaultContractId) {
      window.setTimeout(() => handleSelectContract(defaultContractId, defaultStage), 0);
    }
  }, [open, defaultContractId, defaultStage, editingReceipt?.id]);

  const selectedContract = useMemo(() => effectiveContracts.find((c) => c.id === form.contractId), [effectiveContracts, form.contractId]);

  const contractPaymentInfo = useMemo(() => {
    if (!selectedContract) return null;
    const contractReceipts = effectiveReceipts.filter(r => r.contractId === selectedContract.id);
    const totalReceived = contractReceipts.reduce((s, r) => s + r.amount, 0);
    const totalAmount = selectedContract.contractAmount || 0;
    const stages = selectedContract.paymentStages.map(s => {
      const stagePaid = contractReceipts.filter(r => r.stage === s.name).reduce((sum, r) => sum + r.amount, 0);
      return { ...s, paid: stagePaid, due: s.amount - stagePaid };
    });
    const nextStage = stages.find(s => s.due > 0);
    return { totalReceived, totalAmount, stages, nextStage, progress: totalAmount > 0 ? totalReceived / totalAmount : 0 };
  }, [selectedContract, effectiveReceipts]);

  const filteredContractList = useMemo(() => {
    if (!contractSearch) return filteredContracts;
    const q = contractSearch.toLowerCase();
    return filteredContracts.filter(c => c.contractNo.toLowerCase().includes(q) || c.houseAddress.toLowerCase().includes(q) || c.customerName.toLowerCase().includes(q));
  }, [filteredContracts, contractSearch]);

  const getAmountWarning = () => {
    if (form.stageType !== 'contract' || !contractPaymentInfo || !form.stage || !form.amount) return null;
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

  const getContractProgress = (c: any) => {
    const contractReceipts = effectiveReceipts.filter(r => r.contractId === c.id);
    const received = contractReceipts.reduce((s, r) => s + r.amount, 0);
    const total = c.contractAmount || 0;
    if (total === 0) return 0;
    return Math.min(received / total, 1);
  };

  const handleSubmit = async () => {
    if (!selectedContract || !form.amount || !form.stage || submitting) return;
    if (form.stageType === 'custom' && selectedContract.paymentStages.some((stage) => stage.name === form.stage.trim())) {
      alert('自定义阶段不能与合同收款阶段同名，请选择“合同阶段”或更换名称。');
      return;
    }
    setSubmitting(true);
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (pendingUploads.length > 0) {
        for (const item of pendingUploads) {
          setPendingUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'uploading', progress: 30, error: undefined } : upload));
          try {
            const uploaded = await uploadFinanceAttachments([item.file], `finance/receipts/${selectedContract.id}`, user?.name || 'ERP');
            uploadedAttachments = [...uploadedAttachments, ...uploaded];
            setPendingUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'done', progress: 100 } : upload));
          } catch (uploadError: any) {
            setPendingUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'error', progress: 100, error: uploadError?.message || '附件上传失败' } : upload));
            throw uploadError;
          }
        }
      }

      const paymentMethod = form.paymentMethod === '其他' ? form.customPaymentMethod.trim() || '其他' : form.paymentMethod;
      const primary = incomeCategories.find((category) => category.id === form.primaryCategoryId) || incomeCategories[0];
      const secondary = primary?.children.find((child) => child.id === form.secondaryCategoryId) || primary?.children[0];
      const categoryPath = {
        primaryId: primary?.id || '',
        primaryName: primary?.name || '工程款项',
        secondaryId: secondary?.id || '',
        secondaryName: secondary?.name || form.stage || '合同款',
      };
      const receiptData = {
        ...(editingReceipt || {}),
        id: editingReceipt?.id || generateId(),
        contractId: form.contractId,
        contractNo: selectedContract.contractNo,
        bizType: currentBizType,
        customerName: selectedContract.customerName,
        amount: Number(form.amount),
        paymentMethod,
        receiptDate: form.receiptDate,
        stage: form.stage,
        stageType: form.stageType,
        ...expenseCategoryPayload(categoryPath),
        remark: form.remark,
        createdAt: editingReceipt?.createdAt || new Date().toISOString(),
        attachments: mergeAttachments(form.attachments, uploadedAttachments),
      };
      
      if (editingReceipt) {
        if (onDirectUpdate) await onDirectUpdate(receiptData as Receipt);
        else await updateReceipt(receiptData as Receipt);
      } else if (onDirectAdd) {
        await onDirectAdd(receiptData as Receipt);
      } else {
        await addReceipt(receiptData as any);
      }
      if (!editingReceipt && selectedContract.customerId) {
        await addLeadAuditFollowUp({
          leadId: selectedContract.customerId,
          actorName: user?.name || '员工',
          content: `${user?.name || '员工'}新增收款：${selectedContract.houseAddress || selectedContract.contractNo}，阶段“${form.stage}”，金额 ${Number(form.amount)}，方式 ${paymentMethod}，日期 ${form.receiptDate}。${form.remark ? `备注：${form.remark}` : ''}`,
          createdAt: receiptData.createdAt,
        });
      }
      onClose();
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('收款保存失败', error);
      alert(error?.message || '收款保存失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editingReceipt ? '编辑收款' : '新增收款'} size="sm">
      <div className="space-y-4" onKeyDown={focusNextOnEnter}>
        {/* 合同选择 - compact模式只显示固定合同 */}
        {compact && selectedContract ? (
          <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">关联项目：</span>
              <span className="text-sm font-medium text-gray-800">{selectedContract.houseAddress}</span>
            </div>
          </div>
        ) : (
          /* 完整模式：合同选择 */
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">选择合同</label>
            {!form.contractId ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={contractSearch} onChange={(e) => setContractSearch(e.target.value)} placeholder="搜索项目地址 / 合同编号 / 客户姓名..." className="erp-input pl-9" autoFocus />
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {filteredContracts.map(c => {
                    const pct = getContractProgress(c);
                    const color = pct >= 0.8 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-400' : 'bg-blue-400';
                    return (
                      <button key={c.id} type="button" onClick={() => handleSelectContract(c.id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{c.houseAddress}</p>
                            <p className="text-xs text-gray-400">{c.contractNo} · {c.customerName} · {formatMoney(c.contractAmount || 0)}</p>
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
                  {filteredContracts.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-gray-400">无匹配合同</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-800">{selectedContract?.houseAddress}</span>
                  {!defaultContractId && (
                    <button onClick={() => { setForm({ ...form, contractId: '', stage: '', stageType: 'contract', amount: '' }); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  )}
                </div>
                <p className="text-xs text-gray-400">{selectedContract?.contractNo} · {selectedContract?.customerName}</p>
              </div>
            )}
          </div>
        )}

        {/* 收款阶段进度 - compact模式不显示 */}
        {!compact && contractPaymentInfo && (
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
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款阶段 *</label>
            <div className="mb-2 grid grid-cols-2 rounded-md bg-gray-100 p-1">
              {([
                { value: 'contract', label: '合同阶段' },
                { value: 'custom', label: '自定义阶段' },
              ] as const).map((option) => (
                <button key={option.value} type="button" onClick={() => setForm({ ...form, stageType: option.value, stage: '', amount: option.value === 'contract' ? '' : form.amount })}
                  className={`rounded px-3 py-1.5 text-xs font-medium ${form.stageType === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {option.label}
                </button>
              ))}
            </div>
            {form.stageType === 'contract' ? (
              <Select value={form.stage} onChange={(v) => {
                const stage = contractPaymentInfo?.stages.find(s => s.name === v);
                const categoryChild = incomeCategories[0]?.children.find((child) => child.name === v);
                setForm({
                  ...form,
                  stage: v,
                  amount: stage ? String(Math.max(stage.due, 0)) : form.amount,
                  secondaryCategoryId: categoryChild?.id || form.secondaryCategoryId,
                  category: categoryChild?.name || v || form.category,
                });
              }} options={(selectedContract?.paymentStages || []).map(s => ({ value: s.name, label: `${s.name}（应收 ${formatMoney(s.amount)}）` }))} />
            ) : (
              <input value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} className="erp-input" placeholder="例如：临时补款、追加款" />
            )}
            {form.stageType === 'custom' ? <p className="mt-1 text-[11px] text-gray-400">自定义阶段只计入实际收入，不进入合同收款计划。</p> : null}
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
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款金额 *</label>
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
            <Select searchable value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} options={[
              ...Array.from(new Set([...PAYMENT_METHODS, ...effectiveReceipts.map(r => r.paymentMethod).filter(Boolean)])).map((m) => ({ value: m, label: m })),
            ]} />
          </div>
          {form.paymentMethod === '其他' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">自定义收款方式</label>
              <input value={form.customPaymentMethod} onChange={(e) => setForm({ ...form, customPaymentMethod: e.target.value })} className="erp-input" placeholder="例如：微信转账" />
            </div>
          )}
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
            const files = Array.from(e.target.files || []);
            setPendingUploads(prev => [...prev, ...files.map(createUploadProgressItem)]);
            e.currentTarget.value = '';
          }} className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200" />
          <p className="text-xs text-amber-600 mt-1">附件非必填，可先登记收款，凭证稍后补传。</p>
          <UploadProgressList
            items={pendingUploads}
            disabled={submitting}
            onRemove={(uploadId) => setPendingUploads(prev => prev.filter(item => item.id !== uploadId))}
          />
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
            {submitting ? '提交中...' : editingReceipt ? '保存修改' : '确认新增'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
