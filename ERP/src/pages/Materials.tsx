import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Plus, PackageOpen, Edit3, Trash2, X, Loader2, Clock, ArrowUpCircle, ArrowDownCircle,
  Layers, CheckCircle, AlertTriangle, ChevronRight
} from 'lucide-react';
import { materialsAPI, inventoryRecordsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';
import BottomDrawer from '@/components/BottomDrawer';
import { getCurrentReturnPath } from '@/hooks/useSmartBack';

const CATEGORIES = ['全部', '大地砖', '小地砖', '墙砖'];

const INIT_FORM = {
  name: '', category: '小地砖', brand: '', spec: '', color: '', unit: '片',
  price: '', stock: '', supplier: '', remark: '', status: 'active',
};

const SEED_DATA = [
  { brand: '长安', spec: '30803', color: '2', stock: 238, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '30901', color: '1', stock: 214, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '31936', color: '27', stock: 518, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33870', color: '26', stock: 442, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '30870D', color: '18', stock: 588, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '30871D', color: '4', stock: 923, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33877A', color: '6', stock: 559, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33877B', color: '5', stock: 104, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33877B', color: '8', stock: 1287, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33877D', color: '6', stock: 266, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33926', color: '', stock: 156, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33930', color: '16', stock: 2093, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33930-1', color: '15', stock: 2262, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '333931', color: '36', stock: 1441, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '33931-1', color: '23', stock: 137, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '30936', color: '12', stock: 436, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '31849', color: '1', stock: 622, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '32802', color: '8', stock: 65, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '32806', color: '3', stock: 224, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '32808', color: '3', stock: 360, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '32812', color: '1', stock: 724, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '31886', color: '4', stock: 207, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '31845', color: '1', stock: 490, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '31890', color: '12', stock: 543, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '31923', color: 'A88', stock: 612, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '31928', color: '2', stock: 273, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '31932', color: '3', stock: 574, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '30852', color: '1', stock: 364, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '30828', color: '31', stock: 169, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '30868', color: '23', stock: 560, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '30882', color: '17', stock: 238, unit: '片', category: '小地砖' },
  { brand: '长安', spec: '4A08', color: 'T2', stock: 2869, unit: '片', category: '小地砖' },
  { brand: '糖果', spec: '30030', color: '49G', stock: 390, unit: '片', category: '小地砖' },
  { brand: '糖果', spec: '30551浅', color: '50', stock: 702, unit: '片', category: '小地砖' },
  { brand: '糖果', spec: '30551深', color: '54', stock: 1755, unit: '片', category: '小地砖' },
  { brand: '喜德龙', spec: '6005', color: '4', stock: 225, unit: '片', category: '小地砖' },
  { brand: '喜德龙', spec: '6027', color: '4', stock: 345, unit: '片', category: '小地砖' },
  { brand: '宏宇壹佰', spec: '96P89D', color: '1', stock: 210, unit: '片', category: '小地砖' },
  { brand: '宏宇壹佰', spec: '99YF53D', color: '1', stock: 164, unit: '片', category: '小地砖' },
  { brand: '宏宇壹佰', spec: '96P121D', color: '2', stock: 197, unit: '片', category: '小地砖' },
  { brand: '宏宇壹佰', spec: '96P116D', color: '6', stock: 525, unit: '片', category: '小地砖' },
  { brand: '宏宇壹佰', spec: '99Y07', color: '1', stock: 315, unit: '片', category: '小地砖' },
  { brand: '宏宇壹佰', spec: '96P192D', color: 'A3', stock: 690, unit: '片', category: '小地砖' },
  { brand: '宏宇壹佰', spec: '99Y05D', color: '2', stock: 102, unit: '片', category: '小地砖' },
  { brand: '宏宇壹佰', spec: '96P173D', color: 'A3', stock: 260, unit: '片', category: '小地砖' },
  { brand: '可乐人生', spec: '3315B', color: 'V1', stock: 1122, unit: '片', category: '小地砖' },
  { brand: '可乐人生', spec: '3303A', color: 'F1', stock: 429, unit: '片', category: '小地砖' },
  { brand: '可乐人生', spec: '3303B', color: 'F1', stock: 151, unit: '片', category: '小地砖' },
  { brand: '可乐人生', spec: '3317A', color: 'V1', stock: 56, unit: '片', category: '小地砖' },
  { brand: '可乐人生', spec: '3317B', color: 'V1', stock: 121, unit: '片', category: '小地砖' },
  { brand: '精品小地砖', spec: '99P18D', color: '11', stock: 143, unit: '片', category: '小地砖' },
  { brand: '精品小地砖', spec: '30166', color: '3', stock: 825, unit: '片', category: '小地砖' },
  { brand: '美陶尚品', spec: '6840D', color: '504', stock: 464, unit: '片', category: '小地砖' },
  { brand: '美陶尚品', spec: '5918D', color: '111', stock: 240, unit: '片', category: '小地砖' },
  { brand: '美陶尚品', spec: '68110D', color: '502', stock: 20, unit: '片', category: '小地砖' },
  { brand: '美陶尚品', spec: '6818D', color: '508', stock: 375, unit: '片', category: '小地砖' },
  { brand: '美陶尚品', spec: '80011D', color: '701', stock: 193, unit: '片', category: '小地砖' },
  { brand: '美陶尚品', spec: '6853D', color: '601', stock: 614, unit: '片', category: '小地砖' },
  { brand: '美陶尚品', spec: '8006D', color: '502', stock: 445, unit: '片', category: '小地砖' },
  { brand: '名仕人生', spec: '20026D', color: '606', stock: 1007, unit: '片', category: '小地砖' },
  { brand: '粤维', spec: 'DGS005B', color: '27', stock: 45, unit: '片', category: '小地砖' },
  { brand: '踢脚线', spec: '踢脚线', color: '', stock: 54, unit: '件', category: '小地砖' },
  { brand: '白绿配套', spec: '小地砖', color: '', stock: 16, unit: '件', category: '小地砖' },
];

const ACTION_WIDTH = 144;

export default function Materials() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getCurrentReturnPath(location.pathname, location.search);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState(INIT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [inventoryMaterial, setInventoryMaterial] = useState<any>(null);
  const [inventoryType, setInventoryType] = useState<'in' | 'out'>('in');
  const [inventoryQty, setInventoryQty] = useState('');
  const [inventoryRemark, setInventoryRemark] = useState('');
  const [records, setRecords] = useState<any[]>([]);

  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchCurrentX = useRef(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const fetchData = useCallback(async () => {
    const cached = sessionStorage.getItem('materials_cache');
    if (cached) {
      try {
        setMaterials(JSON.parse(cached));
        setLoading(false);
      } catch {}
    }
    let data = await materialsAPI.toArray();
    const needsInit = data.length === 0 || data.every(m => !CATEGORIES.includes(m.category));
    if (needsInit) {
      for (const item of data) {
        await materialsAPI.delete(item._id);
      }
      for (const item of SEED_DATA) {
        await materialsAPI.add({
          ...item,
          name: '',
          price: 0,
          supplier: '',
          remark: '',
          status: 'active',
          createdAt: new Date().toISOString(),
        });
      }
      data = await materialsAPI.toArray();
    }
    setMaterials(data);
    setLoading(false);
    sessionStorage.setItem('materials_cache', JSON.stringify(data));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const loadRecords = async () => {
      const cloudRecords = await inventoryRecordsAPI.toArray();
      const localRecords: any[] = (() => {
        try { return JSON.parse(localStorage.getItem('materials_records') || '[]'); } catch { return []; }
      })();
      const cloudIds = new Set(cloudRecords.map((r: any) => String(r._id || r.id)));
      const merged = [...cloudRecords];
      for (const r of localRecords) {
        if (!cloudIds.has(String(r.id || ''))) {
          merged.push(r);
        }
      }
      setRecords(merged);
      if (localRecords.length > 0 && cloudRecords.length > 0) {
        localStorage.removeItem('materials_records');
      }
    };
    loadRecords();
  }, []);

  useEffect(() => {
    return () => {
      sessionStorage.setItem('materials_scroll_pos', String(window.scrollY));
    };
  }, []);

  useEffect(() => {
    if (!loading && materials.length > 0) {
      const savedPos = sessionStorage.getItem('materials_scroll_pos');
      if (savedPos && parseInt(savedPos) > 0) {
        const pos = parseInt(savedPos);
        let attempts = 0;
        const tryRestore = () => {
          window.scrollTo(0, pos);
          attempts++;
          if (window.scrollY < pos && attempts < 10) {
            requestAnimationFrame(tryRestore);
          } else if (attempts >= 10) {
            sessionStorage.removeItem('materials_scroll_pos');
          }
        };
        requestAnimationFrame(tryRestore);
      }
    }
  }, [loading, materials.length]);

  const filtered = materials.filter(m => {
    if (activeCategory !== '全部' && m.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!m.spec?.toLowerCase().includes(q) 
          && !m.color?.toLowerCase().includes(q)
          && !m.brand?.toLowerCase().includes(q)
          && !m.name?.toLowerCase().includes(q)
          && !m.remark?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentX.current = e.touches[0].clientX;
    isDraggingRef.current = false;
    setIsDragging(false);
    setActiveSwipeId(id);
    if (swipedId === id) {
      setSwipeOffset(-ACTION_WIDTH);
    } else {
      setSwipeOffset(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = touchStartX.current - e.touches[0].clientX;
    const deltaY = Math.abs(touchStartY.current - e.touches[0].clientY);
    
    if (!isDraggingRef.current && Math.abs(deltaX) > 8 && Math.abs(deltaX) > deltaY) {
      isDraggingRef.current = true;
      setIsDragging(true);
    }
    
    if (isDraggingRef.current) {
      touchCurrentX.current = e.touches[0].clientX;
      
      const currentOpenOffset = swipedId === activeSwipeId ? -ACTION_WIDTH : 0;
      let newOffset = currentOpenOffset - deltaX;
      
      if (newOffset > 0) newOffset = 0;
      if (newOffset < -ACTION_WIDTH - 20) {
        newOffset = -ACTION_WIDTH - 20 + (newOffset + ACTION_WIDTH + 20) * 0.3;
      }
      
      setSwipeOffset(newOffset);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, id: string) => {
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = Math.abs(touchStartY.current - e.changedTouches[0].clientY);
    
    const wasOpen = swipedId === id;
    const effectiveDelta = wasOpen ? deltaX + ACTION_WIDTH : deltaX;
    
    if (isDraggingRef.current) {
      if (effectiveDelta > ACTION_WIDTH / 2) {
        setSwipedId(id);
      } else {
        setSwipedId(null);
      }
    } else {
      if (deltaX > 48 && Math.abs(deltaX) > deltaY) {
        setSwipedId(prev => prev === id ? null : id);
      } else if (deltaX < -24 || deltaY > Math.abs(deltaX)) {
        setSwipedId(null);
      }
    }
    
    setSwipeOffset(0);
    setActiveSwipeId(null);
    setIsDragging(false);
    isDraggingRef.current = false;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.spec) return;
    setSubmitting(true);
    try {
      if (editingItem) {
        await materialsAPI.update(editingItem._id, {
          ...form, price: parseFloat(form.price) || 0, stock: parseInt(form.stock) || 0,
        });
      } else {
        await materialsAPI.add({
          ...form, price: parseFloat(form.price) || 0, stock: parseInt(form.stock) || 0,
          createdAt: new Date().toISOString(),
        });
      }
      setShowCreate(false);
      setEditingItem(null);
      setForm(INIT_FORM);
      fetchData();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInventory = () => {
    if (!inventoryMaterial || !inventoryQty) return;
    const qty = parseInt(inventoryQty) || 0;
    if (qty <= 0) return;
    const newStock = inventoryType === 'in'
      ? (inventoryMaterial.stock || 0) + qty
      : Math.max(0, (inventoryMaterial.stock || 0) - qty);
    const record = {
      id: Date.now(), materialId: inventoryMaterial._id, materialName: inventoryMaterial.name,
      category: inventoryMaterial.category || '', brand: inventoryMaterial.brand || '',
      spec: inventoryMaterial.spec || '', color: inventoryMaterial.color || '',
      type: inventoryType, qty, stockAfter: newStock, remark: inventoryRemark,
      operator: user?.name || '未知', createdAt: new Date().toISOString(),
    };
    const newRecords = [record, ...records];
    setRecords(newRecords);
    inventoryRecordsAPI.add(record).catch(() => {});
    setMaterials(prev => {
      const updated = prev.map(m => m._id === inventoryMaterial._id ? { ...m, stock: newStock } : m);
      sessionStorage.setItem('materials_cache', JSON.stringify(updated));
      return updated;
    });
    setShowInventory(false);
    setInventoryMaterial(null);
    materialsAPI.update(inventoryMaterial._id, { stock: newStock }).catch(() => {
      setMaterials(prev => prev.map(m => m._id === inventoryMaterial._id ? { ...m, stock: inventoryMaterial.stock } : m));
      setRecords(records);
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该材料？')) return;
    await materialsAPI.delete(id);
    setSwipedId(null);
    fetchData();
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      name: item.name || '', category: item.category || '小地砖', brand: item.brand || '',
      spec: item.spec || '', color: item.color || '', unit: item.unit || '',
      price: String(item.price || ''), stock: String(item.stock || ''),
      supplier: item.supplier || '', remark: item.remark || '', status: item.status || 'active',
    });
    setShowCreate(true);
    setSwipedId(null);
  };

  const openInventory = (item: any, type: 'in' | 'out') => {
    setInventoryMaterial(item);
    setInventoryType(type);
    setInventoryQty('');
    setInventoryRemark('');
    setShowInventory(true);
    setSwipedId(null);
  };

  const stats = {
    total: materials.length,
    active: materials.filter(m => m.status !== 'inactive').length,
    lowStock: materials.filter(m => (m.stock || 0) <= 10 && m.status !== 'inactive').length,
  };

  return (
    <div className="erp-page">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base md:text-lg font-bold text-gray-900">材料库存</h1>
          <p className="text-gold-500 text-xs md:text-sm">管理材料信息、库存和供应商</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/inventory-records', { state: { from: returnPath } })}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors">
            <Clock size={14} /> <span className="hidden sm:inline">出入库记录</span>
          </button>
          {isAdmin && (
            <button onClick={() => { setEditingItem(null); setForm(INIT_FORM); setShowCreate(true); }}
              className="erp-btn-primary">
              <Plus size={16} /> <span className="hidden sm:inline">添加材料</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex overflow-x-auto gap-1.5 md:grid md:grid-cols-3 md:gap-3 mb-4 scrollbar-hide -mx-1 px-1">
        <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded-xl p-2.5 md:p-4 border-2 border-transparent bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] md:text-xs text-gray-400">材料总数</span>
            <Layers size={14} className="text-gray-300" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded-xl p-2.5 md:p-4 border-2 border-transparent bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] md:text-xs text-gray-400">在售材料</span>
            <CheckCircle size={14} className="text-gray-300" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-emerald-600">{stats.active}</p>
        </div>
        <div className="flex-shrink-0 w-[calc((100%-12px)/3)] md:w-auto rounded-xl p-2.5 md:p-4 border-2 border-transparent bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] md:text-xs text-gray-400">库存不足</span>
            <AlertTriangle size={14} className="text-gray-300" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-amber-600">{stats.lowStock}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 border-b border-gray-100">
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${activeCategory === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="flex-1 relative w-full sm:w-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索型号、色号、品牌、备注"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400"><Loader2 size={16} className="animate-spin mx-auto mb-2" />加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">暂无材料数据</div>
        ) : (
          <>
            {/* 电脑端表格 */}
            <div className="hidden md:block overflow-visible">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                    <th className="py-3 px-4 font-medium">型号</th>
                    <th className="py-3 px-4 font-medium">色号</th>
                    <th className="py-3 px-4 font-medium">品牌</th>
                    <th className="py-3 px-4 font-medium">分类</th>
                    <th className="py-3 px-4 font-medium">库存</th>
                    <th className="py-3 px-4 font-medium">备注</th>
                    {isAdmin && <th className="py-3 px-4 font-medium text-right">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(m => {
                    const isLowStock = (m.stock || 0) <= 10;
                    return (
                      <tr key={m._id} className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/materials/${m._id}`, { state: { from: returnPath } })}>
                        <td className="py-3 px-4">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{m.spec || '-'}</p>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{m.color || '-'}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{m.brand || '-'}</td>
                        <td className="py-3 px-4"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{m.category}</span></td>
                        <td className="py-3 px-4">
                          <span className={`text-sm font-medium ${isLowStock ? 'text-amber-600' : 'text-gray-900'}`}>
                            {m.stock || 0} {m.unit || ''}
                          </span>
                          {isLowStock && <span className="ml-1 text-xs text-amber-500">低</span>}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500 max-w-[180px] truncate" title={m.remark || ''}>{m.remark || '-'}</td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openInventory(m, 'in')}
                                className="px-2 py-1 text-[11px] text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 font-medium transition-colors">入库</button>
                              <button onClick={() => openInventory(m, 'out')}
                                className="px-2 py-1 text-[11px] text-red-500 bg-red-50 rounded-md hover:bg-red-100 font-medium transition-colors">出库</button>
                              <div className="w-px h-5 bg-gray-200 mx-1" />
                              <button onClick={() => handleEdit(m)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><Edit3 size={14} /></button>
                              <button onClick={() => handleDelete(m._id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片列表 */}
            <div className="md:hidden divide-y divide-gray-50">
              {filtered.map(m => {
                const isLowStock = (m.stock || 0) <= 10;
                const showActions = swipedId === m._id;
                return (
                  <div key={m._id} className="relative overflow-hidden">
                    {/* 左滑操作按钮 - iOS风格 */}
                    {isAdmin && (
                      <div className="absolute inset-y-0 right-0 flex">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(m); }}
                          className="w-[72px] h-full bg-gray-800 text-white flex flex-col items-center justify-center gap-0.5 active:bg-gray-700 transition-colors"
                        >
                          <Edit3 size={18} />
                          <span className="text-[11px] font-medium">编辑</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(m._id); }}
                          className="w-[72px] h-full bg-red-500 text-white flex flex-col items-center justify-center gap-0.5 active:bg-red-600 transition-colors"
                        >
                          <Trash2 size={18} />
                          <span className="text-[11px] font-medium">删除</span>
                        </button>
                      </div>
                    )}
                    {/* 卡片内容区域 */}
                    <div
                      className="bg-white p-3.5"
                      style={{
                        transform: activeSwipeId === m._id && isDragging
                          ? `translateX(${swipeOffset}px)`
                          : showActions
                            ? `translateX(-${ACTION_WIDTH}px)`
                            : 'translateX(0)',
                        transition: isDragging && activeSwipeId === m._id
                          ? 'none'
                          : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      }}
                      onTouchStart={isAdmin && isMobile ? (e) => handleTouchStart(e, m._id) : undefined}
                      onTouchMove={isAdmin && isMobile ? handleTouchMove : undefined}
                      onTouchEnd={isAdmin && isMobile ? (e) => handleTouchEnd(e, m._id) : undefined}
                      onClick={() => {
                        if (showActions) {
                          setSwipedId(null);
                        } else {
                          navigate(`/materials/${m._id}`, { state: { from: returnPath } });
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <p className="text-lg font-semibold text-gray-900 truncate">{m.spec || '未填写型号'}</p>
                            {m.color && (
                              <span className="text-lg font-medium text-amber-600 shrink-0">
                                #{m.color}
                              </span>
                            )}
                            {isLowStock && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium shrink-0">库存低</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium shrink-0">{m.category}</span>
                            {m.brand && <p className="text-xs text-gray-500 truncate">{m.brand}</p>}
                          </div>
                          {m.remark && <p className="text-xs text-gray-500 mt-1 line-clamp-2">备注：{m.remark}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold ${isLowStock ? 'text-amber-600' : 'text-gray-900'}`}>
                            {m.stock || 0}
                          </p>
                          <p className="text-xs text-gray-400">{m.unit || '片'}</p>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                          <button onClick={(e) => { e.stopPropagation(); openInventory(m, 'in'); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 font-medium transition-colors">
                            <ArrowDownCircle size={14} /> 入库
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); openInventory(m, 'out'); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-red-500 bg-red-50 rounded-lg hover:bg-red-100 font-medium transition-colors">
                            <ArrowUpCircle size={14} /> 出库
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditingItem(null); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingItem ? '编辑材料' : '添加材料'}</h2>
              <button onClick={() => { setShowCreate(false); setEditingItem(null); }} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">型号 *</label><input value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" required /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">色号</label><input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">品牌</label><input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
                <div className="hidden md:block">
                  <label className="text-xs text-gray-500 mb-1 block">分类</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10 appearance-none bg-white">
                    {CATEGORIES.filter(c => c !== '全部').map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="md:hidden">
                  <label className="text-xs text-gray-500 mb-1 block">分类</label>
                  <button type="button" onClick={() => setShowCategoryPicker(true)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-left flex items-center justify-between bg-white">
                    <span>{form.category}</span>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">库存</label><input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">单位</label><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="片/箱/件" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10" /></div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">备注</label>
                <textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })}
                  rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => { setShowCreate(false); setEditingItem(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">{submitting ? '保存中...' : '保存'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BottomDrawer open={showCategoryPicker} onClose={() => setShowCategoryPicker(false)} title="选择分类">
        <div className="pb-2">
          {CATEGORIES.filter(c => c !== '全部').map(c => (
            <button key={c}
              onClick={() => { setForm({ ...form, category: c }); setShowCategoryPicker(false); }}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${
                form.category === c ? 'bg-gray-900 text-white font-medium' : 'text-gray-700 hover:bg-gray-50'
              }`}>
              {c}
            </button>
          ))}
        </div>
      </BottomDrawer>

      {showInventory && inventoryMaterial && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowInventory(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">{inventoryType === 'in' ? '入库' : '出库'} - {inventoryMaterial.spec || inventoryMaterial.name}</h2>
              <button onClick={() => setShowInventory(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <PackageOpen size={18} className="text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inventoryMaterial.spec || inventoryMaterial.name}</p>
                  {inventoryMaterial.color && <p className="text-xs text-gray-400">色号：{inventoryMaterial.color}</p>}
                  <p className="text-xs text-gray-400">当前库存: {inventoryMaterial.stock || 0} {inventoryMaterial.unit || ''}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">数量 *</label>
                <input type="number" value={inventoryQty} onChange={e => setInventoryQty(e.target.value)}
                  placeholder={`请输入${inventoryType === 'in' ? '入库' : '出库'}数量`}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" autoFocus />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">备注</label>
                <input value={inventoryRemark} onChange={e => setInventoryRemark(e.target.value)}
                  placeholder="如：采购来源、出库原因"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowInventory(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleInventory}
                className={`px-4 py-2 text-sm text-white rounded-lg font-medium ${inventoryType === 'in' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}>
                确认{inventoryType === 'in' ? '入库' : '出库'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
