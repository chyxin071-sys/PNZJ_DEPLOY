import { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, X, Search, Link as LinkIcon } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { useAuthStore } from '@/store/authStore';
import { createNotificationEventSafely, stableOperationId } from '@/services/notificationService';
import { generateId, normalizeAddress } from '@/utils/format';
import { leadsAPI } from '@/db/api';
import DatePicker from '@/components/DatePicker';
import type { Contract } from '@/types';
import { addLeadAuditFollowUp } from '@/utils/leadAudit';

interface ContractDrawerProps {
  open: boolean;
  onClose: () => void;
  prefill?: {
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    houseAddress?: string;
    projectManager?: string;
    sales?: string;
    designer?: string;
    customerNo?: string;
  };
  onSaved?: (contractId: string) => void;
}

type StageForm = { name: string; amount: number; ratio: number };

const emptyStage = (): StageForm => ({ name: '', amount: 0, ratio: 0 });
const homeDefaultStages = (): StageForm[] => [
  { name: '定金', amount: 0, ratio: 0 },
  { name: '开工款', amount: 0, ratio: 0 },
  { name: '水电验收款', amount: 0, ratio: 0 },
  { name: '泥木验收款', amount: 0, ratio: 0 },
  { name: '竣工尾款', amount: 0, ratio: 0 },
];
const HOME_STAGE_WEIGHTS = [0.1, 0.3, 0.25, 0.25, 0.1];
const commercialDefaultStages = (): StageForm[] => [
  { name: '回款', amount: 0, ratio: 0 },
  { name: '质保金', amount: 0, ratio: 0 },
];
const today = () => new Date().toISOString().slice(0, 10);

function applyHomeDefaultStageAmounts(stages: StageForm[], amount: number) {
  if (amount <= 0 || stages.length === 0 || stages.some((stage) => (stage.amount || 0) > 0)) {
    return stages;
  }
  let allocated = 0;
  return stages.map((stage, index) => {
    const isLast = index === stages.length - 1;
    const weight = HOME_STAGE_WEIGHTS[index] ?? 0;
    const stageAmount = isLast ? amount - allocated : Math.round(amount * weight);
    allocated += stageAmount;
    return { ...stage, amount: stageAmount, ratio: amount > 0 ? stageAmount / amount : 0 };
  });
}

/** 自适应高度 textarea ref 回调 */
function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

export default function ContractDrawer({ open, onClose, prefill, onSaved }: ContractDrawerProps) {
  const { contracts, addContract } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    contractNo: '',
    customerName: prefill?.customerName || '',
    customerPhone: prefill?.customerPhone || '',
    houseAddress: prefill?.houseAddress || '',
    contractAmount: '',
    signDate: today(),
    expectedEndDate: '',
    projectManager: prefill?.projectManager || '',
    sales: prefill?.sales || '',
    designer: prefill?.designer || '',
    remark: '',
    stages: (currentBizType === '工装' ? commercialDefaultStages() : homeDefaultStages()) as StageForm[],
  });
  const [saving, setSaving] = useState(false);
  const saveLockRef = useRef(false);
  const [signedLeads, setSignedLeads] = useState<any[]>([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(prefill?.customerId || '');

  const getNextContractNo = () => {
    const yearPrefix = String(new Date().getFullYear()).slice(2);
    const bizPrefix = currentBizType === '工装' ? 'G' : '';
    const filtered = contracts.filter(c => c.bizType === currentBizType);
    const maxNo = filtered.reduce((max, c) => {
      const numPart = bizPrefix ? c.contractNo.replace(/^G/, '') : c.contractNo;
      const num = parseInt(numPart, 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    return maxNo > 0 ? bizPrefix + String(maxNo + 1) : bizPrefix + yearPrefix + '001';
  };

  useEffect(() => {
    if (!open) return;
    let initialNo = getNextContractNo();
    if (prefill?.customerNo) {
      initialNo = prefill.customerNo;
    }
    setForm({
      contractNo: initialNo,
      customerName: prefill?.customerName || '',
      customerPhone: prefill?.customerPhone || '',
      houseAddress: prefill?.houseAddress || '',
      contractAmount: '',
      signDate: today(),
      expectedEndDate: '',
      projectManager: prefill?.projectManager || '',
      sales: prefill?.sales || '',
      designer: prefill?.designer || '',
      remark: '',
      stages: currentBizType === '工装' ? commercialDefaultStages() : homeDefaultStages(),
    });
    setSelectedLeadId(prefill?.customerId || '');
    setShowLeadPicker(false);
    setLeadSearch('');
    setSaving(false);
  }, [open]);

  useEffect(() => {
    if (currentBizType === '家装') {
      leadsAPI.where({ status: '已签单' }).toArray().then((leads) => setSignedLeads(leads)).catch(() => {});
    }
  }, [currentBizType]);

  const filteredLeads = useMemo(() => {
    if (!leadSearch) return signedLeads;
    const q = leadSearch.toLowerCase();
    return signedLeads.filter((l: any) =>
      (l.name || '').toLowerCase().includes(q) || (l.address || '').toLowerCase().includes(q) || (l.phone || '').includes(q)
    );
  }, [signedLeads, leadSearch]);

  const selectLead = (l: any) => {
    setSelectedLeadId(l._id || '');
    const salesArr = Array.isArray(l.sales) ? l.sales : (l.sales ? [l.sales] : []);
    const designerArr = Array.isArray(l.designer) ? l.designer : (l.designer ? [l.designer] : []);
    const managerArr = Array.isArray(l.manager) ? l.manager : (l.manager ? [l.manager] : []);
    setForm(prev => ({
      ...prev,
      contractNo: currentBizType === '家装' && l.customerNo ? l.customerNo : prev.contractNo,
      customerName: l.name || '',
      customerPhone: l.phone || '',
      houseAddress: l.address || '',
      projectManager: managerArr.join('、'),
      sales: salesArr.join('、'),
      designer: designerArr.join('、'),
    }));
    setLeadSearch('');
    setShowLeadPicker(false);
  };

  const update = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));

  const updateStage = (idx: number, field: keyof StageForm, value: string | number) => {
    const contractTotal = parseFloat(form.contractAmount) || 0;
    setForm(prev => {
      const stages = prev.stages.map((s, i) => {
        if (i !== idx) return s;
        if (field === 'amount' && contractTotal > 0) {
          const amt = Number(value) || 0;
          return { ...s, amount: amt, ratio: amt / contractTotal };
        }
        if (field === 'amount') return { ...s, amount: Number(value) || 0 };
        return { ...s, [field]: value };
      });
      return { ...prev, stages };
    });
  };

  const addStage = () => setForm(prev => ({ ...prev, stages: [...prev.stages, emptyStage()] }));
  const removeStage = (idx: number) => {
    if (form.stages.length <= 1) return;
    setForm(prev => ({ ...prev, stages: prev.stages.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.contractNo || !form.customerName || saving || saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);
    try {
      const amount = Math.round(parseFloat(form.contractAmount) || 0);
      const stageForms = currentBizType === '家装'
        ? applyHomeDefaultStageAmounts(form.stages, amount)
        : form.stages;
      const stages = stageForms
        .filter(s => s.name.trim())
        .map(s => ({ ...s, ratio: amount > 0 ? (s.amount || 0) / amount : 0 }));

      const newId = generateId();
      const exists = contracts.some((contract) =>
        contract.bizType === currentBizType &&
        contract.contractNo === form.contractNo &&
        (!selectedLeadId || contract.customerId === selectedLeadId)
      );
      if (exists) {
        console.warn('合同已存在，已拦截重复新增:', form.contractNo);
        onClose();
        return;
      }
      const contractPayload: Contract = {
        id: newId,
        contractNo: form.contractNo,
        customerId: selectedLeadId,
        customerNo: currentBizType === '家装' ? (prefill?.customerNo || form.contractNo) : undefined,
        bizType: currentBizType,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        houseAddress: normalizeAddress(form.houseAddress),
        contractAmount: amount,
        paymentStages: stages.length > 0 ? stages : [{ name: '全款', amount, ratio: 1 }],
        status: '进行中' as const,
        signDate: form.signDate || new Date().toISOString().slice(0, 10),
        expectedEndDate: form.expectedEndDate,
        projectManager: form.projectManager,
        sales: form.sales,
        designer: form.designer,
        remark: form.remark,
        createdAt: new Date().toISOString(),
      };
      await addContract(contractPayload);
      if (selectedLeadId) {
        await addLeadAuditFollowUp({
          leadId: selectedLeadId,
          actorName: user?.name || '员工',
          content: `${user?.name || '员工'}新建合同：合同编号 ${form.contractNo}，合同金额 ${amount}，签订日期 ${contractPayload.signDate}。`,
          createdAt: contractPayload.createdAt,
        });
      }
      void createNotificationEventSafely({
        operationId: stableOperationId('contract-created', newId),
        eventType: 'CONTRACT_CREATED',
        actorUserId: user?.id || '',
        recipientRoles: ['admin'],
        category: 'contract',
        title: '新建合同',
        content: `${user?.name || '员工'}新建了${form.customerName}的合同，合同编号${form.contractNo}`,
        link: `/contracts/${newId}`,
        relatedTo: { type: 'contract', id: newId, name: form.contractNo },
        channels: ['station', 'wechat'],
      });
      onSaved?.(newId);
      onClose();
    } catch (e) {
      console.error('保存合同失败:', e);
    } finally {
      setSaving(false);
      saveLockRef.current = false;
    }
  };

  // 关闭时清理 body overflow
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const hasSelectedCustomer = !!(selectedLeadId || form.customerName || form.houseAddress);

  const noSpinner = `[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-start md:justify-end">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30" onClick={() => { if (!saving) onClose(); }} />

      {/* 面板：移动端底部上滑，桌面端右侧滑入 */}
      <div className={`
        relative w-full md:w-[480px] md:min-h-full
        max-h-[90vh] md:max-h-full
        bg-white md:shadow-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)]
        rounded-t-2xl md:rounded-none
        overflow-y-auto
        animate-slide-up md:animate-slide-in-right
      `}>
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-gray-100 px-5 md:px-6 py-3.5 md:py-4">
          <h2 className="text-sm md:text-base font-semibold text-gray-900">新建合同</h2>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40"><X size={20} /></button>
        </div>

        <div className="px-5 md:px-6 py-5 space-y-5">
          {/* 关联客户 */}
          {currentBizType === '家装' && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                    <LinkIcon size={13} className="text-gold-500" /> 关联客户
                  </div>
                  {hasSelectedCustomer ? (
                    <>
                      <div className="truncate text-[13px] font-medium text-gray-900">{form.customerName || '-'}</div>
                      <div className="mt-0.5 break-words text-xs text-gray-500">{form.houseAddress || '-'}</div>
                    </>
                  ) : (
                    <div className="text-[13px] text-gray-400">请选择已签单客户</div>
                  )}
                </div>
                <button type="button" onClick={() => setShowLeadPicker(v => !v)}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  {hasSelectedCustomer ? '更换' : '选择'}
                </button>
              </div>
              {showLeadPicker && (
                <div className="mt-3 rounded-lg border border-gray-100 bg-white p-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                      placeholder="搜索客户姓名、电话或地址"
                      className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-[13px] outline-none focus:ring-1 focus:ring-gold-400" />
                  </div>
                  {filteredLeads.length > 0 ? (
                    <div className="mt-2 max-h-44 overflow-y-auto space-y-1">
                      {filteredLeads.slice(0, 20).map((l: any) => (
                        <div key={l._id} onClick={() => selectLead(l)}
                          className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-[13px] hover:bg-gold-50">
                          <span className="font-medium text-gray-700">{l.name}</span>
                          <span className="ml-2 flex-1 truncate text-right text-xs text-gray-400">{l.address}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-gray-400">暂无匹配客户</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 表单 */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">合同编号（自动生成）</label>
              <input value={form.contractNo} readOnly className="erp-input bg-gray-50 cursor-not-allowed text-xs" />
            </div>
            {currentBizType !== '家装' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">客户姓名 *</label>
                  <input value={form.customerName} onChange={e => update('customerName', e.target.value)} className="erp-input text-xs" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">联系电话</label>
                  <input value={form.customerPhone} onChange={e => update('customerPhone', e.target.value)} className="erp-input text-xs" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">合同金额（待定可留空）</label>
              <input type="number" value={form.contractAmount} onChange={e => update('contractAmount', e.target.value)}
                className={`erp-input text-xs ${noSpinner}`} placeholder="待确定可留空" />
            </div>
            {currentBizType !== '家装' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">项目经理</label>
                  <input value={form.projectManager} onChange={e => update('projectManager', e.target.value)} className="erp-input text-xs" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">项目地址</label>
                  <input value={form.houseAddress} onChange={e => update('houseAddress', e.target.value)} className="erp-input text-xs" placeholder="例如：翡翠湾 1-101" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">签订日期</label>
              <DatePicker mode="single" value={form.signDate} onChange={v => update('signDate', v)} placeholder="选择日期" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">备注</label>
              <textarea
                value={form.remark}
                onChange={e => update('remark', e.target.value)}
                ref={autoResize}
                rows={2}
                placeholder="填写备注信息..."
                className="erp-input text-xs resize-none overflow-hidden min-h-[40px]"
              />
            </div>
          </div>

          {/* 收款阶段 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 font-medium">收款阶段</label>
              <button type="button" onClick={addStage} className="text-xs text-gold-500 font-medium">+ 添加阶段</button>
            </div>
            <div className="space-y-2">
              {form.stages.map((stage, idx) => {
                return (
                  <div key={idx} className="grid grid-cols-[18px_minmax(0,1fr)_minmax(108px,140px)_28px] items-center gap-2">
                    <span className="text-xs text-gray-400 w-4 shrink-0">{idx + 1}.</span>
                    <input value={stage.name} onChange={e => updateStage(idx, 'name', e.target.value)}
                      placeholder="阶段名称" className="erp-input flex-1 min-w-0 text-xs" />
                    <input type="number" value={stage.amount || ''} onChange={e => updateStage(idx, 'amount', e.target.value)}
                      placeholder="金额" className={`erp-input w-full text-xs ${noSpinner}`} />
                    <button
                      type="button"
                      onClick={() => removeStage(idx)}
                      disabled={form.stages.length <= 1}
                      className="shrink-0 p-1 text-gray-300 hover:text-red-400 disabled:opacity-20 disabled:pointer-events-none"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 md:px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="erp-btn-secondary text-xs" disabled={saving}>取消</button>
          <button onClick={handleSave} className="erp-btn-primary text-xs" disabled={saving || saveLockRef.current || (currentBizType === '家装' && !hasSelectedCustomer)}>
            {saving ? '保存中...' : '确认新增'}
          </button>
        </div>
      </div>
    </div>
  );
}
