import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { useAuthStore } from '@/store/authStore';
import { contractsAPI, receiptsAPI } from '@/db/api';
import { formatMoney, formatDate, generateId, normalizeAddress } from '@/utils/format';
import type { Contract, PaymentStage } from '@/types';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import DatePicker from '@/components/DatePicker';
import ContractDrawer from '@/components/ContractDrawer';

const PAGE_SIZE = 20;

const today = () => new Date().toISOString().slice(0, 10);

const commercialStages = (): PaymentStage[] => [
  { name: '回款', amount: 0, ratio: 0 },
  { name: '质保金', amount: 0, ratio: 0 },
];

const emptyForm = () => ({
  contractNo: '',
  partyA: '',
  partyB: '',
  partyC: '',
  contractAmount: '',
  signDate: today(),
  houseAddress: '',
  remark: '',
  status: '进行中' as Contract['status'],
});

function focusNextOnEnter(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Enter' || event.shiftKey) return;
  const target = event.target as HTMLElement;
  if (target.tagName === 'TEXTAREA') return;
  event.preventDefault();
  const fields = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('input, textarea, button[data-submit="true"]'),
  ).filter((el) => !el.hasAttribute('disabled') && !(el as HTMLInputElement).readOnly);
  const index = fields.indexOf(target);
  fields[index + 1]?.focus();
}

export default function Contracts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { currentBizType } = useBizStore();
  const {
    addContract,
    updateContract,
  } = useFinanceStore();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [page, setPage] = useState(1);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [homeDrawerOpen, setHomeDrawerOpen] = useState(false);

  const isCommercial = currentBizType === '工装';
  const canSeeAllFinancial = user?.role === 'admin' || user?.role === 'finance';
  const myName = user?.name || '';

  useEffect(() => {
    const action = searchParams.get('action');
    if (action !== 'new') return;
    if (currentBizType === '家装') {
      setHomeDrawerOpen(true);
      setSearchParams(new URLSearchParams());
      return;
    }
    setEditingId(null);
    setForm({
      ...emptyForm(),
      partyA: searchParams.get('name') || '',
      houseAddress: searchParams.get('address') || '',
    });
    setModalOpen(true);
    setSearchParams(new URLSearchParams());
  }, [currentBizType, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setPageLoading(true);
    (async () => {
      const q = search.trim().toLowerCase();
      const searchMatches = q
        ? (await contractsAPI.recentByBizType(currentBizType, 200)).filter((contract) => {
            if (!canSeeAllFinancial && contract.createdBy && contract.createdBy !== myName) return false;
            return [
              contract.contractNo,
              contract.customerName,
              contract.partyB,
              contract.partyC,
              contract.houseAddress,
              contract.remark,
            ].some((value) => String(value || '').toLowerCase().includes(q));
          })
        : [];
      const loadedContracts = q
        ? searchMatches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        : await contractsAPI.pageByBizType(currentBizType, page, PAGE_SIZE);
      const count = q ? searchMatches.length : await contractsAPI.countByBizType(currentBizType);
      const keys = loadedContracts.flatMap((contract) => [contract.id, contract._id]).filter(Boolean) as string[];
      const pageReceipts = await receiptsAPI.whereContractIds(keys);
      if (!cancelled) {
        setContracts(loadedContracts);
        setReceipts(pageReceipts);
        setTotalCount(count);
        setPageLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setContracts([]);
        setReceipts([]);
        setTotalCount(0);
        setPageLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [canSeeAllFinancial, currentBizType, myName, page, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = contracts.filter((contract) => {
      if (contract.bizType !== currentBizType) return false;
      if (!canSeeAllFinancial && contract.createdBy && contract.createdBy !== myName) return false;
      if (!q) return true;
      return [
        contract.contractNo,
        contract.customerName,
        contract.partyB,
        contract.partyC,
        contract.houseAddress,
        contract.remark,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  }, [canSeeAllFinancial, contracts, currentBizType, myName, search]);

  useEffect(() => {
    setPage(1);
  }, [currentBizType, search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageData = filtered;

  const stats = useMemo(() => {
    const totalAmount = filtered.reduce((sum, c) => sum + (c.contractAmount || 0), 0);
    const totalReceived = filtered.reduce((sum, c) => {
      const keys = [c.id, c._id].filter(Boolean);
      return sum + receipts.filter((r) => keys.includes(r.contractId)).reduce((s, r) => s + r.amount, 0);
    }, 0);
    return {
      count: totalCount,
      totalAmount,
      totalReceived,
      totalUnreceived: totalAmount - totalReceived,
    };
  }, [filtered, receipts, totalCount]);

  const openAdd = () => {
    if (currentBizType === '家装') {
      setHomeDrawerOpen(true);
      return;
    }
    setEditingId(null);
    setSaving(false);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (contract: Contract) => {
    setEditingId(contract.id);
    setSaving(false);
    setForm({
      contractNo: contract.contractNo || '',
      partyA: contract.customerName || '',
      partyB: contract.partyB || contract.customerPhone || '',
      partyC: contract.partyC || '',
      contractAmount: contract.contractAmount ? String(contract.contractAmount) : '',
      signDate: contract.signDate || today(),
      houseAddress: contract.houseAddress || '',
      remark: contract.remark || '',
      status: contract.status || '进行中',
    });
    setModalOpen(true);
  };

  const update = (key: keyof ReturnType<typeof emptyForm>, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.partyA.trim() || saving) return;
    setSaving(true);
    try {
      const amount = Math.round(Number(form.contractAmount) || 0);
      if (editingId) {
        const existing = contracts.find((c) => c.id === editingId || c._id === editingId);
        if (!existing) return;
        await updateContract({
          ...existing,
          contractNo: form.contractNo.trim(),
          customerName: form.partyA.trim(),
          customerPhone: form.partyB.trim(),
          partyB: form.partyB.trim(),
          partyC: form.partyC.trim(),
          contractAmount: amount,
          houseAddress: normalizeAddress(form.houseAddress),
          signDate: form.signDate || today(),
          remark: form.remark,
          status: form.status,
        });
        setContracts(prev => prev.map(item => item.id === editingId || item._id === editingId ? {
          ...item,
          contractNo: form.contractNo.trim(),
          customerName: form.partyA.trim(),
          customerPhone: form.partyB.trim(),
          partyB: form.partyB.trim(),
          partyC: form.partyC.trim(),
          contractAmount: amount,
          houseAddress: normalizeAddress(form.houseAddress),
          signDate: form.signDate || today(),
          remark: form.remark,
          status: form.status,
        } : item));
      } else {
        const newId = generateId();
        await addContract({
          id: newId,
          contractNo: form.contractNo.trim(),
          customerId: '',
          bizType: currentBizType,
          customerName: form.partyA.trim(),
          customerPhone: form.partyB.trim(),
          partyB: form.partyB.trim(),
          partyC: form.partyC.trim(),
          houseAddress: normalizeAddress(form.houseAddress),
          contractAmount: amount,
          paymentStages: commercialStages(),
          status: '进行中',
          signDate: form.signDate || today(),
          expectedEndDate: '',
          projectManager: '',
          remark: form.remark,
          createdAt: new Date().toISOString(),
          createdBy: myName,
        });
        navigate(`/contracts/${newId}`);
        return;
      }
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    } finally {
      setSaving(false);
    }
  };

  const getProgress = (contract: Contract) => {
    const keys = [contract.id, contract._id].filter(Boolean);
    const received = receipts.filter((r) => keys.includes(r.contractId)).reduce((s, r) => s + r.amount, 0);
    const total = contract.contractAmount || 0;
    return { received, unreceived: total - received };
  };

  const columns = [
    { key: 'customerName', title: isCommercial ? '甲方' : '客户', width: '180px', truncate: true },
    { key: 'partyB', title: isCommercial ? '乙方' : '联系电话', width: '160px', truncate: true, render: (row: Contract) => isCommercial ? (row.partyB || row.customerPhone || '-') : (row.customerPhone || '-') },
    ...(isCommercial ? [{ key: 'partyC', title: '丙方', width: '140px', truncate: true, render: (row: Contract) => row.partyC || '-' }] : []),
    {
      key: 'contractAmount',
      title: '合同金额',
      render: (row: Contract) => <span className="font-medium text-gray-900">{row.contractAmount ? formatMoney(row.contractAmount) : '-'}</span>,
    },
    {
      key: 'received',
      title: '已收款',
      render: (row: Contract) => <span className="font-medium text-emerald-600">{formatMoney(getProgress(row).received)}</span>,
    },
    {
      key: 'unreceived',
      title: '未收款',
      render: (row: Contract) => {
        const value = getProgress(row).unreceived;
        return <span className={value > 0 ? 'font-medium text-red-500' : 'text-gray-400'}>{formatMoney(value)}</span>;
      },
    },
    {
      key: 'status',
      title: '状态',
      render: (row: Contract) => (
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
          row.status === '进行中' ? 'bg-blue-50 text-blue-600' :
          row.status === '已结算' ? 'bg-emerald-50 text-emerald-600' :
          'bg-gray-100 text-gray-500'
        }`}>
          {row.status}
        </span>
      ),
    },
    { key: 'signDate', title: '签订日期', render: (row: Contract) => row.signDate ? formatDate(row.signDate) : '-' },
  ];

  const homeMobileColumns = [
    {
      key: 'houseAddress',
      title: '项目地址',
      render: (row: Contract) => (
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-gray-400">项目地址</div>
          <div className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-5 text-gray-900">
            {row.houseAddress || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'customerName',
      title: '客户',
      render: (row: Contract) => (
        <div className="shrink-0 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
          {row.customerName || '-'}
        </div>
      ),
    },
    {
      key: 'contractAmountMobile',
      title: '合同金额',
      render: (row: Contract) => (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-gray-400">合同金额</span>
          <span className="text-[15px] font-bold text-gray-900">{formatMoney(row.contractAmount || 0)}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="erp-page-spaced">
      <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-900 md:text-lg">合同管理</h1>
              <p className="text-xs text-gold-500 md:text-sm">{isCommercial ? '工装合同与财务记录' : '家装合同与回款管理'}</p>
            </div>
            <button onClick={openAdd} className="erp-btn-primary">
              <Plus size={16} /> 新建合同
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
            {[
              { label: '合同总数', value: `${stats.count} 份` },
              { label: '当前页合同金额', value: formatMoney(stats.totalAmount) },
              { label: '当前页已收款', value: formatMoney(stats.totalReceived), cls: 'text-emerald-600' },
              { label: '当前页未收款', value: formatMoney(stats.totalUnreceived), cls: stats.totalUnreceived > 0 ? 'text-red-500' : 'text-gray-400' },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-100 bg-white p-3">
                <div className="mb-0.5 text-[10px] text-gray-400">{card.label}</div>
                <div className={`text-sm font-bold ${card.cls || 'text-gray-900'}`}>{card.value}</div>
              </div>
            ))}
          </div>

          <div className="erp-surface overflow-visible">
            <div className="erp-search-row">
              <div className="erp-search-field">
                <Search size={14} className="erp-search-icon" />
                <input
                  placeholder={isCommercial ? '搜索合同编号 / 甲方 / 乙方 / 丙方 / 项目地址' : '搜索合同编号 / 客户 / 电话 / 项目地址'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="erp-search-input"
                />
              </div>
            </div>
            <DataTable
              columns={columns}
              data={pageData}
              emptyText={pageLoading ? '正在加载合同...' : '暂无合同数据'}
              rowKey={(row) => String(row.id)}
              onRowClick={(row) => navigate(`/contracts/${(row as Contract).id}`)}
              mobileCardColumns={isCommercial ? 4 : homeMobileColumns}
            />
            {totalCount > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
                <span>第 {page} / {totalPages} 页，共 {totalCount} 条</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="erp-btn-secondary !h-8 disabled:opacity-40">上一页</button>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="erp-btn-secondary !h-8 disabled:opacity-40">下一页</button>
                </div>
              </div>
            )}
          </div>

          <Modal open={modalOpen} onClose={() => { if (!saving) setModalOpen(false); }} title={editingId ? '编辑合同' : '新增合同'} size="sm">
            <div className="space-y-4" onKeyDown={focusNextOnEnter}>
              <FormField label="合同编号">
                <input value={form.contractNo} onChange={(e) => update('contractNo', e.target.value)} className="erp-input" autoFocus />
              </FormField>
              <FormField label="甲方 *">
                <input value={form.partyA} onChange={(e) => update('partyA', e.target.value)} className="erp-input" />
              </FormField>
              <FormField label="乙方">
                <input value={form.partyB} onChange={(e) => update('partyB', e.target.value)} className="erp-input" />
              </FormField>
              <FormField label="丙方">
                <input value={form.partyC} onChange={(e) => update('partyC', e.target.value)} className="erp-input" />
              </FormField>
              <FormField label="合同金额">
                <input type="number" value={form.contractAmount} onChange={(e) => update('contractAmount', e.target.value)} className="erp-input" />
              </FormField>
              <FormField label="签订日期">
                <DatePicker mode="single" value={form.signDate} onChange={(v) => update('signDate', v)} placeholder="选择日期" />
              </FormField>
              <FormField label="项目地址">
                <input value={form.houseAddress} onChange={(e) => update('houseAddress', e.target.value)} className="erp-input" />
              </FormField>
              <FormField label="备注">
                <textarea value={form.remark} onChange={(e) => update('remark', e.target.value)} rows={3} className="erp-input resize-none" />
              </FormField>
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                工装收款阶段默认包含回款、质保金；阶段名称和金额可在合同详情中继续编辑。
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setModalOpen(false)} className="erp-btn-secondary" disabled={saving}>取消</button>
                <button data-submit="true" onClick={handleSave} disabled={!form.partyA.trim() || saving} className="erp-btn-primary disabled:opacity-40">
                  {saving ? '保存中...' : editingId ? '保存修改' : '确认新增'}
                </button>
              </div>
            </div>
          </Modal>
          <ContractDrawer
            open={homeDrawerOpen}
            onClose={() => setHomeDrawerOpen(false)}
            onSaved={(contractId) => {
              setHomeDrawerOpen(false);
              navigate(`/contracts/${contractId}`);
            }}
          />
      </>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}
