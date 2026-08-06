import { useEffect, useState, useMemo } from 'react';
import { Download, TrendingUp, TrendingDown, DollarSign, ExternalLink, Paperclip, Upload } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney, formatDate } from '@/utils/format';
import { exportToExcel } from '@/utils/export';
import { downloadAttachment, normalizeAttachments } from '@/utils/financeAttachments';
import dayjs from 'dayjs';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import Modal from '@/components/Modal';
import FinanceImportModal from '@/components/FinanceImportModal';
import { useIncrementalList } from '@/hooks/useListViewportState';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AttachmentValue } from '@/types';

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
  paymentMethod?: string;
  status?: string;
  remark?: string;
  attachments?: AttachmentValue[];
}

const isActiveFinanceRecord = (record: any) => !['deleted', 'voided', 'reversed'].includes(record.lifecycleStatus);

export default function CashFlow() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { receipts, expenses, contracts } = useFinanceStore();
  const { currentBizType } = useBizStore();
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

  const MONTH_OPTS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` }));

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
      ...filteredReceipts.map((r) => ({
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
        paymentMethod: r.paymentMethod,
        remark: r.remark,
        attachments: r.attachments || [],
        summary: `${r.stage} - ${r.paymentMethod}${r.remark ? ' - ' + r.remark : ''}`,
      })),
      ...filteredExpenses.map((e) => ({
        id: `expense-${e._id || e.id}`,
        sourceId: e._id || e.id,
        date: e.expenseDate,
        type: '支出' as const,
        amount: e.amount,
        contractId: getContractId(e.contractId, e.contractNo),
        contractNo: e.contractNo,
        relatedParty: e.supplier,
        address: getHouseAddress(e.contractNo),
        category: e.category,
        paymentMethod: e.payMethod,
        status: e.status,
        remark: e.remark,
        attachments: e.attachments || [],
        summary: `${e.category}${e.remark ? ' - ' + e.remark : ''}`,
      })),
    ];
    return flows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [filteredReceipts, filteredExpenses, contracts]);

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
    const data = filtered.map((f) => ({
      日期: formatDate(f.date),
      类型: f.type,
      金额: f.amount,
      合同编号: f.contractNo,
      关联方: f.relatedParty,
      说明: f.summary,
    }));
    const dateSuffix = dateFrom || dateTo ? `_${dateFrom || '起'}至${dateTo || '今'}` : '';
    exportToExcel(data, [], `资金流水明细${dateSuffix}`);
  };

  const columns = [
    {
      key: 'date',
      title: '日期',
      sortable: true,
      render: (row: FlowItem) => formatDate(row.date),
    },
    {
      key: 'type',
      title: '类型',
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
      sortable: true,
      render: (row: FlowItem) => (
        <span className="block max-w-[220px] truncate font-medium text-gray-900" title={row.address || '-'}>
          {row.address || '-'}
        </span>
      ),
    },
    {
      key: 'relatedParty',
      title: '姓名',
      sortable: true,
      render: (row: FlowItem) => <span className="text-gray-700">{row.relatedParty || '-'}</span>,
    },
    {
      key: 'summary',
      title: '说明',
      render: (row: FlowItem) => (
        <span className="block max-w-[260px] truncate text-gray-600" title={row.summary || '-'}>
          {row.summary || '-'}
        </span>
      ),
    },
    {
      key: 'recordAction',
      title: '处理',
      width: '108px',
      render: (row: FlowItem) => (
        row.type === '支出' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/expense?focus=${encodeURIComponent(row.sourceId)}`);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            去支出页
          </button>
        ) : <span className="text-xs text-gray-300">-</span>
      ),
    },
    {
      key: 'contractAction',
      title: '合同详情',
      width: '96px',
      render: (row: FlowItem) => (
        row.contractId ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/contracts/${row.contractId}`);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-gold-50 px-2 py-1 text-xs font-medium text-gold-700 hover:bg-gold-100"
          >
            <ExternalLink size={12} />
            查看
          </button>
        ) : <span className="text-xs text-gray-300">-</span>
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
      key: 'summary',
      title: '说明',
      render: (row: FlowItem) => (
        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-400">{row.type === '收款' ? '收款阶段' : '支出类别'}</span>
            <span className="font-medium text-gray-700">{row.type === '收款' ? (row.stage || '-') : (row.category || '-')}</span>
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
        />
        {hasMoreFlows && (
          <div className="flex justify-center border-t border-gray-50 px-4 py-4">
            <button
              type="button"
              onClick={loadMoreFlows}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gold-300 hover:bg-gold-50 hover:text-gold-700 transition-colors"
            >
              加载更多（已显示 {visibleFlowCount} / 共 {filtered.length}）
            </button>
          </div>
        )}
      </div>
      <Modal open={!!selectedFlow} onClose={() => setSelectedFlow(null)} title="流水详情">
        {selectedFlow && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
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
              <DetailItem label={selectedFlow.type === '收款' ? '收款阶段' : '支出类别'} value={selectedFlow.type === '收款' ? (selectedFlow.stage || '-') : (selectedFlow.category || '-')} />
              <DetailItem label={selectedFlow.type === '收款' ? '收款方式' : '支出方式'} value={selectedFlow.paymentMethod || '-'} />
              {selectedFlow.status ? <DetailItem label="状态" value={selectedFlow.status} /> : null}
              <DetailItem label="备注" value={selectedFlow.remark || '-'} wide />
            </div>
            <AttachmentSection attachments={selectedFlow.attachments || []} />
            {selectedFlow.type === '支出' ? (
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                专业处理方式：未付款的测试支出可以删除；已付款支出不建议直接删除，应做冲销，系统会保留原记录和冲销痕迹，且不再计入资金流水汇总。
              </div>
            ) : null}
            {selectedFlow.type === '支出' ? (
              <button
                type="button"
                onClick={() => {
                  const target = selectedFlow.sourceId;
                  setSelectedFlow(null);
                  navigate(`/expense?focus=${encodeURIComponent(target)}`);
                }}
                className="erp-btn-secondary w-full justify-center"
              >
                去支出页处理
              </button>
            ) : null}
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
      <FinanceImportModal open={showImportModal} onClose={() => setShowImportModal(false)} />
    </div>
  );
}

function DetailItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-gray-100 bg-white px-3 py-2.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function AttachmentSection({ attachments }: { attachments: AttachmentValue[] }) {
  const files = normalizeAttachments(attachments);
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
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
            <div key={`${file.fileID || file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
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
