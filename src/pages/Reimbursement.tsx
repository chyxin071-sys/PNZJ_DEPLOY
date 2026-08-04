import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Plus, Search, Upload, FileText, User, Building, Calendar, FileImage, Settings, Tag, DollarSign, CheckCircle, Trash2 } from 'lucide-react';
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
import { exportSheetsToExcel } from '@/utils/export';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { cloudDB } from '@/db/cloudbase';
import { createNotificationEventSafely, stableOperationId } from '@/services/notificationService';

const FLOW_CONFIG_DOC_ID = 'reimbursement_approval_flow';
const TYPE_CONFIG_DOC_ID = 'reimbursement_types_v1';
const TABS = ['全部', '待一级审批', '待二级审批', '待打款', '已打款', '已驳回'];
const DEFAULT_REIMBURSEMENT_TYPES = ['差旅费', '采购费', '交通费', '业务招待费', '其他'];
const INIT_FORM = { contractId: '', applicant: '', type: DEFAULT_REIMBURSEMENT_TYPES[0], amount: '', expenseDate: '', description: '' };
const EMPTY_FLOW_CONFIG = { approver1Ids: [] as string[], approver2Ids: [] as string[], ccUserIds: [] as string[], payerIds: [] as string[] };

const statusBadge: Record<string, string> = {
  '待一级审批': 'bg-amber-50 text-amber-600',
  '待二级审批': 'bg-indigo-50 text-indigo-600',
  '待打款': 'bg-blue-50 text-blue-600',
  '待审核': 'bg-amber-50 text-amber-600',
  '已审核': 'bg-blue-50 text-blue-600',
  '已打款': 'bg-emerald-50 text-emerald-600',
  '已驳回': 'bg-red-50 text-red-500',
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
}: {
  label: string;
  value: string[];
  candidates: any[];
  userNameById: Map<string, string>;
  onChange: (next: string[]) => void;
}) {
  const selectedIds = normalizeUserIds(value);
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
      <Select
        value=""
        onChange={(id) => id && onChange(normalizeUserIds([...selectedIds, id]))}
        options={options}
        searchable
        placeholder="添加人员"
      />
      <div className="mt-2 flex min-h-[28px] flex-wrap gap-2">
        {selectedIds.length === 0 ? (
          <span className="text-xs text-gray-400">暂未设置</span>
        ) : selectedIds.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
            {userNameById.get(id) || id}
            <button
              type="button"
              onClick={() => onChange(selectedIds.filter((item) => item !== id))}
              className="text-gray-400 hover:text-red-500"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReimbursementPage() {
  const location = useLocation();
  const [localPreviewIndex, setLocalPreviewIndex] = useState<number | null>(null);
  const navigate = useNavigate();
  const { reimbursements, contracts, addReimbursement, updateReimbursement, deleteReimbursement } = useFinanceStore();
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
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
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
    setFlowDraft(approvalConfig);
    setShowFlowModal(true);
  };

  const openTypeSettings = () => {
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
      await showAlert(e?.message || '保存报销类型失败');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') !== 'create') return;

    setForm({
      ...INIT_FORM,
      applicant: user?.name || '',
      contractId: params.get('contractId') || '',
    });
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
  const getReimbursementStatus = (r: Reimbursement) => {
    if (r.status === '待审核') return '待一级审批';
    if (r.status === '已审核') return '待打款';
    return r.status;
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
      relatedTo: { type: 'reimbursement', id: getDocId(r), name: r.description || r.applicant },
      channels: ['station', 'wechat'],
    });
  };

  // Employee sees only their own reimbursements
  const dataSource = isEmployee
    ? reimbursements.filter((r) => r.applicant === user?.name || '')
    : reimbursements;

  const filtered = dataSource
    .filter((r) => {
      if (tab !== '全部' && getReimbursementStatus(r) !== tab) return false;
      if (search && !r.applicant.includes(search) && !r.description.includes(search)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const columns = [
    { key: 'applicant', title: '申请人' },
    { key: 'type', title: '报销类型' },
    { key: 'amount', title: '金额', render: (r: Reimbursement) => <span className="text-emerald-600 font-medium">{formatMoney(r.amount)}</span> },
    { key: 'description', title: '事由', render: (r: Reimbursement) => <span className="max-w-[160px] truncate block" title={r.description}>{r.description}</span> },
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
      const text = status === '待一级审批' ? `待 ${getNamesByIds(flow.approver1Ids)} 审批`
        : status === '待二级审批' ? `待 ${getNamesByIds(flow.approver2Ids)} 审批`
        : status === '待打款' ? `待 ${getNamesByIds(flow.payerIds)} 打款`
        : status;
      return <span className="text-xs text-gray-500">{text}</span>;
    }},
    { key: 'expenseDate', title: '费用日期', render: (r: Reimbursement) => safeFormatDate(r.expenseDate) },
    { key: 'actions', title: '操作', render: (r: Reimbursement) => (
        <div className="flex min-w-[96px] items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canApproveLevel1(r) && <>
            <button onClick={() => handleApproveFlow(r, 1)} className="text-xs px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors font-medium">一级通过</button>
            <button onClick={() => { setShowRejectModal({ item: r }); setRejectReason(''); }} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors font-medium">驳回</button>
          </>}
          {canApproveLevel2(r) && <>
            <button onClick={() => handleApproveFlow(r, 2)} className="text-xs px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors font-medium">二级通过</button>
            <button onClick={() => { setShowRejectModal({ item: r }); setRejectReason(''); }} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors font-medium">驳回</button>
          </>}
          {canPayReimbursement(r) && (
            <button onClick={() => setShowPayModal({ item: r })} className="text-xs px-2 py-1 text-gold-600 hover:bg-gold-50 rounded transition-colors font-medium">打款</button>
          )}
        </div>
      )
    },
    { key: 'delete', title: '删除', render: (r: Reimbursement) => (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          {!isEmployee && (
            <button onClick={() => handleDelete(r)} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors font-medium">删除</button>
          )}
        </div>
      )
    },
  ];

  const handleDelete = async (r: Reimbursement) => {
    const confirmed = await showConfirm(`申请人：${r.applicant}\n金额：${formatMoney(r.amount)}`, { title: '确认删除该报销记录吗？', confirmStyle: 'danger', confirmText: '删除' });
    if (!confirmed) return;
    try {
      await deleteReimbursement(r.id);
      if (showDetail?.id === r.id) setShowDetail(null);
    } catch (e: any) {
      await showAlert(e?.message || '删除失败');
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
          content: `您的报销申请（${r.description}，¥${r.amount}）已审核通过，等待打款`,
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
          content: `您的报销申请（${r.description}，¥${r.amount}）已被驳回。${rejectReason ? `原因：${rejectReason}` : ''}`,
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
          content: `您的报销申请（${showPayModal.item.description}，¥${showPayModal.item.amount}）已打款`,
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

    try {
      await updateReimbursement(next);
      await notifyReimbursementUsers(
        next,
        nextRecipients,
        level === 1 ? 'REIMBURSEMENT_LEVEL2_PENDING' : 'REIMBURSEMENT_PAYMENT_PENDING',
        level === 1 ? '报销待二级审批' : '报销待打款',
        level === 1
          ? `${r.applicant} 的报销已通过一级审批，请进行二级审批：${r.description}（${formatMoney(r.amount)}）`
          : `${r.applicant} 的报销已完成二级审批，请安排打款：${r.description}（${formatMoney(r.amount)}）`,
      );
      const applicantUser = users.find((u: any) => u.name === r.applicant);
      if (applicantUser) {
        await notifyReimbursementUsers(
          next,
          [getUserId(applicantUser)],
          level === 1 ? 'REIMBURSEMENT_LEVEL1_APPROVED' : 'REIMBURSEMENT_LEVEL2_APPROVED',
          title,
          level === 1
            ? `您的报销申请已通过一级审批，等待二级审批：${r.description}`
            : `您的报销申请已通过二级审批，等待打款：${r.description}`,
        );
      }
      if (showDetail?.id === r.id) setShowDetail(next);
    } catch (e: any) {
      await showAlert(e?.message || '审批操作失败');
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
          `您的报销申请已被驳回：${r.description}${rejectReason ? `，原因：${rejectReason}` : ''}`,
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
          `您的报销申请已打款：${r.description}（${formatMoney(r.amount)}）`,
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
    if (!form.applicant || !form.amount || submitting) return;
    const flow = {
      approver1Ids: normalizeUserIds(approvalConfig.approver1Ids),
      approver2Ids: normalizeUserIds(approvalConfig.approver2Ids),
      ccUserIds: normalizeUserIds(approvalConfig.ccUserIds),
      payerIds: normalizeUserIds(approvalConfig.payerIds),
    };
    if (!flow.approver1Ids.length || !flow.approver2Ids.length || !flow.payerIds.length) {
      await showAlert('请先让管理员配置审批人1、审批人2和打款人。');
      return;
    }
    setSubmitting(true);
    setShowSubmit(false);

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
        expenseDate: form.expenseDate,
        description: form.description,
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
        `${form.applicant} 提交了一笔报销：${form.description}（${formatMoney(Number(form.amount))}）`,
      );
      await notifyReimbursementUsers(
        newReimbursement,
        flow.ccUserIds,
        'REIMBURSEMENT_CC',
        '报销申请抄送',
        `${form.applicant} 提交了一笔报销并抄送给您：${form.description}（${formatMoney(Number(form.amount))}）`,
      );
      setForm(INIT_FORM);
      setFiles([]);
      if (returnToUrl) {
        setReturnToUrl(null);
        navigate(returnToUrl);
      }
    } catch (e: any) {
      console.error(e);
      await showAlert(e?.message || '提交失败');
      setShowSubmit(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.applicant || !form.amount || submitting) return;
    setSubmitting(true);
    setShowSubmit(false); // Optimistic close
    
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
        expenseDate: form.expenseDate, 
        description: form.description, 
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
      setForm(INIT_FORM); 
      setFiles([]);

      // 如果有返回URL，则导航回去
      if (returnToUrl) {
        setReturnToUrl(null);
        navigate(returnToUrl);
      }
    } catch (e: any) {
      console.error(e);
      await showAlert(e?.message || '提交失败');
      setShowSubmit(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    const rows = filtered.map(r => {
      const ct = contracts.find((c) => c.id === r.contractId);
      return {
        关联项目: ct?.houseAddress || '非项目报销',
        申请人: r.applicant,
        报销类型: r.type,
        金额: r.amount,
        事由: r.description,
        状态: r.status,
        费用日期: safeFormatDate(r.expenseDate),
        提交时间: formatDate(r.createdAt)
      };
    });
    exportSheetsToExcel([{ name: '报销记录', rows }], '费用报销明细');
  };

  const pendingCount = reimbursements.filter(r => ['待一级审批', '待二级审批', '待审核'].includes(getReimbursementStatus(r))).length;

  const toolbar = (
    <div className="erp-search-row">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 whitespace-nowrap ${
                tab === t ? 'bg-gold-50 text-gold-700' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t}
              {t === '待一级审批' && !isEmployee && pendingCount > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount > 99 ? '99+' : pendingCount}</span>
              )}
            </button>
          ))}
      </div>
      <div className="erp-search-field min-w-[220px]">
        <Search size={15} className="erp-search-icon" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索申请人/事由..." className="erp-search-input pl-9" />
      </div>
        <button onClick={handleExport} className="erp-btn-secondary !h-8 !py-0 shrink-0 hidden md:inline-flex">
          导出表格
        </button>
        {canManageApprovalFlow && (
          <>
            <button onClick={openTypeSettings} className="erp-btn-secondary !h-8 !py-0 shrink-0">
              <Tag size={14} /> 报销类型
            </button>
            <button onClick={openFlowSettings} className="erp-btn-secondary !h-8 !py-0 shrink-0">
              <Settings size={14} /> 审批流程
            </button>
          </>
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
            setForm({ ...INIT_FORM, applicant: user?.name || '' });
            setShowSubmit(true);
          }} className="erp-btn-primary shrink-0">
            <Plus size={16} /> 新建报销
          </button>
        </div>
      )}

      <div className={isEmbedded ? "flex h-full flex-col" : ""}>
        <div className="erp-surface overflow-visible">
          {toolbar}
          <div className={isEmbedded ? "flex-1 pb-0" : ""}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <DataTable columns={columns as any} data={filtered as any} onRowClick={(r) => setShowDetail(r as any)} rowKey={(r) => (r as any).id} mobileCardColumns={8} />
          </div>
        </div>
      </div>

      {/* 提交报销 Modal */}
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title="提交报销申请" size="lg">
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
            <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">报销类型</label><Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={reimbursementTypes.map((t) => ({ value: t, label: t }))} /></div>
            <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">金额</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="erp-input" /></div>
            <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">费用发生日期</label><DatePicker mode="single" value={form.expenseDate} onChange={(v) => setForm({ ...form, expenseDate: v })} placeholder="选择日期" /></div>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1.5 font-medium">事由说明</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="erp-input resize-none" /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">附件上传</label>
            <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gold-400 transition-colors">
              <Upload size={20} className="mx-auto text-gray-400 mb-2" />
              <p className="text-xs text-gray-400">点击上传图片附件（支持多选，可多次追加）</p>
              <input ref={fileRef} type="file" multiple onChange={(e) => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])} className="hidden" />
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {files.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                    <button type="button" onClick={() => setLocalPreviewIndex(i)} className="h-full w-full">
                      <img src={localPreviewUrls[i]} alt={f.name} className="w-full h-full object-cover" />
                    </button>
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
            <div className="mb-3 text-sm font-medium text-gray-900">审批流程</div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">1</span>
                <div>
                  <div className="text-gray-900">审批人1审核</div>
                  <div className="mt-0.5 text-xs text-gray-500">{getNamesByIds(approvalConfig.approver1Ids)}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">2</span>
                <div>
                  <div className="text-gray-900">审批人2审核</div>
                  <div className="mt-0.5 text-xs text-gray-500">{getNamesByIds(approvalConfig.approver2Ids)}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">3</span>
                <div>
                  <div className="text-gray-900">打款人打款</div>
                  <div className="mt-0.5 text-xs text-gray-500">{getNamesByIds(approvalConfig.payerIds)}</div>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-2 text-xs text-gray-500">
                抄送人：{getNamesByIds(approvalConfig.ccUserIds)}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowSubmit(false)} className="erp-btn-secondary">取消</button>
            <button onClick={handleSubmitFlow} disabled={!form.applicant || !form.amount} className="erp-btn-primary">提交申请</button>
          </div>
        </div>
      </Modal>

      {canManageApprovalFlow && (
        <Modal open={showTypeModal} onClose={() => setShowTypeModal(false)} title="报销类型管理" size="md">
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
                placeholder="新增报销类型"
                className="erp-input"
              />
              <button type="button" onClick={addTypeDraft} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                <Plus size={16} />
              </button>
            </div>
            <div className="space-y-2">
              {typeDraft.map((type, index) => (
                <div key={`${type}-${index}`} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
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
                    aria-label="删除报销类型"
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
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              报销提交后依次流转：审批人1通过 &gt; 审批人2通过 &gt; 打款人打款。抄送人只接收通知，不参与操作。
            </div>
            <div className="grid grid-cols-1 gap-4">
              <UserMultiSelect
                label="审批人1"
                value={flowDraft.approver1Ids}
                candidates={approvalCandidates}
                userNameById={userNameById}
                onChange={(next) => setFlowDraft((prev) => ({ ...prev, approver1Ids: next }))}
              />
              <UserMultiSelect
                label="审批人2"
                value={flowDraft.approver2Ids}
                candidates={approvalCandidates}
                userNameById={userNameById}
                onChange={(next) => setFlowDraft((prev) => ({ ...prev, approver2Ids: next }))}
              />
              <UserMultiSelect
                label="抄送人"
                value={flowDraft.ccUserIds}
                candidates={approvalCandidates}
                userNameById={userNameById}
                onChange={(next) => setFlowDraft((prev) => ({ ...prev, ccUserIds: next }))}
              />
              <UserMultiSelect
                label="打款人"
                value={flowDraft.payerIds}
                candidates={approvalCandidates}
                userNameById={userNameById}
                onChange={(next) => setFlowDraft((prev) => ({ ...prev, payerIds: next }))}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowFlowModal(false)} className="erp-btn-secondary">取消</button>
              <button onClick={saveApprovalConfig} className="erp-btn-primary">保存流程</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 打款 Modal - hidden for employee */}
      {!isEmployee && (
        <Modal open={!!showPayModal} onClose={() => { setShowPayModal(null); setPayFiles([]); }} title="确认打款">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">确认向 <span className="text-gray-900 font-semibold">{showPayModal?.item.applicant}</span> 打款 <span className="text-emerald-600 font-semibold">{showPayModal?.item ? formatMoney(showPayModal.item.amount) : ''}</span>？</p>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">打款凭证（可选）</label>
              <input type="file" multiple onChange={(e) => setPayFiles(Array.from(e.target.files || []))} className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200" />
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
        <Modal open={!!showRejectModal} onClose={() => { setShowRejectModal(null); setRejectReason(''); }} title="确认驳回">
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
              <button onClick={() => { setShowRejectModal(null); setRejectReason(''); }} className="erp-btn-secondary">取消</button>
              <button onClick={handleRejectFlow} disabled={submitting} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2"><User size={14} className="text-gray-400" /><span className="text-gray-500">申请人：</span><span className="text-gray-900 font-medium">{showDetail.applicant}</span></div>
              <div className="flex items-center gap-2"><Building size={14} className="text-gray-400" /><span className="text-gray-500">关联项目：</span><span className="text-gray-900 font-medium">{contracts.find(c => c.id === showDetail.contractId)?.houseAddress || '非项目报销'}</span></div>
              <div className="flex items-center gap-2"><Tag size={14} className="text-gray-400" /><span className="text-gray-500">报销类型：</span><span className="text-gray-900 font-medium">{showDetail.type}</span></div>
              <div className="flex items-center gap-2"><DollarSign size={14} className="text-gray-400" /><span className="text-gray-500">金额：</span><span className="text-emerald-600 font-semibold">{formatMoney(showDetail.amount)}</span></div>
              <div className="flex items-center gap-2"><Calendar size={14} className="text-gray-400" /><span className="text-gray-500">费用日期：</span><span className="text-gray-900">{safeFormatDate(showDetail.expenseDate)}</span></div>
              <div className="flex items-center gap-2"><CheckCircle size={14} className="text-gray-400" /><span className="text-gray-500">状态：</span><span className={`text-xs px-2 py-0.5 rounded font-medium ${statusBadge[getReimbursementStatus(showDetail)] || ''}`}>{getReimbursementStatus(showDetail)}</span></div>
            </div>
            <div className="text-sm"><span className="text-gray-500">事由说明：</span><p className="text-gray-700 mt-1">{showDetail.description}</p></div>
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <div className="mb-2 font-medium text-gray-800">审批流程</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>审批人1：{getNamesByIds(getFlow(showDetail).approver1Ids)}</div>
                <div>审批人2：{getNamesByIds(getFlow(showDetail).approver2Ids)}</div>
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
