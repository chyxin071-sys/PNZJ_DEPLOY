import { useState, useMemo } from 'react';
import { Search, ArrowRight, Wallet, TrendingUp, TrendingDown, PieChart, ReceiptText } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney, formatPercent } from '@/utils/format';
import DataTable from '@/components/DataTable';
import { useNavigate } from 'react-router-dom';

const ROLE_COLORS: Record<string, string> = {
  sales: 'bg-blue-50 text-blue-600',
  designer: 'bg-violet-50 text-violet-600',
  manager: 'bg-amber-50 text-amber-600',
};

function splitPeople(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean);
  return String(value).split(/[,，、\s]+/).filter(Boolean);
}

function RoleTags({ names, role }: { names: string[]; role: string }) {
  const color = ROLE_COLORS[role] || 'bg-gray-100 text-gray-600';
  return names.length > 0 ? (
    <div className="flex items-center gap-1 whitespace-nowrap">
      {names.map((n: string) => (
        <span key={n} className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded ${color}`}>{n}</span>
      ))}
    </div>
  ) : <span className="text-[11px] text-gray-300">-</span>;
}

export default function ProjectCost() {
  const navigate = useNavigate();
  const { contracts, receipts, expenses } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const getProjectProfits = useFinanceStore((s) => s.getProjectProfits);
  const [search, setSearch] = useState('');

  const contractMap = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  const enriched = useMemo(() => {
    const filteredContracts = contracts.filter(c => c.bizType === currentBizType);
    const filteredIds = new Set(filteredContracts.map(c => c.id));
    return getProjectProfits()
      .filter(p => filteredIds.has(p.id))
      .map((p) => {
        const contract = contractMap.get(p.id);
        return {
          ...p,
          sales: contract?.sales || '',
          designer: contract?.designer || '',
          projectManager: contract?.projectManager || '',
          unreceived: p.contractAmount - p.receivedAmount,
          cashFlow: p.receivedAmount - p.totalCost,
        };
      })
      .sort((a, b) => String(b.contractNo || '').localeCompare(String(a.contractNo || '')));
  }, [getProjectProfits, contracts, contractMap, currentBizType]);

  const filtered = useMemo(() => {
    if (!search) return enriched;
    const q = search.toLowerCase();
    return enriched.filter(
      (p) =>
        String(p.contractNo || '').toLowerCase().includes(q) ||
        String(p.houseAddress || '').toLowerCase().includes(q) ||
        String(p.customerName || '').toLowerCase().includes(q),
    );
  }, [enriched, search]);

  const summary = useMemo(() => {
    const contractAmount = filtered.reduce((sum, p) => sum + (p.contractAmount || 0), 0);
    const receivedAmount = filtered.reduce((sum, p) => sum + (p.receivedAmount || 0), 0);
    const totalCost = filtered.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    const grossProfit = filtered.reduce((sum, p) => sum + (p.grossProfit || 0), 0);
    return { contractAmount, receivedAmount, totalCost, grossProfit };
  }, [filtered]);

  const categoryStats = useMemo(() => {
    const contractIds = new Set(enriched.map((p) => p.id));
    const map = new Map<string, number>();
    expenses
      .filter((e) => e.bizType === currentBizType && contractIds.has(e.contractId))
      .forEach((e) => {
        const key = e.category || '未分类';
        map.set(key, (map.get(key) || 0) + (e.amount || 0));
      });
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [expenses, enriched, currentBizType]);

  const recentRecords = useMemo(() => {
    const visibleIds = new Set(filtered.map((p) => p.id));
    return expenses
      .filter((e) => e.bizType === currentBizType && visibleIds.has(e.contractId))
      .map((e) => {
        const contract = contractMap.get(e.contractId);
        return {
          ...e,
          address: contract?.houseAddress || '-',
          customerName: contract?.customerName || '-',
        };
      })
      .sort((a, b) => String(b.expenseDate || b.createdAt || '').localeCompare(String(a.expenseDate || a.createdAt || '')))
      .slice(0, 8);
  }, [expenses, filtered, contractMap, currentBizType]);

  const maxCategoryAmount = Math.max(...categoryStats.map((item) => item.amount), 1);

  const columns = [
    {
      key: 'houseAddress',
      title: '项目地址',
      render: (row: any) => (
        <div className="font-medium text-gray-900 truncate max-w-[220px]" title={row.houseAddress}>
          {row.houseAddress || '-'}
        </div>
      ),
    },
    { key: 'customerName', title: '客户' },
    { key: 'contractAmount', title: '合同金额', render: (row: any) => <span className="font-medium">{formatMoney(row.contractAmount)}</span> },
    { key: 'receivedAmount', title: '已收款', render: (row: any) => <span className="text-emerald-600 font-medium">{formatMoney(row.receivedAmount)}</span> },
    { key: 'unreceived', title: '未收款', render: (row: any) => <span className={row.unreceived > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>{formatMoney(row.unreceived)}</span> },
    { key: 'totalCost', title: '总成本', render: (row: any) => <span className="text-red-500 font-medium">{formatMoney(row.totalCost)}</span> },
    { key: 'grossProfit', title: '毛利润', render: (row: any) => <span className={row.grossProfit >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{formatMoney(row.grossProfit)}</span> },
    { key: 'grossMargin', title: '毛利率', render: (row: any) => <span className={row.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}>{formatPercent(row.grossMargin)}</span> },
    { key: 'cashFlow', title: '收支差', render: (row: any) => <span className={row.cashFlow >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{formatMoney(row.cashFlow)}</span> },
    { key: 'sales', title: '销售', render: (row: any) => <RoleTags names={splitPeople(row.sales)} role="sales" /> },
    { key: 'designer', title: '设计', render: (row: any) => <RoleTags names={splitPeople(row.designer)} role="designer" /> },
    { key: 'projectManager', title: '项目经理', render: (row: any) => <RoleTags names={splitPeople(row.projectManager)} role="manager" /> },
    {
      key: 'actions',
      title: '操作',
      render: (row: any) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/contracts/${row.id}`);
          }}
          className="text-xs text-gold-600 hover:text-gold-700 bg-gold-50 px-2 py-1 rounded transition-colors"
        >
          合同详情
        </button>
      ),
    },
  ];

  return (
    <div className="erp-page-spaced">
      <div>
        <h1 className="text-base md:text-lg font-bold text-gray-900">项目成本核算</h1>
        <p className="text-gold-500 text-xs md:text-sm">各项目收入、成本与利润分析</p>
      </div>

      <div className="erp-surface overflow-visible">
        <div className="erp-search-row">
          <div className="erp-search-field max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="搜索项目地址/合同编号/客户..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="erp-search-input pl-8"
            />
          </div>
        </div>

        <div className="hidden md:block">
          <DataTable
            columns={columns}
            data={filtered}
            emptyText="暂无项目数据"
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => navigate(`/contracts/${(row as any).id}`)}
          />
        </div>

        <div className="md:hidden space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="合同金额" value={formatMoney(summary.contractAmount)} icon={Wallet} />
            <MetricCard label="总成本" value={formatMoney(summary.totalCost)} icon={TrendingDown} tone="red" />
            <MetricCard label="已收款" value={formatMoney(summary.receivedAmount)} icon={TrendingUp} tone="emerald" />
            <MetricCard label="毛利润" value={formatMoney(summary.grossProfit)} icon={PieChart} tone={summary.grossProfit >= 0 ? 'emerald' : 'red'} />
          </div>

          <section className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">成本分类</h2>
              <span className="text-[11px] text-gray-400">{categoryStats.length} 类</span>
            </div>
            {categoryStats.length === 0 ? (
              <p className="py-5 text-center text-xs text-gray-400">暂无成本分类数据</p>
            ) : (
              <div className="space-y-3">
                {categoryStats.map((item) => (
                  <div key={item.name}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-gray-700">{item.name}</span>
                      <span className="text-red-500">{formatMoney(item.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.max(8, item.amount / maxCategoryAmount * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">项目利润</h2>
              <span className="text-[11px] text-gray-400">{filtered.length} 个项目</span>
            </div>
            <div className="space-y-2">
              {filtered.slice(0, 5).map((item) => {
                const positive = item.grossProfit >= 0;
                const width = Math.min(100, Math.max(8, Math.abs(item.grossMargin || 0) * 100));
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/contracts/${item.id}`)}
                    className="w-full rounded-lg bg-gray-50 px-3 py-2 text-left"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-gray-900">{item.houseAddress || '-'}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{item.customerName || '-'}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(item.grossProfit)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                      <div className={`h-full rounded-full ${positive ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ width: `${width}%` }} />
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="py-5 text-center text-xs text-gray-400">暂无项目数据</p>}
            </div>
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">支出记录</h2>
              <span className="text-[11px] text-gray-400">{recentRecords.length} 条</span>
            </div>
            {recentRecords.length === 0 ? (
              <p className="py-5 text-center text-xs text-gray-400">暂无支出记录</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentRecords.map((record) => (
                  <div key={record.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold leading-5 text-gray-900">{record.address}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{record.customerName} · {record.expenseDate || '-'}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-red-500">{formatMoney(record.amount || 0)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-500">{record.category || '未分类'}</span>
                      {record.remark ? <span className="min-w-0 truncate text-gray-400">{record.remark}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            {filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(`/contracts/${row.id}`)}
                className="w-full rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-base font-bold leading-6 text-gray-900">{row.houseAddress || '-'}</h2>
                    <p className="mt-1 text-xs text-gray-400">{row.customerName || '-'} · {row.contractNo || '-'}</p>
                  </div>
                  <ArrowRight size={16} className="mt-1 shrink-0 text-gray-300" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniValue label="合同金额" value={formatMoney(row.contractAmount || 0)} />
                  <MiniValue label="总成本" value={formatMoney(row.totalCost || 0)} tone="red" />
                  <MiniValue label="已收款" value={formatMoney(row.receivedAmount || 0)} tone="emerald" />
                  <MiniValue label="毛利润" value={formatMoney(row.grossProfit || 0)} tone={row.grossProfit >= 0 ? 'emerald' : 'red'} />
                </div>
              </button>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, tone = 'gray' }: { label: string; value: string; icon: any; tone?: 'gray' | 'red' | 'emerald' }) {
  const toneClass = tone === 'red' ? 'text-red-500 bg-red-50' : tone === 'emerald' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-700 bg-gray-100';
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={15} />
        </span>
      </div>
      <p className="break-all text-lg font-bold leading-6 text-gray-900">{value}</p>
    </div>
  );
}

function MiniValue({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'red' | 'emerald' }) {
  const color = tone === 'red' ? 'text-red-500' : tone === 'emerald' ? 'text-emerald-600' : 'text-gray-900';
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`mt-1 break-all text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}
