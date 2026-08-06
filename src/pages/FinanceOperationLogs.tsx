import { useEffect, useMemo, useState } from 'react';
import { Activity, FileText, RotateCcw, ShieldCheck, Search, Eye } from 'lucide-react';
import DataTable from '@/components/DataTable';
import DatePicker from '@/components/DatePicker';
import Modal from '@/components/Modal';
import Select from '@/components/Select';
import StatCard from '@/components/StatCard';
import { financeOperationLogsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';
import { useBizStore } from '@/store/bizStore';
import { formatDate, formatMoney } from '@/utils/format';

type FinanceOperationLog = {
  _id?: string;
  id?: string;
  module?: 'receipt' | 'expense' | 'reimbursement';
  moduleLabel?: string;
  action?: 'create' | 'edit' | 'delete' | 'void' | 'reverse';
  actionLabel?: string;
  recordId?: string;
  recordName?: string;
  bizType?: string;
  amount?: number;
  reason?: string;
  operatorId?: string;
  operatorName?: string;
  createdAt?: string;
  before?: unknown;
  after?: unknown;
};

const MODULE_OPTIONS = [
  { value: '全部', label: '全部模块' },
  { value: 'receipt', label: '收款记录' },
  { value: 'expense', label: '支出记录' },
  { value: 'reimbursement', label: '报销记录' },
];

const ACTION_OPTIONS = [
  { value: '全部', label: '全部动作' },
  { value: 'delete', label: '删除' },
  { value: 'void', label: '作废' },
  { value: 'reverse', label: '冲销' },
  { value: 'edit', label: '编辑' },
  { value: 'create', label: '新增' },
];

const ACTION_BADGE: Record<string, string> = {
  delete: 'bg-red-50 text-red-500',
  void: 'bg-gray-100 text-gray-600',
  reverse: 'bg-amber-50 text-amber-600',
  edit: 'bg-blue-50 text-blue-600',
  create: 'bg-emerald-50 text-emerald-600',
};

const MODULE_LABEL: Record<string, string> = {
  receipt: '收款记录',
  expense: '支出记录',
  reimbursement: '报销记录',
};

const ACTION_LABEL: Record<string, string> = {
  create: '新增',
  edit: '编辑',
  delete: '删除',
  void: '作废',
  reverse: '冲销',
};

function getLogId(log: FinanceOperationLog) {
  return String(log._id || log.id || `${log.module}-${log.action}-${log.recordId}-${log.createdAt}`);
}

function safeJson(value: unknown) {
  if (!value) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function FinanceOperationLogs() {
  const { user } = useAuthStore();
  const { currentBizType } = useBizStore();
  const isAdmin = user?.role === 'admin';
  const [logs, setLogs] = useState<FinanceOperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('全部');
  const [actionFilter, setActionFilter] = useState('全部');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedLog, setSelectedLog] = useState<FinanceOperationLog | null>(null);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    financeOperationLogsAPI.toArray()
      .then((data) => {
        if (!disposed) setLogs(data as FinanceOperationLog[]);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => { disposed = true; };
  }, []);

  const scopedLogs = useMemo(() => {
    const bizLogs = logs.filter((log) => log.bizType === currentBizType);
    if (isAdmin) return bizLogs;
    const userId = String(user?.id || '');
    const userName = String(user?.name || '');
    return bizLogs.filter((log) => String(log.operatorId || '') === userId || String(log.operatorName || '') === userName);
  }, [currentBizType, isAdmin, logs, user?.id, user?.name]);

  const filtered = useMemo(() => {
    let list = [...scopedLogs];
    if (moduleFilter !== '全部') list = list.filter((log) => log.module === moduleFilter);
    if (actionFilter !== '全部') list = list.filter((log) => log.action === actionFilter);
    if (dateFrom) list = list.filter((log) => String(log.createdAt || '').slice(0, 10) >= dateFrom);
    if (dateTo) list = list.filter((log) => String(log.createdAt || '').slice(0, 10) <= dateTo);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((log) => [
        log.operatorName,
        log.recordName,
        log.reason,
        log.moduleLabel,
        log.actionLabel,
        log.recordId,
      ].some((value) => String(value || '').toLowerCase().includes(q)));
    }
    if (sortField) {
      list.sort((a, b) => {
        const va = String(a[sortField as keyof FinanceOperationLog] ?? '');
        const vb = String(b[sortField as keyof FinanceOperationLog] ?? '');
        const cmp = va.localeCompare(vb, 'zh-CN');
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    } else {
      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }
    return list;
  }, [actionFilter, dateFrom, dateTo, moduleFilter, scopedLogs, search, sortField, sortOrder]);

  const reverseCount = filtered.filter((log) => log.action === 'reverse').length;
  const voidCount = filtered.filter((log) => log.action === 'void').length;
  const deleteCount = filtered.filter((log) => log.action === 'delete').length;

  const handleSort = (field: string) => {
    if (sortField === field) setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setModuleFilter('全部');
    setActionFilter('全部');
    setDateFrom('');
    setDateTo('');
    setSortField('');
  };

  const columns = [
    {
      key: 'createdAt',
      title: '时间',
      sortable: true,
      render: (log: FinanceOperationLog) => log.createdAt ? formatDate(log.createdAt) : '-',
    },
    {
      key: 'operatorName',
      title: '操作人',
      sortable: true,
      render: (log: FinanceOperationLog) => log.operatorName || '-',
    },
    {
      key: 'module',
      title: '模块',
      sortable: true,
      render: (log: FinanceOperationLog) => log.moduleLabel || MODULE_LABEL[String(log.module || '')] || '-',
    },
    {
      key: 'action',
      title: '动作',
      sortable: true,
      render: (log: FinanceOperationLog) => (
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[String(log.action || '')] || 'bg-gray-100 text-gray-500'}`}>
          {log.actionLabel || ACTION_LABEL[String(log.action || '')] || '-'}
        </span>
      ),
    },
    {
      key: 'amount',
      title: '金额',
      sortable: true,
      align: 'right' as const,
      render: (log: FinanceOperationLog) => typeof log.amount === 'number' ? formatMoney(log.amount) : '-',
    },
    {
      key: 'recordName',
      title: '对象',
      render: (log: FinanceOperationLog) => (
        <span className="block max-w-[220px] truncate" title={log.recordName || log.recordId || '-'}>
          {log.recordName || log.recordId || '-'}
        </span>
      ),
    },
    {
      key: 'reason',
      title: '原因',
      render: (log: FinanceOperationLog) => (
        <span className="block max-w-[260px] truncate text-gray-500" title={log.reason || '-'}>
          {log.reason || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '详情',
      width: '72px',
      render: (log: FinanceOperationLog) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedLog(log);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gold-50 hover:text-gold-700"
        >
          <Eye size={12} />
          查看
        </button>
      ),
    },
  ];

  const mobileColumns = [
    {
      key: 'summary',
      title: '日志',
      render: (log: FinanceOperationLog) => (
        <div>
          <div className="text-[11px] text-gray-400">{log.createdAt ? formatDate(log.createdAt) : '-'}</div>
          <div className="mt-1 text-[15px] font-semibold text-gray-900">{log.recordName || log.recordId || '-'}</div>
          <div className="mt-1 text-xs text-gray-500">{log.operatorName || '-'} · {log.moduleLabel || MODULE_LABEL[String(log.module || '')] || '-'}</div>
        </div>
      ),
    },
    {
      key: 'action',
      title: '动作',
      render: (log: FinanceOperationLog) => (
        <div className="text-right">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[String(log.action || '')] || 'bg-gray-100 text-gray-500'}`}>
            {log.actionLabel || ACTION_LABEL[String(log.action || '')] || '-'}
          </span>
          <div className="mt-1 text-sm font-bold text-gray-900">{typeof log.amount === 'number' ? formatMoney(log.amount) : '-'}</div>
        </div>
      ),
    },
  ];

  return (
    <div className="erp-page-spaced erp-finance-log-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base md:text-lg font-bold text-gray-900">财务操作日志</h1>
          <p className="text-gold-500 text-xs md:text-sm">{currentBizType} · {isAdmin ? '查看所有财务处理记录' : '查看本人财务处理记录'}</p>
        </div>
      </div>

      <div className="erp-finance-stats">
        <button type="button" onClick={clearFilters} className="erp-finance-stat-button">
          <StatCard title="日志总数" value={`${filtered.length} 条`} icon={Activity} accent="gold" sub="当前筛选范围" />
        </button>
        <button type="button" onClick={() => setActionFilter('reverse')} className={`erp-finance-stat-button ${actionFilter === 'reverse' ? 'is-active' : ''}`}>
          <StatCard title="冲销记录" value={`${reverseCount} 条`} icon={RotateCcw} accent="red" sub="点击筛选冲销" />
        </button>
        <button type="button" onClick={() => setActionFilter('void')} className={`erp-finance-stat-button ${actionFilter === 'void' ? 'is-active' : ''}`}>
          <StatCard title="作废记录" value={`${voidCount} 条`} icon={ShieldCheck} accent="emerald" sub="点击筛选作废" />
        </button>
        <button type="button" onClick={() => setActionFilter('delete')} className={`erp-finance-stat-button ${actionFilter === 'delete' ? 'is-active' : ''}`}>
          <StatCard title="删除记录" value={`${deleteCount} 条`} icon={FileText} accent="red" sub="点击筛选删除" />
        </button>
      </div>

      <div className="erp-surface overflow-visible">
        <div className="erp-finance-log-filter-row">
          <DatePicker mode="single" value={dateFrom} onChange={setDateFrom} placeholder="开始日期" />
          <span className="shrink-0 text-xs text-gray-400">至</span>
          <DatePicker mode="single" value={dateTo} onChange={setDateTo} placeholder="结束日期" />
          <Select value={moduleFilter} onChange={setModuleFilter} options={MODULE_OPTIONS} className="w-auto shrink-0" />
          <Select value={actionFilter} onChange={setActionFilter} options={ACTION_OPTIONS} className="w-auto shrink-0" />
          <div className="erp-finance-log-search relative min-w-[180px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索操作人 / 对象 / 原因"
              className="erp-search-input pl-9"
            />
          </div>
          {(dateFrom || dateTo || search || moduleFilter !== '全部' || actionFilter !== '全部') && (
            <button onClick={clearFilters} className="shrink-0 text-xs font-medium text-gold-500 hover:text-gold-600">清除</button>
          )}
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          rowKey={getLogId}
          onRowClick={setSelectedLog}
          emptyText={loading ? '正在加载日志...' : '暂无财务操作日志'}
          mobileCardColumns={mobileColumns}
        />
      </div>

      <Modal open={!!selectedLog} onClose={() => setSelectedLog(null)} title="操作日志详情" size="lg">
        {selectedLog && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs text-gray-400">{selectedLog.createdAt ? formatDate(selectedLog.createdAt) : '-'}</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">{selectedLog.recordName || selectedLog.recordId || '-'}</div>
                </div>
                <span className={`w-fit rounded px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[String(selectedLog.action || '')] || 'bg-gray-100 text-gray-500'}`}>
                  {selectedLog.actionLabel || ACTION_LABEL[String(selectedLog.action || '')] || '-'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <DetailItem label="操作人" value={selectedLog.operatorName || '-'} />
              <DetailItem label="模块" value={selectedLog.moduleLabel || MODULE_LABEL[String(selectedLog.module || '')] || '-'} />
              <DetailItem label="金额" value={typeof selectedLog.amount === 'number' ? formatMoney(selectedLog.amount) : '-'} />
              <DetailItem label="记录ID" value={selectedLog.recordId || '-'} />
              <DetailItem label="原因" value={selectedLog.reason || '-'} wide />
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <JsonBlock title="处理前" value={selectedLog.before} />
              <JsonBlock title="处理后" value={selectedLog.after} />
            </div>
          </div>
        )}
      </Modal>
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

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white">
      <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">{title}</div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-xs leading-5 text-gray-600">
        {safeJson(value)}
      </pre>
    </div>
  );
}
