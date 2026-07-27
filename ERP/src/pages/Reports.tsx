import { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import Select from '@/components/Select';
import dayjs from 'dayjs';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import StatCard from '@/components/StatCard';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney } from '@/utils/format';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const TABS = ['利润表', '现金流量表', '经营总览'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const LIGHT_TEXT = '#9ca3af';
const LIGHT_GRID = '#f0f0f0';

type MonthStats = {
  month: string;
  projIncome: number;
  genIncome: number;
  projExpense: number;
  genExpense: number;
  invoiceAmount: number;
  invoicePaid: number;
};

export default function ReportsPage() {
  const { receipts, expenses, invoices, generalIncomes, generalExpenses, initialized, loading } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const [tab, setTab] = useState('利润表');
  const [year, setYear] = useState(dayjs().year());

  const isReady = initialized || receipts.length > 0 || expenses.length > 0;

  const filteredReceipts = useMemo(() => receipts.filter(r => r.bizType === currentBizType), [receipts, currentBizType]);
  const filteredExpenses = useMemo(() => expenses.filter(e => e.bizType === currentBizType), [expenses, currentBizType]);
  const supportsInvoices = currentBizType === '工装';
  const includeGeneralLedger = false;
  const filteredInvoices = useMemo(() => supportsInvoices ? invoices.filter(i => i.bizType === currentBizType) : [], [invoices, currentBizType, supportsInvoices]);
  const scopedGeneralIncomes = includeGeneralLedger ? generalIncomes : [];
  const scopedGeneralExpenses = includeGeneralLedger ? generalExpenses : [];

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
    return Array.from(years).sort((a, b) => b - a);
  }, [filteredReceipts, filteredExpenses, filteredInvoices, scopedGeneralIncomes, scopedGeneralExpenses]);

  const monthlyData = useMemo((): MonthStats[] => {
    return MONTHS.map((_, i) => {
      const m = i + 1;
      const projIncome = filteredReceipts.filter(r => dayjs(r.receiptDate).year() === year && dayjs(r.receiptDate).month() + 1 === m).reduce((s, r) => s + r.amount, 0);
      const genIncome = scopedGeneralIncomes.filter(gi => dayjs(gi.incomeDate).year() === year && dayjs(gi.incomeDate).month() + 1 === m).reduce((s, gi) => s + gi.amount, 0);
      const projExpense = filteredExpenses.filter(e => dayjs(e.expenseDate).year() === year && dayjs(e.expenseDate).month() + 1 === m).reduce((s, e) => s + e.amount, 0);
      const genExpense = scopedGeneralExpenses.filter(ge => dayjs(ge.expenseDate).year() === year && dayjs(ge.expenseDate).month() + 1 === m).reduce((s, ge) => s + ge.amount, 0);
      const invoiceAmount = filteredInvoices.filter(inv => dayjs(inv.invoiceDate).year() === year && dayjs(inv.invoiceDate).month() + 1 === m).reduce((s, inv) => s + inv.invoiceAmount, 0);
      const invoicePaid = filteredInvoices.filter(inv => inv.paymentDate && dayjs(inv.paymentDate).year() === year && dayjs(inv.paymentDate).month() + 1 === m).reduce((s, inv) => s + inv.paymentAmount, 0);
      return { month: MONTHS[i], projIncome, genIncome, projExpense, genExpense, invoiceAmount, invoicePaid };
    });
  }, [filteredReceipts, filteredExpenses, filteredInvoices, scopedGeneralIncomes, scopedGeneralExpenses, year]);

  const totalProjIncome = monthlyData.reduce((s, d) => s + d.projIncome, 0);
  const totalGenIncome = monthlyData.reduce((s, d) => s + d.genIncome, 0);
  const totalIncome = totalProjIncome + totalGenIncome;
  const totalProjExpense = monthlyData.reduce((s, d) => s + d.projExpense, 0);
  const totalGenExpense = monthlyData.reduce((s, d) => s + d.genExpense, 0);
  const totalExpense = totalProjExpense + totalGenExpense;
  const totalProfit = totalIncome - totalExpense;
  const totalInvoiceAmount = monthlyData.reduce((s, d) => s + d.invoiceAmount, 0);
  const totalInvoicePaid = monthlyData.reduce((s, d) => s + d.invoicePaid, 0);
  const totalInvoiceDebt = totalInvoiceAmount - totalProjIncome;

  // 去年数据（同比）
  const prevYearData = useMemo((): MonthStats[] => {
    const prev = year - 1;
    return MONTHS.map((_, i) => {
      const m = i + 1;
      const projIncome = filteredReceipts.filter(r => dayjs(r.receiptDate).year() === prev && dayjs(r.receiptDate).month() + 1 === m).reduce((s, r) => s + r.amount, 0);
      const genIncome = scopedGeneralIncomes.filter(gi => dayjs(gi.incomeDate).year() === prev && dayjs(gi.incomeDate).month() + 1 === m).reduce((s, gi) => s + gi.amount, 0);
      const projExpense = filteredExpenses.filter(e => dayjs(e.expenseDate).year() === prev && dayjs(e.expenseDate).month() + 1 === m).reduce((s, e) => s + e.amount, 0);
      const genExpense = scopedGeneralExpenses.filter(ge => dayjs(ge.expenseDate).year() === prev && dayjs(ge.expenseDate).month() + 1 === m).reduce((s, ge) => s + ge.amount, 0);
      const invoiceAmount = filteredInvoices.filter(inv => dayjs(inv.invoiceDate).year() === prev && dayjs(inv.invoiceDate).month() + 1 === m).reduce((s, inv) => s + inv.invoiceAmount, 0);
      const invoicePaid = filteredInvoices.filter(inv => inv.paymentDate && dayjs(inv.paymentDate).year() === prev && dayjs(inv.paymentDate).month() + 1 === m).reduce((s, inv) => s + inv.paymentAmount, 0);
      return { month: MONTHS[i], projIncome, genIncome, projExpense, genExpense, invoiceAmount, invoicePaid };
    });
  }, [filteredReceipts, filteredExpenses, filteredInvoices, scopedGeneralIncomes, scopedGeneralExpenses, year]);

  const prevTotalIncome = prevYearData.reduce((s, d) => s + d.projIncome + d.genIncome, 0);
  const prevTotalExpense = prevYearData.reduce((s, d) => s + d.projExpense + d.genExpense, 0);
  const prevTotalProfit = prevTotalIncome - prevTotalExpense;

  const baseGrid = { left: '3%', right: '4%', bottom: '3%', top: 40, containLabel: true };
  const xAxisBase = { type: 'category' as const, data: MONTHS, axisLine: { lineStyle: { color: LIGHT_GRID } }, axisTick: { show: false }, axisLabel: { color: LIGHT_TEXT, fontSize: 11 } };
  const yAxisBase = { type: 'value' as const, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: LIGHT_GRID, type: 'dashed' as const } }, axisLabel: { color: LIGHT_TEXT, fontSize: 11 } };

  const barOption = useMemo(() => ({
    backgroundColor: '#fff',
    tooltip: { trigger: 'axis' as const, backgroundColor: '#fff', borderColor: '#e5e7eb', textStyle: { color: '#374151', fontSize: 12 }, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
    legend: { show: true, top: 0, textStyle: { color: '#6b7280', fontSize: 12 }, itemWidth: 10, itemHeight: 10, itemGap: 24 },
    grid: baseGrid, xAxis: xAxisBase, yAxis: yAxisBase,
    series: [
      { name: `${year}年收入`, type: 'bar', data: monthlyData.map(d => d.projIncome + d.genIncome), itemStyle: { color: '#d4a843', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 20, barGap: '20%' },
      { name: `${year - 1}年收入`, type: 'bar', data: prevYearData.map(d => d.projIncome + d.genIncome), itemStyle: { color: '#e5c978', borderRadius: [4, 4, 0, 0], opacity: 0.6 }, barMaxWidth: 20 },
      { name: `${year}年支出`, type: 'bar', data: monthlyData.map(d => d.projExpense + d.genExpense), itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 20, barGap: '20%' },
      { name: `${year - 1}年支出`, type: 'bar', data: prevYearData.map(d => d.projExpense + d.genExpense), itemStyle: { color: '#f27e7e', borderRadius: [4, 4, 0, 0], opacity: 0.6 }, barMaxWidth: 20 },
    ],
  }), [monthlyData, prevYearData, year]);

  const lineOption = useMemo(() => ({
    backgroundColor: '#fff',
    tooltip: { trigger: 'axis' as const, backgroundColor: '#fff', borderColor: '#e5e7eb', textStyle: { color: '#374151', fontSize: 12 }, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', valueFormatter: (v: number) => formatMoney(v) },
    legend: { show: true, top: 0, textStyle: { color: '#6b7280', fontSize: 12 }, itemWidth: 16, itemHeight: 3, itemGap: 24 },
    grid: baseGrid, xAxis: { ...xAxisBase, boundaryGap: false }, yAxis: yAxisBase,
    series: [
      { name: '现金流入', type: 'line', data: monthlyData.map(d => d.projIncome + d.genIncome), smooth: true, lineStyle: { color: '#d4a843', width: 2.5 }, itemStyle: { color: '#d4a843' }, symbol: 'circle', symbolSize: 6, areaStyle: { color: 'rgba(212,168,67,0.06)' } },
      { name: '现金流出', type: 'line', data: monthlyData.map(d => d.projExpense + d.genExpense), smooth: true, lineStyle: { color: '#ef4444', width: 2.5 }, itemStyle: { color: '#ef4444' }, symbol: 'circle', symbolSize: 6, areaStyle: { color: 'rgba(239,68,68,0.06)' } },
    ],
  }), [monthlyData]);

  // 经营总览：近6月堆叠柱状图
  const recent6Months = monthlyData.slice(-6);
  const overviewBarOption = useMemo(() => ({
    backgroundColor: '#fff',
    tooltip: { trigger: 'axis' as const, backgroundColor: '#fff', borderColor: '#e5e7eb', textStyle: { color: '#374151', fontSize: 12 }, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', valueFormatter: (v: number) => formatMoney(v) },
    legend: { show: true, top: 0, textStyle: { color: '#6b7280', fontSize: 12 }, itemWidth: 10, itemHeight: 10, itemGap: 20 },
    grid: { left: '3%', right: '4%', bottom: '3%', top: 40, containLabel: true },
    xAxis: { type: 'category' as const, data: recent6Months.map(d => d.month), axisLine: { lineStyle: { color: LIGHT_GRID } }, axisTick: { show: false }, axisLabel: { color: LIGHT_TEXT, fontSize: 11 } },
    yAxis: yAxisBase,
    series: [
      { name: '项目收入', type: 'bar', stack: 'income', data: recent6Months.map(d => d.projIncome), itemStyle: { color: '#d4a843' }, barMaxWidth: 36, emphasis: { focus: 'series' } },
      { name: '总店收入', type: 'bar', stack: 'income', data: recent6Months.map(d => d.genIncome), itemStyle: { color: '#f0c36d' }, barMaxWidth: 36, emphasis: { focus: 'series' } },
      { name: '项目支出', type: 'bar', stack: 'expense', data: recent6Months.map(d => d.projExpense), itemStyle: { color: '#ef4444' }, barMaxWidth: 36, emphasis: { focus: 'series' } },
      { name: '总店支出', type: 'bar', stack: 'expense', data: recent6Months.map(d => d.genExpense), itemStyle: { color: '#f87171' }, barMaxWidth: 36, emphasis: { focus: 'series' } },
    ],
  }), [recent6Months]);

  const StatRow = ({ labels, values, accents }: { labels: string[]; values: string[]; accents: Array<'gold' | 'emerald' | 'red' | 'blue'> }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard title={labels[0]} value={values[0]} icon={ArrowUpRight} accent={accents[0]} />
      <StatCard title={labels[1]} value={values[1]} icon={ArrowDownRight} accent={accents[1]} />
      <StatCard title={labels[2]} value={values[2]} icon={Wallet} accent={accents[2]} />
    </div>
  );

  const header = (label: string) => (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-base md:text-lg font-bold text-gray-900">财务报表</h1>
        <p className="text-gold-500 text-xs md:text-sm">{currentBizType} · {label}</p>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 font-medium">年份：</label>
        <Select value={String(year)} onChange={v => setYear(Number(v))} options={(availableYears.length > 0 ? availableYears : [dayjs().year()]).map(y => ({ value: String(y), label: `${y}年` }))} />
      </div>
    </div>
  );

  const reportScopeNote = (
    <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-700">
      当前口径：{currentBizType}项目收款按收款日期统计，项目支出按支出日期统计。家装报表只统计家装合同关联的收支，不再混入总店收入/支出、开票、应收或应付数据。
    </div>
  );

  const MobileMonthList = ({ mode }: { mode: 'profit' | 'cash' | 'overview' }) => (
    <div className="md:hidden divide-y divide-gray-50">
      {monthlyData.map((d, i) => {
        const inc = d.projIncome + d.genIncome;
        const exp = d.projExpense + d.genExpense;
        const net = inc - exp;
        const prevInc = prevYearData[i].projIncome + prevYearData[i].genIncome;
        const prevExp = prevYearData[i].projExpense + prevYearData[i].genExpense;
        const prevNet = prevInc - prevExp;
        return (
          <div key={`${mode}-${d.month}`} className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">{d.month}</span>
              <span className={`text-sm font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(net)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <div className="text-emerald-600/70">收入合计</div>
                <div className="mt-0.5 font-semibold text-emerald-700">{formatMoney(inc)}</div>
              </div>
              <div className="rounded-lg bg-red-50 px-3 py-2">
                <div className="text-red-500/70">支出合计</div>
                <div className="mt-0.5 font-semibold text-red-600">{formatMoney(exp)}</div>
              </div>
              {mode === 'profit' && (
                <div className="col-span-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="text-gray-500">去年同期利润</span>
                  <span className="font-semibold text-gray-500">{formatMoney(prevNet)}</span>
                </div>
              )}
              {mode === 'overview' && (
                <>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-gray-500">项目收入</div>
                    <div className="mt-0.5 font-semibold text-gray-900">{formatMoney(d.projIncome)}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-gray-500">项目支出</div>
                    <div className="mt-0.5 font-semibold text-gray-900">{formatMoney(d.projExpense)}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const tabBar = (
    <div>
      <div className="flex items-center gap-0 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 md:px-6 py-2.5 text-sm font-medium transition-colors relative ${tab === t ? 'text-gold-500' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}{tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 rounded-full" />}
          </button>
        ))}
      </div>
    </div>
  );

  if (!isReady) {
    return (
      <div className="erp-page-spaced">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">{loading ? '加载财务数据...' : '正在准备报表...'}</p>
          </div>
        </div>
      </div>
    );
  }

  const statYoy = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? '+∞' : '0%';
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  };

  return (
    <div className="erp-page-spaced">
      {tab === '利润表' && (
            <>
              {header('利润表 & 现金流量表分析')}{tabBar}
          {reportScopeNote}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="总收入" value={formatMoney(totalIncome)} icon={ArrowUpRight} accent="emerald" sub={`同比 ${statYoy(totalIncome, prevTotalIncome)}`} />
            <StatCard title="总支出" value={formatMoney(totalExpense)} icon={ArrowDownRight} accent="red" sub={`同比 ${statYoy(totalExpense, prevTotalExpense)}`} />
            <StatCard title="净利润" value={formatMoney(totalProfit)} icon={Wallet} accent={totalProfit >= 0 ? 'gold' : 'red'} sub={`同比 ${statYoy(totalProfit, prevTotalProfit)}`} />
          </div>
          {supportsInvoices && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard title="开票金额" value={formatMoney(totalInvoiceAmount)} icon={ArrowUpRight} accent="blue" />
              <StatCard title="项目实收款" value={formatMoney(totalProjIncome)} icon={ArrowUpRight} accent="emerald" />
              <StatCard title="开票欠款" value={formatMoney(totalInvoiceDebt)} icon={Wallet} accent={totalInvoiceDebt > 0 ? 'red' : 'gold'} />
              <StatCard title="开票回款率" value={totalInvoiceAmount > 0 ? `${Math.min(totalProjIncome / totalInvoiceAmount * 100, 999).toFixed(1)}%` : '0.0%'} icon={Wallet} accent="gold" />
            </div>
          )}

          <div>
            <div className="bg-white rounded-lg border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">{year}年 vs {year - 1}年 月度收入与支出对比</h3>
              <ReactEChartsCore echarts={echarts} option={barOption} style={{ height: 360 }} />
            </div>
          </div>
          <div><div className="bg-white rounded-lg border border-gray-100 px-6 py-4"><h3 className="text-sm font-semibold text-gray-700 mb-3">{year}年 月度利润明细</h3></div></div>
          <div>
            <div className="bg-white rounded-lg border border-gray-100 overflow-visible"><div className="overflow-visible -mx-4 md:-mx-6 px-4 md:px-6">
              <MobileMonthList mode="profit" />
              <table className="hidden md:table w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">月份</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">收入合计</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">支出合计</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">利润</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{year - 1} 年利润</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">同比变动</th>
                </tr></thead>
                <tbody>
                  {monthlyData.map((d, i) => {
                    const inc = d.projIncome + d.genIncome;
                    const exp = d.projExpense + d.genExpense;
                    const pf = inc - exp;
                    const prevInc = prevYearData[i].projIncome + prevYearData[i].genIncome;
                    const prevExp = prevYearData[i].projExpense + prevYearData[i].genExpense;
                    const prevPf = prevInc - prevExp;
                    const yoy = prevPf === 0 ? (pf > 0 ? '+∞' : pf < 0 ? '-∞' : '0%') : `${((pf - prevPf) / Math.abs(prevPf) * 100).toFixed(1)}%`;
                    return (
                      <tr key={d.month} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4 text-gray-700 font-medium">{d.month}</td>
                        <td className="py-3 px-4 text-emerald-600 text-right font-medium">{formatMoney(inc)}</td>
                        <td className="py-3 px-4 text-red-500 text-right font-medium">{formatMoney(exp)}</td>
                        <td className={`py-3 px-4 text-right font-bold ${pf >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(pf)}</td>
                        <td className="py-3 px-4 text-right text-gray-400">{formatMoney(prevPf)}</td>
                        <td className={`py-3 px-4 text-right font-medium ${pf > prevPf ? 'text-emerald-600' : pf < prevPf ? 'text-red-500' : 'text-gray-400'}`}>{pf > prevPf ? '↑' : pf < prevPf ? '↓' : '-'} {yoy}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50/80 font-semibold">
                    <td className="py-3 px-4 text-gray-900">合计</td>
                    <td className="py-3 px-4 text-emerald-600 text-right">{formatMoney(totalIncome)}</td>
                    <td className="py-3 px-4 text-red-500 text-right">{formatMoney(totalExpense)}</td>
                    <td className={`py-3 px-4 text-right ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(totalProfit)}</td>
                    <td className="py-3 px-4 text-right text-gray-400">{formatMoney(prevTotalIncome - prevTotalExpense)}</td>
                    <td className={`py-3 px-4 text-right ${totalProfit > prevTotalIncome - prevTotalExpense ? 'text-emerald-600' : totalProfit < prevTotalIncome - prevTotalExpense ? 'text-red-500' : 'text-gray-400'}`}>{totalProfit > prevTotalIncome - prevTotalExpense ? '↑' : totalProfit < prevTotalIncome - prevTotalExpense ? '↓' : '-'} {statYoy(totalProfit, prevTotalIncome - prevTotalExpense)}</td>
                  </tr>
                </tbody>
              </table>
            </div></div>
          </div>
        </>
      )}

      {tab === '现金流量表' && (
        <>
          {header('利润表 & 现金流量表分析')}{tabBar}
          {reportScopeNote}
          <StatRow labels={['现金流入', '现金流出', '现金净额']} values={[formatMoney(totalIncome), formatMoney(totalExpense), formatMoney(totalIncome - totalExpense)]} accents={['emerald', 'red', (totalIncome - totalExpense) >= 0 ? 'gold' : 'red']} />
          {supportsInvoices && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard title="本年开票" value={formatMoney(totalInvoiceAmount)} icon={ArrowUpRight} accent="blue" />
              <StatCard title="开票记录付款" value={formatMoney(totalInvoicePaid)} icon={ArrowUpRight} accent="emerald" />
              <StatCard title="按开票口径欠款" value={formatMoney(totalInvoiceDebt)} icon={Wallet} accent={totalInvoiceDebt > 0 ? 'red' : 'gold'} />
            </div>
          )}
          <div>
            <div className="bg-white rounded-lg border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">{year}年 月度现金流量</h3>
              <ReactEChartsCore echarts={echarts} option={lineOption} style={{ height: 380 }} />
            </div>
          </div>
          <div><div className="bg-white rounded-lg border border-gray-100 px-6 py-4"><h3 className="text-sm font-semibold text-gray-700 mb-3">{year}年 月度现金流量明细</h3></div></div>
          <div className="px-8 pb-8">
            <div className="bg-white rounded-lg border border-gray-100 overflow-visible"><div className="overflow-visible">
              <MobileMonthList mode="cash" />
              <table className="hidden md:table w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">月份</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">现金流入</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">现金流出</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">净流量</th>
                  {supportsInvoices && <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">开票</th>}
                  {supportsInvoices && <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">欠款</th>}
                </tr></thead>
                <tbody>
                  {monthlyData.map(d => {
                    const inc = d.projIncome + d.genIncome;
                    const exp = d.projExpense + d.genExpense;
                    const nf = inc - exp;
                    return (
                      <tr key={d.month} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4 text-gray-700 font-medium">{d.month}</td>
                        <td className="py-3 px-4 text-emerald-600 text-right">{formatMoney(inc)}</td>
                        <td className="py-3 px-4 text-red-500 text-right">{formatMoney(exp)}</td>
                        <td className={`py-3 px-4 text-right font-bold ${nf >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(nf)}</td>
                        {supportsInvoices && <td className="py-3 px-4 text-blue-600 text-right">{formatMoney(d.invoiceAmount)}</td>}
                        {supportsInvoices && <td className={`py-3 px-4 text-right ${(d.invoiceAmount - d.projIncome) > 0 ? 'text-red-500' : 'text-gray-400'}`}>{formatMoney(d.invoiceAmount - d.projIncome)}</td>}
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50/80 font-semibold">
                    <td className="py-3 px-4 text-gray-900">合计</td>
                    <td className="py-3 px-4 text-emerald-600 text-right">{formatMoney(totalIncome)}</td>
                    <td className="py-3 px-4 text-red-500 text-right">{formatMoney(totalExpense)}</td>
                    <td className={`py-3 px-4 text-right ${(totalIncome - totalExpense) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(totalIncome - totalExpense)}</td>
                    {supportsInvoices && <td className="py-3 px-4 text-blue-600 text-right">{formatMoney(totalInvoiceAmount)}</td>}
                    {supportsInvoices && <td className={`py-3 px-4 text-right ${totalInvoiceDebt > 0 ? 'text-red-500' : 'text-gray-400'}`}>{formatMoney(totalInvoiceDebt)}</td>}
                  </tr>
                </tbody>
              </table>
            </div></div>
          </div>
        </>
      )}

      {tab === '经营总览' && (
        <>
          {header('经营总览分析')}{tabBar}
          {reportScopeNote}
          <StatRow labels={['总收入', '总支出', '净利润']} values={[formatMoney(totalIncome), formatMoney(totalExpense), formatMoney(totalProfit)]} accents={['blue', 'red', totalProfit >= 0 ? 'gold' : 'red']} />
          <div>
            <div className="bg-white rounded-lg border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">近6个月收入/支出构成</h3>
              <ReactEChartsCore echarts={echarts} option={overviewBarOption} style={{ height: 380 }} />
            </div>
          </div>
          <div><div className="bg-white rounded-lg border border-gray-100 px-6 py-4"><h3 className="text-sm font-semibold text-gray-700 mb-3">经营总览明细</h3></div></div>
          <div>
            <div className="bg-white rounded-lg border border-gray-100 overflow-visible"><div className="overflow-visible">
              <MobileMonthList mode="overview" />
              <table className="hidden md:table w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">月份</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">项目收入</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">总店收入</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">总收入</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">项目支出</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">总店支出</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">总支出</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">净利润</th>
                </tr></thead>
                <tbody>
                  {monthlyData.map(d => {
                    const inc = d.projIncome + d.genIncome;
                    const exp = d.projExpense + d.genExpense;
                    const pf = inc - exp;
                    return (
                      <tr key={d.month} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4 text-gray-700 font-medium">{d.month}</td>
                        <td className="py-3 px-4 text-emerald-600 text-right">{formatMoney(d.projIncome)}</td>
                        <td className="py-3 px-4 text-emerald-600 text-right">{formatMoney(d.genIncome)}</td>
                        <td className="py-3 px-4 text-emerald-600 text-right font-medium">{formatMoney(inc)}</td>
                        <td className="py-3 px-4 text-red-500 text-right">{formatMoney(d.projExpense)}</td>
                        <td className="py-3 px-4 text-red-500 text-right">{formatMoney(d.genExpense)}</td>
                        <td className="py-3 px-4 text-red-500 text-right font-medium">{formatMoney(exp)}</td>
                        <td className={`py-3 px-4 text-right font-bold ${pf >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(pf)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50/80 font-semibold">
                    <td className="py-3 px-4 text-gray-900">合计</td>
                    <td className="py-3 px-4 text-emerald-600 text-right">{formatMoney(totalProjIncome)}</td>
                    <td className="py-3 px-4 text-emerald-600 text-right">{formatMoney(totalGenIncome)}</td>
                    <td className="py-3 px-4 text-emerald-600 text-right">{formatMoney(totalIncome)}</td>
                    <td className="py-3 px-4 text-red-500 text-right">{formatMoney(totalProjExpense)}</td>
                    <td className="py-3 px-4 text-red-500 text-right">{formatMoney(totalGenExpense)}</td>
                    <td className="py-3 px-4 text-red-500 text-right">{formatMoney(totalExpense)}</td>
                    <td className={`py-3 px-4 text-right ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(totalProfit)}</td>
                  </tr>
                </tbody>
              </table>
            </div></div>
          </div>
        </>
      )}
    </div>
  );
}
