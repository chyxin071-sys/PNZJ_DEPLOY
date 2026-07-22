import { useState, useMemo } from 'react';
import { TrendingUp, CheckCircle, AlertCircle, Search } from 'lucide-react';
import DataTable from '@/components/DataTable';
import StatCard from '@/components/StatCard';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney } from '@/utils/format';
import { useNavigate } from 'react-router-dom';

export default function Receivable() {
  const navigate = useNavigate();
  const { contracts, receipts } = useFinanceStore();
  const { currentBizType } = useBizStore();

  const filteredContracts = useMemo(() => contracts.filter(c => c.bizType === currentBizType), [contracts, currentBizType]);

  const receivableData = useMemo(() => {
    return filteredContracts.map((c) => {
      const contractReceipts = receipts.filter((r) => r.contractId === c.id);
      const receivedAmount = contractReceipts.reduce((s, r) => s + r.amount, 0);
      const balance = c.contractAmount - receivedAmount;
      const progress = c.contractAmount > 0 ? receivedAmount / c.contractAmount : 0;
      return { ...c, receivedAmount, balance, progress };
    });
  }, [filteredContracts, receipts]);

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return receivableData;
    const q = search.toLowerCase();
    return receivableData.filter(d =>
      d.houseAddress.toLowerCase().includes(q) ||
      d.customerName.toLowerCase().includes(q) ||
      d.contractNo.toLowerCase().includes(q)
    );
  }, [receivableData, search]);

  const totalContract = useMemo(
    () => filteredContracts.reduce((s, c) => s + c.contractAmount, 0),
    [filteredContracts],
  );
  const totalReceived = useMemo(
    () => filtered.reduce((s, r) => s + r.receivedAmount, 0),
    [filtered],
  );
  const totalBalance = totalContract - totalReceived;

  const columns = [
    { key: 'contractNo', title: '合同编号', sortable: true, width: '140px' },
    { key: 'houseAddress', title: '项目地址', sortable: true },
    {
      key: 'contractAmount', title: '合同金额', sortable: true, align: 'right' as const,
      render: (row: Record<string, unknown>) => (
        <span className="text-gray-900 font-medium">{formatMoney(row.contractAmount as number)}</span>
      ),
    },
    {
      key: 'receivedAmount', title: '已收款', sortable: true, align: 'right' as const,
      render: (row: Record<string, unknown>) => (
        <span className="text-emerald-600 font-medium">{formatMoney(row.receivedAmount as number)}</span>
      ),
    },
    {
      key: 'balance', title: '应收余额', sortable: true, align: 'right' as const,
      render: (row: Record<string, unknown>) => {
        const v = row.balance as number;
        return (
          <span className={`font-bold ${v > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {formatMoney(v)}
          </span>
        );
      },
    },
    {
      key: 'progress', title: '收款进度', width: '160px',
      render: (row: Record<string, unknown>) => {
        const p = row.progress as number;
        const pct = `${Math.round(p * 100)}%`;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(p * 100, 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-9 text-right">{pct}</span>
          </div>
        );
      },
    },
    {
      key: 'status', title: '状态', sortable: true,
      render: (row: Record<string, unknown>) => {
        const p = row.progress as number;
        const contractAmount = row.contractAmount as number;
        // 合同金额为 0 时，显示为「待设置」或「未设置」
        if (contractAmount === 0) {
          return (
            <span className="text-xs px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-500">
              未设置金额
            </span>
          );
        }
        if (p >= 1) {
          return (
            <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-600">
              已结清
            </span>
          );
        }
        if (p > 0) {
          return (
            <span className="text-xs px-2 py-0.5 rounded font-medium bg-amber-50 text-amber-600">
              部分收款
            </span>
          );
        }
        return (
          <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-50 text-red-500">
            未收款
          </span>
        );
      },
    },
  ];

  return (
    <div className="erp-page-spaced">
      {/* 页头 */}
      <div>
        <h1 className="text-base md:text-lg font-bold text-gray-900">应收账款</h1>
        <p className="text-gold-500 text-xs md:text-sm">按合同跟踪收款进度</p>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="合同总金额" value={formatMoney(totalContract)} icon={TrendingUp} accent="gold" />
        <StatCard title="已收金额" value={formatMoney(totalReceived)} icon={CheckCircle} accent="emerald" />
        <StatCard
          title="应收余额"
          value={formatMoney(totalBalance)}
          icon={AlertCircle}
          accent={totalBalance > 0 ? 'red' : 'emerald'}
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
            placeholder="搜索项目地址/客户姓名/合同编号"
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
        </div>
        <DataTable
            columns={columns}
            data={filtered as unknown as Record<string, unknown>[]}
            rowKey={(row) => row.id as string}
            onRowClick={(row) => {
              navigate(`/contracts/${row.id}`);
            }}
        />
      </div>
    </div>
  );
}
