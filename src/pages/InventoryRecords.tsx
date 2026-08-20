import { useState, useEffect } from 'react';
import { Search, ArrowLeft, X, ChevronLeft, ChevronRight, FileText, ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react';
import { inventoryRecordsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';
import { useSmartBack } from '@/hooks/useSmartBack';

const PAGE_SIZE = 30;

export default function InventoryRecords() {
  const smartBack = useSmartBack('/materials');
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isFinance = user?.role === 'finance';
  const canSeeAll = isAdmin || isFinance;
  const myName = user?.name || '';

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        setRecords(await inventoryRecordsAPI.toArray());
      } catch { setRecords([]); }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = records.filter((r: any) => {
    // 非管理员/财务只看自己操作的记录
    if (!canSeeAll && r.operator !== myName) return false;
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.spec || '').toLowerCase().includes(q)
        && !(r.color || '').toLowerCase().includes(q)
        && !(r.brand || '').toLowerCase().includes(q)
        && !(r.materialName || '').toLowerCase().includes(q)
        && !(r.operator || '').toLowerCase().includes(q)
        && !(r.remark || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const inCount = records.filter((r: any) => r.type === 'in').length;
  const outCount = records.filter((r: any) => r.type === 'out').length;

  return (
    <div className="erp-page">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => smartBack()} className="p-2 hover:bg-gray-100 rounded transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-base md:text-lg font-bold text-gray-900">出入库记录</h1>
          <p className="text-gold-500 text-xs md:text-sm">查看所有材料的出入库操作记录</p>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-1.5 md:grid md:grid-cols-3 md:gap-3 mb-4 scrollbar-hide -mx-1 px-1">
        <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded p-2.5 md:p-4 border-2 border-transparent bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] md:text-xs text-gray-400">总记录数</span>
            <FileText size={14} className="text-gray-300" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-gray-900">{records.length}</p>
        </div>
        <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded p-2.5 md:p-4 border-2 border-transparent bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] md:text-xs text-gray-400">入库次数</span>
            <ArrowDownCircle size={14} className="text-gray-300" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-emerald-600">{inCount}</p>
        </div>
        <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded p-2.5 md:p-4 border-2 border-transparent bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] md:text-xs text-gray-400">出库次数</span>
            <ArrowUpCircle size={14} className="text-gray-300" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-red-500">{outCount}</p>
        </div>
      </div>

      <div className="bg-white rounded border border-gray-100">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 border-b border-gray-100">
          <div className="flex gap-1.5">
            {([
              { key: 'all', label: '全部' },
              { key: 'in', label: '入库' },
              { key: 'out', label: '出库' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => { setFilterType(f.key); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filterType === f.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 relative w-full sm:w-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="搜索型号、色号、品牌、操作人..."
              className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-50 rounded focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {paged.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            {loading ? <Loader2 size={16} className="animate-spin mx-auto mb-2" /> : null}
            {loading ? '加载中...' : records.length === 0 ? '暂无出入库记录' : '没有匹配的记录'}
          </div>
        ) : (
          <>
            <div className="overflow-visible">
              <table className="w-full text-left hidden md:table">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                    <th className="py-3 px-4 font-medium">时间</th>
                    <th className="py-3 px-4 font-medium">型号</th>
                    <th className="py-3 px-4 font-medium">色号</th>
                    <th className="py-3 px-4 font-medium">品牌</th>
                    <th className="py-3 px-4 font-medium">类型</th>
                    <th className="py-3 px-4 font-medium">数量</th>
                    <th className="py-3 px-4 font-medium">库存后</th>
                    <th className="py-3 px-4 font-medium">操作人</th>
                    <th className="py-3 px-4 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString('zh-CN', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{r.spec || r.materialName || '-'}</p>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{r.color || '-'}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{r.brand || '-'}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.type === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                          }`}>
                            {r.type === 'in' ? '入库' : '出库'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium">
                          <span className={r.type === 'in' ? 'text-emerald-600' : 'text-red-500'}>
                            {r.type === 'in' ? '+' : '-'}{r.qty}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-600">{r.stockAfter}</td>
                        <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{r.operator}</td>
                        <td className="py-3 px-4 text-xs text-gray-400 max-w-[150px] truncate" title={r.remark || ''}>
                          {r.remark || '-'}
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>

              {/* 移动端卡片式布局 */}
              <div className="md:hidden divide-y divide-gray-50">
                {paged.map((r: any) => (
                  <div key={r.id} className="p-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-gray-900 truncate flex-1">{r.spec || r.materialName || '未填写型号'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        r.type === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {r.type === 'in' ? '入库' : '出库'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400">时间：</span>
                        <span className="text-gray-600">
                          {new Date(r.createdAt).toLocaleString('zh-CN', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">数量：</span>
                        <span className={`font-medium ${r.type === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {r.type === 'in' ? '+' : '-'}{r.qty}
                        </span>
                      </div>
                      {r.color && (
                        <div>
                          <span className="text-gray-400">色号：</span>
                          <span className="text-gray-600">{r.color}</span>
                        </div>
                      )}
                      {r.brand && (
                        <div>
                          <span className="text-gray-400">品牌：</span>
                          <span className="text-gray-600 truncate">{r.brand}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-400">库存后：</span>
                        <span className="text-gray-600">{r.stockAfter}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">操作人：</span>
                        <span className="text-gray-600">{r.operator}</span>
                      </div>
                      {r.remark && (
                        <div className="col-span-2">
                          <span className="text-gray-400">备注：</span>
                          <span className="text-gray-600">{r.remark}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  共 {sorted.length} 条，第 {page}/{totalPages} 页
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 rounded hover:bg-gray-100"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`min-w-[32px] h-8 px-2 rounded text-xs font-medium transition-colors ${
                          pageNum === page
                            ? 'bg-gray-900 text-white'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 rounded hover:bg-gray-100"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
