import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Plus, Search, Upload, FileText, User, Building, Calendar, FileImage, Settings, Tag, DollarSign, CheckCircle, Trash2, Ban, RotateCcw } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import FormAttachmentList from '@/components/FormAttachmentList';
import { useFinanceStore } from '@/store/financeStore';
import { useAuthStore } from '@/store/authStore';
import { useBizStore } from '@/store/bizStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useDialogStore } from '@/store/dialogStore';
import { formatMoney, formatDate, generateId } from '@/utils/format';
import type { Reimbursement, AttachmentValue } from '@/types';
import { normalizeAttachments, openAttachment, uploadFinanceAttachments, mergeAttachments, downloadAttachment } from '@/utils/financeAttachments';
import { exportPaymentApplications, parsePaymentApplicationsFromFile, rmbUppercase, type ImportedPaymentApplication, type PaymentApplicationExportItem } from '@/utils/paymentApplicationExport';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { cloudDB } from '@/db/cloudbase';
import { createNotificationEventSafely, stableOperationId } from '@/services/notificationService';
import { notifyFinanceAuditAction, recordFinanceAuditAction } from '@/services/financeAuditLog';

const FLOW_CONFIG_DOC_ID = 'reimbursement_approval_flow';
const TYPE_CONFIG_DOC_ID = 'reimbursement_types_v1';
const TABS = ['全部', '待审批', '待打款', '已打款', '已驳回', '已作废', '已冲销'];
const DEFAULT_REIMBURSEMENT_TYPES = ['差旅费', '采购费', '交通费', '业务招待费', '其他'];
const EMPTY_FLOW_CONFIG = { approver1Ids: [] as string[], approver2Ids: [] as string[], ccUserIds: [] as string[], payerIds: [] as string[] };

function todayDate() {
  return formatDate(new Date().toISOString());
}

function createInitialForm(applicant = '', contractId = '') {
  const date = todayDate();
  return {
    contractId,
    applicant,
    type: DEFAULT_REIMBURSEMENT_TYPES[0],
    amount: '',
    expenseDate: date,
    applicationDate: date,
    description: '',
    payeeName: '',
    payeeBank: '',
    payeeAccount: '',
    remark: '',
  };
}

const INIT_FORM = createInitialForm();

const statusBadge: Record<string, string> = {
  '待一级审批': 'bg-amber-50 text-amber-600',
  '待二级审批': 'bg-indigo-50 text-indigo-600',
  '待打款': 'bg-blue-50 text-blue-600',
  '待审核': 'bg-amber-50 text-amber-600',
  '已审核': 'bg-blue-50 text-blue-600',
  '已打款': 'bg-emerald-50 text-emerald-600',
  '已驳回': 'bg-red-50 text-red-500',
  '已作废': 'bg-gray-100 text-gray-500',
  '已冲销': 'bg-slate-100 text-slate-600',
};

function getDocId(record: any) {
  return String(record?._id || record?.id || '');
}

function getUserId(item: any) {
  return String(item?._id || item?.id || '');
}

function normalizeUserIds(ids?: string[]) {
  return [...new Set((ids || []).map(String).filter(Boolean))];
}

function isUserInList(userId: string, ids?: string[]) {
  return Boolean(userId && normalizeUserIds(ids).includes(userId));
}

function safeFormatDate(value?: string) {
  if (!value) return '-';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '-';
  return formatDate(value);
}

function normalizeReimbursementTypes(value: any) {
  const source = Array.isArray(value) ? value : DEFAULT_REIMBURSEMENT_TYPES;
  const types = [...new Set(source.map((item: any) => String(item || '').trim()).filter(Boolean))];
  return types.length ? types : DEFAULT_REIMBURSEMENT_TYPES;
}

function UserMultiSelect({
  label,
  value,
  candidates,
  userNameById,
  onChange,
  tone = 'amber',
}: {
  label: string;
  value: string[];
  candidates: any[];
  userNameById: Map<string, string>;
  onChange: (next: string[]) => void;
  tone?: 'amber' | 'indigo' | 'emerald' | 'gray';
}) {
  const selectedIds = normalizeUserIds(value);
  const toneClassMap = {
    amber: {
      chip: 'border-amber-100 bg-amber-50 text-amber-700',
      close: 'text-amber-500 hover:text-red-500',
    },
    indigo: {
      chip: 'border-indigo-100 bg-indigo-50 text-indigo-700',
      close: 'text-indigo-500 hover:text-red-500',
    },
    emerald: {
      chip: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      close: 'text-emerald-500 hover:text-red-500',
    },
    gray: {
      chip: 'border-gray-100 bg-gray-50 text-gray-600',
      close: 'text-gray-400 hover:text-red-500',
    },
  }[tone];
  const options = [
    { value: '', label: '选择人员' },
    ...candidates
      .filter((u: any) => !selectedIds.includes(getUserId(u)))
      .map((u: any) => ({
        value: getUserId(u),
        label: u.name || u.displayName || u.username || getUserId(u),
        description: u.role === 'finance' ? '财务' : u.role === 'admin' ? '管理员' : '',
      })),
  ];

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-500">{label}</label>
      <div className="mb-2 flex min-h-[34px] flex-wrap gap-2">
        {selectedIds.length === 0 ? (
          <span className="flex items-center text-xs text-gray-400">暂未设置</span>
        ) : selectedIds.map((id) => (
          <span key={id} className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-medium ${toneClassMap.chip}`}>
            {userNameById.get(id) || id}
            <button
              type="button"
              onClick={() => onChange(selectedIds.filter((item) => item !== id))}
              className={toneClassMap.close}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <Select
        value=""
        onChange={(id) => id && onChange(normalizeUserIds([...selectedIds, id]))}
        options={options}
        searchable
        placeholder="添加人员"
      />
    </div>
  );
}

export default function ReimbursementPage() {
  const location = useLocation();
  const [localPreviewIndex, setLocalPreviewIndex] = useState<number | null>(null);
  const navigate = useNavigate();
  const { reimbursements, contracts, addReimbursement, updateReimbursement } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { user, users, loadUsers } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const { showConfirm, showAlert } = useDialogStore();
  
  const isEmployee = !['admin', 'finance'].includes(user?.role || '');
  const canSeeAllFinancial = !isEmployee;
  const currentUserId = getUserId(user);
  const myName = user?.name || '';
  const canManageApprovalFlow = user?.role === 'admin';
  const isEmbedded = new URLSearchParams(location.search).get('embed') === '1';

  const [tab, setTab] = useState('全部');
  const [search, setSearch] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [showPayModal, setShowPayModal] = useState<{ item: Reimbursement } | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<{ item: Reimbursement } | null>(null);
  const [controlAction, setControlAction] = useState<{ type: 'delete' | 'void' | 'reverse'; item: Reimbursement } | null>(null);
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [controlReason, setControlReason] = useState('');
  const [showDetail, setShowDetail] = useState<Reimbursement | null>(null);
  const [form, setForm] = useState(INIT_FORM);
  const [approvalConfig, setApprovalConfig] = useState(EMPTY_FLOW_CONFIG);
  const [flowDraft, setFlowDraft] = useState(EMPTY_FLOW_CONFIG);
  const [reimbursementTypes, setReimbursementTypes] = useState(DEFAULT_REIMBURSEMENT_TYPES);
  const [typeDraft, setTypeDraft] = useState(DEFAULT_REIMBURSEMENT_TYPES);
  const [newTypeName, setNewTypeName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [returnToUrl, setReturnToUrl] = useState<string | null>(null);
  const localPreviewUrls = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);

  useEffect(() => () => {
    localPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  }, [localPreviewUrls]);

  useEffect(() => {
    if (localPreviewIndex !== null && localPreviewIndex >= localPreviewUrls.length) {
      setLocalPreviewIndex(null);
    }
  }, [localPreviewIndex, localPreviewUrls.length]);
  const [payFiles, setPayFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const payFileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const approvalCandidates = useMemo(
    () => users.filter((u: any) => {
      const roles = [
        u.role,
        u.accessRole,
        ...(Array.isArray(u.roles) ? u.roles : []),
      ].map((role) => String(role || '').trim());
      return roles.some((role) => ['admin', 'finance'].includes(role))
        && u.status !== 'inactive'
        && u.isActive !== false;
    }),
    [users]
  );
  const adminUserIds = useMemo(() => users
    .filter((u: any) => u.role === 'admin' && u.status !== 'inactive' && u.isActive !== false)
    .map((u: any) => String(u._id || u.id || '').trim())
    .filter(Boolean), [users]);
  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u: any) => {
      const id = getUserId(u);
      if (id) map.set(id, u.name || u.displayName || u.username || id);
    });
    return map;
  }, [users]);
  const scopedContracts = useMemo(
    () => contracts.filter((c) => c.bizType === currentBizType && (canSeeAllFinancial || c.createdBy === myName)),
    [contracts, currentBizType, canSeeAllFinancial, myName]
  );
  const payeeHistory = useMemo(() => {
    const map = new Map<string, { value: string; label: string; description: string; payeeName: string; payeeBank: string; payeeAccount: string }>();
    [...reimbursements]
      .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .forEach((r: any) => {
      const payeeName = String(r.payeeName || '').trim();
      const payeeBank = String(r.payeeBank || '').trim();
      const payeeAccount = String(r.payeeAccount || '').trim();
      if (!payeeName && !payeeBank && !payeeAccount) return;
      const key = `${payeeName}|${payeeBank}|${payeeAccount}`;
      if (map.has(key)) return;
      map.set(key, {
        value: key,
        label: payeeName || payeeBank || payeeAccount,
        description: [payeeBank, payeeAccount ? `尾号${payeeAccount.slice(-4)}` : ''].filter(Boolean).join(' · '),
        payeeName,
        payeeBank,
        payeeAccount,
      });
    });
    return Array.from(map.values());
  }, [reimbursements]);
  const bankHistory = useMemo(() => {
    const map = new Map<string, { value: string; payeeName: string; payeeBank: string; payeeAccount: string }>();
    payeeHistory.forEach((item) => {
      if (!item.payeeBank) return;
      const key = `${item.payeeName}|${item.payeeBank}|${item.payeeAccount}`;
      map.set(key, {
        value: item.payeeBank,
        payeeName: item.payeeName,
        payeeBank: item.payeeBank,
        payeeAccount: item.payeeAccount,
      });
    });
    return Array.from(map.values());
  }, [payeeHistory]);

  const handlePayeeNameChange = (payeeName: string) => {
    const selected = payeeHistory.find((item) => item.payeeName === payeeName);
    setForm((prev) => ({
      ...prev,
      payeeName,
      ...(selected ? {
        payeeBank: selected.payeeBank,
        payeeAccount: selected.payeeAccount,
      } : {}),
    }));
  };

  const handlePayeeBankChange = (payeeBank: string) => {
    const selected = bankHistory.find((item) => (
      item.payeeBank === payeeBank && (!form.payeeName || item.payeeName === form.payeeName)
    )) || bankHistory.find((item) => item.payeeBank === payeeBank);
    setForm((prev) => ({
      ...prev,
      payeeBank,
      ...(selected ? {
        payeeName: prev.payeeName || selected.payeeName,
        payeeAccount: selected.payeeAccount,
      } : {}),
    }));
  };

  useEffect(() => {
    if (!form.contractId) return;
    if (scopedContracts.some((c) => c.id === form.contractId)) return;
    setForm((prev) => ({ ...prev, contractId: '' }));
  }, [form.contractId, scopedContracts]);

  const loadApprovalConfig = useCallback(async () => {
    try {
      const res: any = await cloudDB.collection('system_configs').doc(FLOW_CONFIG_DOC_ID).get();
      const data = Array.isArray(res?.data) ? res.data[0] : res?.data;
      if (data) {
        setApprovalConfig({
          approver1Ids: normalizeUserIds(data.approver1Ids),
          approver2Ids: normalizeUserIds(data.approver2Ids),
          ccUserIds: normalizeUserIds(data.ccUserIds),
          payerIds: normalizeUserIds(data.payerIds),
        });
      }
    } catch {
      setApprovalConfig(EMPTY_FLOW_CONFIG);
    }
  }, []);

  useEffect(() => {
    void loadApprovalConfig();
  }, [loadApprovalConfig]);

  const loadReimbursementTypes = useCallback(async () => {
    try {
      const res: any = await cloudDB.collection('system_configs').doc(TYPE_CONFIG_DOC_ID).get();
      const data = Array.isArray(res?.data) ? res.data[0] : res?.data;
      setReimbursementTypes(normalizeReimbursementTypes(data?.types));
    } catch {
      setReimbursementTypes(DEFAULT_REIMBURSEMENT_TYPES);
    }
  }, []);

  useEffect(() => {
    void loadReimbursementTypes();
  }, [loadReimbursementTypes]);

  useEffect(() => {
    if (reimbursementTypes.includes(form.type)) return;
    setForm((prev) => ({ ...prev, type: reimbursementTypes[0] || DEFAULT_REIMBURSEMENT_TYPES[0] }));
  }, [form.type, reimbursementTypes]);

  const openFlowSettings = () => {
    if (!canManageApprovalFlow) return;
    setFlowDraft(approvalConfig);
    setShowFlowModal(true);
  };

  const openTypeSettings = () => {
    if (!canManageApprovalFlow) return;
    setTypeDraft(reimbursementTypes);
    setNewTypeName('');
    setShowTypeModal(true);
  };

  const saveApprovalConfig = async () => {
    if (!canManageApprovalFlow) return;
    const next = {
      approver1Ids: normalizeUserIds(flowDraft.approver1Ids),
      approver2Ids: normalizeUserIds(flowDraft.approver2Ids),
      ccUserIds: normalizeUserIds(flowDraft.ccUserIds),
      payerIds: normalizeUserIds(flowDraft.payerIds),
      updatedAt: new Date().toISOString(),
      updatedBy: myName,
    };
    try {
      await cloudDB.collection('system_configs').doc(FLOW_CONFIG_DOC_ID).set(next);
      setApprovalConfig(next);
      setShowFlowModal(false);
    } catch (e: any) {
      await showAlert(e?.message || '保存审批流程失败');
    }
  };

  const addTypeDraft = () => {
    const name = newTypeName.trim();
    if (!name) return;
    setTypeDraft((prev) => normalizeReimbursementTypes([...prev, name]));
    setNewTypeName('');
  };

  const saveTypeConfig = async () => {
    if (!canManageApprovalFlow) return;
    const nextTypes = normalizeReimbursementTypes(typeDraft);
    try {
      await cloudDB.collection('system_configs').doc(TYPE_CONFIG_DOC_ID).set({
        types: nextTypes,
        updatedAt: new Date().toISOString(),
        updatedBy: myName,
      });
      setReimbursementTypes(nextTypes);
      setShowTypeModal(false);
    } catch (e: any) {
      await showAlert(e?.message || '保存付款类型失败');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') !== 'create') return;

    setForm(createInitialForm(user?.name || '', params.get('contractId') || ''));
    setFiles([]);
    setShowSubmit(true);

    // 存储返回URL
    const fromParam = params.get('from');
    setReturnToUrl(fromParam || null);

    params.delete('action');
    params.delete('contractId');
    params.delete('from');
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate, user?.name]);

  const getNamesByIds = (ids?: string[]) => normalizeUserIds(ids).map((id) => userNameById.get(id) || id).join('、') || '-';
  const getFlowActionText = (ids: string[] | undefined, action: string, emptyText: string) => {
    const names = getNamesByIds(ids);
    return names === '-' ? emptyText : `${names}${action}`;
  };
  const getReimbursementStatus = (r: Reimbursement) => {
    if ((r as any).lifecycleStatus === 'voided') return '已作废';
    if ((r as any).lifecycleStatus === 'reversed') return '已冲销';
    if (r.status === '待审核') return '待一级审批';
    if (r.status === '已审核') return '待打款';
    return r.status;
  };
  const isVisibleReimbursement = (r: Reimbursement) => (r as any).lifecycleStatus !== 'deleted';
  const getReimbursementControlType = (r: Reimbursement): 'delete' | 'void' | 'reverse' => {
    const status = getReimbursementStatus(r);
    if (status === '已打款') return 'reverse';
    if (['待二级审批', '待打款'].includes(status)) return 'void';
    return 'delete';
  };
  const getReimbursementControlLabel = (r: Reimbursement) => {
    const type = getReimbursementControlType(r);
    if (type === 'reverse') return '冲销';
    if (type === 'void') return '作废';
    return '删除';
  };
  const getFlow = (r?: Reimbursement) => ({
    approver1Ids: normalizeUserIds((r as any)?.approvalFlow?.approver1Ids || approvalConfig.approver1Ids),
    approver2Ids: normalizeUserIds((r as any)?.approvalFlow?.approver2Ids || approvalConfig.approver2Ids),
    ccUserIds: normalizeUserIds((r as any)?.approvalFlow?.ccUserIds || approvalConfig.ccUserIds),
    payerIds: normalizeUserIds((r as any)?.approvalFlow?.payerIds || approvalConfig.payerIds),
  });
  const canApproveLevel1 = (r: Reimbursement) => {
    if (canManageApprovalFlow && getReimbursementStatus(r) === '待一级审批') return true;
    return getReimbursementStatus(r) === '待一级审批' && isUserInList(currentUserId, getFlow(r).approver1Ids);
  };
  const canApproveLevel2 = (r: Reimbursement) => {
    if (canManageApprovalFlow && getReimbursementStatus(r) === '待二级审批') return true;
    return getReimbursementStatus(r) === '待二级审批' && isUserInList(currentUserId, getFlow(r).approver2Ids);
  };
  const canPayReimbursement = (r: Reimbursement) => {
    if (canManageApprovalFlow && getReimbursementStatus(r) === '待打款') return true;
    return getReimbursementStatus(r) === '待打款' && isUserInList(currentUserId, getFlow(r).payerIds);
  };
  const getPaymentPurpose = (r: Reimbursement) => (r as any).paymentPurpose || r.description || '';

  const notifyReimbursementUsers = async (
    r: Reimbursement,
    recipientUserIds: string[],
    eventType: string,
    title: string,
    content: string,
  ) => {
    const recipients = normalizeUserIds(recipientUserIds);
    if (!recipients.length) return;
    await createNotificationEventSafely({
      operationId: stableOperationId(eventType, getDocId(r), Date.now()),
      eventType,
      actorUserId: currentUserId,
      recipientUserIds: recipients,
      category: 'system',
      title,
      content,
      link: '/reimbursement',
      miniProgramPage: '/pages/index/index?erpPath=%2Freimbursement',
      relatedTo: { type: 'reimbursement', id: getDocId(r), name: getPaymentPurpose(r) || r.applicant },
      channels: ['station', 'wechat'],
    });
  };

  // Employee sees only their own reimbursements
  const dataSource = (isEmployee
    ? reimbursements.filter((r) => r.applicant === user?.name || '')
    : reimbursements).filter(isVisibleReimbursement);

  const filtered = dataSource
    .filter((r) => {
      const status = getReimbursementStatus(r);
      if (tab === '待审批' && !['待一级审批', '待二级审批', '待审核'].includes(status)) return false;
      if (!['全部', '待审批'].includes(tab) && status !== tab) return false;
      if (search) {
        const haystack = [
          r.applicant,
          getPaymentPurpose(r),
          (r as any).payeeName,
          (r as any).payeeBank,
          (r as any).payeeAccount,
          (r as any).remark,
        ].map((item) => String(item || '')).join(' ');
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const tableTextClass = 'block truncate text-[13px] font-normal leading-5 text-gray-800';
  const renderTableText = (value?: string, width = 'max-w-[140px]') => (
    <span className={`${tableTextClass} ${width}`} title={value || ''}>{value || '-'}</span>
  );

  const columns = [
    { key: 'applicant', title: '申请人', render: (r: Reimbursement) => renderTableText(r.applicant, 'max-w-[120px]') },
    { key: 'type', title: '付款类型', render: (r: Reimbursement) => renderTableText(r.type, 'max-w-[100px]') },
    { key: 'payeeName', title: '收款人', render: (r: Reimbursement) => renderTableText((r as any).payeeName, 'max-w-[120px]') },
    { key: 'amount', title: '金额', render: (r: Reimbursement) => <span className="text-[13px] leading-5 text-emerald-600 font-medium">{formatMoney(r.amount)}</span> },
    { key: 'description', title: '付款用途', render: (r: Reimbursement) => renderTableText(getPaymentPurpose(r), 'max-w-[180px]') },
    { key: 'contractId', title: '关联项目', render: (r: Reimbursement) => {
      const ct = contracts.find((c) => c.id === r.contractId);
      return <span className="text-xs text-gray-500">{ct?.houseAddress || '-'}</span>;
    }},
    { key: 'status', title: '状态', render: (r: Reimbursement) => (
      <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusBadge[getReimbursementStatus(r)] || ''}`}>{getReimbursementStatus(r)}</span>
    )},
    { key: 'currentNode', title: '当前节点', render: (r: Reimbursement) => {
      const flow = getFlow(r);
      const status = getReimbursementStatus(r);
      const text = status === '待一级审批' ? `待 ${getNamesByIds(flow.approver1Ids)} 审核`
        : status === '待二级审批' ? `待 ${getNamesByIds(flow.approver2Ids)} 复核`
        : status === '待打款' ? `待 ${getNamesByIds(flow.payerIds)} 打款`
        : status;
      return <span className="text-xs text-gray-500">{text}</span>;
    }},
    { key: 'expenseDate', title: '申请日期', render: (r: Reimbursement) => safeFormatDate((r as any).applicationDate || r.expenseDate) },
    { key: 'actions', title: '操作', render: (r: Reimbursement) => (
        <div className="flex min-w-[96px] items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canApproveLevel1(r) && <>
            <button disabled={submitting} onClick={() => handleApproveFlow(r, 1)} className="text-xs px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50">审核通过</button>
            <button disabled={submitting} onClick={() => { setShowRejectModal({ item: r }); setRejectReason(''); }} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50">驳回</button>
          </>}
          {canApproveLevel2(r) && <>
            <button disabled={submitting} onClick={() => handleApproveFlow(r, 2)} className="text-xs px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50">复核通过</button>
            <button disabled={submitting} onClick={() => { setShowRejectModal({ item: r }); setRejectReason(''); }} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50">驳回</button>
          </>}
          {canPayReimbursement(r) && (
            <button disabled={submitting} onClick={() => setShowPayModal({ item: r })} className="text-xs px-2 py-1 text-gold-600 hover:bg-gold-50 rounded transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50">打款</button>
          )}
        </div>
      )
    },
    { key: 'delete', title: '处理', render: (r: Reimbursement) => (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          {!isEmployee && !['已作废', '已冲销'].includes(getReimbursementStatus(r)) && (
            <button disabled={submitting} onClick={() => openReimbursementControlAction(r)} className="inline-flex items-center gap-1 text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50">
              {getReimbursementControlType(r) === 'reverse' ? <RotateCcw size={12} /> : getReimbursementControlType(r) === 'void' ? <Ban size={12} /> : <Trash2 size={12} />}
              {getReimbursementControlLabel(r)}
            </button>
          )}
        </div>
      )
    },
  ];

  const openReimbursementControlAction = (r: Reimbursement) => {
    setControlAction({ type: getReimbursementControlType(r), item: r });
    setControlReason('');
  };

  const handleReimbursementControlAction = async () => {
    if (!controlAction || submitting) return;
    const { type, item: r } = controlAction;
    const reason = controlReason.trim();
    if (type !== 'delete' && !reason) {
      await showAlert(`${type === 'reverse' ? '冲销' : '作废'}必须填写原因。`);
      return;
    }
    const actionLabel = type === 'reverse' ? '冲销' : type === 'void' ? '作废' : '删除';
    setSubmitting(true);
    try {
      const confirmed = await showConfirm(`申请人：${r.applicant}\n金额：${formatMoney(r.amount)}`, { title: `确认${actionLabel}该报销记录吗？`, confirmStyle: 'danger', confirmText: `确认${actionLabel}` });
      if (!confirmed) return;
      const now = new Date().toISOString();
      const record = {
        action: actionLabel,
        operatorId: currentUserId,
        operatorName: myName,
        comment: reason,
        operatedAt: now,
      };
      const next: Reimbursement = type === 'delete'
        ? { ...r, lifecycleStatus: 'deleted', deletedAt: now, deletedBy: myName, approvalRecords: [...(((r as any).approvalRecords || [])), record] } as any
        : type === 'void'
          ? { ...r, status: '已作废' as any, lifecycleStatus: 'voided', voidedAt: now, voidedBy: myName, voidReason: reason, approvalRecords: [...(((r as any).approvalRecords || [])), record] } as any
          : { ...r, status: '已冲销' as any, lifecycleStatus: 'reversed', reversedAt: now, reversedBy: myName, reverseReason: reason, approvalRecords: [...(((r as any).approvalRecords || [])), record] } as any;
      await updateReimbursement(next);
      await recordFinanceAuditAction({
        module: 'reimbursement',
        action: type,
        recordId: getDocId(r),
        recordName: `${r.applicant}-${r.type}`,
        bizType: currentBizType,
        amount: r.amount,
        reason,
        operatorId: currentUserId,
        operatorName: myName,
        before: r,
        after: next,
      });
      const applicantUser = users.find((u: any) => u.name === r.applicant);
      await notifyFinanceAuditAction({
        module: 'reimbursement',
        action: type,
        recordId: getDocId(r),
        recordName: `${r.applicant}-${r.type}`,
        bizType: currentBizType,
        amount: r.amount,
        reason,
        operatorId: currentUserId,
        operatorName: myName,
        recipientUserIds: [
          ...adminUserIds,
          (applicantUser as any)?._id || applicantUser?.id || '',
        ],
      });
      if (showDetail?.id === r.id) setShowDetail(next);
      if (type === 'delete') setShowDetail(null);
      setControlAction(null);
      setControlReason('');
    } catch (e: any) {
      await showAlert(e?.message || `${actionLabel}失败`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (r: Reimbursement) => {
    const confirmed = await showConfirm(`金额：${formatMoney(r.amount)}`, { title: `确认通过 ${r.applicant} 的报销申请？` });
    if (!confirmed) return;
    
    try {
      await updateReimbursement({ ...r, status: '已审核', reviewer: user?.name || '', reviewDate: new Date().toISOString() });
      const applicantUser = users.find((u) => u.name === r.applicant);
      if (applicantUser) {
        addNotification({
          title: '报销申请已通过',
          content: `您的报销申请（${getPaymentPurpose(r)}，¥${r.amount}）已审核通过，等待打款`,
          type: '报销',
          isRead: false,
          targetUserId: applicantUser.id,
        });
      }
    } catch (e: any) {
      await showAlert(e?.message || '操作失败');
    }
  };

  const handleReject = async () => {
    if (!showRejectModal || submitting) return;
    setSubmitting(true);
    const r = showRejectModal.item;
    
    try {
      await updateReimbursement({ ...r, status: '已驳回', reviewComment: rejectReason || '管理员驳回', reviewer: user?.name || '', reviewDate: new Date().toISOString() });
      const applicantUser = users.find((u) => u.name === r.applicant);
      if (applicantUser) {
        addNotification({
          title: '报销申请已驳回',
          content: `您的报销申请（${getPaymentPurpose(r)}，¥${r.amount}）已被驳回。${rejectReason ? `原因：${rejectReason}` : ''}`,
          type: '报销',
          isRead: false,
          targetUserId: applicantUser.id,
        });
      }
      setShowRejectModal(null);
      setRejectReason('');
    } catch (e: any) {
      await showAlert(e?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePay = async () => {
    if (!showPayModal || submitting) return;
    setSubmitting(true);
    
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (payFiles.length > 0) {
        try {
          uploadedAttachments = await uploadFinanceAttachments(
            payFiles,
            `finance/reimbursements/pay/${showPayModal.item.id}`,
            myName || 'ERP'
          );
        } catch (uploadError: any) {
          console.error(uploadError);
          // continue without attachments if upload fails? Or alert? Let's just catch it.
        }
      }
      
      await updateReimbursement({ 
        ...showPayModal.item, 
        status: '已打款', 
        paymentDate: new Date().toISOString(),
        attachments: mergeAttachments(showPayModal.item.attachments, uploadedAttachments)
      });
      
      const applicantUser = users.find((u) => u.name === showPayModal.item.applicant);
      if (applicantUser) {
        addNotification({
          title: '报销款已打款',
          content: `您的报销申请（${getPaymentPurpose(showPayModal.item)}，¥${showPayModal.item.amount}）已打款`,
          type: '报销',
          isRead: false,
          targetUserId: applicantUser.id,
        });
      }
      setShowPayModal(null);
      setPayFiles([]);
    } catch (e: any) {
      await showAlert(e?.message || '打款操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveFlow = async (r: Reimbursement, level: 1 | 2) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const flow = getFlow(r);
      const nextStatus = level === 1 ? '待二级审批' : '待打款';
      const nextRecipients = level === 1 ? flow.approver2Ids : flow.payerIds;
      const title = level === 1 ? '一级审批通过' : '二级审批通过';
      const confirmed = await showConfirm(`金额：${formatMoney(r.amount)}`, { title: `确认${title}？` });
      if (!confirmed) return;

      const record = {
        level,
        action: '通过',
        operatorId: currentUserId,
        operatorName: myName,
        operatedAt: new Date().toISOString(),
      };
      const next: any = {
        ...r,
        status: nextStatus as any,
        reviewer: myName,
        reviewDate: new Date().toISOString(),
        approvalRecords: [...(((r as any).approvalRecords || [])), record],
      };
      if (level === 1) {
        next.firstReviewer = myName;
        next.firstReviewDate = record.operatedAt;
      } else {
        next.secondReviewer = myName;
        next.secondReviewDate = record.operatedAt;
      }

      await updateReimbursement(next);
      await notifyReimbursementUsers(
        next,
        nextRecipients,
        level === 1 ? 'REIMBURSEMENT_LEVEL2_PENDING' : 'REIMBURSEMENT_PAYMENT_PENDING',
        level === 1 ? '报销待二级审批' : '报销待打款',
        level === 1
          ? `${r.applicant} 的报销已通过一级审批，请进行二级审批：${getPaymentPurpose(r)}（${formatMoney(r.amount)}）`
          : `${r.applicant} 的报销已完成二级审批，请安排打款：${getPaymentPurpose(r)}（${formatMoney(r.amount)}）`,
      );
      const applicantUser = users.find((u: any) => u.name === r.applicant);
      if (applicantUser) {
        await notifyReimbursementUsers(
          next,
          [getUserId(applicantUser)],
          level === 1 ? 'REIMBURSEMENT_LEVEL1_APPROVED' : 'REIMBURSEMENT_LEVEL2_APPROVED',
          title,
          level === 1
            ? `您的报销申请已通过一级审批，等待二级审批：${getPaymentPurpose(r)}`
            : `您的报销申请已通过二级审批，等待打款：${getPaymentPurpose(r)}`,
        );
      }
      if (showDetail?.id === r.id) setShowDetail(next);
    } catch (e: any) {
      await showAlert(e?.message || '审批操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectFlow = async () => {
    if (!showRejectModal || submitting) return;
    setSubmitting(true);
    const r = showRejectModal.item;
    const next: any = {
      ...r,
      status: '已驳回',
      reviewComment: rejectReason || '审批驳回',
      reviewer: myName,
      reviewDate: new Date().toISOString(),
      approvalRecords: [
        ...(((r as any).approvalRecords || [])),
        {
          action: '驳回',
          operatorId: currentUserId,
          operatorName: myName,
          comment: rejectReason || '审批驳回',
          operatedAt: new Date().toISOString(),
        },
      ],
    };

    try {
      await updateReimbursement(next);
      const applicantUser = users.find((u: any) => u.name === r.applicant);
      if (applicantUser) {
        await notifyReimbursementUsers(
          next,
          [getUserId(applicantUser)],
          'REIMBURSEMENT_REJECTED',
          '报销申请已驳回',
          `您的报销申请已被驳回：${getPaymentPurpose(r)}${rejectReason ? `，原因：${rejectReason}` : ''}`,
        );
      }
      setShowRejectModal(null);
      setRejectReason('');
      if (showDetail?.id === r.id) setShowDetail(next);
    } catch (e: any) {
      await showAlert(e?.message || '驳回失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayFlow = async () => {
    if (!showPayModal || submitting) return;
    setSubmitting(true);
    const r = showPayModal.item;
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (payFiles.length > 0) {
        uploadedAttachments = await uploadFinanceAttachments(
          payFiles,
          `finance/reimbursements/pay/${r.id}`,
          myName || 'ERP'
        );
      }
      const next: any = {
        ...r,
        status: '已打款',
        payerId: currentUserId,
        payerName: myName,
        paymentDate: new Date().toISOString(),
        attachments: mergeAttachments(r.attachments, uploadedAttachments),
        approvalRecords: [
          ...(((r as any).approvalRecords || [])),
          {
            action: '打款',
            operatorId: currentUserId,
            operatorName: myName,
            operatedAt: new Date().toISOString(),
          },
        ],
      };
      await updateReimbursement(next);
      const applicantUser = users.find((u: any) => u.name === r.applicant);
      if (applicantUser) {
        await notifyReimbursementUsers(
          next,
          [getUserId(applicantUser)],
          'REIMBURSEMENT_PAID',
          '报销款已打款',
          `您的报销申请已打款：${getPaymentPurpose(r)}（${formatMoney(r.amount)}）`,
        );
      }
      setShowPayModal(null);
      setPayFiles([]);
      if (showDetail?.id === r.id) setShowDetail(next);
    } catch (e: any) {
      await showAlert(e?.message || '打款操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitFlow = async () => {
    if (!form.applicant || !form.amount || !form.payeeName || !form.payeeBank || !form.payeeAccount || !form.description || submitting) return;
    const flow = {
      approver1Ids: normalizeUserIds(approvalConfig.approver1Ids),
      approver2Ids: normalizeUserIds(approvalConfig.approver2Ids),
      ccUserIds: normalizeUserIds(approvalConfig.ccUserIds),
      payerIds: normalizeUserIds(approvalConfig.payerIds),
    };
    if (!flow.approver1Ids.length || !flow.approver2Ids.length || !flow.payerIds.length) {
      await showAlert('请先让管理员配置一级审核人、复核人和打款人。');
      return;
    }
    setSubmitting(true);

    try {
      const reimbursementId = generateId();
      let uploadedAttachments: AttachmentValue[] = [];
      if (files.length > 0) {
        uploadedAttachments = await uploadFinanceAttachments(
          files,
          `finance/reimbursements/apply/${reimbursementId}`,
          myName || 'ERP'
        );
      }
      const newReimbursement: any = {
        id: reimbursementId,
        contractId: form.contractId,
        applicant: form.applicant,
        department: (form as any).department || '未知',
        type: form.type as Reimbursement['type'],
        amount: Number(form.amount),
        amountUppercase: rmbUppercase(Number(form.amount)),
        expenseDate: form.expenseDate,
        applicationDate: form.applicationDate || form.expenseDate,
        description: form.description,
        paymentPurpose: form.description,
        payeeName: form.payeeName.trim(),
        payeeBank: form.payeeBank.trim(),
        payeeAccount: form.payeeAccount.trim(),
        remark: form.remark.trim(),
        attachments: uploadedAttachments,
        status: '待一级审批',
        approvalFlow: flow,
        approvalRecords: [{
          action: '提交',
          operatorId: currentUserId,
          operatorName: form.applicant,
          operatedAt: new Date().toISOString(),
        }],
        reviewComment: '',
        reviewer: '',
        reviewDate: '',
        paymentVoucher: '',
        paymentDate: '',
        createdAt: new Date().toISOString(),
      };

      await addReimbursement(newReimbursement);
      await notifyReimbursementUsers(
        newReimbursement,
        flow.approver1Ids,
        'REIMBURSEMENT_LEVEL1_PENDING',
        '新的报销待一级审批',
        `${form.applicant} 提交了一笔付款申请：${form.description}（${formatMoney(Number(form.amount))}）`,
      );
      await notifyReimbursementUsers(
        newReimbursement,
        flow.ccUserIds,
        'REIMBURSEMENT_CC',
        '付款申请抄送',
        `${form.applicant} 提交了一笔付款申请并抄送给您：${form.description}（${formatMoney(Number(form.amount))}）`,
      );
      setShowSubmit(false);
      setForm(createInitialForm(user?.name || ''));
      setFiles([]);
      if (returnToUrl) {
        setReturnToUrl(null);
        navigate(returnToUrl);
      }
    } catch (e: any) {
      console.error(e);
      await showAlert(e?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.applicant || !form.amount || !form.payeeName || !form.payeeBank || !form.payeeAccount || !form.description || submitting) return;
    setSubmitting(true);
    
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (files.length > 0) {
        try {
          uploadedAttachments = await uploadFinanceAttachments(
            files,
            `finance/reimbursements/apply/${generateId()}`,
            myName || 'ERP'
          );
        } catch (uploadError: any) {
          console.error(uploadError);
        }
      }
      
      await addReimbursement({
        id: generateId(), 
        contractId: form.contractId,
        applicant: form.applicant, 
        department: (form as any).department || '未知',
        type: form.type as Reimbursement['type'], 
        amount: Number(form.amount),
        amountUppercase: rmbUppercase(Number(form.amount)),
        expenseDate: form.expenseDate, 
        applicationDate: form.applicationDate || form.expenseDate,
        description: form.description,
        paymentPurpose: form.description,
        payeeName: form.payeeName.trim(),
        payeeBank: form.payeeBank.trim(),
        payeeAccount: form.payeeAccount.trim(),
        remark: form.remark.trim(),
        attachments: uploadedAttachments,
        status: '待审核', 
        reviewComment: '', 
        reviewer: '', 
        reviewDate: '', 
        paymentVoucher: '', 
        paymentDate: '',
        createdAt: new Date().toISOString(),
      });
      
      const adminUser = users.find((u) => u.role === 'admin');
      if (adminUser) {
        addNotification({
          title: '新的报销申请',
          content: `${form.applicant} 提交了一笔报销：${form.description}（¥${Number(form.amount)}）`,
          type: '报销',
          isRead: false,
          targetUserId: adminUser.id,
        });
      }
      setShowSubmit(false);
      setForm(createInitialForm(user?.name || '')); 
      setFiles([]);

      // 如果有返回URL，则导航回去
      if (returnToUrl) {
        setReturnToUrl(null);
        navigate(returnToUrl);
      }
    } catch (e: any) {
      console.error(e);
      await showAlert(e?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const buildPaymentApplicationItem = (r: Reimbursement): PaymentApplicationExportItem => {
    const ct = contracts.find((c) => c.id === r.contractId);
    const flow = getFlow(r);
    const approverNames = getNamesByIds(flow.approver1Ids);
    return {
      applicant: r.applicant,
      applicationDate: (r as any).applicationDate || r.expenseDate || r.createdAt,
      payeeName: (r as any).payeeName || '',
      payeeBank: (r as any).payeeBank || '',
      payeeAccount: (r as any).payeeAccount || '',
      projectAddress: ct?.houseAddress || '',
      ownerName: ct?.customerName || '',
      paymentType: r.type,
      paymentPurpose: getPaymentPurpose(r),
      amount: Number(r.amount || 0),
      amountUppercase: Object.prototype.hasOwnProperty.call(r, 'amountUppercase') ? (r as any).amountUppercase : undefined,
      projectManager: ct?.projectManager || '',
      approverNames: approverNames === '-' ? '' : approverNames,
      payerNames: getNamesByIds(flow.payerIds) === '-' ? '' : getNamesByIds(flow.payerIds),
      remark: (r as any).remark || '',
    };
  };

  const findContractForImport = (item: ImportedPaymentApplication) => {
    const projectAddress = item.projectAddress.trim();
    const ownerName = item.ownerName.trim();
    return contracts.find((c) => {
      const addressMatched = projectAddress && c.houseAddress === projectAddress;
      const ownerMatched = ownerName && c.customerName === ownerName;
      return addressMatched && (!ownerName || ownerMatched);
    }) || contracts.find((c) => {
      const addressMatched = projectAddress && c.houseAddress.includes(projectAddress);
      const ownerMatched = ownerName && c.customerName.includes(ownerName);
      return (addressMatched && !ownerName) || (addressMatched && ownerMatched);
    });
  };

  const createReimbursementFromImport = (item: ImportedPaymentApplication, flow: typeof EMPTY_FLOW_CONFIG): any => {
    const contract = findContractForImport(item);
    const reimbursementId = generateId();
    const purpose = item.paymentPurpose || item.remark || '付款申请';
    return {
      id: reimbursementId,
      contractId: contract?.id || '',
      applicant: item.applicant || user?.name || '',
      department: '未知',
      type: item.paymentType || reimbursementTypes[0] || DEFAULT_REIMBURSEMENT_TYPES[0],
      amount: Number(item.amount || 0),
      amountUppercase: item.amountUppercase,
      amountUppercaseImported: true,
      expenseDate: item.applicationDate || todayDate(),
      applicationDate: item.applicationDate || todayDate(),
      description: purpose,
      paymentPurpose: purpose,
      payeeName: item.payeeName,
      payeeBank: item.payeeBank,
      payeeAccount: item.payeeAccount,
      remark: item.remark,
      attachments: [],
      status: '待一级审批',
      approvalFlow: flow,
      approvalRecords: [{
        action: '导入',
        operatorId: currentUserId,
        operatorName: user?.name || item.applicant || 'ERP',
        operatedAt: new Date().toISOString(),
        comment: `从 ${item.sheetName} 导入`,
      }],
      reviewComment: '',
      reviewer: '',
      reviewDate: '',
      paymentVoucher: '',
      paymentDate: '',
      createdAt: new Date().toISOString(),
    };
  };

  const handleImportFile = async (file?: File) => {
    if (!file || submitting) return;
    const flow = {
      approver1Ids: normalizeUserIds(approvalConfig.approver1Ids),
      approver2Ids: normalizeUserIds(approvalConfig.approver2Ids),
      ccUserIds: normalizeUserIds(approvalConfig.ccUserIds),
      payerIds: normalizeUserIds(approvalConfig.payerIds),
    };
    if (!flow.approver1Ids.length || !flow.approver2Ids.length || !flow.payerIds.length) {
      await showAlert('请先让管理员配置一级审核人、复核人和打款人。');
      return;
    }

    setSubmitting(true);
    try {
      const items = await parsePaymentApplicationsFromFile(file);
      if (!items.length) {
        await showAlert('没有识别到付款申请单数据。');
        return;
      }
      const invalid = items.filter((item) => !item.payeeName || !item.payeeBank || !item.payeeAccount || !item.amount || !item.paymentPurpose);
      if (invalid.length) {
        await showAlert(`有 ${invalid.length} 个工作表缺少收款人、开户行、账号、金额或付款用途，请补齐后再导入。`);
        return;
      }

      const records = items.map((item) => createReimbursementFromImport(item, flow));
      for (const record of records) {
        await addReimbursement(record);
        await notifyReimbursementUsers(
          record,
          flow.approver1Ids,
          'REIMBURSEMENT_LEVEL1_PENDING',
          '新的报销待一级审批',
          `${record.applicant} 导入了一笔付款申请：${record.paymentPurpose}（${formatMoney(Number(record.amount))}）`,
        );
      }
      await showAlert(`已导入 ${records.length} 笔付款申请。`);
    } catch (e: any) {
      console.error(e);
      await showAlert(e?.message || '导入付款申请单失败');
    } finally {
      setSubmitting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleExport = async () => {
    if (!filtered.length) {
      await showAlert('当前没有可导出的付款申请。');
      return;
    }
    try {
      await exportPaymentApplications(filtered.map(buildPaymentApplicationItem));
    } catch (e: any) {
      console.error(e);
      await showAlert(e?.message || '导出付款申请单失败');
    }
  };

  const pendingCount = reimbursements.filter(r => ['待一级审批', '待二级审批', '待审核'].includes(getReimbursementStatus(r))).length;

  const renderMobileActions = (r: Reimbursement) => (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
      {canApproveLevel1(r) && <>
        <button disabled={submitting} onClick={() => handleApproveFlow(r, 1)} className="rounded border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-50">审核通过</button>
        <button disabled={submitting} onClick={() => { setShowRejectModal({ item: r }); setRejectReason(''); }} className="rounded border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-500 disabled:opacity-50">驳回</button>
      </>}
      {canApproveLevel2(r) && <>
        <button disabled={submitting} onClick={() => handleApproveFlow(r, 2)} className="rounded border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-50">复核通过</button>
        <button disabled={submitting} onClick={() => { setShowRejectModal({ item: r }); setRejectReason(''); }} className="rounded border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-500 disabled:opacity-50">驳回</button>
      </>}
      {canPayReimbursement(r) && (
        <button disabled={submitting} onClick={() => setShowPayModal({ item: r })} className="rounded border border-gold-100 bg-gold-50 px-3 py-1.5 text-xs font-medium text-gold-700 disabled:opacity-50">打款</button>
      )}
      {!isEmployee && !['已作废', '已冲销'].includes(getReimbursementStatus(r)) && (
        <button disabled={submitting} onClick={() => openReimbursementControlAction(r)} className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-red-500 disabled:opacity-50">
          {getReimbursementControlLabel(r)}
        </button>
      )}
    </div>
  );

  const renderMobileRecordCard = (r: Reimbursement) => {
    const ct = contracts.find((c) => c.id === r.contractId);
    const status = getReimbursementStatus(r);
    const projectText = ct?.houseAddress || '非项目报销';
    const payee = (r as any).payeeName || '';
    const date = safeFormatDate((r as any).applicationDate || r.expenseDate);
    return (
      <button
        key={r.id}
        type="button"
        onClick={() => setShowDetail(r)}
        className="block w-full border-b border-gray-100 bg-white px-4 py-3 text-left active:bg-gray-50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{getPaymentPurpose(r) || r.applicant}</div>
            <div className="mt-1 truncate text-[11px] text-gray-400">{r.applicant} · {r.type}{date !== '-' ? ` · ${date}` : ''}</div>
          </div>
          <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${statusBadge[status] || ''}`}>{status}</span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold leading-tight text-emerald-600">{formatMoney(r.amount)}</div>
            <div className="mt-1 truncate text-xs text-gray-500">{projectText}</div>
            {payee && <div className="mt-1 truncate text-xs text-gray-400">收款人：{payee}</div>}
          </div>
          <div className="max-w-[42%] truncate text-right text-xs text-gray-400">{status === '待一级审批' || status === '待二级审批' || status === '待打款' ? columns.find((col) => col.key === 'currentNode')?.render?.(r) : ''}</div>
        </div>
        {(canApproveLevel1(r) || canApproveLevel2(r) || canPayReimbursement(r) || (!isEmployee && !['已作废', '已冲销'].includes(status))) && renderMobileActions(r)}
      </button>
    );
  };
  const amountUppercasePreview = form.amount ? rmbUppercase(Number(form.amount)) : '';

  const toolbar = (
    <div className="erp-search-row erp-reimbursement-toolbar">
      <div className="erp-reimbursement-tabs flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors shrink-0 whitespace-nowrap ${
                tab === t ? 'bg-gold-50 text-gold-700' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t}
              {t === '待审批' && !isEmployee && pendingCount > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount > 99 ? '99+' : pendingCount}</span>
              )}
            </button>
          ))}
      </div>
      <div className="erp-search-field min-w-[220px]">
        <Search size={15} className="erp-search-icon" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索申请人/收款人/付款用途..." className="erp-search-input pl-9" />
      </div>
        <button onClick={handleExport} className="erp-btn-secondary !h-8 !py-0 shrink-0 hidden md:inline-flex">
          导出付款单
        </button>
        <button onClick={() => importFileRef.current?.click()} disabled={submitting} className="erp-btn-secondary !h-8 !py-0 shrink-0 hidden md:inline-flex">
          导入付款单
        </button>
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => void handleImportFile(e.target.files?.[0])}
          className="hidden"
        />
        {canManageApprovalFlow && (
          <div className="erp-reimbursement-settings">
            <button onClick={openTypeSettings} className="erp-btn-secondary !h-8 !py-0 shrink-0">
              <Tag size={14} /> 付款类型
            </button>
            <button onClick={openFlowSettings} className="erp-btn-secondary !h-8 !py-0 shrink-0">
              <Settings size={14} /> 审批流程
            </button>
          </div>
        )}
    </div>
  );

  return (
    <div className={isEmbedded ? "h-full bg-transparent flex flex-col" : "erp-page-spaced"}>
      {!isEmbedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base md:text-lg font-bold text-gray-900">费用报销</h1>
            <p className="text-gold-500 text-xs md:text-sm">费用报销申请与打款</p>
          </div>
          <button onClick={() => {
            setForm(createInitialForm(user?.name || ''));
            setShowSubmit(true);
          }} className="erp-btn-primary shrink-0">
            <Plus size={16} /> 新建报销
          </button>
        </div>
      )}

      <div className={isEmbedded ? "flex h-full flex-col" : ""}>
        <div className="erp-surface overflow-visible">
          {toolbar}
          <div className={`hidden md:block ${isEmbedded ? "flex-1 pb-0" : ""}`}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <DataTable columns={columns as any} data={filtered as any} onRowClick={(r) => setShowDetail(r as any)} rowKey={(r) => (r as any).id} mobileCardColumns={8} />
          </div>
          <div className="md:hidden">
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">暂无报销记录</div>
            ) : filtered.map(renderMobileRecordCard)}
          </div>
        </div>
      </div>

      {/* 提交报销 Modal */}
      <Modal open={showSubmit} onClose={() => { if (!submitting) setShowSubmit(false); }} title="提交报销申请" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">关联项目（可选）</label>
              <Select 
                value={form.contractId} 
                onChange={(v) => setForm({ ...form, contractId: v })} 
                searchable
                options={[
                  { value: '', label: '非项目报销（公司日常费用等）' },
                  ...scopedContracts.map(c => ({ value: c.id, label: `${c.houseAddress} (${c.customerName})` }))
                ]} 
              />
            </div>
            <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">申请人</label><input value={form.applicant} onChange={(e) => setForm({ ...form, applicant: e.target.value })} className="erp-input" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">收款人（单位）*</label>
                <input
                  value={form.payeeName}
                  onChange={(e) => handlePayeeNameChange(e.target.value)}
                  list="reimbursement-payee-history"
                  className="erp-input"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">开户银行 *</label>
                <input
                  value={form.payeeBank}
                  onChange={(e) => handlePayeeBankChange(e.target.value)}
                  list="reimbursement-bank-history"
                  className="erp-input"
                />
              </div>
              <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">账号 *</label><input value={form.payeeAccount} onChange={(e) => setForm({ ...form, payeeAccount: e.target.value })} className="erp-input" /></div>
            </div>
            <datalist id="reimbursement-payee-history">
              {Array.from(new Set(payeeHistory.map((item) => item.payeeName).filter(Boolean))).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <datalist id="reimbursement-bank-history">
              {Array.from(new Set(bankHistory.map((item) => item.payeeBank).filter(Boolean))).map((bank) => (
                <option key={bank} value={bank} />
              ))}
            </datalist>
            <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">付款类型</label><Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={reimbursementTypes.map((t) => ({ value: t, label: t }))} /></div>
            <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">付款用途 *</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="erp-input resize-none" /></div>
            <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">付款金额（小写）</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="erp-input" /></div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">付款金额（大写）</label>
              <input value={amountUppercasePreview} readOnly placeholder="根据小写金额自动生成" className="erp-input bg-gray-50 text-gray-600" />
            </div>
            <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">申请日期</label><DatePicker mode="single" value={form.applicationDate} onChange={(v) => setForm({ ...form, applicationDate: v, expenseDate: v })} placeholder="选择日期" /></div>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">备注</label><textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} rows={2} className="erp-input resize-none" /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">附件上传</label>
            <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded p-6 text-center cursor-pointer hover:border-gold-400 transition-colors">
              <Upload size={20} className="mx-auto text-gray-400 mb-2" />
              <p className="text-xs text-gray-400">点击上传图片附件（支持多选，可多次追加）</p>
              <input ref={fileRef} type="file" multiple onChange={(e) => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])} className="hidden" />
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {files.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded overflow-hidden border border-gray-200">
                    <button type="button" onClick={() => setLocalPreviewIndex(i)} className="h-full w-full">
                      <img src={localPreviewUrls[i]} alt={f.name} className="w-full h-full object-cover" />
                    </button>
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded border border-gray-100 bg-gray-50 px-3 py-3">
            <div className="mb-3 text-sm font-medium text-gray-900">审批流程</div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">1</span>
                <div>
                  <div className="text-gray-900">{getFlowActionText(approvalConfig.approver1Ids, '审核', '待配置一级审核人')}</div>
                  <div className="mt-0.5 text-xs text-gray-500">一级审核</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">2</span>
                <div>
                  <div className="text-gray-900">{getFlowActionText(approvalConfig.approver2Ids, '复核', '待配置复核人')}</div>
                  <div className="mt-0.5 text-xs text-gray-500">复核确认</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">3</span>
                <div>
                  <div className="text-gray-900">{getFlowActionText(approvalConfig.payerIds, '打款', '待配置打款人')}</div>
                  <div className="mt-0.5 text-xs text-gray-500">财务打款</div>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-2 text-xs text-gray-500">
                抄送人：{getNamesByIds(approvalConfig.ccUserIds)}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { if (!submitting) setShowSubmit(false); }} disabled={submitting} className="erp-btn-secondary disabled:cursor-not-allowed disabled:opacity-60">取消</button>
            <button onClick={handleSubmitFlow} disabled={!form.applicant || !form.amount || !form.payeeName || !form.payeeBank || !form.payeeAccount || !form.description || submitting} className="erp-btn-primary disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? '提交中...' : '提交申请'}
            </button>
          </div>
        </div>
      </Modal>

      {canManageApprovalFlow && (
        <Modal open={showTypeModal} onClose={() => setShowTypeModal(false)} title="付款类型管理" size="md">
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTypeDraft();
                  }
                }}
                placeholder="新增付款类型"
                className="erp-input"
              />
              <button type="button" onClick={addTypeDraft} className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-900 text-white">
                <Plus size={16} />
              </button>
            </div>
            <div className="space-y-2">
              {typeDraft.map((type, index) => (
                <div key={`${type}-${index}`} className="flex items-center gap-2 rounded border border-gray-100 bg-gray-50 px-3 py-2">
                  <input
                    value={type}
                    onChange={(e) => {
                      const next = [...typeDraft];
                      next[index] = e.target.value;
                      setTypeDraft(next);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (typeDraft.length <= 1) return;
                      setTypeDraft(typeDraft.filter((_, i) => i !== index));
                    }}
                    className="p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-40"
                    disabled={typeDraft.length <= 1}
                    aria-label="删除付款类型"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowTypeModal(false)} className="erp-btn-secondary">取消</button>
              <button onClick={saveTypeConfig} className="erp-btn-primary">保存类型</button>
            </div>
          </div>
        </Modal>
      )}

      {canManageApprovalFlow && (
        <Modal open={showFlowModal} onClose={() => setShowFlowModal(false)} title="报销审批流程" size="lg">
          <div className="space-y-5">
            <div className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              报销提交后依次流转：一级审核 &gt; 复核 &gt; 打款。抄送人只接收通知，不参与操作。
            </div>
            <div className="grid grid-cols-1 gap-4">
              <UserMultiSelect
                label="一级审核人"
                value={flowDraft.approver1Ids}
                candidates={approvalCandidates}
                userNameById={userNameById}
                onChange={(next) => setFlowDraft((prev) => ({ ...prev, approver1Ids: next }))}
                tone="amber"
              />
              <UserMultiSelect
                label="复核人"
                value={flowDraft.approver2Ids}
                candidates={approvalCandidates}
                userNameById={userNameById}
                onChange={(next) => setFlowDraft((prev) => ({ ...prev, approver2Ids: next }))}
                tone="indigo"
              />
              <UserMultiSelect
                label="抄送人"
                value={flowDraft.ccUserIds}
                candidates={approvalCandidates}
                userNameById={userNameById}
                onChange={(next) => setFlowDraft((prev) => ({ ...prev, ccUserIds: next }))}
                tone="gray"
              />
              <UserMultiSelect
                label="打款人"
                value={flowDraft.payerIds}
                candidates={approvalCandidates}
                userNameById={userNameById}
                onChange={(next) => setFlowDraft((prev) => ({ ...prev, payerIds: next }))}
                tone="emerald"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowFlowModal(false)} className="erp-btn-secondary">取消</button>
              <button onClick={saveApprovalConfig} className="erp-btn-primary">保存流程</button>
            </div>
          </div>
        </Modal>
      )}

      {!isEmployee && (
        <Modal
          open={!!controlAction}
          onClose={() => { if (!submitting) { setControlAction(null); setControlReason(''); } }}
          title={controlAction ? `${controlAction.type === 'reverse' ? '冲销' : controlAction.type === 'void' ? '作废' : '删除'}报销记录` : '处理报销记录'}
        >
          {controlAction && (
            <div className="space-y-4">
              <div className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                {controlAction.type === 'reverse'
                  ? '已打款的报销不能直接删除。冲销后该记录不再作为有效报销处理，但会保留付款与冲销痕迹。'
                  : controlAction.type === 'void'
                    ? '已进入审批流程的报销不能直接删除。作废后流程终止，并保留审批与作废痕迹。'
                    : '未形成有效审批结果的报销可以删除，系统会保留操作日志。'}
              </div>
              <div className="rounded bg-gray-50 px-3 py-3 text-sm text-gray-600">
                <div>申请人：<span className="font-medium text-gray-900">{controlAction.item.applicant}</span></div>
                <div className="mt-1">金额：<span className="font-medium text-emerald-600">{formatMoney(controlAction.item.amount)}</span></div>
                <div className="mt-1">当前状态：<span className="font-medium text-gray-900">{getReimbursementStatus(controlAction.item)}</span></div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">
                  {controlAction.type === 'reverse' ? '冲销原因' : controlAction.type === 'void' ? '作废原因' : '删除原因'}
                </label>
                <textarea
                  value={controlReason}
                  onChange={(e) => setControlReason(e.target.value)}
                  rows={3}
                  placeholder={controlAction.type === 'delete' ? '可填写删除原因，便于后续追溯' : '请填写原因，便于后续查账'}
                  className="erp-input resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { if (!submitting) { setControlAction(null); setControlReason(''); } }} disabled={submitting} className="erp-btn-secondary disabled:cursor-not-allowed disabled:opacity-60">取消</button>
                <button onClick={handleReimbursementControlAction} disabled={submitting} className="px-4 py-2 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-70">
                  {submitting ? '处理中...' : `确认${controlAction.type === 'reverse' ? '冲销' : controlAction.type === 'void' ? '作废' : '删除'}`}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* 打款 Modal - hidden for employee */}
      {!isEmployee && (
        <Modal open={!!showPayModal} onClose={() => { setShowPayModal(null); setPayFiles([]); }} title="确认打款">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">确认向 <span className="text-gray-900 font-semibold">{showPayModal?.item.applicant}</span> 打款 <span className="text-emerald-600 font-semibold">{showPayModal?.item ? formatMoney(showPayModal.item.amount) : ''}</span>？</p>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">打款凭证（可选）</label>
              <input type="file" multiple onChange={(e) => setPayFiles(Array.from(e.target.files || []))} className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200" />
              <p className="text-xs text-amber-600 mt-1">（选填）如有需要，您可以在打款后继续通过报销详情补充打款凭证。</p>
            </div>
            
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowPayModal(null); setPayFiles([]); }} className="erp-btn-secondary">取消</button>
              <button onClick={handlePayFlow} disabled={submitting} className="erp-btn-primary">
                {submitting ? '处理中...' : '确认打款'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {localPreviewIndex !== null && (
        <ImagePreviewModal
          images={localPreviewUrls}
          index={localPreviewIndex}
          onIndexChange={setLocalPreviewIndex}
          onClose={() => setLocalPreviewIndex(null)}
        />
      )}

      {/* 驳回 Modal - hidden for employee */}
      {!isEmployee && (
        <Modal open={!!showRejectModal} onClose={() => { if (!submitting) { setShowRejectModal(null); setRejectReason(''); } }} title="确认驳回">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">确认驳回 <span className="text-gray-900 font-semibold">{showRejectModal?.item.applicant}</span> 的报销申请？</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">驳回原因（可选）</label>
              <textarea 
                value={rejectReason} 
                onChange={(e) => setRejectReason(e.target.value)} 
                placeholder="请输入驳回原因，方便申请人修改..."
                rows={3}
                className="erp-input resize-none" 
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { if (!submitting) { setShowRejectModal(null); setRejectReason(''); } }}
                disabled={submitting}
                className="erp-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button onClick={handleRejectFlow} disabled={submitting} className="px-4 py-2 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-70">
                {submitting ? '处理中...' : '确认驳回'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 报销详情 Modal */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)} title="报销详情" size="lg">
        {showDetail && (
          <div className="space-y-5">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await exportPaymentApplications([buildPaymentApplicationItem(showDetail)]);
                  } catch (e: any) {
                    await showAlert(e?.message || '导出付款申请单失败');
                  }
                }}
                className="erp-btn-secondary !h-8 !py-0"
              >
                导出付款单
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">申请人：</span><span className="text-gray-900 font-medium">{showDetail.applicant}</span></div>
              <div><span className="text-gray-500">关联项目：</span><span className="text-gray-900 font-medium">{contracts.find(c => c.id === showDetail.contractId)?.houseAddress || '非项目报销'}</span></div>
              <div><span className="text-gray-500">付款类型：</span><span className="text-gray-900 font-medium">{showDetail.type}</span></div>
              <div><span className="text-gray-500">金额：</span><span className="text-emerald-600 font-semibold">{formatMoney(showDetail.amount)}</span></div>
              <div><span className="text-gray-500">申请日期：</span><span className="text-gray-900">{safeFormatDate((showDetail as any).applicationDate || showDetail.expenseDate)}</span></div>
              <div><span className="text-gray-500">状态：</span><span className={`text-xs px-2 py-0.5 rounded font-medium ${statusBadge[getReimbursementStatus(showDetail)] || ''}`}>{getReimbursementStatus(showDetail)}</span></div>
              <div><span className="text-gray-500">收款人：</span><span className="text-gray-900 font-medium">{(showDetail as any).payeeName || '-'}</span></div>
              <div><span className="text-gray-500">开户银行：</span><span className="text-gray-900 font-medium">{(showDetail as any).payeeBank || '-'}</span></div>
              <div className="sm:col-span-2"><span className="text-gray-500">账号：</span><span className="text-gray-900 font-medium">{(showDetail as any).payeeAccount || '-'}</span></div>
            </div>
            <div className="text-sm"><span className="text-gray-500">付款用途：</span><p className="text-gray-700 mt-1">{getPaymentPurpose(showDetail)}</p></div>
            {(showDetail as any).remark && (
              <div className="text-sm"><span className="text-gray-500">备注：</span><p className="text-gray-700 mt-1">{(showDetail as any).remark}</p></div>
            )}
            <div className="rounded bg-gray-50 p-3 text-xs text-gray-600">
              <div className="mb-2 font-medium text-gray-800">审批流程</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>一级审核：{getNamesByIds(getFlow(showDetail).approver1Ids)}</div>
                <div>复核：{getNamesByIds(getFlow(showDetail).approver2Ids)}</div>
                <div>打款人：{getNamesByIds(getFlow(showDetail).payerIds)}</div>
                <div>抄送人：{getNamesByIds(getFlow(showDetail).ccUserIds)}</div>
              </div>
            </div>
            {showDetail.attachments && showDetail.attachments.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2"><FileImage size={14} />附件（{showDetail.attachments.length}个）</div>
                <FormAttachmentList 
                  attachments={showDetail.attachments}
                  onRemove={async (idx) => {
                    const confirmed = await showConfirm('确认删除该附件吗？', { title: '删除后不可恢复' });
                    if (confirmed) {
                      const newAttachments = normalizeAttachments(showDetail.attachments).filter((_, i) => i !== idx);
                      await updateReimbursement({ ...showDetail, attachments: newAttachments });
                      setShowDetail({ ...showDetail, attachments: newAttachments });
                    }
                  }}
                />
                <div className="mt-2">
                  <input type="file" multiple className="text-xs w-full" onChange={async (e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    try {
                      const uploaded = await uploadFinanceAttachments(Array.from(files), `finance/reimbursements/append/${showDetail.id}`, myName || 'ERP');
                      const newAttachments = mergeAttachments(showDetail.attachments, uploaded);
                      await updateReimbursement({ ...showDetail, attachments: newAttachments });
                      setShowDetail({ ...showDetail, attachments: newAttachments });
                    } catch (err: any) {
                      await showAlert('上传失败: ' + (err?.message || '未知错误'));
                    }
                  }} />
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3"><FileText size={14} />审核流转</div>
              <div className="space-y-3 pl-1">
                <div className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-gold-400 mt-1.5 shrink-0" />
                  <div><p className="text-gray-900">{showDetail.applicant} 提交申请</p><p className="text-gray-400 text-xs mt-0.5">{formatDate(showDetail.createdAt)}</p></div>
                </div>
                {((showDetail as any).approvalRecords || []).filter((record: any) => record.action !== '提交').map((record: any, idx: number) => (
                  <div key={`${record.operatedAt || idx}-${record.action}`} className="flex gap-3 text-sm">
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${record.action === '驳回' ? 'bg-red-400' : record.action === '打款' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                    <div>
                      <p className="text-gray-900">{record.operatorName || '-'} {record.level ? `${record.level}级审批` : ''}{record.action}</p>
                      {record.comment && <p className="mt-0.5 text-xs text-red-500">原因：{record.comment}</p>}
                      <p className="mt-0.5 text-xs text-gray-400">{formatDate(record.operatedAt)}</p>
                    </div>
                  </div>
                ))}
                {showDetail.reviewDate && (
                  <div className="flex gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${showDetail.status === '已驳回' ? 'bg-red-400' : 'bg-blue-400'}`} />
                    <div>
                      <p className="text-gray-900">{showDetail.reviewer} {showDetail.status === '已驳回' ? '驳回' : '审核通过'}</p>
                      {showDetail.reviewComment && <p className="text-red-500 text-xs mt-0.5">原因：{showDetail.reviewComment}</p>}
                      <p className="text-gray-400 text-xs mt-0.5">{formatDate(showDetail.reviewDate)}</p>
                    </div>
                  </div>
                )}
                {showDetail.paymentDate && (
                  <div className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <div><p className="text-gray-900">已打款 {formatMoney(showDetail.amount)}</p><p className="text-gray-400 text-xs mt-0.5">{formatDate(showDetail.paymentDate)}</p></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
