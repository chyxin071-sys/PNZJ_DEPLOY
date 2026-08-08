import { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, FileText, TrendingUp, Wallet, Plus, Pencil, Download, Paperclip, Upload, Loader2, X, ExternalLink, ChevronDown } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney, formatDate, generateId, normalizeAddress } from '@/utils/format';
import type { Receipt, Expense, Quotation, Contract, PaymentStage, AttachmentValue, InvoiceRecord, FileAttachment } from '@/types';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import FinanceImportModal from '@/components/FinanceImportModal';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { leadsAPI, contractsAPI, receiptsAPI } from '@/db/api';
import { exportSheetsToExcel } from '@/utils/export';
import { getAttachmentSummary, normalizeAttachments, uploadFinanceAttachments, mergeAttachments } from '@/utils/financeAttachments';
import { useDialogStore } from '@/store/dialogStore';
import { getCurrentReturnPath, useSmartBack } from '@/hooks/useSmartBack';
import { Users } from 'lucide-react';

const QUOTATION_STATUS_CLASS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-500',
  '已发送': 'bg-blue-50 text-blue-600',
  '已确认': 'bg-emerald-50 text-emerald-600',
  '已作废': 'bg-red-50 text-red-500',
};

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

const defaultCommercialStages = (): PaymentStage[] => [
  { name: '回款', amount: 0, ratio: 0 },
  { name: '质保金', amount: 0, ratio: 0 },
];
const defaultHomeStages = (): PaymentStage[] => [
  { name: '定金', amount: 0, ratio: 0 },
  { name: '开工款', amount: 0, ratio: 0 },
  { name: '水电验收款', amount: 0, ratio: 0 },
  { name: '泥木验收款', amount: 0, ratio: 0 },
  { name: '竣工尾款', amount: 0, ratio: 0 },
];

function parseMoneyInput(value: string | number) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = value.replace(/[，,\s￥¥]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizePaymentStages(contract?: Contract | null): PaymentStage[] {
  const stages = contract?.paymentStages || [];
  if (!contract) return defaultHomeStages();
  if (contract.bizType !== '工装') return stages.length > 0 ? stages : defaultHomeStages();
  const hasHomeDefault = stages.some((stage) => ['预付款', '中期款', '竣工款'].includes(stage.name));
  if (!hasHomeDefault) return stages.length > 0 ? stages : defaultCommercialStages();
  const warranty = stages.find((stage) => stage.name === '质保金');
  const warrantyAmount = warranty?.amount || 0;
  const receiptAmount = Math.max(0, stages.reduce((sum, stage) => sum + (stage.amount || 0), 0) - warrantyAmount);
  return [
    { name: '回款', amount: receiptAmount, ratio: 0 },
    { name: '质保金', amount: warrantyAmount, ratio: 0 },
  ];
}

const CONTRACT_FILE_FOLDERS = ['合同资料', '合同文件夹'];

function isContractFileFolder(folderName?: string) {
  return CONTRACT_FILE_FOLDERS.includes(String(folderName || '').trim());
}

function mergeAttachmentsByFileId(items: Array<FileAttachment & Record<string, any>>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.fileID || `${item.name || ''}-${item.uploadTime || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import FormAttachmentList from '@/components/FormAttachmentList';
import UploadProgressList, { createUploadProgressItem, type UploadProgressItem } from '@/components/UploadProgressList';
import ReceiptFormModal from '@/components/ReceiptFormModal';
import ExpenseFormModal from '@/components/ExpenseFormModal';
import { useAuthStore, canViewFinancialData, hasRole } from '@/store/authStore';
import { useUploadQueueStore } from '@/store/uploadQueueStore';
import {
  createNotificationEventSafely,
  resolveUserIdsByNames,
  stableOperationId,
} from '@/services/notificationService';

type PendingUpload = UploadProgressItem & { file: File };

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getCurrentReturnPath(location.pathname, location.search);
  const smartBack = useSmartBack('/contracts');
  const {
    contracts,
    receipts,
    expenses,
    invoices,
    quotations,
    addQuotation,
    updateQuotation,
    deleteQuotation,
    updateContract,
    deleteContract,
    updateReceipt,
    updateExpense,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    initialized,
    loading,
  } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { showAlert, showConfirm } = useDialogStore();
  const { user } = useAuthStore();
  const canViewFinance = canViewFinancialData(user?.roles, user?.role);
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);
  const addUploadTasks = useUploadQueueStore(s => s.addTasks);
  const uploadTasks = useUploadQueueStore(s => s.tasks);
  const retryUploadTask = useUploadQueueStore(s => s.retryTask);
  const removeUploadTask = useUploadQueueStore(s => s.removeTask);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [directContract, setDirectContract] = useState<Contract | null>(null);
  const [directReceipts, setDirectReceipts] = useState<Receipt[]>([]);
  const [relatedLead, setRelatedLead] = useState<any>(null);
  const contract = useMemo(() => {
    const directMatches = directContract && (directContract.id === id || (directContract as any)._id === id);
    return directMatches ? directContract : contracts.find((c) => c.id === id || (c as any)._id === id) || directContract;
  }, [contracts, directContract, id]);
  const [directLoading, setDirectLoading] = useState(false);

  useEffect(() => {
    if (contract || !id) return;
    let cancelled = false;
    setDirectLoading(true);
    (async () => {
      try {
        const direct = await contractsAPI.doc(id).get();
        const found = direct || (await contractsAPI.where({ id }).toArray())[0];
        if (found && !cancelled) {
          setDirectContract(found as Contract);
          const contractKey = found.id || found._id;
          if (contractKey && !canViewFinance) {
            const foundReceipts = await receiptsAPI.where({ contractId: contractKey }).toArray();
            if (!cancelled) setDirectReceipts(foundReceipts);
          }
        }
      } catch (e) {
        console.error('直接加载合同失败:', e);
      } finally {
        if (!cancelled) setDirectLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canViewFinance, contract, id]);

  useEffect(() => {
    if (!contract) {
      setRelatedLead(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let matches: any[] = [];
        if (contract.customerId) {
          matches = await leadsAPI.where({ _id: contract.customerId }).toArray();
        }
        if (matches.length === 0 && contract.customerNo) {
          matches = await leadsAPI.where({ customerNo: contract.customerNo }).toArray();
        }
        if (matches.length === 0 && contract.customerPhone) {
          matches = await leadsAPI.where({ phone: contract.customerPhone }).toArray();
        }
        if (!cancelled) setRelatedLead(matches[0] || null);
      } catch {
        if (!cancelled) setRelatedLead(null);
      }
    })();
    return () => { cancelled = true; };
  }, [contract?.customerId, contract?.customerNo, contract?.customerPhone, contract?.id, (contract as any)?._id]);

  useEffect(() => {
    if (canViewFinance || !contract || !id) return;
    const contractKey = contract.id || (contract as any)._id || id;
    let cancelled = false;
    receiptsAPI.where({ contractId: contractKey }).toArray()
      .then((foundReceipts) => { if (!cancelled) setDirectReceipts(foundReceipts); })
      .catch(() => { if (!cancelled) setDirectReceipts([]); });
    return () => { cancelled = true; };
  }, [canViewFinance, contract, id]);

  const contractReceipts = useMemo(() => {
    const source = canViewFinance ? receipts : directReceipts;
    return source
      .filter((r) => r.contractId === id || r.contractId === contract?.id || r.contractId === (contract as any)?._id)
      .filter((r) => !['deleted', 'voided', 'reversed'].includes((r as any).lifecycleStatus))
      .sort((a, b) => (b.receiptDate || b.createdAt).localeCompare(a.receiptDate || a.createdAt));
  }, [canViewFinance, contract, directReceipts, receipts, id]);
  const contractKeys = useMemo(() => [id, contract?.id, (contract as any)?._id].filter(Boolean), [contract, id]);
  const contractExpenses = useMemo(
    () => expenses
      .filter((e) => contractKeys.includes(e.contractId))
      .filter((e) => !['deleted', 'voided', 'reversed'].includes((e as any).lifecycleStatus))
      .sort((a, b) => (b.expenseDate || b.createdAt).localeCompare(a.expenseDate || a.createdAt)),
    [expenses, contractKeys],
  );
  const contractInvoices = useMemo(
    () => invoices.filter((i) => contractKeys.includes(i.contractId)).sort((a, b) => (b.invoiceDate || b.createdAt).localeCompare(a.invoiceDate || a.createdAt)),
    [invoices, contractKeys],
  );
  const contractQuotations = useMemo(
    () => quotations.filter((q) => contractKeys.includes(q.contractId)).sort((a, b) => a.quotationDate.localeCompare(b.quotationDate)),
    [quotations, contractKeys],
  );

  const totalReceived = contractReceipts.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = contractExpenses.reduce((s, e) => s + e.amount, 0);
  const totalInvoiced = contractInvoices.reduce((s, i) => s + i.invoiceAmount, 0);
  const totalInvoicePaid = contractInvoices.reduce((s, i) => s + i.paymentAmount, 0);
  const invoiceDebt = totalInvoiced - totalReceived;
  const pendingBalance = (contract?.contractAmount || 0) - totalReceived;
  const isHomeContract = contract?.bizType === '家装';
  const showInvoiceFeature = !isHomeContract;
  const effectivePaymentStages = useMemo(() => normalizePaymentStages(contract), [contract]);
  const visibleUploadStatuses = ['queued', 'uploading', 'error'];
  const contractUploadTasks = uploadTasks.filter(task =>
    task.context?.scope === 'contract-attachments' &&
    contractKeys.includes(String(task.context?.contractId || '')) &&
    visibleUploadStatuses.includes(task.status)
  );
  const contractFolderFiles = useMemo(() => {
    return normalizeAttachments((relatedLead?.files || []).filter((file: any) => isContractFileFolder(file.folderName)))
      .map((file) => ({ ...file, folderName: (file as any).folderName || '合同资料', source: 'lead-contract-folder' }));
  }, [relatedLead?.files]);
  const contractAttachmentList = contract ? mergeAttachmentsByFileId([
    ...normalizeAttachments(contract.attachments).map((file) => ({ ...file, source: 'contract' })),
    ...contractFolderFiles,
    ...contractUploadTasks.map(task => ({
      fileID: `uploading:${task.id}`,
      name: task.fileName,
      size: task.fileSize,
      sizeStr: `${(task.fileSize / 1024 / 1024).toFixed(1)} MB`,
      type: task.file.type || task.fileName.split('.').pop()?.toLowerCase() || 'file',
      uploadTime: new Date(task.createdAt).toISOString(),
      isUploading: true,
      uploadStatus: task.status,
      uploadProgress: task.progress,
      uploadTaskId: task.id,
      uploadError: task.error,
    } as any)),
  ]) : [];

  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [stageForm, setStageForm] = useState<PaymentStage[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [receiptDefaultStage, setReceiptDefaultStage] = useState('');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [pendingInvoiceUploads, setPendingInvoiceUploads] = useState<PendingUpload[]>([]);
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceUnit: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    invoiceAmount: '',
    paymentDate: '',
    paymentAmount: '',
    remark: '',
    attachments: [] as AttachmentValue[],
  });
  const [showBasicInfo, setShowBasicInfo] = useState(true);
  const [quotationFiles, setQuotationFiles] = useState<File[]>([]);
  const [quotationSubmitting, setQuotationSubmitting] = useState(false);
  const [contractUploading, setContractUploading] = useState(false);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [quotationForm, setQuotationForm] = useState({
    version: '',
    amount: '',
    content: '',
    status: '草稿' as Quotation['status'],
    quotationDate: new Date().toISOString().slice(0, 10),
    attachments: [] as string[],
  });

  const initEditForm = () => {
    if (!contract) return;
    return {
      contractNo: contract.contractNo,
      customerName: contract.customerName,
      customerPhone: contract.customerPhone || '',
      partyB: contract.partyB || contract.customerPhone || '',
      partyC: contract.partyC || '',
      houseAddress: contract.houseAddress,
      contractAmount: String(contract.contractAmount || ''),
      signDate: contract.signDate || '',
      expectedEndDate: contract.expectedEndDate || '',
      projectManager: contract.projectManager || '',
      sales: (contract as any).sales || '',
      designer: (contract as any).designer || '',
      remark: contract.remark || '',
      stages: contract.paymentStages.length > 0 ? contract.paymentStages.map(s => ({ ...s })) : [{ name: '', amount: 0, ratio: 0 }],
      status: contract.status,
    };
  };

  const [editForm, setEditForm] = useState<ReturnType<typeof initEditForm>>();

  const handleOpenEdit = () => {
    if (!contract) return;
    setEditForm(initEditForm()!);
    setShowEditModal(true);
  };

  const handleOpenStageModal = () => {
    if (!contract) return;
    setStageForm(effectivePaymentStages.map((stage) => ({ ...stage, ratio: 0 })));
    setShowStageModal(true);
  };

  const updateStageForm = (idx: number, field: keyof PaymentStage, value: string | number) => {
    const stages = stageForm.map((s, i) => {
      if (i !== idx) return s;
      if (field === 'amount') {
        return { ...s, amount: parseMoneyInput(value), ratio: 0 };
      }
      return { ...s, [field]: String(value), ratio: 0 };
    });
    setStageForm(stages);
  };

  const addStageForm = () => setStageForm((prev) => [...prev, { name: '', amount: 0, ratio: 0 }]);
  const removeStageForm = (idx: number) => {
    if (stageForm.length <= 1) return;
    setStageForm((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleStageSave = async () => {
    if (!contract) return;
    const amount = contract.contractAmount || 0;
    const stages = stageForm
      .filter((stage) => stage.name.trim())
      .map((stage) => {
        const stageAmount = parseMoneyInput(stage.amount);
        return { ...stage, name: stage.name.trim(), amount: stageAmount, ratio: amount > 0 ? stageAmount / amount : 0 };
      });
    await saveContractChanges({
      ...contract,
      paymentStages: stages.length > 0 ? stages : (contract.bizType === '工装' ? defaultCommercialStages() : defaultHomeStages()),
    });
    setShowStageModal(false);
  };

  const saveContractChanges = async (nextContract: Contract) => {
    if (canViewFinance) {
      await updateContract(nextContract);
      setDirectContract(nextContract);
      return;
    }
    await contractsAPI.put(nextContract);
    setDirectContract(nextContract);
  };

  const handleEditSave = async () => {
    if (!contract || !editForm.contractNo || !editForm.customerName) return;
    const amount = parseFloat(editForm.contractAmount) || 0;
    if (isHomeContract) {
      await saveContractChanges({
        ...contract,
        contractAmount: amount,
        signDate: editForm.signDate || contract.signDate,
      });
      setShowEditModal(false);
      return;
    }
    await saveContractChanges({
      ...contract,
      contractNo: editForm.contractNo,
      customerName: editForm.customerName,
      customerPhone: editForm.partyB,
      partyB: editForm.partyB,
      partyC: editForm.partyC,
      houseAddress: normalizeAddress(editForm.houseAddress),
      contractAmount: amount,
      signDate: editForm.signDate || contract.signDate,
      expectedEndDate: editForm.expectedEndDate,
      projectManager: editForm.projectManager,
      sales: editForm.sales,
      designer: editForm.designer,
      remark: editForm.remark,
      status: editForm.status as Contract['status'],
    });
    setShowEditModal(false);
  };

  const getNextVersion = () => {
    const count = contractQuotations.length;
    if (count === 0) return '初版';
    if (count === 1) return '最终版';
    return `修订版V${count}`;
  };

  const handleOpenQuotationModal = () => {
    navigate(`/quotation-builder/contract/${id}/new`);
  };

  const handleViewQuotation = (q: Quotation) => {
    navigate(`/quotation-builder/contract/${id}/${q.id}?mode=view`);
  };

  const handleDeleteQuotation = async (id: string) => {
    const confirmed = await showConfirm('确定删除该报价吗？');
    if (!confirmed) return;
    try {
      await deleteQuotation(id);
    } catch (error: any) {
      await showAlert(error?.message || '删除失败');
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteContract = async () => {
    if (!contract) return;
    const count = contractReceipts.length + contractExpenses.length;
    if (count > 0) {
      await showAlert(`该合同下有 ${contractReceipts.length} 条收款记录和 ${contractExpenses.length} 条支出记录。按财务规范，有财务记录的合同不能直接删除，请先按财务流程处理相关记录。`);
      return;
    }
    const extraMsg = count > 0
      ? `\n\n该合同下有 ${contractReceipts.length} 条收款记录和 ${contractExpenses.length} 条支出记录。按财务规范，有财务记录的合同不能直接删除。`
      : '';
    const confirmed = await showConfirm(`确定要删除合同「${contract.contractNo}」吗？此操作不可恢复。${extraMsg}`);
    if (!confirmed) return;
    try {
      await deleteContract(contract.id);
      navigate('/contracts');
    } catch (error: any) {
      await showAlert(error?.message || '删除失败');
    }
  };

  const openInvoiceModal = (invoice?: InvoiceRecord) => {
    if (!contract) return;
    setEditingInvoice(invoice || null);
    setPendingInvoiceUploads([]);
    setInvoiceForm(invoice ? {
      invoiceUnit: invoice.invoiceUnit || '',
      invoiceDate: invoice.invoiceDate || new Date().toISOString().slice(0, 10),
      invoiceAmount: invoice.invoiceAmount ? String(invoice.invoiceAmount) : '',
      paymentDate: invoice.paymentDate || '',
      paymentAmount: invoice.paymentAmount ? String(invoice.paymentAmount) : '',
      remark: invoice.remark || '',
      attachments: invoice.attachments || [],
    } : {
      invoiceUnit: contract.customerName || '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      invoiceAmount: '',
      paymentDate: '',
      paymentAmount: '',
      remark: '',
      attachments: [],
    });
    setShowInvoiceModal(true);
  };

  const handleSaveInvoice = async () => {
    if (!contract || invoiceSubmitting) return;
    setInvoiceSubmitting(true);
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (pendingInvoiceUploads.length > 0) {
        for (const item of pendingInvoiceUploads) {
          setPendingInvoiceUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'uploading', progress: 30, error: undefined } : upload));
          try {
            const uploaded = await uploadFinanceAttachments([item.file], `finance/invoices/${contract.id}`, user?.name || 'ERP');
            uploadedAttachments = [...uploadedAttachments, ...uploaded];
            setPendingInvoiceUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'done', progress: 100 } : upload));
          } catch (uploadError: any) {
            setPendingInvoiceUploads(prev => prev.map(upload => upload.id === item.id ? { ...upload, status: 'error', progress: 100, error: uploadError?.message || '附件上传失败' } : upload));
            throw uploadError;
          }
        }
      }
      const invoiceAmount = Number(invoiceForm.invoiceAmount) || 0;
      const paymentAmount = Number(invoiceForm.paymentAmount) || 0;
      const next: InvoiceRecord = {
        ...(editingInvoice || {}),
        id: editingInvoice?.id || generateId(),
        contractId: contract.id,
        contractNo: contract.contractNo,
        bizType: contract.bizType,
        invoiceUnit: invoiceForm.invoiceUnit,
        invoiceDate: invoiceForm.invoiceDate,
        invoiceAmount,
        paymentDate: invoiceForm.paymentDate,
        paymentAmount,
        debtAmount: invoiceAmount - paymentAmount,
        remark: invoiceForm.remark,
        attachments: mergeAttachments(invoiceForm.attachments, uploadedAttachments),
        createdAt: editingInvoice?.createdAt || new Date().toISOString(),
        createdBy: user?.name || '',
      };
      if (editingInvoice) await updateInvoice(next);
      else await addInvoice(next);
      setShowInvoiceModal(false);
      setEditingInvoice(null);
      setPendingInvoiceUploads([]);
    } catch (error: any) {
      await showAlert(error?.message || '开票记录保存失败。请确认云端已存在 erp_invoices 集合并允许当前账号写入。');
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  const handleSubmitQuotation = async () => {
    if (!quotationForm.version || !quotationForm.amount || quotationSubmitting) return;
    setQuotationSubmitting(true);
    // 立即关闭弹窗，提供乐观更新体验
    setShowQuotationModal(false);
    try {
      let uploadedAttachments: AttachmentValue[] = [];
      if (quotationFiles.length > 0) {
        try {
          uploadedAttachments = await uploadFinanceAttachments(
            quotationFiles,
            `finance/quotations/${contract?.id || 'general'}`,
            user?.name || 'ERP'
          );
        } catch (uploadError: any) {
          console.error(uploadError);
        }
      }
      
      const quotationData = {
        id: editingQuotationId || generateId(),
        contractId: contract?.id || '',
        contractNo: contract?.contractNo || '',
        bizType: contract?.bizType || currentBizType,
        version: quotationForm.version,
        amount: Number(quotationForm.amount),
        content: quotationForm.content,
        status: quotationForm.status,
        quotationDate: quotationForm.quotationDate,
        createdAt: new Date().toISOString(),
        attachments: mergeAttachments(quotationForm.attachments, uploadedAttachments),
      };

      if (editingQuotationId) {
        await updateQuotation(quotationData as any);
      } else {
        await addQuotation(quotationData as any);
      }
      
      setQuotationFiles([]);
      setEditingQuotationId(null);
    } catch (error: any) {
      console.error('报价保存失败', error);
      await showAlert(error?.message || '报价保存失败，请重试');
      setShowQuotationModal(true); // 失败时恢复弹窗
    } finally {
      setQuotationSubmitting(false);
    }
  };

  const handleUploadContractAttachments = async (files: FileList | null) => {
    if (!contract || !files || files.length === 0 || contractUploading) return;
    const selected = Array.from(files);
    const uploadBatchId = generateId();
    const contractKey = contract.id || (contract as any)._id || id || generateId();
    addUploadTasks(selected.map(file => ({
      file,
      fileName: file.name,
      fileSize: file.size,
      folder: `finance/contracts/${contractKey}`,
      title: `合同资料 / ${contract.contractNo}`,
      context: { scope: 'contract-attachments', contractId: contractKey },
      onSuccess: async ({ fileID }) => {
        const uploadTime = new Date().toISOString();
        const uploaded: AttachmentValue = {
          fileID,
          name: file.name,
          size: file.size,
          sizeStr: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
          type: file.type || file.name.split('.').pop()?.toLowerCase() || 'file',
          uploader: user?.name || 'ERP',
          uploadTime,
        };
        const latestContract = await contractsAPI.doc(contractKey).get()
          || (await contractsAPI.where({ id: contractKey }).toArray())[0]
          || contract;
        const newAttachments = [...normalizeAttachments(latestContract.attachments), uploaded];
        await saveContractChanges({ ...latestContract, attachments: newAttachments });

        let relatedLead: any = null;
        try {
          let leads: any[] = [];
          if (latestContract.customerId) {
            leads = await leadsAPI.where({ _id: latestContract.customerId }).toArray();
          }
          if (leads.length === 0 && latestContract.customerNo) {
            leads = await leadsAPI.where({ customerNo: latestContract.customerNo }).toArray();
          }
          if (leads.length === 0 && latestContract.customerPhone) {
            leads = await leadsAPI.where({ phone: latestContract.customerPhone }).toArray();
          }
          const lead = leads[0];
          relatedLead = lead || null;
          if (lead) {
              const fileFolders = Array.from(new Set([...(lead.fileFolders || []), '合同资料']));
              const projectFile = {
                fileID,
                name: file.name,
                size: file.size,
                sizeStr: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
                type: file.type?.startsWith('image/') ? 'image' : file.name.split('.').pop()?.toLowerCase() || 'file',
                uploader: user?.name || 'ERP',
                uploadTime,
                folderName: '合同资料',
                isVisible: false,
              };
              const leadFiles = lead.files || [];
              await leadsAPI.update(lead._id, {
                files: leadFiles.some((item: any) => item.fileID === fileID) ? leadFiles : [...leadFiles, projectFile],
                fileFolders,
                updatedAt: uploadTime,
              });
              setRelatedLead((prev: any) => !prev || prev._id === lead._id ? {
                ...prev,
                ...lead,
                files: leadFiles.some((item: any) => item.fileID === fileID) ? leadFiles : [...leadFiles, projectFile],
                fileFolders,
              } : prev);
          }
        } catch (syncErr) {
          console.error('同步至客户项目资料失败', syncErr);
        }
        const recipientUserIds = await resolveUserIdsByNames(
          relatedLead?.sales,
          relatedLead?.designer,
          relatedLead?.manager,
          latestContract.projectManager,
        );
        void createNotificationEventSafely({
          operationId: stableOperationId('contract-attachments-uploaded', contractKey, uploadBatchId),
          eventType: 'CONTRACT_ATTACHMENTS_UPLOADED',
          actorUserId: user?.id || '',
          recipientUserIds,
          recipientRoles: ['admin', 'finance'],
          category: 'contract',
          title: '合同附件更新',
          content: `${user?.name || '员工'}为${latestContract.customerName}上传了${selected.length}个合同附件`,
          link: `/contracts/${contractKey}`,
          relatedTo: { type: 'contract', id: contractKey, name: latestContract.contractNo },
          channels: ['station', 'wechat'],
        });
      },
    })));
  };

  const handleExportContract = () => {
    if (!contract) return;
    const isCommercial = contract.bizType === '工装' || currentBizType === '工装';
    
    // 基本信息 sheet
    const infoData = [isCommercial
      ? {
        合同编号: contract.contractNo,
        项目名称: normalizeAddress(contract.houseAddress),
        甲方: contract.customerName,
        乙方: contract.partyB || contract.customerPhone || '',
        丙方: contract.partyC || '',
        合同金额: contract.contractAmount,
        已收金额: totalReceived,
        未收金额: pendingBalance,
        签订日期: formatDate(contract.signDate),
        预计开工: formatDate((contract as any).startDate || ''),
        预计完工: formatDate(contract.expectedEndDate || ''),
        负责人: contract.projectManager || '',
        状态: contract.status,
        备注: contract.remark || ''
      }
      : {
        合同编号: contract.contractNo,
        客户姓名: contract.customerName,
        项目地址: normalizeAddress(contract.houseAddress),
        合同金额: contract.contractAmount,
        已收金额: totalReceived,
        未收尾款: pendingBalance,
        工期: (contract as any).durationDays || '',
        签订日期: formatDate(contract.signDate),
        预计开工: formatDate((contract as any).startDate || ''),
        面积: (contract as any).area || '',
        状态: contract.status,
        备注: contract.remark || ''
      }];

    // 收款记录 sheet
    const receiptData = contractReceipts.map(r => ({
      收款日期: formatDate(r.receiptDate),
      款项阶段: r.stage,
      收款方式: r.paymentMethod,
      金额: r.amount,
      备注: r.remark || ''
    }));

    // 支出明细 sheet
    const expenseData = contractExpenses.map(e => ({
      支出日期: formatDate(e.expenseDate),
      类别: e.category,
      供应商: e.supplier,
      金额: e.amount,
      状态: e.status,
      备注: e.remark || ''
    }));

    // 报价单 sheet
    const quotationData = contractQuotations.map(q => ({
      发送日期: formatDate(q.quotationDate),
      版本名称: q.version,
      金额: q.amount,
      状态: q.status,
      备注: (q as any).remark || ''
    }));

    exportSheetsToExcel(
      [
        { name: '基本信息', rows: infoData },
        { name: '收款记录', rows: receiptData },
        { name: '支出明细', rows: expenseData },
        { name: '报价单', rows: quotationData }
      ],
      `${isCommercial ? '工装' : '家装'}_${contract.customerName}_${contract.contractNo}_结算明细`
    );
  };

  const handleJumpToCustomer = async () => {
    if (!contract) return;
    try {
      // 0. 如果合同绑定了唯一的 customerId，直接跳转，不再依赖可能被修改的文本匹配
      if (contract.customerId) {
        navigate(`/leads/${contract.customerId}`, { state: { from: returnPath } });
        return;
      }

      let matches: any[] = [];
      
      // 1. 优先尝试通过手机号匹配（最精准）
      if (contract.customerPhone) {
        matches = await leadsAPI.where({ phone: contract.customerPhone }).toArray();
      }
      
      // 2. 如果手机号没匹配到（或者没填手机号），则尝试通过姓名匹配
      if (matches.length === 0 && contract.customerName) {
        matches = await leadsAPI.where({ name: contract.customerName }).toArray();
      }
      
      // 3. 如果还是没匹配到，尝试通过地址匹配
      if (matches.length === 0 && contract.houseAddress) {
        matches = await leadsAPI.where({ address: contract.houseAddress }).toArray();
      }

      if (matches.length > 0) {
        navigate(`/leads/${matches[0]._id}`, { state: { from: returnPath } });
      } else {
        await showAlert('未找到关联的客户记录，可能是客户姓名/电话被修改或已删除。');
      }
    } catch (e) {
      console.error(e);
      await showAlert('跳转失败，请重试');
    }
  };

  if (!contract) {
    if (directLoading || (canViewFinance && (!initialized || loading))) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm">加载中...</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-gray-400 text-sm mb-4">合同不存在</p>
        <button
          onClick={() => smartBack()}
          className="erp-btn-secondary"
        >
          <ArrowLeft size={14} className="inline mr-1" />
          返回合同列表
        </button>
      </div>
    );
  }

  const receiptColumns = [
    { key: 'receiptDate', title: '收款日期', render: (r: Receipt) => formatDate(r.receiptDate) },
    {
      key: 'stage',
      title: '收款阶段',
      render: (r: Receipt) => (
        <div className="flex items-center gap-1.5">
          <span>{r.stage || '-'}</span>
          {r.stageType === 'custom' ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">自定义</span> : null}
        </div>
      ),
    },
    {
      key: 'amount',
      title: '收款金额',
      render: (r: Receipt) => (
        <span className="text-emerald-600 font-medium">{formatMoney(r.amount)}</span>
      ),
    },
    { key: 'paymentMethod', title: '收款方式' },
    { key: 'remark', title: '备注' },
    {
      key: 'attachments',
      title: '附件',
      render: (r: Receipt) => (
        <AttachmentCell 
          attachments={r.attachments} 
          onUploadFiles={async (files) => {
            const uploaded = await uploadFinanceAttachments(files, `finance/receipts/${r.contractId || r.id}`, user?.name || 'ERP');
            await useFinanceStore.getState().updateReceipt({ ...r, attachments: mergeAttachments(r.attachments, uploaded) });
          }}
          onDelete={async (idx) => {
            try {
              const newAttachments = [...(r.attachments || [])];
              newAttachments.splice(idx, 1);
              await useFinanceStore.getState().updateReceipt({ ...r, attachments: newAttachments });
            } catch (err: any) {
              alert('删除附件失败: ' + (err?.message || '未知错误'));
            }
          }}
        />
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '150px',
      render: (r: Receipt) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setEditingReceipt(r); setShowReceiptModal(true); }} className="text-xs text-gold-600 hover:text-gold-700">编辑</button>
          {canViewFinance ? (
            <button
              onClick={() => navigate(`/income?focus=${encodeURIComponent(String((r as any)._id || r.id))}`)}
              className="text-xs text-red-500 hover:text-red-600"
              title="到收入管理页冲销"
            >
              去处理
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const receiptMobileColumns = [
    {
      key: 'receiptSummary',
      title: '收款记录',
      render: (r: Receipt) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{formatDate(r.receiptDate)}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">{r.stage || '未分阶段'}</span>
          </div>
          <div className="mt-1 text-xs text-gray-400">{r.paymentMethod || '-'}{r.remark ? ` · ${r.remark}` : ''}</div>
        </div>
      ),
    },
    {
      key: 'receiptAmount',
      title: '金额',
      render: (r: Receipt) => (
        <div className="text-right text-base font-semibold text-emerald-600">{formatMoney(r.amount)}</div>
      ),
    },
    {
      key: 'receiptMobileActions',
      title: '操作',
      render: (r: Receipt) => (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          <AttachmentCell
            attachments={r.attachments}
            onUploadFiles={async (files) => {
              const uploaded = await uploadFinanceAttachments(files, `finance/receipts/${r.contractId || r.id}`, user?.name || 'ERP');
              await useFinanceStore.getState().updateReceipt({ ...r, attachments: mergeAttachments(r.attachments, uploaded) });
            }}
            onDelete={async (idx) => {
              const newAttachments = [...(r.attachments || [])];
              newAttachments.splice(idx, 1);
              await useFinanceStore.getState().updateReceipt({ ...r, attachments: newAttachments });
            }}
          />
          <div className="flex items-center gap-3">
            <button onClick={() => { setEditingReceipt(r); setShowReceiptModal(true); }} className="text-xs font-medium text-gold-600 hover:text-gold-700">编辑</button>
            {canViewFinance ? (
              <button
                onClick={() => navigate(`/income?focus=${encodeURIComponent(String((r as any)._id || r.id))}`)}
                className="text-xs font-medium text-red-500 hover:text-red-600"
              >
                去处理
              </button>
            ) : null}
          </div>
        </div>
      ),
    },
  ];

  const expenseColumns = [
    { key: 'expenseDate', title: '支出日期', render: (e: Expense) => formatDate(e.expenseDate) },
    {
      key: 'category',
      title: '类别',
      render: (e: Expense) => (
        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{e.category}</span>
      ),
    },
    { key: 'supplier', title: '收款方' },
    {
      key: 'amount',
      title: '金额',
      render: (e: Expense) => (
        <span className="text-red-500 font-medium">{formatMoney(e.amount)}</span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (e: Expense) => {
        const cls = e.status === '已付' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600';
        return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{e.status}</span>;
      },
    },
    { key: 'remark', title: '备注' },
    {
      key: 'attachments',
      title: '附件',
      render: (e: Expense) => (
        <AttachmentCell 
          attachments={e.attachments} 
          onUploadFiles={async (files) => {
            const uploaded = await uploadFinanceAttachments(files, `finance/expenses/${e.contractId || e.id}`, user?.name || 'ERP');
            await useFinanceStore.getState().updateExpense({ ...e, attachments: mergeAttachments(e.attachments, uploaded) });
          }}
          onDelete={async (idx) => {
            try {
              const newAttachments = [...(e.attachments || [])];
              newAttachments.splice(idx, 1);
              await useFinanceStore.getState().updateExpense({ ...e, attachments: newAttachments });
            } catch (err: any) {
              alert('删除附件失败: ' + (err?.message || '未知错误'));
            }
          }}
        />
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '150px',
      render: (e: Expense) => (
        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <button onClick={() => { setEditingExpense(e); setShowExpenseModal(true); }} className="text-xs text-gold-600 hover:text-gold-700">编辑</button>
          {canViewFinance ? (
            <button
              onClick={() => navigate(`/expense?focus=${encodeURIComponent(String((e as any)._id || e.id))}`)}
              className="text-xs text-red-500 hover:text-red-600"
              title="到支出管理页删除或冲销"
            >
              去处理
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const expenseMobileColumns = [
    {
      key: 'expenseSummary',
      title: '支出记录',
      render: (e: Expense) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{formatDate(e.expenseDate)}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{e.category}</span>
          </div>
          <div className="mt-1 text-xs text-gray-400">收款方：{e.supplier || '-'}</div>
        </div>
      ),
    },
    {
      key: 'expenseAmount',
      title: '金额',
      render: (e: Expense) => (
        <div className="text-right">
          <div className="text-base font-semibold text-red-500">{formatMoney(e.amount)}</div>
          <div className={`mt-1 text-xs ${e.status === '已付' ? 'text-emerald-600' : 'text-amber-600'}`}>{e.status}</div>
        </div>
      ),
    },
    {
      key: 'expenseMobileActions',
      title: '操作',
      render: (e: Expense) => (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}>
          <AttachmentCell
            attachments={e.attachments}
            onUploadFiles={async (files) => {
              const uploaded = await uploadFinanceAttachments(files, `finance/expenses/${e.contractId || e.id}`, user?.name || 'ERP');
              await useFinanceStore.getState().updateExpense({ ...e, attachments: mergeAttachments(e.attachments, uploaded) });
            }}
            onDelete={async (idx) => {
              const newAttachments = [...(e.attachments || [])];
              newAttachments.splice(idx, 1);
              await useFinanceStore.getState().updateExpense({ ...e, attachments: newAttachments });
            }}
          />
          <div className="flex items-center gap-3">
            <button onClick={() => { setEditingExpense(e); setShowExpenseModal(true); }} className="text-xs font-medium text-gold-600 hover:text-gold-700">编辑</button>
            {canViewFinance ? (
              <button
                onClick={() => navigate(`/expense?focus=${encodeURIComponent(String((e as any)._id || e.id))}`)}
                className="text-xs font-medium text-red-500 hover:text-red-600"
              >
                去处理
              </button>
            ) : null}
          </div>
        </div>
      ),
    },
  ];

  const invoiceColumns = [
    { key: 'invoiceUnit', title: '开票单位' },
    { key: 'invoiceDate', title: '开票日期', render: (i: InvoiceRecord) => i.invoiceDate ? formatDate(i.invoiceDate) : '-' },
    { key: 'invoiceAmount', title: '开票金额', render: (i: InvoiceRecord) => <span className="font-medium text-gray-900">{formatMoney(i.invoiceAmount)}</span> },
    { key: 'paymentDate', title: '付款日期', render: (i: InvoiceRecord) => i.paymentDate ? formatDate(i.paymentDate) : '-' },
    { key: 'paymentAmount', title: '付款金额', render: (i: InvoiceRecord) => <span className="font-medium text-emerald-600">{formatMoney(i.paymentAmount)}</span> },
    { key: 'debtAmount', title: '欠款金额', render: (i: InvoiceRecord) => <span className={i.debtAmount > 0 ? 'font-medium text-red-500' : 'text-gray-400'}>{formatMoney(i.debtAmount)}</span> },
    { key: 'remark', title: '备注' },
    {
      key: 'attachments',
      title: '凭证',
      render: (i: InvoiceRecord) => (
        <AttachmentCell
          attachments={i.attachments}
          onUploadFiles={async (files) => {
            const uploaded = await uploadFinanceAttachments(files, `finance/invoices/${i.contractId || i.id}`, user?.name || 'ERP');
            await updateInvoice({ ...i, attachments: mergeAttachments(i.attachments, uploaded) });
          }}
          onDelete={async (idx) => {
            const nextAttachments = [...(i.attachments || [])];
            nextAttachments.splice(idx, 1);
            await updateInvoice({ ...i, attachments: nextAttachments });
          }}
        />
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '110px',
      render: (i: InvoiceRecord) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => openInvoiceModal(i)} className="text-xs text-gold-600 hover:text-gold-700">编辑</button>
          <button onClick={async () => {
            const confirmed = await showConfirm('删除后不可恢复', { title: '确认删除该开票记录吗？' });
            if (confirmed) await deleteInvoice(i.id);
          }} className="text-xs text-red-500 hover:text-red-600">删除</button>
        </div>
      ),
    },
  ];

  const quotationColumns = [
    {
      key: 'version',
      title: '版本',
      width: '100px',
      render: (q: Quotation) => (
        <span className="font-semibold text-gray-800">{q.version}</span>
      ),
    },
    {
      key: 'amount',
      title: '报价金额',
      width: '120px',
      render: (q: Quotation) => (
        <span className="text-gold-500 font-medium">{formatMoney(q.amount)}</span>
      ),
    },
    { 
      key: 'content', 
      title: '内容摘要',
      render: (q: Quotation) => (
        <div className="truncate max-w-[200px] xl:max-w-[300px]" title={q.content}>{q.content}</div>
      )
    },
    {
      key: 'quotationDate',
      title: '日期',
      width: '120px',
      render: (q: Quotation) => formatDate(q.quotationDate),
    },
    {
      key: 'status',
      title: '状态',
      width: '80px',
      render: (q: Quotation) => {
        const cls = QUOTATION_STATUS_CLASS[q.status] || 'bg-gray-100 text-gray-500';
        const isVoid = q.status === '已作废';
        return (
          <span className={`text-xs px-2 py-0.5 rounded ${cls} ${isVoid ? 'line-through' : ''}`}>
            {q.status}
          </span>
        );
      },
    },
    {
      key: 'attachments',
      title: '凭证',
      width: '120px',
      render: (q: Quotation) => (
        <div onClick={(e) => e.stopPropagation()}>
          <AttachmentCell 
            attachments={q.attachments as AttachmentValue[]} 
            onUploadClick={() => navigate(`/quotation-builder/contract/${id}/${q.id}`)} 
          />
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '80px',
      align: 'right' as const,
      render: (q: Quotation) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => handleDeleteQuotation(q.id)} className="text-xs text-red-500 hover:text-red-600">
            删除
          </button>
        </div>
      ),
    },
  ];

  const renderQuotationDiff = () => {
    if (contractQuotations.length < 2) return null;
    const firstAmount = contractQuotations[0].amount;
    const lastAmount = contractQuotations[contractQuotations.length - 1].amount;
    const diff = lastAmount - firstAmount;
    const sign = diff >= 0 ? '+' : '';
    const color = diff >= 0 ? 'text-red-500' : 'text-emerald-600';

    return (
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-500">
        <div>
          <span>首版报价：</span>
          <span className="font-medium text-gray-700">{formatMoney(firstAmount)}</span>
        </div>
        <div>
          <span>最终报价：</span>
          <span className="font-medium text-gray-700">{formatMoney(lastAmount)}</span>
        </div>
        <div>
          <span>累计调整：</span>
          <span className={`font-medium ${color}`}>{sign}{formatMoney(diff)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="erp-page-spaced max-w-7xl mx-auto">
      {/* 页头 */}
      <div className="flex flex-row items-start justify-between gap-3 md:items-center">
        <div className="flex min-w-0 items-start gap-3 md:flex-1 md:items-center">
          <button
            onClick={() => smartBack()}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-base font-bold text-gray-900 md:flex-nowrap">
              <span className="min-w-0 max-w-full truncate">{normalizeAddress(contract.houseAddress) || contract.customerName || (isHomeContract ? '未关联客户' : '未填写甲方')}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                contract.status === '进行中' ? 'bg-blue-50 text-blue-600' :
                contract.status === '已结算' ? 'bg-emerald-50 text-emerald-600' :
                'bg-gray-100 text-gray-600'
              }`}>
                {contract.status}
              </span>
            </h1>
            <p className="text-gray-500 text-xs mt-0.5 truncate">
              {contract.customerName || (isHomeContract ? '未关联客户' : '未填写甲方')}{contract.contractNo ? ` · ${contract.contractNo}` : ''}
            </p>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-1.5 md:ml-3 md:flex md:w-auto md:flex-wrap md:items-center md:justify-end md:gap-2">
          <button onClick={handleOpenEdit} className="inline-flex h-7 w-[58px] items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 md:h-9 md:w-auto md:px-4 md:text-sm">
            编辑
          </button>
          <button onClick={() => isAdmin ? handleDeleteContract() : showAlert('只有管理员有权限')} className="inline-flex h-7 w-[58px] items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 md:h-9 md:w-auto md:px-4 md:text-sm">
            删除
          </button>
          {canViewFinance && (
            <button onClick={handleExportContract} className="hidden h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 md:inline-flex">
              导出明细
            </button>
          )}
          {canViewFinance && (
            <button onClick={() => setShowImportModal(true)} className="hidden h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 md:inline-flex">
              导入
            </button>
          )}
        </div>
      </div>

      {/* StatCard区 */}
      <div className={`grid ${isMobile ? 'grid-cols-1' : showInvoiceFeature ? 'grid-cols-5' : 'grid-cols-4'} gap-2.5 md:gap-4`}>
        <StatCard
          title="合同金额"
          value={formatMoney(contract.contractAmount)}
          icon={FileText}
          accent="gold"
          sub={isMobile ? undefined : contract.houseAddress}
        />
        <StatCard
          title="已收款"
          value={formatMoney(totalReceived)}
          icon={TrendingUp}
          accent="emerald"
          sub={isMobile ? `待收款 ${formatMoney(pendingBalance)}` : undefined}
        />
        {!isMobile && (
          <StatCard
            title="未收款"
            value={formatMoney(pendingBalance)}
            icon={Wallet}
            accent="blue"
          />
        )}
        {canViewFinance && !isMobile && (
          <StatCard title="累计支出" value={formatMoney(totalExpenses)} icon={Wallet} accent="red" />
        )}
        {showInvoiceFeature && !isMobile && (
          <StatCard title="开票欠款" value={formatMoney(invoiceDebt)} icon={FileText} accent="gold" />
        )}
      </div>

      {/* 详情区 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左：基本信息 */}
        <div className="bg-white rounded-lg border border-gray-100 overflow-visible lg:col-span-2">
          <button
            type="button"
            onClick={() => setShowBasicInfo(v => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors md:pointer-events-none"
          >
            <h3 className="text-sm font-semibold text-gray-900">基本信息</h3>
            <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 md:hidden ${showBasicInfo ? '' : '-rotate-90'}`} />
          </button>
          {showBasicInfo && (
            <div className="px-5 pb-5 pt-1">
              <div className="grid grid-cols-1 gap-3 md:hidden">
                <InfoItem label="合同编号" value={contract.contractNo || '-'} />
                <InfoItem label="项目地址" value={contract.houseAddress || '-'} />
                <InfoItem label="状态" value={<ContractStatusBadge status={contract.status} />} />
                <InfoItem label="签订日期" value={formatDate(contract.signDate)} />
                {isHomeContract ? (
                  <>
                    <InfoItem label="客户" value={contract.customerName || '-'} />
                    <InfoItem label="联系电话" value={contract.customerPhone || '-'} />
                    <InfoItem label="销售" value={contract.sales || '-'} />
                    <InfoItem label="设计" value={contract.designer || '-'} />
                    <InfoItem label="项目经理" value={contract.projectManager || '-'} />
                  </>
                ) : (
                  <>
                    <InfoItem label="甲方" value={contract.customerName || '-'} />
                    <InfoItem label="乙方" value={contract.partyB || contract.customerPhone || '-'} />
                    <InfoItem label="丙方" value={contract.partyC || '-'} />
                  </>
                )}
                <InfoItem label="合同金额" value={formatMoney(contract.contractAmount || 0)} />
                <InfoItem label="备注" value={contract.remark || '-'} />
                {isHomeContract && (
                  <button
                    type="button"
                    onClick={handleJumpToCustomer}
                    className="justify-self-start text-xs font-medium text-gold-600 hover:text-gold-700"
                  >
                    查看客户详情页
                  </button>
                )}
              </div>

              <div className="hidden md:grid md:grid-cols-2 md:gap-x-16 md:gap-y-4">
                <div className="space-y-4">
                  <InfoItem label="合同编号" value={contract.contractNo || '-'} />
                  <InfoItem label="项目地址" value={contract.houseAddress || '-'} />
                  <InfoItem label="状态" value={<ContractStatusBadge status={contract.status} />} />
                  <InfoItem label="签订日期" value={formatDate(contract.signDate)} />
                </div>
                <div className="space-y-4">
                  {isHomeContract ? (
                    <>
                      <InfoItem label="客户" value={contract.customerName || '-'} />
                      <InfoItem label="联系电话" value={contract.customerPhone || '-'} />
                      <InfoItem label="销售" value={contract.sales || '-'} />
                      <InfoItem label="设计" value={contract.designer || '-'} />
                      <InfoItem label="项目经理" value={contract.projectManager || '-'} />
                    </>
                  ) : (
                    <>
                      <InfoItem label="甲方" value={contract.customerName || '-'} />
                      <InfoItem label="乙方" value={contract.partyB || contract.customerPhone || '-'} />
                      <InfoItem label="丙方" value={contract.partyC || '-'} />
                    </>
                  )}
                  <InfoItem label="合同金额" value={formatMoney(contract.contractAmount || 0)} />
                </div>
                <div className="md:col-span-2 pt-1">
                  <InfoItem label="备注" value={contract.remark || '-'} />
                </div>
                {isHomeContract && (
                  <button
                    type="button"
                    onClick={handleJumpToCustomer}
                    className="md:col-span-2 justify-self-start text-xs font-medium text-gold-600 hover:text-gold-700"
                  >
                    查看客户详情页
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右：收款阶段 */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">收款阶段</h3>
            <button onClick={handleOpenStageModal} className="text-xs font-medium text-gold-600 hover:text-gold-700">编辑阶段</button>
          </div>
          <div className="space-y-2.5">
            {effectivePaymentStages.map((stage, idx) => {
              const stageReceipts = contractReceipts.filter(r => r.stage === stage.name);
              const stagePaid = stageReceipts.reduce((s, r) => s + r.amount, 0);
              const stageDue = stage.amount - stagePaid;
              const isFullyPaid = stage.amount > 0 && stageDue <= 0;
              return (
                <div key={idx} className={`px-3 py-2.5 rounded-lg border ${isFullyPaid ? 'bg-emerald-50/50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 font-medium truncate">{stage.name}</p>
                      <p className="text-xs text-gray-400">应收 {formatMoney(stage.amount)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* 收款状态 */}
                      {isFullyPaid ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-600 font-medium">已收齐</span>
                      ) : stagePaid > 0 ? (
                        <div className="text-right">
                          <span className="text-sm font-semibold text-amber-500">{formatMoney(stagePaid)}</span>
                          <p className="text-xs text-gray-400">尚欠 {formatMoney(stageDue)}</p>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-gray-400">待收款</span>
                      )}
                      {/* 收款按钮 - 未收齐时显示 */}
                      {!isFullyPaid && (
                        <button
                          onClick={() => {
                            setReceiptDefaultStage(stage.name);
                            setShowReceiptModal(true);
                          }}
                          className="px-2.5 py-1.5 text-xs bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                        >
                          收款
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-100 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">合同资料附件</h3>
            <p className="text-xs text-gray-400 mt-1">支持先保存合同，后续再补传合同文件、补充协议、结算单等资料。</p>
          </div>
          <label className="erp-btn-secondary cursor-pointer">
            {contractUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            上传资料
            <input
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                void handleUploadContractAttachments(e.target.files);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>
        <div className="mt-4">
          {contractAttachmentList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-center text-sm text-gray-400">
              暂无合同附件
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {contractAttachmentList.map((file: any, index) => (
                <div
                  key={`${file.fileID}-${index}`}
                  className="relative flex items-center justify-between gap-3 overflow-hidden bg-white px-3 py-3 text-sm text-gray-700"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Paperclip size={14} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-800">{file.name}</div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {file.sizeStr || (file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '大小未知')} · {file.uploadTime ? formatDate(file.uploadTime) : '上传日期未知'}
                      </div>
                    </div>
                  </div>
                  {file.isUploading ? (
                    <div className="absolute inset-0 flex items-end bg-white/70 px-2 py-1 backdrop-blur-[1px]">
                      {file.uploadStatus === 'error' ? (
                        <div className="flex w-full items-center justify-between gap-2 text-[11px] text-red-600">
                          <span>上传失败</span>
                          <span className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); retryUploadTask(file.uploadTaskId); }} className="rounded bg-gray-900 px-1.5 py-0.5 text-white">重试</button>
                            <button onClick={(e) => { e.stopPropagation(); removeUploadTask(file.uploadTaskId); }} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">删除</button>
                          </span>
                        </div>
                      ) : (
                        <div className="w-full">
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${file.uploadProgress || 0}%` }} />
                          </div>
                          <div className="mt-0.5 text-right text-[10px] text-gray-400">{file.uploadStatus === 'queued' ? '等待上传' : `${file.uploadProgress || 0}%`}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-3">
                      {isMobile && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { openAttachment } = await import('@/utils/financeAttachments');
                            void openAttachment(file);
                          }}
                          className="text-xs font-medium text-gray-600 hover:text-gray-800"
                        >
                          查看
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const { downloadAttachment } = await import('@/utils/financeAttachments');
                          void downloadAttachment(file);
                        }}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        下载
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await showConfirm('删除后不可恢复', { title: '确认删除该附件吗？' });
                          if (confirmed) {
                            const targetFileID = file.fileID;
                            const current = normalizeAttachments(contract.attachments);
                            const newAttachments = current.filter((item) => item.fileID !== targetFileID);
                            await saveContractChanges({ ...contract, attachments: newAttachments });
                            if (relatedLead?._id && targetFileID) {
                              const freshLeadData = await leadsAPI.doc(relatedLead._id).get();
                              const freshLead = Array.isArray(freshLeadData) ? freshLeadData[0] : freshLeadData;
                              await leadsAPI.update(relatedLead._id, {
                                files: (freshLead?.files || []).filter((item: any) => item.fileID !== targetFileID),
                                updatedAt: new Date().toISOString(),
                              });
                              setRelatedLead((prev: any) => prev ? {
                                ...prev,
                                files: (prev.files || []).filter((item: any) => item.fileID !== targetFileID),
                              } : prev);
                            }
                          }
                        }}
                        className="text-xs font-medium text-red-500 hover:text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 开票记录 */}
      {showInvoiceFeature && (
      <div>
        <div className="bg-white rounded-lg border border-gray-100 overflow-visible">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">开票记录</h3>
            <button
              onClick={() => openInvoiceModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus size={14} /> 新增记录
            </button>
          </div>
          <MiniSummary items={[
            { label: '累计开票', value: formatMoney(totalInvoiced) },
            { label: '累计付款', value: formatMoney(totalInvoicePaid), cls: 'text-emerald-600' },
            { label: '开票欠款', value: formatMoney(invoiceDebt), cls: invoiceDebt > 0 ? 'text-red-500' : 'text-gray-500' },
          ]} />
          <DataTable
            columns={invoiceColumns}
            data={contractInvoices}
            emptyText="暂无开票记录"
            rowKey={(i) => String(i.id)}
            compactEmpty
          />
        </div>
      </div>
      )}

      <ReceiptFormModal
        open={showReceiptModal}
        onClose={() => { setShowReceiptModal(false); setReceiptDefaultStage(''); setEditingReceipt(null); }}
        defaultContractId={contract.id}
        defaultStage={receiptDefaultStage}
        editingReceipt={editingReceipt}
        defaultContract={{ ...contract, paymentStages: effectivePaymentStages }}
        receiptsOverride={canViewFinance ? undefined : contractReceipts}
        onDirectAdd={canViewFinance ? undefined : async (receipt) => {
          await receiptsAPI.add(receipt);
          setDirectReceipts(prev => [receipt, ...prev]);
        }}
        onDirectUpdate={canViewFinance ? undefined : async (receipt) => {
          await receiptsAPI.put(receipt);
          setDirectReceipts(prev => prev.map(item => item.id === receipt.id ? receipt : item));
        }}
      />
      {canViewFinance && (
        <>
          <ExpenseFormModal
            open={showExpenseModal}
            onClose={() => { setShowExpenseModal(false); setEditingExpense(null); }}
            defaultContractId={contract.id}
            editingExpense={editingExpense}
          />
        </>
      )}

      {/* 支出记录模块 */}
      {canViewFinance && (
      <div>
        <div className="bg-white rounded-lg border border-gray-100 overflow-visible">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">支出记录</h3>
            <button onClick={() => { setEditingExpense(null); setShowExpenseModal(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
              <Plus size={14} /> 新增支出
            </button>
          </div>
          <MiniSummary items={[
            { label: '累计支出', value: formatMoney(totalExpenses), cls: 'text-red-500' },
            { label: '已付支出', value: formatMoney(contractExpenses.filter(e => e.status === '已付').reduce((s, e) => s + e.amount, 0)) },
            { label: '未付支出', value: formatMoney(contractExpenses.filter(e => e.status === '未付').reduce((s, e) => s + e.amount, 0)), cls: 'text-amber-600' },
          ]} />
          <DataTable
            columns={expenseColumns}
            data={contractExpenses}
            emptyText="暂无支出记录"
            rowKey={(e) => String(e.id)}
            mobileCardColumns={expenseMobileColumns}
            compactEmpty
          />
        </div>
      </div>
      )}

      {/* 收款记录模块 */}
      <div>
        <div className="bg-white rounded-lg border border-gray-100 overflow-visible">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">收款记录</h3>
            <button onClick={() => { setEditingReceipt(null); setShowReceiptModal(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
              <Plus size={14} /> 新增收款
            </button>
          </div>
          <MiniSummary items={[
            { label: '应收参考', value: formatMoney(contract.contractAmount || 0) },
            { label: '累计收款', value: formatMoney(totalReceived), cls: 'text-emerald-600' },
            { label: '未收款', value: formatMoney(pendingBalance), cls: pendingBalance > 0 ? 'text-red-500' : 'text-gray-500' },
          ]} />
          <DataTable
            columns={receiptColumns}
            data={contractReceipts}
            emptyText="暂无收款记录"
            rowKey={(r) => String(r.id)}
            mobileCardColumns={receiptMobileColumns}
            compactEmpty
          />
        </div>
      </div>

      {/* 报价管理 */}
      <div>
        <div className="bg-white rounded-lg border border-gray-100 overflow-visible">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">报价记录</h3>
            <button
              onClick={handleOpenQuotationModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white border border-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus size={14} /> 新增报价
            </button>
          </div>
          <DataTable
            columns={quotationColumns}
            data={contractQuotations}
            emptyText="暂无报价记录"
            rowKey={(q) => String(q.id)}
            onRowClick={(q) => handleViewQuotation(q)}
            compactEmpty
          />
          {renderQuotationDiff()}
        </div>
      </div>

      {/* 开票记录 Modal */}
      {showInvoiceFeature && (
      <Modal open={showInvoiceModal} onClose={() => { if (!invoiceSubmitting) { setShowInvoiceModal(false); setEditingInvoice(null); setPendingInvoiceUploads([]); } }} title={editingInvoice ? '编辑开票记录' : '新增开票记录'} size="sm">
        <div className="space-y-4" onKeyDown={focusNextOnEnter}>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">开票单位 *</label>
            <input value={invoiceForm.invoiceUnit} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceUnit: e.target.value })} className="erp-input" placeholder={isHomeContract ? '默认客户，可删除后自定义' : '默认甲方，可删除后自定义'} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">开票日期 *</label>
            <DatePicker mode="single" value={invoiceForm.invoiceDate} onChange={(v) => setInvoiceForm({ ...invoiceForm, invoiceDate: v })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">开票金额 *</label>
            <input type="number" value={invoiceForm.invoiceAmount} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceAmount: e.target.value })} className="erp-input" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">付款日期</label>
            <DatePicker mode="single" value={invoiceForm.paymentDate} onChange={(v) => setInvoiceForm({ ...invoiceForm, paymentDate: v })} placeholder="选择日期" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">付款金额</label>
            <input type="number" value={invoiceForm.paymentAmount} onChange={(e) => setInvoiceForm({ ...invoiceForm, paymentAmount: e.target.value })} className="erp-input" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">欠款金额</label>
            <input readOnly value={formatMoney((Number(invoiceForm.invoiceAmount) || 0) - (Number(invoiceForm.paymentAmount) || 0))} className="erp-input bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">备注</label>
            <textarea value={invoiceForm.remark} onChange={(e) => setInvoiceForm({ ...invoiceForm, remark: e.target.value })} rows={2} className="erp-input resize-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">上传凭证</label>
            <input type="file" multiple onChange={(e) => {
              const files = Array.from(e.target.files || []);
              setPendingInvoiceUploads(prev => [...prev, ...files.map(createUploadProgressItem)]);
              e.currentTarget.value = '';
            }} className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200" />
            <UploadProgressList
              items={pendingInvoiceUploads}
              disabled={invoiceSubmitting}
              onRemove={(uploadId) => setPendingInvoiceUploads(prev => prev.filter(item => item.id !== uploadId))}
            />
            <FormAttachmentList attachments={invoiceForm.attachments as any[]} onRemove={(idx) => setInvoiceForm({ ...invoiceForm, attachments: invoiceForm.attachments.filter((_, i) => i !== idx) })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setShowInvoiceModal(false); setEditingInvoice(null); setPendingInvoiceUploads([]); }} disabled={invoiceSubmitting} className="erp-btn-secondary disabled:opacity-40">??</button>
            <button onClick={handleSaveInvoice} disabled={!invoiceForm.invoiceUnit.trim() || !invoiceForm.invoiceDate || !invoiceForm.invoiceAmount || invoiceSubmitting} className="erp-btn-primary disabled:opacity-40">
              {invoiceSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {invoiceSubmitting ? '上传并保存中...' : '保存'}
            </button>
          </div>
        </div>
      </Modal>
      )}


      {/* 编辑收款阶段 Modal */}
      <Modal open={showStageModal} onClose={() => setShowStageModal(false)} title="编辑收款阶段" size="sm">
        <div className="space-y-4" onKeyDown={focusNextOnEnter}>
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            此处维护合同正式收款计划，可自由添加阶段。临时到账请在新增收款时选择“自定义阶段”；阶段金额可以不等于合同金额。
          </div>
          <div className="space-y-3">
            {stageForm.map((stage, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
                <input value={stage.name} onChange={(e) => updateStageForm(idx, 'name', e.target.value)} placeholder="阶段名称" className="erp-input text-xs" />
                <input type="number" value={stage.amount || ''} onChange={(e) => updateStageForm(idx, 'amount', e.target.value)} placeholder="金额" className="erp-input text-xs" />
                {stageForm.length > 1 && (
                  <button type="button" onClick={() => removeStageForm(idx)} className="text-xs text-red-500 hover:text-red-600">删除</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addStageForm} className="text-xs font-medium text-gold-600 hover:text-gold-700">+ 添加阶段</button>
          {(() => {
            const stageTotal = stageForm.reduce((sum, stage) => sum + (Number(stage.amount) || 0), 0);
            const diff = stageTotal - (contract.contractAmount || 0);
            if (!diff) return null;
            return (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                阶段合计 {formatMoney(stageTotal)}，与合同金额相差 {formatMoney(diff)}，仍可保存。
              </div>
            );
          })()}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowStageModal(false)} className="erp-btn-secondary">取消</button>
            <button onClick={handleStageSave} className="erp-btn-primary">保存</button>
          </div>
        </div>
      </Modal>
      <FinanceImportModal open={showImportModal} onClose={() => setShowImportModal(false)} />

      {/* 编辑合同 Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="编辑合同" size="sm">
        {!editForm ? null : (
          <div onKeyDown={focusNextOnEnter}>
        {isHomeContract ? (
        <div className="grid grid-cols-1 gap-4">
          <div><label className="block text-xs text-gray-500 mb-1">合同金额</label><input type="number" value={editForm.contractAmount} onChange={(e) => setEditForm({ ...editForm, contractAmount: e.target.value })} className="erp-input" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">签订日期</label><DatePicker mode="single" value={editForm.signDate} onChange={(v) => setEditForm({ ...editForm, signDate: v })} placeholder="选择日期" /></div>
        </div>
        ) : (
        <div className="grid grid-cols-1 gap-4">
          <div><label className="block text-xs text-gray-500 mb-1">合同编号</label><input value={editForm.contractNo} onChange={(e) => setEditForm({ ...editForm, contractNo: e.target.value })} className="erp-input" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">{isHomeContract ? '客户 *' : '甲方 *'}</label><input value={editForm.customerName} onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })} className="erp-input" /></div>
          {isHomeContract ? (
            <>
              <div><label className="block text-xs text-gray-500 mb-1">联系电话</label><input value={editForm.partyB || ''} onChange={(e) => setEditForm({ ...editForm, partyB: e.target.value })} className="erp-input" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">销售</label><input value={editForm.sales || ''} onChange={(e) => setEditForm({ ...editForm, sales: e.target.value })} className="erp-input" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">设计</label><input value={editForm.designer || ''} onChange={(e) => setEditForm({ ...editForm, designer: e.target.value })} className="erp-input" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">项目经理</label><input value={editForm.projectManager || ''} onChange={(e) => setEditForm({ ...editForm, projectManager: e.target.value })} className="erp-input" /></div>
            </>
          ) : (
            <>
              <div><label className="block text-xs text-gray-500 mb-1">乙方</label><input value={editForm.partyB || ''} onChange={(e) => setEditForm({ ...editForm, partyB: e.target.value })} className="erp-input" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">丙方</label><input value={editForm.partyC || ''} onChange={(e) => setEditForm({ ...editForm, partyC: e.target.value })} className="erp-input" /></div>
            </>
          )}
          <div><label className="block text-xs text-gray-500 mb-1">合同金额</label><input type="number" value={editForm.contractAmount} onChange={(e) => setEditForm({ ...editForm, contractAmount: e.target.value })} className="erp-input" /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">状态</label>
            <Select value={editForm.status} onChange={(v) => setEditForm({ ...editForm, status: v as Contract['status'] })} options={[
              { value: '进行中', label: '进行中' }, { value: '已完工', label: '已完工' }, { value: '已结算', label: '已结算' },
            ]} />
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">签订日期</label><DatePicker mode="single" value={editForm.signDate} onChange={(v) => setEditForm({ ...editForm, signDate: v })} placeholder="选择日期" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">项目地址</label><input value={editForm.houseAddress} onChange={(e) => setEditForm({ ...editForm, houseAddress: e.target.value })} className="erp-input" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">备注</label><textarea value={editForm.remark} onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })} rows={3} className="erp-input resize-none" /></div>
        </div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={() => setShowEditModal(false)} className="erp-btn-secondary">取消</button>
          <button onClick={handleEditSave} className="erp-btn-primary">保存修改</button>
        </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="text-sm text-gray-700">{value}</div>
    </div>
  );
}

function ContractStatusBadge({ status }: { status: Contract['status'] }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${
        status === '进行中'
          ? 'bg-blue-50 text-blue-600'
          : status === '已完工'
          ? 'bg-emerald-50 text-emerald-600'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      {status}
    </span>
  );
}

function MiniSummary({ items }: { items: Array<{ label: string; value: string; cls?: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-y border-gray-100 bg-gray-50/50 px-5 py-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3 sm:block">
          <div className="shrink-0 text-xs font-medium text-gray-500">{item.label}</div>
          <div className={`min-w-0 text-right text-sm font-semibold sm:mt-1 sm:text-left sm:text-base ${item.cls || 'text-gray-800'}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

import AttachmentViewerModal from '@/components/AttachmentViewerModal';

function AttachmentCell({ attachments, onUploadClick, onUploadFiles, onDelete }: { attachments?: AttachmentValue[]; onUploadClick?: () => void; onUploadFiles?: (files: File[]) => Promise<void>; onDelete?: (idx: number) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const files = normalizeAttachments(attachments);
  const handleFiles = async (fileList: FileList | null) => {
    const selected = Array.from(fileList || []);
    if (selected.length === 0) return;
    if (!onUploadFiles) {
      onUploadClick?.();
      return;
    }
    setUploading(true);
    try {
      await onUploadFiles(selected);
    } catch (err: any) {
      alert('上传凭证失败: ' + (err?.message || '未知错误'));
    } finally {
      setUploading(false);
    }
  };

  if (files.length === 0) {
    return (
      <label
        onClick={(e) => e.stopPropagation()}
        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-gray-300 bg-gray-50 px-2 py-1 text-[11px] text-gray-500 transition-colors hover:border-gold-300 hover:text-gold-600"
      >
        {uploading ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
        {uploading ? '上传中' : '上传凭证'}
        <input type="file" className="hidden" multiple onChange={(e) => { void handleFiles(e.target.files); e.currentTarget.value = ''; }} />
      </label>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(true);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-gold-200 bg-gold-50 px-2 py-1 text-xs text-gold-700 hover:bg-gold-100"
        title={files.map((file) => file.name).join('、\n')}
      >
        <Paperclip size={12} />
        {getAttachmentSummary(files)}
      </button>
      <label
        onClick={(e) => e.stopPropagation()}
        className="inline-flex cursor-pointer items-center rounded-full border border-gray-200 bg-white px-1.5 py-1 text-gray-400 hover:border-gold-300 hover:text-gold-600"
        title="追加凭证"
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        <input type="file" className="hidden" multiple onChange={(e) => { void handleFiles(e.target.files); e.currentTarget.value = ''; }} />
      </label>
      <AttachmentViewerModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        attachments={files} 
        title="凭证附件"
        onDelete={onDelete}
      />
    </div>
  );
}
