import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, PieChart, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart as EChartsPieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import Select from '@/components/Select';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney } from '@/utils/format';

echarts.use([LineChart, BarChart, EChartsPieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const REPORT_CACHE_PREFIX = 'pnzj:finance-report:v2';
const TABS = ['经营总览', '利润分析', '现金流', '成本分析'] as const;
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const LIGHT_TEXT = '#6b7280';
const LIGHT_GRID = '#eef0f3';

type ReportTab = typeof TABS[number];

type MonthStats = {
  month: string;
  monthNo: number;
  projIncome: number;
  genIncome: number;
  projExpense: number;
  genExpense: number;
  invoiceAmount: number;
  invoicePaid: number;
};

type CostCategory = {
  name: string;
  amount: number;
  ratio: number;
};

type ReportSnapshot = {
  monthlyData: MonthStats[];
  prevYearData: MonthStats[];
  costCategories: CostCategory[];
  updatedAt: number;
};

function sum(list: number[]) {
  return list.reduce((total, value) => total + Number(value || 0), 0);
}

function monthTotal(d: MonthStats) {
  const income = d.projIncome + d.genIncome;
  const expense = d.projExpense + d.genExpense;
  return { income, expense, profit: income - expense };
}

function cacheKey(bizType: string, year: number) {
  return `${REPORT_CACHE_PREFIX}:${bizType}:${year}`;
}

function readReportCache(bizType: string, year: number): ReportSnapshot | null {
  try {
    const raw = window.localStorage?.getItem(cacheKey(bizType, year));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.monthlyData) || parsed.monthlyData.length !== 12) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeReportCache(bizType: string, year: number, snapshot: ReportSnapshot) {
  try {
    window.localStorage?.setItem(cacheKey(bizType, year), JSON.stringify(snapshot));
  } catch {
    // Cache is a speed-up only.
  }
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const { receipts, expenses, invoices, generalIncomes, generalExpenses, initialized, loading } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const [tab, setTab] = useState<ReportTab>('经营总览');
  const [year, setYear] = useState(dayjs().year());
  const [cachedSnapshot, setCachedSnapshot] = useState<ReportSnapshot | null>(() => readReportCache(currentBizType, dayjs().year()));

  const hasLiveData = initialized || receipts.length > 0 || expenses.length > 0 || generalIncomes.length > 0 || generalExpenses.length > 0;
  const hasCache = !!cachedSnapshot;
  const supportsInvoices = currentBizType === '工装';

  useEffect(() => {
    setCachedSnapshot(readReportCache(currentBizType, year));
  }, [currentBizType, year]);

  const filteredReceipts = useMemo(() => receipts.filter(r => r.bizType === currentBizType), [receipts, currentBizType]);
  const filteredExpenses = useMemo(() => expenses.filter(e => e.bizType === currentBizType), [expenses, currentBizType]);
  const filteredInvoices = useMemo(() => supportsInvoices ? invoices.filter(i => i.bizType === currentBizType) : [], [invoices, currentBizType, supportsInvoices]);
  const ledgerBelongsToCurrentBiz = (item: { bizType?: string }) => {
    if (item.bizType) return item.bizType === currentBizType;
    return currentBizType === '家装';
  };
  const scopedGeneralIncomes = useMemo(() => generalIncomes.filter(ledgerBelongsToCurrentBiz), [generalIncomes, currentBizType]);
  const scopedGeneralExpenses = useMemo(() => generalExpenses.filter(ledgerBelongsToCurrentBiz), [generalExpenses, currentBizType]);

  const availableYears = useMemo(() => {
    const dates = [
      ...filteredReceipts.map(r => r.receiptDate),
      ...filteredExpenses.map(e => e.expenseDate),
      ...filteredInvoices.map(i => i.invoiceDate),
      ...filteredInvoices.map(i => i.paymentDate),
      ...scopedGeneralIncomes.map(gi => gi.incomeDate),
      ...scopedGeneralExpenses.map(ge => ge.expenseDate),
    ].filter(Boolean);
    const years = new Set(dates.map(d => dayjs(d).year()).filter(Boolean));
    years.add(dayjs().year());
    return Array.from(years).sort((a, b) => b - a);
  }, [filteredReceipts, filteredExpenses, filteredInvoices, scopedGeneralIncomes, scopedGeneralExpenses]);

  const buildMonthlyData = (targetYear: number): MonthStats[] => (
    MONTHS.map((month, i) => {
      const monthNo = i + 1;
      const isMonth = (value?: string) => value && dayjs(value).year() === targetYear && dayjs(value).month() + 1 === monthNo;
      return {
        month,
        monthNo,
        projIncome: sum(filteredReceipts.filter(r => isMonth(r.receiptDate)).map(r => r.amount)),
        genIncome: sum(scopedGeneralIncomes.filter(gi => isMonth(gi.incomeDate)).map(gi => gi.amount)),
        projExpense: sum(filteredExpenses.filter(e => isMonth(e.expenseDate)).map(e => e.amount)),
        genExpense: sum(scopedGeneralExpenses.filter(ge => isMonth(ge.expenseDate)).map(ge => ge.amount)),
        invoiceAmount: sum(filteredInvoices.filter(inv => isMonth(inv.invoiceDate)).map(inv => inv.invoiceAmount)),
        invoicePaid: sum(filteredInvoices.filter(inv => isMonth(inv.paymentDate)).map(inv => inv.paymentAmount)),
      };
    })
  );

  const liveMonthlyData = useMemo(() => buildMonthlyData(year), [filteredReceipts, filteredExpenses, filteredInvoices, scopedGeneralIncomes, scopedGeneralExpenses, year]);
  const livePrevYearData = useMemo(() => buildMonthlyData(year - 1), [filteredReceipts, filteredExpenses, filteredInvoices, scopedGeneralIncomes, scopedGeneralExpenses, year]);
  const liveCostCategories = useMemo(() => {
    const map = new Map<string, number>();
    filteredExpenses
      .filter(e => e.expenseDate && dayjs(e.expenseDate).year() === year)
      .forEach(e => map.set(e.category || '未分类项目支出', (map.get(e.category || '未分类项目支出') || 0) + Number(e.amount || 0)));
    scopedGeneralExpenses
      .filter(e => e.expenseDate && dayjs(e.expenseDate).year() === year)
      .forEach(e => map.set(e.category || '未分类店内支出', (map.get(e.category || '未分类店内支出') || 0) + Number(e.amount || 0)));
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount, ratio: total > 0 ? amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses, scopedGeneralExpenses, year]);

  useEffect(() => {
    if (!hasLiveData) return;
    const snapshot = {
      monthlyData: liveMonthlyData,
      prevYearData: livePrevYearData,
      costCategories: liveCostCategories,
      updatedAt: Date.now(),
    };
    setCachedSnapshot(snapshot);
    writeReportCache(currentBizType, year, snapshot);
  }, [currentBizType, hasLiveData, liveCostCategories, liveMonthlyData, livePrevYearData, year]);

  const monthlyData = hasLiveData ? liveMonthlyData : [];
  const prevYearData = hasLiveData ? livePrevYearData : [];
  const costCategories = hasLiveData ? liveCostCategories : [];
  const readyToRender = monthlyData.length === 12;

  const totals = useMemo(() => {
    const income = sum(monthlyData.map(d => monthTotal(d).income));
    const expense = sum(monthlyData.map(d => monthTotal(d).expense));
    const projectIncome = sum(monthlyData.map(d => d.projIncome));
    const storeIncome = sum(monthlyData.map(d => d.genIncome));
    const projectExpense = sum(monthlyData.map(d => d.projExpense));
    const storeExpense = sum(monthlyData.map(d => d.genExpense));
    const invoiceAmount = sum(monthlyData.map(d => d.invoiceAmount));
    const invoicePaid = sum(monthlyData.map(d => d.invoicePaid));
    const prevIncome = sum(prevYearData.map(d => monthTotal(d).income));
    const prevExpense = sum(prevYearData.map(d => monthTotal(d).expense));
    return {
      income,
      expense,
      profit: income - expense,
      projectIncome,
      storeIncome,
      projectExpense,
      storeExpense,
      invoiceAmount,
      invoicePaid,
      invoiceDebt: Math.max(0, invoiceAmount - projectIncome),
      prevIncome,
      prevExpense,
      prevProfit: prevIncome - prevExpense,
    };
  }, [monthlyData, prevYearData]);

  const profitRate = totals.income > 0 ? totals.profit / totals.income : 0;
  const projectCostRate = totals.projectIncome > 0 ? totals.projectExpense / totals.projectIncome : 0;
  const bestMonth = monthlyData.reduce<MonthStats | null>((best, item) => (!best || monthTotal(item).profit > monthTotal(best).profit ? item : best), null);
  const worstMonth = monthlyData.reduce<MonthStats | null>((worst, item) => (!worst || monthTotal(item).profit < monthTotal(worst).profit ? item : worst), null);

  const drillToCashflow = (monthNo: number, type: 'income' | 'expense' | 'all') => {
    const flowType = type === 'income' ? '收款' : type === 'expense' ? '支出' : '全部';
    navigate(`/cashflow?year=${year}&monthFrom=${monthNo}&monthTo=${monthNo}&type=${encodeURIComponent(flowType)}`);
  };

  const statYoy = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? '+∞' : curr < 0 ? '-∞' : '0%';
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  const chartBase = {
    backgroundColor: '#fff',
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#fff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#374151', fontSize: 12 },
      valueFormatter: (v: number) => formatMoney(v),
    },
    grid: { left: 8, right: 12, bottom: 8, top: 42, containLabel: true },
    xAxis: { type: 'category' as const, data: MONTHS, axisLine: { lineStyle: { color: LIGHT_GRID } }, axisTick: { show: false }, axisLabel: { color: LIGHT_TEXT, fontSize: 11, interval: 0 } },
    yAxis: { type: 'value' as const, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: LIGHT_GRID, type: 'dashed' as const } }, axisLabel: { color: LIGHT_TEXT, fontSize: 11 } },
  };

  const overviewOption = useMemo(() => ({
    ...chartBase,
    legend: { top: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#6b7280', fontSize: 11 } },
    series: [
      { name: '收入', type: 'bar', data: monthlyData.map(d => monthTotal(d).income), itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18 },
      { name: '支出', type: 'bar', data: monthlyData.map(d => monthTotal(d).expense), itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18 },
      { name: '利润', type: 'line', data: monthlyData.map(d => monthTotal(d).profit), smooth: true, lineStyle: { color: '#111827', width: 2 }, itemStyle: { color: '#111827' }, symbolSize: 5 },
    ],
  }), [monthlyData]);

  const profitOption = useMemo(() => ({
    ...chartBase,
    legend: { top: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#6b7280', fontSize: 11 } },
    series: [
      { name: `${year}利润`, type: 'bar', data: monthlyData.map(d => monthTotal(d).profit), itemStyle: { color: '#111827', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 20 },
      { name: `${year - 1}利润`, type: 'bar', data: prevYearData.map(d => monthTotal(d).profit), itemStyle: { color: '#cbd5e1', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 20 },
    ],
  }), [monthlyData, prevYearData, year]);

  const cashOption = useMemo(() => ({
    ...chartBase,
    legend: { top: 0, itemWidth: 16, itemHeight: 3, textStyle: { color: '#6b7280', fontSize: 11 } },
    series: [
      { name: '现金流入', type: 'line', data: monthlyData.map(d => monthTotal(d).income), smooth: true, lineStyle: { color: '#10b981', width: 2.4 }, itemStyle: { color: '#10b981' }, areaStyle: { color: 'rgba(16,185,129,0.06)' }, symbolSize: 5 },
      { name: '现金流出', type: 'line', data: monthlyData.map(d => monthTotal(d).expense), smooth: true, lineStyle: { color: '#ef4444', width: 2.4 }, itemStyle: { color: '#ef4444' }, areaStyle: { color: 'rgba(239,68,68,0.06)' }, symbolSize: 5 },
    ],
  }), [monthlyData]);

  const costOption = useMemo(() => ({
    backgroundColor: '#fff',
    tooltip: { trigger: 'item' as const, valueFormatter: (v: number) => formatMoney(v) },
    legend: { orient: 'vertical' as const, right: 0, top: 'middle', textStyle: { color: '#6b7280', fontSize: 11 } },
    series: [{
      name: '成本分类',
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      data: costCategories.slice(0, 8).map(item => ({ name: item.name, value: item.amount })),
      color: ['#111827', '#64748b', '#94a3b8', '#cbd5e1', '#10b981', '#f59e0b', '#ef4444', '#60a5fa'],
    }],
  }), [costCategories]);

  const chartHeight = typeof window !== 'undefined' && window.innerWidth < 768 ? 260 : 360;

  if (!readyToRender) {
    return (
      <div className="erp-page-spaced">
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
            <p className="text-sm text-gray-400">{loading || hasCache ? '正在同步真实财务数据...' : '正在准备报表...'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-page-spaced">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">财务报表</h1>
          <p className="mt-1 text-xs text-gold-500 md:text-sm">{currentBizType} · 收入、支出、利润与成本分析</p>
          <p className="mt-1 text-[11px] text-gray-400">仅统计真实财务数据；收款、支出、店内收支变更后会同步重算</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw size={14} className="animate-spin text-gold-500" />}
          <span className="text-xs font-medium text-gray-500">年份</span>
          <Select value={String(year)} onChange={v => setYear(Number(v))} options={availableYears.map(y => ({ value: String(y), label: `${y}年` }))} />
        </div>
      </div>

      <div className="sticky top-[calc(var(--erp-header-height,0px))] z-20 -mx-4 bg-gray-100/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0">
        <div className="flex gap-2 overflow-x-auto pb-1 md:border-b md:border-gray-200">
          {TABS.map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`h-9 shrink-0 rounded-md px-4 text-sm font-medium transition-colors md:rounded-none md:border-b-2 md:px-5 ${
                tab === item
                  ? 'bg-gray-900 text-white md:border-gold-400 md:bg-transparent md:text-gold-600'
                  : 'bg-white text-gray-500 md:border-transparent md:bg-transparent md:hover:text-gray-900'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-700">
        当前口径：合同收款按收款日期统计，项目支出按支出日期统计，店内收入/支出按所属业务统计。家装不包含开票记录；工装保留开票与回款分析。
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard title="总收入" value={formatMoney(totals.income)} sub={`同比 ${statYoy(totals.income, totals.prevIncome)}`} icon={ArrowUpRight} tone="emerald" />
        <MetricCard title="总支出" value={formatMoney(totals.expense)} sub={`同比 ${statYoy(totals.expense, totals.prevExpense)}`} icon={ArrowDownRight} tone="red" />
        <MetricCard title="净利润" value={formatMoney(totals.profit)} sub={`利润率 ${(profitRate * 100).toFixed(1)}%`} icon={Wallet} tone={totals.profit >= 0 ? 'dark' : 'red'} />
        <MetricCard title="项目成本率" value={`${(projectCostRate * 100).toFixed(1)}%`} sub={`项目支出 ${formatMoney(totals.projectExpense)}`} icon={PieChart} tone="slate" />
      </section>

      {tab === '经营总览' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard title={`${year}年月度经营趋势`} className="lg:col-span-2">
              <ReactEChartsCore echarts={echarts} option={overviewOption} style={{ height: chartHeight }} notMerge />
            </ChartCard>
            <div className="grid gap-3">
              <SummaryBlock label="利润最好月份" title={bestMonth?.month || '-'} value={bestMonth ? formatMoney(monthTotal(bestMonth).profit) : '-'} tone="emerald" />
              <SummaryBlock label="利润压力月份" title={worstMonth?.month || '-'} value={worstMonth ? formatMoney(monthTotal(worstMonth).profit) : '-'} tone="red" />
              {supportsInvoices && <SummaryBlock label="开票欠款" title="工装口径" value={formatMoney(totals.invoiceDebt)} tone={totals.invoiceDebt > 0 ? 'red' : 'emerald'} />}
            </div>
          </div>
          <MonthlyDrillList monthlyData={monthlyData} prevYearData={prevYearData} onDrill={drillToCashflow} mode="overview" />
        </div>
      )}

      {tab === '利润分析' && (
        <div className="space-y-4">
          <ChartCard title={`${year}年利润与去年对比`}>
            <ReactEChartsCore echarts={echarts} option={profitOption} style={{ height: chartHeight }} notMerge />
          </ChartCard>
          <MonthlyDrillList monthlyData={monthlyData} prevYearData={prevYearData} onDrill={drillToCashflow} mode="profit" />
        </div>
      )}

      {tab === '现金流' && (
        <div className="space-y-4">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard title="现金流入" value={formatMoney(totals.income)} sub="点击月度收入可查看流水" icon={TrendingUp} tone="emerald" />
            <MetricCard title="现金流出" value={formatMoney(totals.expense)} sub="点击月度支出可查看流水" icon={ArrowDownRight} tone="red" />
            <MetricCard title="净现金流" value={formatMoney(totals.income - totals.expense)} sub="收款减支出" icon={Wallet} tone={totals.income - totals.expense >= 0 ? 'dark' : 'red'} />
          </section>
          <ChartCard title={`${year}年月度现金流`}>
            <ReactEChartsCore echarts={echarts} option={cashOption} style={{ height: chartHeight }} notMerge />
          </ChartCard>
          <MonthlyDrillList monthlyData={monthlyData} prevYearData={prevYearData} onDrill={drillToCashflow} mode="cash" />
        </div>
      )}

      {tab === '成本分析' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title={`${year}年成本分类`}>
              {costCategories.length > 0 ? (
                <ReactEChartsCore echarts={echarts} option={costOption} style={{ height: chartHeight }} notMerge />
              ) : (
                <EmptyBlock text="暂无成本分类数据" />
              )}
            </ChartCard>
            <div className="rounded-lg border border-gray-100 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">成本排行</h3>
              <div className="space-y-3">
                {costCategories.length === 0 ? <EmptyBlock text="暂无成本记录" /> : costCategories.slice(0, 8).map((item) => (
                  <div key={item.name}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-gray-700">{item.name}</span>
                      <span className="shrink-0 font-semibold text-gray-900">{formatMoney(item.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gray-900" style={{ width: `${Math.min(100, item.ratio * 100)}%` }} />
                    </div>
                    <div className="mt-1 text-right text-[11px] text-gray-400">{(item.ratio * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <MonthlyDrillList monthlyData={monthlyData} prevYearData={prevYearData} onDrill={drillToCashflow} mode="cost" />
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, sub, icon: Icon, tone }: { title: string; value: string; sub: string; icon: any; tone: 'emerald' | 'red' | 'dark' | 'slate' }) {
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-500',
    dark: 'bg-gray-900 text-white',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">{title}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${toneMap[tone]}`}>
          <Icon size={16} />
        </span>
      </div>
      <div className="break-words text-2xl font-bold leading-tight text-gray-900">{value}</div>
      <div className="mt-2 text-xs text-gray-400">{sub}</div>
    </div>
  );
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-gray-100 bg-white p-3 md:p-5 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      <div className="min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}

function SummaryBlock({ label, title, value, tone }: { label: string; title: string; value: string; tone: 'emerald' | 'red' }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-lg font-bold text-gray-900">{title}</div>
        <div className={`text-base font-bold ${tone === 'emerald' ? 'text-emerald-600' : 'text-red-500'}`}>{value}</div>
      </div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="flex h-48 items-center justify-center text-sm text-gray-400">{text}</div>;
}

function MonthlyDrillList({
  monthlyData,
  prevYearData,
  onDrill,
  mode,
}: {
  monthlyData: MonthStats[];
  prevYearData: MonthStats[];
  onDrill: (monthNo: number, type: 'income' | 'expense' | 'all') => void;
  mode: 'overview' | 'profit' | 'cash' | 'cost';
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-100 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">月度明细</h3>
      </div>
      <div className="md:hidden divide-y divide-gray-50">
        {monthlyData.map((d, i) => {
          const current = monthTotal(d);
          const prev = prevYearData[i] ? monthTotal(prevYearData[i]) : { profit: 0 };
          return (
            <div key={`mobile-${d.month}`} className="p-4">
              <button type="button" onClick={() => onDrill(d.monthNo, 'all')} className="mb-3 flex w-full items-center justify-between text-left">
                <span className="text-lg font-bold text-gray-900">{d.month}</span>
                <span className={`text-lg font-bold ${current.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(current.profit)}</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onDrill(d.monthNo, 'income')} className="rounded-lg bg-emerald-50 px-3 py-2 text-left">
                  <div className="text-xs text-emerald-600/70">收入合计</div>
                  <div className="mt-1 break-words text-sm font-bold text-emerald-700">{formatMoney(current.income)}</div>
                </button>
                <button type="button" onClick={() => onDrill(d.monthNo, 'expense')} className="rounded-lg bg-red-50 px-3 py-2 text-left">
                  <div className="text-xs text-red-500/70">支出合计</div>
                  <div className="mt-1 break-words text-sm font-bold text-red-600">{formatMoney(current.expense)}</div>
                </button>
                {mode !== 'cash' && (
                  <div className="col-span-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                    <span className="text-gray-500">去年同期利润</span>
                    <span className="font-semibold text-gray-500">{formatMoney(prev.profit)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">月份</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">项目收入</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">店内收入</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">项目支出</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">店内支出</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">净利润</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">去年利润</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((d, i) => {
              const current = monthTotal(d);
              const prev = prevYearData[i] ? monthTotal(prevYearData[i]) : { profit: 0 };
              return (
                <tr key={`desktop-${d.month}`} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-900">{d.month}</td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => onDrill(d.monthNo, 'income')} className="font-medium text-emerald-600 hover:underline">{formatMoney(d.projIncome)}</button></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => onDrill(d.monthNo, 'income')} className="font-medium text-emerald-600 hover:underline">{formatMoney(d.genIncome)}</button></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => onDrill(d.monthNo, 'expense')} className="font-medium text-red-500 hover:underline">{formatMoney(d.projExpense)}</button></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => onDrill(d.monthNo, 'expense')} className="font-medium text-red-500 hover:underline">{formatMoney(d.genExpense)}</button></td>
                  <td className={`px-4 py-3 text-right font-bold ${current.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(current.profit)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{formatMoney(prev.profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
