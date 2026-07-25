import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Calendar, DollarSign, Eye, Edit3, Trash2 } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { useDialogStore } from '@/store/dialogStore';
import { formatDate } from '@/utils/format';
import { Quotation } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-500',
  '已发送': 'bg-blue-50 text-blue-600',
  '已确认': 'bg-emerald-50 text-emerald-600',
  '已作废': 'bg-red-50 text-red-500',
};

export default function QuotesBiz() {
  const navigate = useNavigate();
  const { quotations, deleteQuotation } = useFinanceStore();
  const { showConfirm } = useDialogStore();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleting, setDeleting] = useState(false);

  const stats = useMemo(() => {
    const s = { total: quotations.length, draft: 0, confirmed: 0, totalAmount: 0 };
    quotations.forEach(q => {
      if (q.status === '草稿') s.draft++;
      if (q.status === '已确认') s.confirmed++;
      s.totalAmount += Number(q.amount) || 0;
    });
    return s;
  }, [quotations]);

  const filtered = useMemo(() => {
    return quotations
      .filter(q => {
        if (filterStatus !== 'all' && q.status !== filterStatus) return false;
        if (search) {
          const lower = search.toLowerCase();
          const matchName = q.customerName?.toLowerCase().includes(lower);
          const matchNo = q.contractNo?.toLowerCase().includes(lower);
          const matchVersion = q.version?.toLowerCase().includes(lower);
          if (!matchName && !matchNo && !matchVersion) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [quotations, filterStatus, search]);

  const handleDelete = async (id: string) => {
    if (deleting) return;
    const confirmed = await showConfirm('确定删除该报价单吗？该操作不可恢复。');
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteQuotation(id);
    } finally {
      setDeleting(false);
    }
  };

  const handleView = (q: Quotation) => {
    if (q.contractId) {
      navigate(`/quotation-builder/contract/${q.contractId}/${q.id}?mode=view`);
    } else if (q.leadId) {
      navigate(`/quotation-builder/lead/${q.leadId}/${q.id}?mode=view`);
    }
  };

  return (
    <div className="erp-page space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base md:text-xl font-bold text-gray-900">报价单管理</h1>
          <p className="text-xs md:text-sm text-gold-500">管理客户的报价清单与版本记录</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">全部报价</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">草稿</p>
          <p className="text-2xl font-bold text-gray-900">{stats.draft}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">已确认</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.confirmed}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">总金额</p>
          <p className="text-2xl font-bold text-gold-600">¥{stats.totalAmount.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-visible flex flex-col">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="搜索客户名称、编号..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 transition-colors" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 transition-colors bg-white">
            <option value="all">全部状态</option>
            <option value="草稿">草稿</option>
            <option value="已发送">已发送</option>
            <option value="已确认">已确认</option>
            <option value="已作废">已作废</option>
          </select>
        </div>

        <div className="overflow-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">客户 / 编号</th>
                <th className="px-6 py-3 font-medium">版本</th>
                <th className="px-6 py-3 font-medium">金额</th>
                <th className="px-6 py-3 font-medium">状态</th>
                <th className="px-6 py-3 font-medium">创建日期</th>
                <th className="px-6 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filtered.map(q => (
                <tr key={q.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <FileText size={16} className="text-gray-500" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{q.customerName || '未知客户'}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{(q.contractId ? '合同:' : '客户:')} {q.contractNo || q.leadId || q.id.slice(-6)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-700">{q.version}</td>
                  <td className="px-6 py-4 font-bold text-gray-900">¥{(q.amount || 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[q.status]}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{formatDate(q.createdAt)}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => handleView(q)} className="p-1.5 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors" title="查看">
                      <Eye size={16} />
                    </button>
                    <button onClick={() => handleDelete(q.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="删除">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 mb-3">
                      <FileText size={24} className="text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-sm">暂无报价记录</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
