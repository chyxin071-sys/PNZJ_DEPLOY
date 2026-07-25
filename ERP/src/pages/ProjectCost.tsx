import { useState, useMemo } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney, formatPercent } from '@/utils/format';
import type { ProjectProfit } from '@/types';
import DataTable from '@/components/DataTable';
import { useNavigate } from 'react-router-dom';

const ROLE_COLORS: Record<string, string> = {
  sales: 'bg-blue-50 text-blue-600',
  designer: 'bg-violet-50 text-violet-600',
  manager: 'bg-amber-50 text-amber-600',
};

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

  const enriched = useMemo(() => {
    const filteredContracts = contracts.filter(c => c.bizType === currentBizType);
    const profits = getProjectProfits()
      .filter(p => filteredContracts.some(c => c.id === p.id));
    return profits.map((p) => {
      const contract = contracts.find(c => c.id === p.id);
      return {
        ...p,
        sales: contract?.sales || '',
        designer: contract?.designer || '',
        projectManager: contract?.projectManager || '',
        unreceived: p.contractAmount - p.receivedAmount,
        cashFlow: p.receivedAmount - p.totalCost,
      };
    }).sort((a, b) => b.contractNo.localeCompare(a.contractNo));
  }, [getProjectProfits, contracts, currentBizType]);

  const filtered = useMemo(() => {
    if (!search) return enriched;
    const q = search.toLowerCase();
    return enriched.filter(
      (p) =>
        p.contractNo.toLowerCase().includes(q) ||
        p.houseAddress.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q),
    );
  }, [enriched, search]);

  const columns = [
    {
      key: 'houseAddress',
      title: '项目地址',
      render: (row: any) => (
        <div className="font-medium text-gray-900 truncate max-w-[200px]" title={row.houseAddress}>
          {row.houseAddress}
        </div>
      ),
    },
    { key: 'customerName', title: '客户' },
    {
      key: 'contractAmount',
      title: '合同金额',
      render: (row: any) => (
        <span className="font-medium">{formatMoney(row.contractAmount)}</span>
      ),
    },
    {
      key: 'receivedAmount',
      title: '已收款',
      render: (row: any) => (
        <span className="text-emerald-600 font-medium">{formatMoney(row.receivedAmount)}</span>
      ),
    },
    {
      key: 'unreceived',
      title: '未收款',
      render: (row: any) => (
        <span className={row.unreceived > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>{formatMoney(row.unreceived)}</span>
      ),
    },
    {
      key: 'totalCost',
      title: '总成本',
      render: (row: any) => (
        <span className="text-red-500 font-medium">{formatMoney(row.totalCost)}</span>
      ),
    },
    {
      key: 'grossProfit',
      title: '毛利润',
      render: (row: any) => (
        <span className={row.grossProfit >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
          {formatMoney(row.grossProfit)}
        </span>
      ),
    },
    {
      key: 'grossMargin',
      title: '毛利率',
      render: (row: any) => (
        <span className={row.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}>
          {formatPercent(row.grossMargin)}
        </span>
      ),
    },
    {
      key: 'cashFlow',
      title: '收支差',
      render: (row: any) => (
        <span className={row.cashFlow >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
          {formatMoney(row.cashFlow)}
        </span>
      ),
    },
    {
      key: 'sales',
      title: '销售',
      render: (row: any) => (
        <RoleTags names={row.sales ? row.sales.split(/[,，、\s]+/).filter(Boolean) : []} role="sales" />
      ),
    },
    {
      key: 'designer',
      title: '设计',
      render: (row: any) => (
        <RoleTags names={row.designer ? row.designer.split(/[,，、\s]+/).filter(Boolean) : []} role="designer" />
      ),
    },
    {
      key: 'projectManager',
      title: '项目经理',
      render: (row: any) => (
        <RoleTags names={row.projectManager ? row.projectManager.split(/[,，、\s]+/).filter(Boolean) : []} role="manager" />
      ),
    },
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
          查看合同详情
        </button>
      ),
    }
  ];

  return (
    <div className="erp-page-spaced">
      {/* 页头 */}
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
        <DataTable
            columns={columns}
            data={filtered}
            emptyText="暂无项目数据"
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => {
              const r = row as unknown as ProjectProfit;
              navigate(`/projects/${r.id}`);
            }}
        />
      </div>
    </div>
  );
}
