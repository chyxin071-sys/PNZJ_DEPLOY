import { useState, useMemo } from 'react';
import { FileText, AlertCircle, CheckCircle, Search } from 'lucide-react';
import DataTable from '@/components/DataTable';
import StatCard from '@/components/StatCard';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { useNavigate } from 'react-router-dom';
import { formatMoney, formatDate } from '@/utils/format';
import { isActiveFinanceRecord } from '@/utils/financeLifecycle';

const STATUS_TABS = ['全部', '已付', '未付'] as const;

const CATEGORY_BADGE: Record<string, string> = {
  '材料费': 'bg-blue-50 text-blue-600',
  '人工费': 'bg-purple-50 text-purple-600',
  '外包费': 'bg-amber-50 text-amber-600',
  '管理费': 'bg-gray-100 text-gray-600',
  '其他': 'bg-slate-100 text-slate-600',
};

export default function Payable() {
  const navigate = useNavigate();
  const { expenses, contracts } = useFinanceStore();
  const { currentBizType } = useBizStore();

  const filteredExpenses = useMemo(() => expenses.filter(e => e.bizType === currentBizType && isActiveFinanceRecord(e)), [expenses, currentBizType]);

  const [statusTab, setStatusTab] = useState<string>('全部');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = statusTab === '全部' ? filteredExpenses : filteredExpenses.filter((e) => e.status === statusTab);
    if (search) {
      const q = search.toLowerCase();
      const matchedContractNos = new Set(
        contracts.filter(c =>
          c.houseAddress.toLowerCase().includes(q) ||
          c.customerName.toLowerCase().includes(q)
        ).map(c => c.contractNo)
      );
      list = list.filter(e =>
        e.supplier.toLowerCase().includes(q) ||
        matchedContractNos.has(e.contractNo)
      );
    }
    return list;
  }, [filteredExpenses, statusTab, search, contracts]);

  const totalAll = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);
  const totalPaid = useMemo(
    () => filtered.filter((e) => e.status === '已付').reduce((s, e) => s + e.amount, 0),
    [filtered],
  );
  const totalUnpaid = totalAll - totalPaid;

  const columns = [
    { key: 'contractNo', title: '合同编号', sortable: true, width: '120px' },
    { key: 'contractId', title: '项目地址', render: (row: Record<string, unknown>) => {
      const ct = contracts.find((c) => c.id === row.contractId as string);
      return <div className="max-w-[160px] md:max-w-[200px] truncate" title={ct?.houseAddress}>{ct?.houseAddress || '-'}</div>;
    }},
    { key: 'supplier', title: '收款方', sortable: true, render: (row: Record<string, unknown>) => <div className="max-w-[120px] truncate" title={row.supplier as string}>{row.supplier as string}</div> },
    {
      key: 'amount', title: '金额', sortable: true, align: 'right' as const,
      render: (row: Record<string, unknown>) => (
        <span className="text-red-500 font-medium">{formatMoney(row.amount as number)}</span>
      ),
    },
    {
      key: 'category', title: '类别',
      render: (row: Record<string, unknown>) => {
        const cat = row.category as string;
        return (
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${CATEGORY_BADGE[cat] || 'bg-gray-100 text-gray-600'}`}>
            {cat}
          </span>
        );
      },
    },
    {
      key: 'expenseDate', title: '日期', sortable: true,
      render: (row: Record<string, unknown>) => formatDate(row.expenseDate as string),
    },
    {
      key: 'status', title: '状态', sortable: true,
      render: (row: Record<string, unknown>) => {
        const s = row.status as string;
        return (
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            s === '已付'
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-amber-50 text-amber-600'
          }`}>
            {s}
          </span>
        );
      },
    },
  ];

  return (
    <div className="erp-page-spaced">
      {/* 页头 */}
      <div>
        <h1 className="text-base md:text-lg font-bold text-gray-900">应付账款</h1>
        <p className="text-gold-500 text-xs md:text-sm">按收款方跟踪应付明细</p>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="应付总额" value={formatMoney(totalAll)} icon={FileText} accent="gold" />
        <StatCard title="已付金额" value={formatMoney(totalPaid)} icon={CheckCircle} accent="emerald" />
        <StatCard
          title="未付金额"
          value={formatMoney(totalUnpaid)}
          icon={AlertCircle}
          accent={totalUnpaid > 0 ? 'red' : 'emerald'}
        />
      </div>

      <div className="erp-surface overflow-visible">
        <div className="erp-search-row">
          <div className="erp-search-field max-w-sm">
          <Search size={14} className="erp-search-icon" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目地址/客户姓名/收款方"
            className="erp-search-input"
          />
          </div>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              清除
            </button>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors relative ${
                statusTab === tab
                  ? 'text-gold-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
              {statusTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 rounded-full" />
              )}
            </button>
          ))}
        </div>
        </div>
        <DataTable
            columns={columns}
            data={filtered as unknown as Record<string, unknown>[]}
            rowKey={(row) => row.id as string}
            onRowClick={(row) => {
              if (row.contractId) {
                navigate(`/projects/${row.contractId}`);
              }
            }}
        />
      </div>
    </div>
  );
}
