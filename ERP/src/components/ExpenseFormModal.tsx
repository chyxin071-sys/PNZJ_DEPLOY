import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
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
import type { AttachmentValue } from '@/types';
import { addLeadAuditFollowUp } from '@/utils/leadAudit';

type PendingUpload = UploadProgressItem & { file: File };

const CATEGORY_OPTIONS = ['材料费', '人工费', '外包费', '管理费', '其他'];
const PAY_METHOD_OPTIONS = ['银行转账', '微信', '支付宝', '现金', '其他'];

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

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  defaultContractId?: string;
  editingExpense?: any | null;
  onSuccess?: () => void;
  /** 是否为简化模式（从客户详情页打开，合同固定） */
  compact?: boolean;
}

export default function ExpenseFormModal({ open, onClose, defaultContractId, editingExpense, onSuccess, compact }: ExpenseFormModalProps) {
  const { expenses, receipts, contracts, addExpense, updateExpense } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { user } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [contractSearch, setContractSearch] = useState('');

  const blankForm = () => ({
    contractId: '',
    category: '材料费',
    customCategory: '',
    amount: '',
    supplier: '',
    payMethod: '银行转账',
    customPayMethod: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    status: '已付' as '已付' | '未付',
    remark: '',
    attachments: [] as any[],
  });
  const [form, setForm] = useState(blankForm);

  const filteredContracts = useMemo(() => {
    return contracts
      .filter(c => c.bizType === currentBizType && c.status !== '已结算')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [contracts, currentBizType]);

  const selectedContract = useMemo(() => contracts.find((c) => c.id === form.contractId), [contracts, form.contractId]);

  const filteredContractList = useMemo(() => {
    if (!contractSearch) return filteredContracts;
    const q = contractSearch.toLowerCase();
    return filteredContracts.filter(c => c.contractNo.toLowerCase().includes(q) || c.houseAddress.toLowerCase().includes(q) || c.customerName.toLowerCase().includes(q));
  }, [filteredContracts, contractSearch]);

  const getContractProgress = (c: any) => {
    const contractReceipts = receipts.filter(r => r.contractId === c.id);
    const received = contractReceipts.reduce((s, r) => s + r.amount, 0);
    const total = c.contractAmount || 0;
    if (total === 0) return 0;
    return Math.min(received / total, 1);
  };

  const handleSelectContract = (contractId: string) => {
    const c = contracts.find(ct => ct.id === contractId);
    if (!c) return;
    setContractSearch(`${c.contractNo} - ${c.customerName}`);
    setForm(prev => ({ ...prev, contractId, supplier: currentBizType === '家装' ? (c.customerName || prev.supplier) : prev.supplier }));
  };

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setPendingUploads([]);
    if (editingExpense) {
      const category = editingExpense.category || '材料费';
      const payMethod = editingExpense.payMethod || '银行转账';
      setForm({
        contractId: editingExpense.contractId || '',
        category: CATEGORY_OPTIONS.includes(category) ? category : '其他',
        customCategory: CATEGORY_OPTIONS.includes(category) ? '' : category,
        amount: String(editingExpense.amount || ''),
        supplier: editingExpense.supplier || '',
        payMethod: PAY_METHOD_OPTIONS.includes(payMethod) ? payMethod : '其他',
        customPayMethod: PAY_METHOD_OPTIONS.includes(payMethod) ? '' : payMethod,
        expenseDate: editingExpense.expenseDate || new Date().toISOString().slice(0, 10),
        status: editingExpense.status || '已付',
        remark: editingExpense.remark || '',
        attachments: editingExpense.attachments || [],
      });
      const c = contracts.find(ct => ct.id === editingExpense.contractId || ct._id === editingExpense.contractId);
      setContractSearch(c ? `${c.contractNo} - ${c.customerName}` : editingExpense.contractId === '__none__' ? '非项目支出' : '');
      return;
    }
    const base = blankForm();
    if (defaultContractId) {
      const c = contracts.find(ct => ct.id === defaultContractId || ct._id === defaultContractId);
      if (c && currentBizType === '家装') base.supplier = c.customerName || '';
    }
    setForm(base);
    setContractSearch('');
    if (defaultContractId) {
      window.setTimeout(() => handleSelectContract(defaultContractId), 0);
    }
  }, [open, defaultContractId, editingExpense?.id]);

  const handleSubmit = async () => {
    if (!form.amount || !form.supplier || submitting) return;
    setSubmitting(true);
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (pendingUploads.length > 0) {
        for (const item of pendingUploads) {
          setPendingUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'uploading', progress: 30, error: undefined } : upload));
          try {
            const uploaded = await uploadFinanceAttachments([item.file], `finance/expenses/${form.contractId || 'general'}`, user?.name || 'ERP');
            uploadedAttachments = [...uploadedAttachments, ...uploaded];
            setPendingUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'done', progress: 100 } : upload));
          } catch (uploadError: any) {
            setPendingUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'error', progress: 100, error: uploadError?.message || '附件上传失败' } : upload));
            throw uploadError;
          }
        }
      }

      const category = form.category === '其他' ? form.customCategory.trim() || '其他' : form.category;
      const payMethod = form.payMethod === '其他' ? form.customPayMethod.trim() || '其他' : form.payMethod;
      const expenseData = {
        ...(editingExpense || {}),
        id: editingExpense?.id || generateId(),
        contractId: form.contractId,
        bizType: currentBizType,
        category,
        amount: Number(form.amount),
        supplier: form.supplier,
        payMethod,
        expenseDate: form.expenseDate,
        status: form.status,
        remark: form.remark,
        createdAt: editingExpense?.createdAt || new Date().toISOString(),
        attachments: mergeAttachments(form.attachments, uploadedAttachments),
      };

      if (editingExpense) await updateExpense(expenseData as any);
      else await addExpense(expenseData as any);
      if (!editingExpense && selectedContract?.customerId) {
        await addLeadAuditFollowUp({
          leadId: selectedContract.customerId,
          actorName: user?.name || '员工',
          content: `${user?.name || '员工'}新增支出：${selectedContract.houseAddress || selectedContract.contractNo}，类别“${category}”，金额 ${Number(form.amount)}，收款方/供应商 ${form.supplier}，状态 ${form.status}，日期 ${form.expenseDate}。${form.remark ? `备注：${form.remark}` : ''}`,
          createdAt: expenseData.createdAt,
        });
      }
      onClose();
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('支出保存失败', error);
      alert(error?.message || '支出保存失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editingExpense ? '编辑支出' : '新增支出'} size="sm">
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
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">选择合同</label>
            {!form.contractId ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={contractSearch} onChange={(e) => setContractSearch(e.target.value)} placeholder="搜索项目地址 / 合同编号 / 客户姓名..." className="erp-input pl-9" autoFocus />
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {/* 非项目支出选项 */}
                  <button type="button" onClick={() => { setContractSearch('非项目支出'); setForm(prev => ({ ...prev, contractId: '__none__' })); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">非项目</span>
                      <span className="text-sm text-gray-500">非项目支出（不关联合同）</span>
                    </div>
                  </button>
                  {filteredContractList.map(c => {
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
                  <span className="text-sm font-medium text-gray-800">
                    {form.contractId === '__none__' ? '非项目支出' : selectedContract?.houseAddress}
                  </span>
                  {!defaultContractId && (
                    <button onClick={() => { setForm({ ...form, contractId: '' }); setContractSearch(''); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  )}
                </div>
                {form.contractId !== '__none__' && selectedContract && (
                  <p className="text-xs text-gray-400">{selectedContract.contractNo} · {selectedContract.customerName}</p>
                )}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">支出类别</label>
            <Select searchable value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={[
              ...Array.from(new Set([...CATEGORY_OPTIONS, ...expenses.map(e => e.category).filter(Boolean)])).map((c) => ({ value: c, label: c })),
            ]} />
          </div>
          {form.category === '其他' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">自定义支出类别</label>
              <input value={form.customCategory} onChange={(e) => setForm({ ...form, customCategory: e.target.value })} className="erp-input" />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">金额 *</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="请输入金额" className="erp-input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款方 *</label>
          <input
            type="text"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            readOnly={currentBizType === '家装' && !!selectedContract}
            placeholder={selectedContract?.customerName || '请输入收款方名称'}
            className={`erp-input ${currentBizType === '家装' && selectedContract ? 'bg-gray-50 text-gray-500' : ''}`}
          />
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">支出方式</label>
            <Select searchable value={form.payMethod} onChange={(v) => setForm({ ...form, payMethod: v })} options={[
              ...Array.from(new Set([...PAY_METHOD_OPTIONS, ...expenses.map(e => e.payMethod).filter(Boolean)])).map((m) => ({ value: m, label: m })),
            ]} />
          </div>
          {form.payMethod === '其他' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">自定义支出方式</label>
              <input value={form.customPayMethod} onChange={(e) => setForm({ ...form, customPayMethod: e.target.value })} className="erp-input" placeholder="例如：微信转账" />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">日期</label>
            <DatePicker mode="single" value={form.expenseDate} onChange={(v) => setForm({ ...form, expenseDate: v })} placeholder="选择日期" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">状态</label>
            <Select value={form.status} onChange={(v) => setForm({ ...form, status: v as '已付' | '未付' })} options={[{ value: '已付', label: '已付' }, { value: '未付', label: '未付' }]} />
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
          <p className="text-xs text-amber-600 mt-1">附件非必填，可先登记支出，后续再补上传票据或收据。</p>
          <UploadProgressList
            items={pendingUploads}
            disabled={submitting}
            onRemove={(uploadId) => setPendingUploads(prev => prev.filter(item => item.id !== uploadId))}
          />
          <FormAttachmentList attachments={form.attachments as any[]} onRemove={(idx) => {
            const newAtt = (form.attachments as any[]).filter((_, i) => i !== idx);
            setForm(prev => ({ ...prev, attachments: newAtt }));
          }} />
        </div>
        <div className="flex justify-center pt-2">
          <button onClick={handleSubmit} disabled={!form.amount || !form.supplier || submitting} className="erp-btn-primary min-w-[220px] justify-center disabled:opacity-40">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? '提交中...' : editingExpense ? '保存修改' : '确认新增'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
