import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ArrowDownCircle, ArrowUpCircle, Edit3, PackageOpen } from 'lucide-react';
import { materialsAPI, inventoryRecordsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';

export default function MaterialDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [material, setMaterial] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [inventoryType, setInventoryType] = useState<'in' | 'out'>('in');
  const [inventoryQty, setInventoryQty] = useState('');
  const [inventoryRemark, setInventoryRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '', category: '小地砖', brand: '', spec: '', color: '', unit: '片',
    price: '', stock: '', remark: '', status: 'active',
  });

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    const m = await materialsAPI.get(id as string);
    setMaterial(m);
    if (m) {
      setForm({
        name: m.name || '', category: m.category || '小地砖', brand: m.brand || '',
        spec: m.spec || '', color: m.color || '', unit: m.unit || '片',
        price: String(m.price || ''), stock: String(m.stock || ''),
        remark: m.remark || '', status: m.status || 'active',
      });
    }
    try {
      setRecords(await inventoryRecordsAPI.where({ materialId: id }).toArray());
    } catch {
      setRecords([]);
    }
    setLoading(false);
  };

  const openInventory = (type: 'in' | 'out') => {
    setInventoryType(type);
    setInventoryQty('');
    setInventoryRemark('');
    setShowInventory(true);
  };

  const handleInventory = () => {
    if (!material || !inventoryQty) return;
    const qty = parseInt(inventoryQty) || 0;
    if (qty <= 0) return;
    const newStock = inventoryType === 'in'
      ? (material.stock || 0) + qty
      : Math.max(0, (material.stock || 0) - qty);
    const record = {
      id: Date.now(), materialId: material._id, materialName: material.name,
      category: material.category || '', brand: material.brand || '',
      spec: material.spec || '', color: material.color || '',
      type: inventoryType, qty, stockAfter: newStock, remark: inventoryRemark,
      operator: user?.name || '未知', createdAt: new Date().toISOString(),
    };
    const allRecords = [record, ...records];
    setRecords(allRecords);
    setMaterial({ ...material, stock: newStock });
    setShowInventory(false);
    inventoryRecordsAPI.add(record).catch(() => {});
    materialsAPI.update(material._id, { stock: newStock }).catch(() => {
      setMaterial(material);
      setRecords(records);
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;
    setSubmitting(true);
    try {
      await materialsAPI.update(material._id, {
        name: form.name, category: form.category, brand: form.brand,
        spec: form.spec, color: form.color, unit: form.unit,
        price: parseFloat(form.price) || 0, stock: parseInt(form.stock) || 0,
        remark: form.remark, status: form.status,
      });
      setShowEdit(false);
      fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  const inTotal = records.filter(r => r.type === 'in').reduce((sum, r) => sum + (r.qty || 0), 0);
  const outTotal = records.filter(r => r.type === 'out').reduce((sum, r) => sum + (r.qty || 0), 0);
  const isLowStock = material && (material.stock || 0) <= 10;

  if (loading) {
    return (
      <div className="erp-page flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="erp-page">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold">材料不存在</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-page">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base md:text-lg font-bold text-gray-900 truncate">{material.spec || '未命名材料'}</h1>
            {material.color && <span className="text-sm font-medium text-amber-600 shrink-0">#{material.color}</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">{material.brand || ''} · {material.category || ''}</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowEdit(true)}
            className="px-2.5 py-1 text-xs border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600 transition-colors">
            编辑
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl p-4 mb-4 border border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400">当前库存</p>
            <p className={`text-2xl md:text-3xl font-bold ${isLowStock ? 'text-amber-600' : 'text-gray-900'}`}>
              {material.stock || 0} <span className="text-sm font-normal text-gray-400">{material.unit || '片'}</span>
            </p>
            {isLowStock && <p className="text-xs text-amber-500 mt-0.5">库存不足</p>}
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button onClick={() => openInventory('in')}
                className="px-3 py-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 font-medium transition-colors flex items-center gap-1">
                <ArrowDownCircle size={14} /> 入库
              </button>
              <button onClick={() => openInventory('out')}
                className="px-3 py-2 text-xs text-red-500 bg-red-50 rounded-lg hover:bg-red-100 font-medium transition-colors flex items-center gap-1">
                <ArrowUpCircle size={14} /> 出库
              </button>
            </div>
          )}
        </div>

        <div className="flex overflow-x-auto gap-1.5 md:grid md:grid-cols-3 md:gap-3 scrollbar-hide -mx-1 px-1">
          <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded-xl p-2.5 md:p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] md:text-xs text-gray-400">累计入库</span>
              <ArrowDownCircle size={14} className="text-emerald-400" />
            </div>
            <p className="text-lg md:text-xl font-bold text-emerald-600">{inTotal}</p>
          </div>
          <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded-xl p-2.5 md:p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] md:text-xs text-gray-400">累计出库</span>
              <ArrowUpCircle size={14} className="text-red-400" />
            </div>
            <p className="text-lg md:text-xl font-bold text-red-500">{outTotal}</p>
          </div>
          <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded-xl p-2.5 md:p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] md:text-xs text-gray-400">操作次数</span>
              <span className="text-xs text-gray-400">{records.length}</span>
            </div>
            <p className="text-lg md:text-xl font-bold text-gray-900">{records.length}</p>
          </div>
        </div>

        {material.remark && (
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-50 break-all whitespace-pre-wrap">备注：{material.remark}</p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">出入库记录</h2>
        {records.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
            <p className="text-sm text-gray-400">暂无出入库记录</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((r: any) => (
              <div key={r.id} className="bg-white rounded-xl p-3 border border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.type === 'in' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      {r.type === 'in'
                        ? <ArrowDownCircle size={16} className="text-emerald-500" />
                        : <ArrowUpCircle size={16} className="text-red-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {r.type === 'in' ? '入库' : '出库'} {r.qty} {material.unit || '片'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString()} {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">操作后库存</p>
                    <p className="text-sm font-medium text-gray-700">{r.stockAfter || 0}</p>
                  </div>
                </div>
                {r.remark && (
                  <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-50 break-all whitespace-pre-wrap">备注：{r.remark}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">操作人：{r.operator || '未知'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">编辑材料</h2>
              <button onClick={() => setShowEdit(false)} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">型号 *</label><input value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" required /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">分类</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10">{['大地砖', '小地砖', '墙砖'].map(c => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">品牌</label><input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">色号</label><input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">库存</label><input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">单位</label><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">材料名称（可选）</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">备注</label><input value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowEdit(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">{submitting ? '保存中...' : '保存'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInventory && material && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowInventory(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">{inventoryType === 'in' ? '入库' : '出库'} - {material.spec || material.name}</h2>
              <button onClick={() => setShowInventory(false)} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <PackageOpen size={18} className="text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{material.spec || material.name}</p>
                  {material.color && <p className="text-xs text-gray-400">色号：{material.color}</p>}
                  <p className="text-xs text-gray-400">当前库存: {material.stock || 0} {material.unit || ''}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">数量 *</label>
                <input type="number" value={inventoryQty} onChange={e => setInventoryQty(e.target.value)}
                  placeholder={`请输入${inventoryType === 'in' ? '入库' : '出库'}数量`}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" autoFocus />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">备注</label>
                <input value={inventoryRemark} onChange={e => setInventoryRemark(e.target.value)}
                  placeholder="如：采购来源、出库原因"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowInventory(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleInventory} disabled={submitting}
                className={`px-4 py-2 text-sm text-white rounded-lg font-medium ${inventoryType === 'in' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'} disabled:opacity-50`}>
                确认{inventoryType === 'in' ? '入库' : '出库'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
