import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { PieChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { formatMoney, formatDate } from '@/utils/format';
import type { Receipt, Expense, AttachmentValue, Contract } from '@/types';
import { isActiveFinanceRecord } from '@/utils/financeLifecycle';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import { useParams } from 'react-router-dom';
import { Paperclip, Download } from 'lucide-react';
import { getAttachmentSummary, normalizeAttachments, openAttachment } from '@/utils/financeAttachments';
import { contractsAPI } from '@/db/api';
import { useSmartBack } from '@/hooks/useSmartBack';

echarts.use([PieChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const palette = ['#d4a843', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];
const CAT_TABS = ['全部', '材料费', '人工费', '外包费', '管理费', '其他'] as const;

import AttachmentViewerModal from '@/components/AttachmentViewerModal';

function isSameContractDoc(a: Contract, b: Contract) {
  const aDocId = a._id || a.id;
  const bDocId = b._id || b.id;
  return aDocId === bDocId || a.id === b.id || (!!a._id && a._id === b.id) || (!!b._id && b._id === a.id);
}

function AttachmentCell({ attachments, onDelete }: { attachments?: AttachmentValue[]; onDelete?: (idx: number) => void }) {
  const [showModal, setShowModal] = useState(false);
  const files = normalizeAttachments(attachments);
  if (files.length === 0) {
    return <span className="text-gray-400 text-[11px]">-</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(true);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-gold-200 bg-gold-50 px-2 py-1 text-xs text-gold-700 hover:bg-gold-100"
        title={files.map((file) => file.name).join('、')}
      >
        <Paperclip size={12} />
        {getAttachmentSummary(files)}
      </button>
      <AttachmentViewerModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        attachments={files} 
        title="凭证附件"
        onDelete={onDelete}
      />
    </>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const smartBack = useSmartBack('/projects');
  const { contracts, receipts, expenses } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const [catTab, setCatTab] = useState<string>('全部');
  const [directContract, setDirectContract] = useState<Contract | null>(null);

  const contract = contracts.find((c) => c.id === id || c._id === id) || directContract;
  const contractIds = useMemo(() => [contract?.id, contract?._id, id].filter(Boolean), [contract, id]);
  const contractId = contract?.id || contract?._id || id;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([contractsAPI.doc(id).get(), contractsAPI.where({ id }).toArray()])
      .then(([direct, byLegacyId]) => {
        const found = direct || byLegacyId[0];
        if (!cancelled) {
          const latestContract = (found || null) as Contract | null;
          setDirectContract(latestContract);
          if (latestContract) {
            useFinanceStore.setState((state) => ({
              contracts: state.contracts.some((item) => isSameContractDoc(item, latestContract))
                ? state.contracts.map((item) => (isSameContractDoc(item, latestContract) ? latestContract : item))
                : [latestContract, ...state.contracts],
              loadedDatasets: Array.from(new Set([...state.loadedDatasets, 'contracts'])),
            }));
          }
        }
      })
      .catch(() => { if (!cancelled) setDirectContract(null); });
    return () => { cancelled = true; };
  }, [id]);
  const projectReceipts = useMemo(() => {
    if (contractIds.length === 0) return [];
    return receipts.filter((r) => contractIds.includes(r.contractId) && r.bizType === currentBizType && isActiveFinanceRecord(r));
  }, [receipts, contractIds, currentBizType]);
  const projectExpenses = useMemo(() => {
    if (contractIds.length === 0) return [];
    return expenses.filter((e) => contractIds.includes(e.contractId) && e.bizType === currentBizType && isActiveFinanceRecord(e));
  }, [expenses, contractIds, currentBizType]);

  const totalReceived = useMemo(() => projectReceipts.reduce((s, r) => s + r.amount, 0), [projectReceipts]);
  const totalCost = useMemo(() => projectExpenses.reduce((s, e) => s + e.amount, 0), [projectExpenses]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    projectExpenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [projectExpenses]);

  const supplierData = useMemo(() => {
    const map: Record<string, number> = {};
    projectExpenses.forEach((e) => { map[e.supplier] = (map[e.supplier] || 0) + e.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [projectExpenses]);

  const pieOption = useMemo(() => {
    if (categoryData.length === 0) return null;
    return {
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
        textStyle: { color: '#374151', fontSize: 12 },
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}：${formatMoney(p.value)} (${p.percent}%)`,
      },
      legend: { bottom: 0, textStyle: { color: '#6b7280', fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['50%', '75%'], center: ['50%', '45%'],
        padAngle: 2, itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: false }, emphasis: { scaleSize: 8 },
        data: categoryData.map((d, i) => ({ ...d, itemStyle: { color: palette[i % palette.length] } })),
      }],
    };
  }, [categoryData]);

  const barOption = useMemo(() => {
    if (supplierData.length === 0) return null;
    const reversed = [...supplierData].reverse();
    return {
      tooltip: {
        trigger: 'axis' as const, axisPointer: { type: 'shadow' as const },
        backgroundColor: '#fff', borderColor: '#e5e7eb', textStyle: { color: '#374151', fontSize: 12 },
        formatter: (p: { name: string; value: number }[]) => `${p[0].name}：${formatMoney(p[0].value)}`,
      },
      grid: { left: '3%', right: '8%', top: 10, bottom: '3%', containLabel: true },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#9ca3af', fontSize: 10 } },
      yAxis: { type: 'category', data: reversed.map(d => d.name), axisLabel: { color: '#6b7280', fontSize: 11, width: 60, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
      series: [{
        type: 'bar', data: reversed.map(d => d.value),
        itemStyle: { color: '#d4a843', borderRadius: [0, 4, 4, 0] }, barMaxWidth: 16,
        label: { show: true, position: 'right', color: '#6b7280', fontSize: 10, formatter: (p: { value: number }) => formatMoney(p.value) },
      }],
    };
  }, [supplierData]);

  const filteredExpenses = useMemo(() => {
    if (catTab === '全部') return projectExpenses;
    return projectExpenses.filter((e) => e.category === catTab);
  }, [projectExpenses, catTab]);

  const filteredTotal = useMemo(() => filteredExpenses.reduce((s, e) => s + e.amount, 0), [filteredExpenses]);

  const laborExpenses = useMemo(() => projectExpenses.filter((e) => e.category === '人工费'), [projectExpenses]);
  const laborGroups = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    laborExpenses.forEach((e) => { if (!map[e.supplier]) map[e.supplier] = []; map[e.supplier].push(e); });
    return Object.entries(map).sort((a, b) => {
      const sa = a[1].reduce((s, e) => s + e.amount, 0);
      const sb = b[1].reduce((s, e) => s + e.amount, 0);
      return sb - sa;
    });
  }, [laborExpenses]);

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-gray-400 text-sm mb-4">项目不存在</p>
        <button onClick={() => smartBack()} className="erp-btn-secondary">
          <ArrowLeft size={14} className="inline mr-1" />返回项目列表
        </button>
      </div>
    );
  }

  const expenseColumns = [
    { key: 'supplier', title: '收款方' },
    { key: 'amount', title: '金额', render: (e: Expense) => <span className="text-red-500 font-medium">{formatMoney(e.amount)}</span> },
    { key: 'expenseDate', title: '日期', render: (e: Expense) => formatDate(e.expenseDate) },
    { key: 'remark', title: '备注', render: (e: Expense) => e.remark || '-' },
    { key: 'attachments', title: '凭证', render: (e: Expense) => <AttachmentCell attachments={e.attachments} onDelete={async (idx) => {
            try {
              const newAttachments = [...(e.attachments || [])];
              newAttachments.splice(idx, 1);
              await useFinanceStore.getState().updateExpense({ ...e, attachments: newAttachments });
            } catch (err: any) {
              alert('删除附件失败: ' + (err?.message || '未知错误'));
            }
    }} /> },
  ];

  const receiptColumns = [
    { key: 'receiptDate', title: '日期', render: (r: Receipt) => formatDate(r.receiptDate) },
    { key: 'stage', title: '阶段' },
    { key: 'paymentMethod', title: '方式' },
    { key: 'amount', title: '金额', render: (r: Receipt) => <span className="text-emerald-600 font-medium">{formatMoney(r.amount)}</span> },
    { key: 'attachments', title: '凭证', render: (r: Receipt) => <AttachmentCell attachments={r.attachments} onDelete={async (idx) => {
            try {
              const newAttachments = [...(r.attachments || [])];
              newAttachments.splice(idx, 1);
              await useFinanceStore.getState().updateReceipt({ ...r, attachments: newAttachments });
            } catch (err: any) {
              alert('删除附件失败: ' + (err?.message || '未知错误'));
            }
    }} /> },
  ];

  return (
    <div className="erp-page-spaced">
      {/* 头部 */}
      <div className="flex items-center gap-4">
        <button onClick={() => smartBack()} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{contract.houseAddress} - {contract.contractNo}</h1>
          <p className="text-gold-500 text-sm">项目成本详情</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard title="合同金额" value={formatMoney(contract.contractAmount)} icon={FileText} accent="gold" />
        <StatCard title="已收款" value={formatMoney(totalReceived)} icon={TrendingUp} accent="emerald" />
        <StatCard title="总成本" value={formatMoney(totalCost)} icon={TrendingDown} accent="red" />
      </div>

      {/* 支出双维度分析区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 按类别分类 */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">按类别分类</h3>
          {pieOption ? (
            <ReactEChartsCore echarts={echarts} option={pieOption} style={{ height: 240 }} notMerge />
          ) : (
            <p className="text-center text-gray-400 text-sm py-16">暂无支出数据</p>
          )}
          {categoryData.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {categoryData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: palette[idx % palette.length] }} />
                    <span className="text-gray-600">{item.name}</span>
                  </div>
                  <span className="text-gray-800 font-medium">{formatMoney(item.value)}（{totalCost > 0 ? ((item.value / totalCost) * 100).toFixed(1) : 0}%）</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 按收款方分类 */}
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">按收款方分类</h3>
          {barOption ? (
            <ReactEChartsCore echarts={echarts} option={barOption} style={{ height: 240 }} notMerge />
          ) : (
            <p className="text-center text-gray-400 text-sm py-16">暂无支出数据</p>
          )}
          {supplierData.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {supplierData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[140px]">{item.name}</span>
                  <span className="text-gray-800 font-medium">{formatMoney(item.value)}（{totalCost > 0 ? ((item.value / totalCost) * 100).toFixed(1) : 0}%）</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 支出明细 - 按类别 */}
      <div>
        <div className="bg-white rounded-lg border border-gray-100 overflow-visible">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">支出明细 - 按类别</h3>
            <span className="text-sm text-red-500 font-medium">合计：{formatMoney(filteredTotal)}</span>
          </div>
          <div className="px-5 pb-2 flex flex-wrap items-center gap-0 border-b border-gray-100">
            {CAT_TABS.map((tab) => (
              <button key={tab} onClick={() => setCatTab(tab)} className={`px-3 py-2 text-xs font-medium transition-colors relative ${catTab === tab ? 'text-gold-500' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab}
                {catTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 rounded-full" />}
              </button>
            ))}
          </div>
          <DataTable columns={expenseColumns} data={filteredExpenses} emptyText="暂无支出记录" rowKey={(e) => String(e.id)} />
        </div>
      </div>

      {/* 收入明细 */}
      <div>
        <div className="bg-white rounded-lg border border-gray-100 overflow-visible">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">收入明细</h3>
            <span className="text-sm text-emerald-600 font-medium">合计：{formatMoney(totalReceived)}</span>
          </div>
          <DataTable columns={receiptColumns} data={projectReceipts} emptyText="暂无收入记录" rowKey={(r) => String(r.id)} />
        </div>
      </div>
    </div>
  );
}
