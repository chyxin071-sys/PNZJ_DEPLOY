import { useState, useMemo } from 'react';
import { Download, TrendingUp, TrendingDown, DollarSign, X } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney, formatDate } from '@/utils/format';
import { exportToExcel } from '@/utils/export';
import dayjs from 'dayjs';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';
import { useIncrementalList } from '@/hooks/useListViewportState';

interface FlowItem {
  id: string;
  date: string;
  type: '收款' | '支出';
  amount: number;
  contractNo: string;
  relatedParty: string;
  summary: string;
}

export default function CashFlow() {
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

  const MONTH_OPTS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` }));

  // 年份选项：从所有收付款记录中提取
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    receipts.forEach(r => { if (r.receiptDate) years.add(String(dayjs(r.receiptDate).year())); });
    expenses.forEach(e => { if (e.expenseDate) years.add(String(dayjs(e.expenseDate).year())); });
    return [{ value: '', label: '全部年份' }, ...Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)).map(y => ({ value: y, label: y }))];
  }, [receipts, expenses]);

  const filteredReceipts = useMemo(() => receipts.filter(r => r.bizType === currentBizType), [receipts, currentBizType]);
  const filteredExpenses = useMemo(() => expenses.filter(e => e.bizType === currentBizType), [expenses, currentBizType]);

  const getHouseAddress = (contractNo: string) => {
    const c = contracts.find((ct) => ct.contractNo === contractNo);
    return c?.houseAddress || '';
  };

  const flowList = useMemo(() => {
    const flows: FlowItem[] = [
      ...filteredReceipts.map((r) => ({
        id: r.id,
        date: r.receiptDate,
        type: '收款' as const,
        amount: r.amount,
        contractNo: r.contractNo,
        relatedParty: getHouseAddress(r.contractNo) || r.customerName,
        summary: `${r.stage} - ${r.paymentMethod}${r.remark ? ' - ' + r.remark : ''}`,
      })),
      ...filteredExpenses.map((e) => ({
        id: e.id,
        date: e.expenseDate,
        type: '支出' as const,
        amount: e.amount,
        contractNo: e.contractNo,
        relatedParty: e.supplier,
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
      list = list.filter(f => matchedAddresses.has(f.contractNo));
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
    { key: 'contractNo', title: '合同编号', sortable: true, render: (row: FlowItem) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-mono">
          {row.contractNo}
        </span>
      )},
    { key: 'relatedParty', title: '关联方', sortable: true },
    { key: 'summary', title: '说明' },
  ];

  return (
    <div className="erp-page-spaced">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base md:text-lg font-bold text-gray-900">资金流水</h1>
          <p className="text-gold-500 text-xs md:text-sm">所有收付款记录汇总</p>
        </div>
        <button
          onClick={handleExport}
          className="erp-btn-secondary"
        >
          <Download size={14} />
          导出Excel
        </button>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          title="收入总额"
          value={formatMoney(incomeTotal)}
          icon={TrendingUp}
          accent="emerald"
          sub="时间段内收款合计"
        />
        <StatCard
          title="支出总额"
          value={formatMoney(expenseTotal)}
          icon={TrendingDown}
          accent="red"
          sub="时间段内支出合计"
        />
        <StatCard
          title="净额"
          value={formatMoney(netTotal)}
          icon={DollarSign}
          accent={netTotal >= 0 ? 'gold' : 'red'}
          sub={netTotal >= 0 ? '净流入' : '净流出'}
        />
      </div>

      {/* 筛选栏 */}
      <div className="erp-surface overflow-visible">
      <div className="erp-search-row flex-wrap md:flex-nowrap">
        <span className="hidden lg:inline shrink-0 text-xs text-gray-500">日期：</span>
        <Select value={filterYear} onChange={setFilterYear} options={yearOptions} className="w-32 shrink-0" />
        <Select value={filterMonthFrom} onChange={setFilterMonthFrom} options={MONTH_OPTS} className="w-24 shrink-0" />
        <span className="text-xs text-gray-400">至</span>
        <Select value={filterMonthTo} onChange={setFilterMonthTo} options={MONTH_OPTS} className="w-24 shrink-0" />
          <Select
            value={flowType}
            onChange={(v) => setFlowType(v as '全部' | '收款' | '支出')}
            options={[
              { value: '全部', label: '全部类型' },
              { value: '收款', label: '收入' },
              { value: '支出', label: '支出' },
            ]}
            className="w-28 shrink-0"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目地址/客户姓名"
            className="erp-search-input min-w-[220px] flex-1"
          />
        {(dateFrom || dateTo || search) && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setFilterYear('');
              setFilterMonthFrom('1');
              setFilterMonthTo('12');
              setSearch('');
            }}
            className="text-xs text-gold-500 hover:text-gold-600 font-medium"
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
            emptyText="暂无流水记录"
            mobileCardColumns={4}
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
    </div>
  );
}
