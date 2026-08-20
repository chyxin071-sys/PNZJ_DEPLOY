import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, User, X,
  FileText, PenTool, DollarSign, HardHat, TrendingDown,
} from 'lucide-react';
import dayjs from 'dayjs';
import { leadsAPI, projectsAPI, quotesAPI, contractsAPI, receiptsAPI, expensesAPI, usersAPI } from '@/db/api';
import { useAuthStore, hasRole, canViewFinancialData } from '@/store/authStore';
import { formatDate, formatMoney } from '@/utils/format';
import DataTable from '@/components/DataTable';
import BottomDrawer from '@/components/BottomDrawer';
import Select from '@/components/Select';
import DatePicker from '@/components/DatePicker';
import { buildProjectProgressSummary } from '@/utils/projectProgress';

const SIGNED_LEAD_FIELDS = { _id: true, name: true, phone: true, address: true, status: true, sales: true, designer: true, manager: true, signer: true, signDate: true, updatedAt: true };
const SIGNED_PROJECT_FIELDS = { _id: true, leadId: true, relatedCustomerId: true, status: true, nodesData: true };
const SIGNED_QUOTE_FIELDS = { _id: true, id: true, leadId: true };

const toPersonArray = (val: string | string[] | undefined | null): string[] => {
  if (Array.isArray(val)) return val.flatMap(v => typeof v === 'string' ? v.split(/[,，、\s]+/).filter(Boolean) : []);
  if (val && val !== '未分配' && val !== '') return val.split(/[,，、\s]+/).filter(Boolean);
  return [];
};

function LinkBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:border-gold-400 hover:text-gold-600 hover:bg-gold-50 transition-colors whitespace-nowrap"
    >
      <Icon size={11} />
      <span>{label}</span>
    </button>
  );
}

function ProgressBar({ percent, color = 'bg-emerald-500' }: { percent: number; color?: string }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex items-center gap-1.5 min-w-[60px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-[11px] text-gray-500 w-8 text-right">{Math.round(p)}%</span>
    </div>
  );
}

export default function SignedContracts() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = hasRole(user?.roles, 'admin', user?.role);
  const canViewFinance = canViewFinancialData(user?.roles, user?.role);
  const myName = user?.name || '';

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);

  // 筛选条件
  const [filterReceipt, setFilterReceipt] = useState('全部'); // 全部 | 未收完 | 已收全
  const [filterSite, setFilterSite] = useState('全部');       // 全部 | 未开工 | 进行中 | 已完工
  const [filterSales, setFilterSales] = useState('');          // 销售姓名
  const [filterDesigner, setFilterDesigner] = useState('');    // 设计姓名
  const [filterManager, setFilterManager] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // 分配人员 modal
  const [assignTarget, setAssignTarget] = useState<{ lead: any; role: string } | null>(null);
  const [assignSelected, setAssignSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await usersAPI.toArray();
      setEmployees(data.filter((u: any) => u.status !== 'inactive'));
    } catch {}
  }, []);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [allLeads, allProjects, allQuotes, allContracts, allReceipts, allExpenses] = await Promise.all([
        leadsAPI.toArray(SIGNED_LEAD_FIELDS),
        projectsAPI.toArray(SIGNED_PROJECT_FIELDS),
        quotesAPI.toArray(SIGNED_QUOTE_FIELDS),
        contractsAPI.toArray(),
        receiptsAPI.toArray(),
        canViewFinance ? expensesAPI.toArray() : Promise.resolve([]),
      ]);

      const signedLeads = allLeads.filter((l: any) => l.status === '已签单');

      const merged = signedLeads.map((lead: any) => {
        const relatedProjects = allProjects.filter((p: any) =>
          p.leadId === lead._id || p.relatedCustomerId === lead._id
        );
        const relatedQuotes = allQuotes.filter((q: any) =>
          q.leadId === lead._id
        );
        const relatedContracts = allContracts.filter((c: any) =>
          c.customerName === lead.name && c.customerPhone === lead.phone
        );

        const totalContractAmount = relatedContracts.reduce((sum: number, c: any) => sum + (c.contractAmount || 0), 0);
        const settledAmount = relatedContracts.reduce((sum: number, c: any) => {
          return sum + allReceipts.filter((r: any) => r.contractId === c.id).reduce((s: number, r: any) => s + (r.amount || 0), 0);
        }, 0);
        const receiptPercent = totalContractAmount > 0 ? (settledAmount / totalContractAmount) * 100 : 0;
        const totalExpense = canViewFinance ? relatedContracts.reduce((sum: number, c: any) => {
          return sum + allExpenses.filter((e: any) => e.contractId === c.id).reduce((s: number, e: any) => s + (e.amount || 0), 0);
        }, 0) : 0;
        const costRatio = settledAmount > 0 ? (totalExpense / settledAmount) * 100 : 0;

        const primaryProject = relatedProjects[0] || null;
        let constructionProgress = 0;
        let currentNodeName = '';
        const nodesData = Array.isArray(primaryProject?.nodesData)
          ? primaryProject.nodesData
          : (Array.isArray(primaryProject?.nodes) ? primaryProject.nodes : []);
        if (nodesData.length > 0) {
          const summary = buildProjectProgressSummary(nodesData);
          constructionProgress = summary.progressPercent;
          currentNodeName = summary.currentNodeName;
        }

        return {
          _id: lead._id,
          name: lead.name || '',
          phone: lead.phone || '',
          address: lead.address || '',
          sales: lead.sales || [],
          designer: lead.designer || [],
          manager: lead.manager || [],
          signDate: lead.signDate || lead.updatedAt || '',
          signer: lead.signer || '',
          contractAmount: totalContractAmount,
          settledAmount,
          receiptPercent,
          totalExpense,
          costRatio,
          constructionProgress,
          currentNodeName,
          projectId: primaryProject?._id || '',
          contractId: relatedContracts[0]?.id || '',
          quoteId: relatedQuotes[0]?.id || '',
        };
      });

      setItems(merged);
    } catch (e) {
      console.error('加载签单数据失败:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canViewFinance]);

  useEffect(() => { fetchAll(); fetchEmployees(); }, [fetchAll, fetchEmployees]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchAll(true);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchAll]);

  // 保存滚动位置
  const scrollPosKey = 'signed_contracts_scroll';
  useEffect(() => {
    const saved = sessionStorage.getItem(scrollPosKey);
    if (saved) {
      sessionStorage.removeItem(scrollPosKey);
      const container = document.querySelector('[data-scroll="main"]');
      if (container) {
        queueMicrotask(() => container.scrollTo(0, parseInt(saved, 10)));
      }
    }
  }, []);
  const saveScroll = useCallback(() => {
    const container = document.querySelector('[data-scroll="main"]');
    if (container) {
      sessionStorage.setItem(scrollPosKey, String(container.scrollTop));
    }
  }, []);

  const handleQuickAssign = async (leadId: string, role: string, persons: string[]) => {
    if (assigning) return;
    setAssigning(true);
    try {
      await leadsAPI.update(leadId, { [role]: persons, updatedAt: new Date().toISOString() });
      // 同步关联工地和报价
      try {
        const [relatedProjects, relatedQuotes] = await Promise.all([
          projectsAPI.where({ leadId }).toArray(),
          quotesAPI.where({ leadId }).toArray(),
        ]);
        await Promise.all([
          ...relatedProjects.map((p: any) => projectsAPI.update(p._id, { [role]: persons })),
          ...relatedQuotes.map((q: any) => quotesAPI.update(q._id, { [role]: persons })),
        ]);
      } catch (e) { console.error('同步跟进人员失败:', e); }
      setAssignTarget(null);
      // 本地更新
      setItems(prev => prev.map(item =>
        item._id === leadId ? { ...item, [role]: persons } : item
      ));
    } finally {
      setAssigning(false);
    }
  };

  const filtered = items
    .filter(item => {
      if (!search) return true;
      const q = search.toLowerCase();
      return item.name?.toLowerCase().includes(q) || item.phone?.includes(q) || item.address?.toLowerCase().includes(q);
    })
    // 收款状态筛选
    .filter(item => {
      if (filterReceipt === '全部') return true;
      if (filterReceipt === '已收全') return item.receiptPercent >= 100;
      if (filterReceipt === '未收完') return item.receiptPercent < 100;
      return true;
    })
    // 工地进度筛选
    .filter(item => {
      if (filterSite === '全部') return true;
      if (filterSite === '未开工') return item.constructionProgress === 0;
      if (filterSite === '已完工') return item.constructionProgress >= 100;
      if (filterSite === '进行中') return item.constructionProgress > 0 && item.constructionProgress < 100;
      return true;
    })
    // 跟进人员筛选
    .filter(item => {
      if (filterSales && !toPersonArray(item.sales).some((n: string) => n.includes(filterSales))) return false;
      if (filterDesigner && !toPersonArray(item.designer).some((n: string) => n.includes(filterDesigner))) return false;
      if (filterManager && !toPersonArray(item.manager).some((n: string) => n.includes(filterManager))) return false;
      return true;
    })
    // 签单时间范围筛选
    .filter(item => {
      if (!filterDateFrom && !filterDateTo) return true;
      const d = item.signDate ? dayjs(item.signDate) : null;
      if (!d) return false;
      if (filterDateFrom && d.isBefore(dayjs(filterDateFrom), 'day')) return false;
      if (filterDateTo && d.isAfter(dayjs(filterDateTo), 'day')) return false;
      return true;
    })
    .sort((a, b) => {
      if (!sortField || !sortOrder) {
        return new Date(b.signDate || 0).getTime() - new Date(a.signDate || 0).getTime();
      }
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal, 'zh-CN') : (aVal as number) - (bVal as number);
      return sortOrder === 'asc' ? cmp : -cmp;
    });

  const handleSort = (field: string) => {
    if (sortField !== field) { setSortField(field); setSortOrder('desc'); }
    else if (sortOrder === 'desc') setSortOrder('asc');
    else { setSortField(null); setSortOrder(null); }
  };

  // 参与过滤后的员工列表
  const salesOptions = employees
    .filter(e => hasRole(e.roles, 'sales', e.role))
    .map(e => ({ value: e.name, label: e.name }));
  const designerOptions = employees
    .filter(e => hasRole(e.roles, 'designer', e.role))
    .map(e => ({ value: e.name, label: e.name }));
  const managerOptions = employees
    .filter(e => hasRole(e.roles, 'manager', e.role))
    .map(e => ({ value: e.name, label: e.name }));

  const renderAssigneeCol = (role: keyof typeof ROLE_COLORS, label: string, roleOpt: { value: string; label: string }[]) => (
    (row: any) => {
      const names: string[] = Array.isArray(row[role]) ? row[role] : toPersonArray(row[role]);
      const color = ROLE_COLORS[role];
      return (
        <div className="flex items-center gap-1 whitespace-nowrap" onClick={e => e.stopPropagation()}>
          {names.length > 0 ? names.map((n: string) => (
            <span
              key={n}
              onClick={() => { setAssignSelected(names); setAssignTarget({ lead: row, role }); }}
              className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded ${color} cursor-pointer hover:opacity-80`}
            >{n}</span>
          )) : (
            <button
              onClick={() => { setAssignSelected([]); setAssignTarget({ lead: row, role }); }}
              className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-gold-400 hover:text-gold-600 hover:bg-gold-50 transition-colors"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              {label}
            </button>
          )}
        </div>
      );
    }
  );

  const activeFilters = [filterReceipt !== '全部', filterSite !== '全部', !!filterSales, !!filterDesigner, !!filterManager, !!(filterDateFrom || filterDateTo)].filter(Boolean).length;

  const clearFilters = () => {
    setFilterReceipt('全部'); setFilterSite('全部');
    setFilterSales(''); setFilterDesigner(''); setFilterManager('');
    setFilterDateFrom(''); setFilterDateTo('');
  };

  // 统计看板数据
  const stats = useMemo(() => {
    const totalCount = items.length;
    const totalContract = items.reduce((s, i) => s + (i.contractAmount || 0), 0);
    const totalSettled = items.reduce((s, i) => s + (i.settledAmount || 0), 0);
    const totalExpense = items.reduce((s, i) => s + (i.totalExpense || 0), 0);
    const totalProfit = totalSettled - totalExpense;
    const profitMargin = totalSettled > 0 ? (totalProfit / totalSettled) * 100 : 0;
    return { totalCount, totalContract, totalSettled, totalExpense, totalProfit, profitMargin };
  }, [items]);

  const STAT_CARDS = [
    { label: '签单总数', value: `${stats.totalCount} 单`, color: 'text-gray-900', bg: '' },
    { label: '合同总金额', value: formatMoney(stats.totalContract), color: 'text-gray-900', bg: '' },
    { label: '已收总额', value: formatMoney(stats.totalSettled), color: 'text-emerald-600', bg: 'bg-emerald-50' },
    ...(canViewFinance ? [
      { label: '毛利润合计', value: formatMoney(stats.totalProfit), color: stats.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500', bg: stats.totalProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
      { label: '毛利率', value: `${stats.profitMargin.toFixed(1)}%`, color: stats.profitMargin >= 0 ? 'text-emerald-600' : 'text-red-500', bg: stats.profitMargin >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
    ] : []),
  ];

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">签单管理</h1>
          <p className="erp-page-subtitle">{items.length} 个已签单客户</p>
        </div>
      </div>

      {/* 统计看板 */}
      <div className="px-3 md:px-4 mb-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STAT_CARDS.map((card) => (
            <div key={card.label} className={`flex h-20 flex-col justify-center rounded border border-gray-100 px-4 py-3 ${card.bg}`}>
              <div className="text-[10px] text-gray-400 mb-1">{card.label}</div>
              <div className={`text-sm font-bold ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="erp-surface">
          <div className="erp-search-row">
            <div className="erp-search-field">
              <Search size={14} className="erp-search-icon" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索客户姓名、电话、地址" className="erp-search-input" />
            </div>
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`erp-filter-button ${showFilter ? 'erp-filter-button-active' : 'erp-filter-button-idle'} ${activeFilters > 0 ? 'bg-gold-50 text-gold-600 border-gold-200' : ''}`}
            >
              <Filter size={13} /> <span>筛选</span>
              {activeFilters > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold-400 text-white text-[10px] font-bold">{activeFilters}</span>
              )}
            </button>
          </div>

          {activeFilters > 0 && (
            <div className="md:hidden flex items-center justify-between gap-3 border-b border-gold-100 bg-gold-50/50 px-3 py-2">
              <span className="min-w-0 truncate text-xs text-gray-600">
                已筛选：{filterManager || filterSales || filterDesigner || `${activeFilters} 项条件`}
              </span>
              <button type="button" onClick={clearFilters} className="shrink-0 text-xs font-medium text-gold-600">清除筛选</button>
            </div>
          )}

          {/* 筛选面板 */}
          {showFilter && (
            <div className="erp-filter-panel">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {/* 收款状态 */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">收款状态</label>
                  <Select value={filterReceipt} onChange={setFilterReceipt} options={[
                    { value: '全部', label: '全部' },
                    { value: '未收完', label: '未收完' },
                    { value: '已收全', label: '已收全' },
                  ]} />
                </div>
                {/* 工地进度 */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">工地进度</label>
                  <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold-400">
                    <option value="全部">全部</option>
                    <option value="未开工">未开工</option>
                    <option value="进行中">进行中</option>
                    <option value="已完工">已完工</option>
                  </select>
                </div>
                {/* 销售 */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">销售</label>
                  <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold-400">
                    <option value="">全部</option>
                    {salesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {/* 设计 */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">设计</label>
                  <select value={filterDesigner} onChange={e => setFilterDesigner(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold-400">
                    <option value="">全部</option>
                    {designerOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                {/* 工程 */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">项目经理</label>
                  <Select value={filterManager} onChange={setFilterManager} searchable
                    options={[{ value: '', label: '全部' }, ...managerOptions.map(o => ({ value: o.value, label: o.label }))]} />
                </div>
                {/* 签单时间 */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">签单时间 从</label>
                  <DatePicker mode="single" value={filterDateFrom} onChange={setFilterDateFrom} placeholder="起始日期" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">签单时间 至</label>
                  <DatePicker mode="single" value={filterDateTo} onChange={setFilterDateTo} placeholder="截止日期" />
                </div>
                {/* 清除 */}
                <div className="flex items-end">
                  <button onClick={clearFilters}
                    className="w-full flex items-center justify-center gap-1 border border-gray-200 rounded px-3 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors duration-150">
                    <X size={14} /> 清除
                  </button>
                </div>
              </div>
            </div>
          )}

        {loading ? (
          <div className="py-20 text-center text-gray-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-400 text-sm">暂无签单数据</div>
        ) : (
          <DataTable
            columns={[
              { key: 'address', title: '项目地址', sortable: true, truncate: true, render: (row: any) => (
                <span className="text-gray-900">{row.address || '-'}</span>
              )},
              { key: 'name', title: '客户姓名', render: (row: any) => (
                <span className="text-gray-900">{row.name || '-'}</span>
              )},
              { key: 'phone', title: '联系方式', render: (row: any) => (
                <span className="text-gray-600">{row.phone || '-'}</span>
              )},
              { key: 'leadLink', title: '客户信息', width: '90px', render: (row: any) => (
                <LinkBtn icon={User} label="客户信息" onClick={() => { saveScroll(); navigate(`/leads/${row._id}`, { state: { from: '/signed-contracts' } }); }} />
              )},
              { key: 'quoteLink', title: '报价', width: '80px', render: (row: any) => (
                row.quoteId ? (
                  <LinkBtn icon={PenTool} label="报价" onClick={() => { saveScroll(); navigate(`/quotes-biz/${row.quoteId}`, { state: { from: '/signed-contracts' } }); }} />
                ) : <span className="text-[11px] text-gray-300">-</span>
              )},
              { key: 'contractLink', title: '合同', width: '80px', render: (row: any) => (
                row.contractId ? (
                  <LinkBtn icon={FileText} label="合同" onClick={() => { saveScroll(); navigate(`/contracts/${row.contractId}`, { state: { from: '/signed-contracts' } }); }} />
                ) : <span className="text-[11px] text-gray-300">-</span>
              )},
              { key: 'contractAmount', title: '合同金额', sortable: true, render: (row: any) => (
                <span className="font-medium text-gray-900 whitespace-nowrap">¥{row.contractAmount.toLocaleString()}</span>
              )},
              { key: 'settledAmount', title: '结算金额', sortable: true, render: (row: any) => (
                <span className="text-gray-700 whitespace-nowrap">¥{row.settledAmount.toLocaleString()}</span>
              )},
              { key: 'receiptPercent', title: '收款进度', render: (row: any) => (
                <ProgressBar percent={row.receiptPercent} color={row.receiptPercent >= 100 ? 'bg-emerald-500' : row.receiptPercent >= 50 ? 'bg-amber-400' : 'bg-red-400'} />
              )},
              { key: 'incomeLink', title: '客户收款', width: '90px', render: (row: any) => (
                row.contractId ? (
                  <LinkBtn
                    icon={DollarSign}
                    label={canViewFinance ? '收款明细' : '录入收款'}
                    onClick={() => {
                      saveScroll();
                      navigate(canViewFinance ? `/income?contractId=${row.contractId}` : `/contracts/${row.contractId}`);
                    }}
                  />
                ) : <span className="text-[11px] text-gray-300">-</span>
              )},
              { key: 'unsettledAmount', title: '未收金额', sortable: true, render: (row: any) => {
                const unsettled = row.contractAmount - row.settledAmount;
                return <span className={`font-medium whitespace-nowrap ${unsettled > 0 ? 'text-red-500' : 'text-gray-400'}`}>¥{unsettled.toLocaleString()}</span>;
              }},
              ...(canViewFinance ? [
                { key: 'grossProfit', title: '毛利润', sortable: true, render: (row: any) => {
                  const profit = row.settledAmount - row.totalExpense;
                  return <span className={`font-medium whitespace-nowrap ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>¥{profit.toLocaleString()}</span>;
                }},
                { key: 'totalExpense', title: '项目支出', sortable: true, render: (row: any) => (
                  <span className="text-gray-700 whitespace-nowrap">¥{row.totalExpense.toLocaleString()}</span>
                )},
                { key: 'costRatio', title: '成本分析', width: '100px', render: (row: any) => (
                  row.contractId ? (
                    <LinkBtn
                      icon={TrendingDown}
                      label={`成本分析 ${row.settledAmount > 0 ? Math.round(row.costRatio) + '%' : '-'}`}
                      onClick={() => { saveScroll(); navigate(`/projects?contractId=${row.contractId}`); }}
                    />
                  ) : <span className="text-[11px] text-gray-300">-</span>
                )},
              ] : []),
              { key: 'constructionProgress', title: '工地进度', render: (row: any) => (
                <div className="flex flex-col gap-0.5 min-w-[100px]">
                  <ProgressBar percent={row.constructionProgress} color="bg-blue-500" />
                  {row.currentNodeName && <span className="text-[10px] text-gray-400 truncate">{row.currentNodeName}</span>}
                </div>
              )},
              { key: 'siteLink', title: '工地详情', width: '90px', render: (row: any) => (
                row.projectId ? (
                  <LinkBtn icon={HardHat} label="工地详情" onClick={() => { saveScroll(); navigate(`/projects-biz/${row.projectId}`, { state: { from: '/signed-contracts' } }); }} />
                ) : <span className="text-[11px] text-gray-300">-</span>
              )},
              { key: 'sales', title: '销售', render: renderAssigneeCol('sales', '销售', salesOptions) },
              { key: 'designer', title: '设计', render: renderAssigneeCol('designer', '设计', designerOptions) },
              { key: 'manager', title: '项目经理', render: renderAssigneeCol('manager', '工程', managerOptions) },
              { key: 'signDate', title: '签单时间', sortable: true, width: '90px', render: (row: any) => (
                <span className="text-gray-500 whitespace-nowrap">{formatDate(row.signDate)}</span>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
            rowKey={(row) => (row as any)._id as string}
            mobileFixedLeft={0}
            horizontalScroll
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            emptyText="暂无签单数据"
          />
        )}
      </div>

      {/* Quick Assign Modal — 桌面端 */}
      {assignTarget && (
        <>
          <div className="hidden md:block">
            {createPortal(
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAssignTarget(null)}>
              <div className="bg-white rounded w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">
                    分配{assignTarget.role === 'sales' ? '销售' : assignTarget.role === 'designer' ? '设计师' : '工程'} — {assignTarget.lead.name}
                  </h3>
                </div>
                <div className="p-3 max-h-64 overflow-y-auto scrollbar-hide space-y-1">
                  {(() => {
                    const opts = assignTarget.role === 'sales' ? salesOptions : assignTarget.role === 'designer' ? designerOptions : managerOptions;
                    return opts.length > 0 ? opts.map(opt => {
                      const checked = assignSelected.includes(opt.value);
                      return (
                        <label key={opt.value} className="flex items-center gap-2.5 px-3 py-2.5 rounded hover:bg-gold-50 cursor-pointer transition-colors">
                          <input type="checkbox" checked={checked} onChange={() => {
                            setAssignSelected(prev => checked ? prev.filter(x => x !== opt.value) : [...prev, opt.value]);
                          }} className="w-4 h-4 text-gold-400 border-gray-300 rounded focus:ring-gold-400" />
                          <span className="text-sm text-gray-700">{opt.label}</span>
                        </label>
                      );
                    }) : <div className="text-sm text-gray-400 text-center py-6">暂无可分配人员</div>;
                  })()}
                </div>
                <div className="p-3 border-t border-gray-100 flex justify-end gap-2">
                  <button disabled={assigning} onClick={() => setAssignTarget(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40">取消</button>
                  <button disabled={assigning} onClick={() => handleQuickAssign(assignTarget.lead._id, assignTarget.role, assignSelected)} className="px-4 py-1.5 text-xs bg-gold-400 text-black rounded font-medium hover:bg-gold-500 disabled:opacity-50">
                    {assigning ? '保存中...' : '确认'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
            )}
          </div>

          {/* Quick Assign — 移动端底部抽屉 */}
          <BottomDrawer open={!!assignTarget} onClose={() => setAssignTarget(null)} title={`分配${assignTarget.role === 'sales' ? '销售' : assignTarget.role === 'designer' ? '设计师' : '工程'} — ${assignTarget.lead.name}`}>
            <div className="space-y-1 pb-4">
              {(() => {
                const opts = assignTarget.role === 'sales' ? salesOptions : assignTarget.role === 'designer' ? designerOptions : managerOptions;
                return opts.length > 0 ? opts.map(opt => {
                  const checked = assignSelected.includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-3 px-4 py-3 rounded hover:bg-gold-50 cursor-pointer transition-colors">
                      <input type="checkbox" checked={checked} onChange={() => {
                        setAssignSelected(prev => checked ? prev.filter(x => x !== opt.value) : [...prev, opt.value]);
                      }} className="w-5 h-5 text-gold-400 border-gray-300 rounded focus:ring-gold-400" />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  );
                }) : <div className="text-sm text-gray-400 text-center py-8">暂无可分配人员</div>;
              })()}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button disabled={assigning} onClick={() => setAssignTarget(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40">取消</button>
              <button disabled={assigning} onClick={() => handleQuickAssign(assignTarget.lead._id, assignTarget.role, assignSelected)} className="px-6 py-2 text-sm bg-gold-400 text-black rounded font-medium hover:bg-gold-500 disabled:opacity-50">
                {assigning ? '保存中...' : '确认'}
              </button>
            </div>
          </BottomDrawer>
        </>
      )}
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  sales: 'bg-blue-50 text-blue-600',
  designer: 'bg-violet-50 text-violet-600',
  manager: 'bg-amber-50 text-amber-600',
};
