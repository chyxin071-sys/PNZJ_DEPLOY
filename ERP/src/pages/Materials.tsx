import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle, Edit3, Layers,
  Loader2, PackageOpen, Plus, Search, Trash2, X,
} from 'lucide-react';
import { inventoryRecordsAPI, materialsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';
import { getCurrentReturnPath } from '@/hooks/useSmartBack';
import { uploadFile } from '@/utils/cloudStorage';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import InventoryCategoryManager from '@/components/InventoryCategoryManager';
import MaterialEditorModal, { type MaterialEditorDraft } from '@/components/MaterialEditorModal';
import MaterialImage from '@/components/MaterialImage';
import {
  categoryPayload, ensureCategoryPath, getMaterialImageID, loadInventoryCategories,
  resolveMaterialCategory, saveCategoriesAndMigrateMaterials, saveInventoryCategories,
  type InventoryCategory, type MaterialRecord,
} from '@/services/inventoryCategories';

const ACTION_WIDTH = 144;

export default function Materials() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getCurrentReturnPath(location.pathname, location.search);

  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState('all');
  const [secondaryFilter, setSecondaryFilter] = useState('all');
  const [editingItem, setEditingItem] = useState<MaterialRecord | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);

  const [showInventory, setShowInventory] = useState(false);
  const [inventoryMaterial, setInventoryMaterial] = useState<MaterialRecord | null>(null);
  const [inventoryType, setInventoryType] = useState<'in' | 'out'>('in');
  const [inventoryQty, setInventoryQty] = useState('');
  const [inventoryRemark, setInventoryRemark] = useState('');

  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDraggingRef = useRef(false);

  const fetchData = useCallback(async () => {
    const cached = sessionStorage.getItem('materials_cache');
    if (cached) {
      try { setMaterials(JSON.parse(cached)); setLoading(false); } catch { sessionStorage.removeItem('materials_cache'); }
    }
    const [data, categoryTree] = await Promise.all([materialsAPI.toArray(), loadInventoryCategories()]);
    setMaterials(data);
    setCategories(categoryTree);
    setLoading(false);
    sessionStorage.setItem('materials_cache', JSON.stringify(data));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => () => sessionStorage.setItem('materials_scroll_pos', String(window.scrollY)), []);
  useEffect(() => {
    if (loading) return;
    const saved = Number(sessionStorage.getItem('materials_scroll_pos') || 0);
    if (saved > 0) requestAnimationFrame(() => window.scrollTo(0, saved));
  }, [loading]);

  const selectedPrimary = categories.find((category) => category.id === primaryFilter);
  const filtered = useMemo(() => materials.filter((material) => {
    const path = resolveMaterialCategory(material, categories);
    if (primaryFilter !== 'all' && path.primaryId !== primaryFilter) return false;
    if (secondaryFilter !== 'all' && path.secondaryId !== secondaryFilter) return false;
    if (!search.trim()) return true;
    const haystack = [material.spec, material.color, material.brand, material.name, material.remark, path.primaryName, path.secondaryName]
      .filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  }), [materials, categories, primaryFilter, secondaryFilter, search]);

  const stats = {
    total: materials.length,
    active: materials.filter((material) => material.status !== 'inactive').length,
    lowStock: materials.filter((material) => Number(material.stock || 0) <= 10 && material.status !== 'inactive').length,
  };

  const handleSave = async (draft: MaterialEditorDraft) => {
    setSubmitting(true);
    try {
      const ensured = ensureCategoryPath(categories, draft.primaryCategoryName, draft.secondaryCategoryName);
      if (JSON.stringify(ensured.categories) !== JSON.stringify(categories)) {
        const saved = await saveInventoryCategories(ensured.categories);
        setCategories(saved);
      }
      let imageFileID = draft.imageFileID;
      if (draft.imageFile) {
        imageFileID = (await uploadFile(draft.imageFile, `inventory/materials/${editingItem?._id || Date.now()}`)).fileID;
      }
      const payload = {
        name: draft.name.trim(), brand: draft.brand.trim(), spec: draft.spec.trim(), color: draft.color.trim(),
        unit: draft.unit.trim() || '片', price: Number(draft.price) || 0, stock: Number(draft.stock) || 0,
        supplier: draft.supplier.trim(), remark: draft.remark.trim(), status: draft.status,
        imageFileID, ...categoryPayload(ensured.path), updatedAt: new Date().toISOString(),
      };
      if (editingItem) await materialsAPI.update(editingItem._id, payload);
      else await materialsAPI.add({ ...payload, createdAt: new Date().toISOString() });
      setShowEditor(false);
      setEditingItem(null);
      await fetchData();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCategorySave = async (next: InventoryCategory[]) => {
    setSavingCategories(true);
    try {
      const saved = await saveCategoriesAndMigrateMaterials(categories, next, materials);
      setCategories(saved);
      setShowCategoryManager(false);
      await fetchData();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : '分类保存失败');
    } finally {
      setSavingCategories(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该材料？')) return;
    await materialsAPI.delete(id);
    setSwipedId(null);
    await fetchData();
  };
  const openEdit = (material: MaterialRecord) => {
    setEditingItem(material); setShowEditor(true); setSwipedId(null);
  };
  const openInventory = (material: MaterialRecord, type: 'in' | 'out') => {
    setInventoryMaterial(material); setInventoryType(type); setInventoryQty(''); setInventoryRemark('');
    setShowInventory(true); setSwipedId(null);
  };
  const handleInventory = () => {
    if (!inventoryMaterial) return;
    const qty = Number(inventoryQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const oldStock = Number(inventoryMaterial.stock || 0);
    const newStock = inventoryType === 'in' ? oldStock + qty : Math.max(0, oldStock - qty);
    const record = {
      id: Date.now(), materialId: inventoryMaterial._id, materialName: inventoryMaterial.name,
      category: inventoryMaterial.category || '', brand: inventoryMaterial.brand || '', spec: inventoryMaterial.spec || '',
      color: inventoryMaterial.color || '', type: inventoryType, qty, stockAfter: newStock,
      remark: inventoryRemark, operator: user?.name || '未知', createdAt: new Date().toISOString(),
    };
    setMaterials((current) => current.map((item) => item._id === inventoryMaterial._id ? { ...item, stock: newStock } : item));
    setShowInventory(false);
    inventoryRecordsAPI.add(record).catch(() => {});
    materialsAPI.update(inventoryMaterial._id, { stock: newStock }).then(fetchData).catch(() => fetchData());
  };

  const handleTouchStart = (event: React.TouchEvent, id: string) => {
    touchStartX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
    isDraggingRef.current = false;
    setActiveSwipeId(id);
    setSwipeOffset(swipedId === id ? -ACTION_WIDTH : 0);
  };
  const handleTouchMove = (event: React.TouchEvent) => {
    const deltaX = touchStartX.current - event.touches[0].clientX;
    const deltaY = Math.abs(touchStartY.current - event.touches[0].clientY);
    if (!isDraggingRef.current && Math.abs(deltaX) > 8 && Math.abs(deltaX) > deltaY) {
      isDraggingRef.current = true; setIsDragging(true);
    }
    if (isDraggingRef.current) {
      const base = swipedId === activeSwipeId ? -ACTION_WIDTH : 0;
      setSwipeOffset(Math.max(-ACTION_WIDTH, Math.min(0, base - deltaX)));
    }
  };
  const handleTouchEnd = (event: React.TouchEvent, id: string) => {
    const deltaX = touchStartX.current - event.changedTouches[0].clientX;
    if (isDraggingRef.current) setSwipedId((swipedId === id ? ACTION_WIDTH + deltaX : deltaX) > ACTION_WIDTH / 2 ? id : null);
    setSwipeOffset(0); setActiveSwipeId(null); setIsDragging(false); isDraggingRef.current = false;
  };

  const showPreview = (url: string) => setPreviewImages([url]);

  return (
    <div className="erp-page">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900 md:text-lg">库存管理</h1>
          <p className="mt-0.5 text-xs text-amber-600">材料分类、库存与出入库记录</p>
        </div>
        {isAdmin && <button onClick={() => { setEditingItem(null); setShowEditor(true); }} className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white md:px-4 md:text-sm"><Plus size={16} /> 新增材料</button>}
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2 md:gap-3">
        {[
          ['材料总数', stats.total, <Layers key="layers" size={15} className="text-blue-500" />],
          ['在售材料', stats.active, <CheckCircle key="active" size={15} className="text-emerald-500" />],
          ['库存不足', stats.lowStock, <AlertTriangle key="low" size={15} className="text-amber-500" />],
        ].map(([label, value, icon]) => <div key={String(label)} className="min-w-0 rounded-md border border-gray-100 bg-white p-3 md:p-4"><div className="flex items-center justify-between gap-1 text-[11px] text-gray-400 md:text-xs"><span className="truncate">{label}</span>{icon}</div><p className="mt-1 text-xl font-bold text-gray-900 md:text-2xl">{value}</p></div>)}
      </div>

      <section className="overflow-hidden rounded-md border border-gray-100 bg-white">
        <div className="grid grid-cols-2 gap-2 border-b border-gray-100 p-3 md:grid-cols-[180px_180px_minmax(220px,1fr)_auto]">
          <select value={primaryFilter} onChange={(event) => { setPrimaryFilter(event.target.value); setSecondaryFilter('all'); }} className="min-w-0 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-700 outline-none">
            <option value="all">全部一级分类</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select value={secondaryFilter} onChange={(event) => setSecondaryFilter(event.target.value)} className="min-w-0 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-700 outline-none">
            <option value="all">全部二级分类</option>{(selectedPrimary?.children || categories.flatMap((category) => category.children)).map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </select>
          <label className="relative col-span-2 md:col-span-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索型号、色号、品牌、备注" className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-gray-400" /></label>
          {isAdmin && <button onClick={() => setShowCategoryManager(true)} className="hidden rounded-md border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50 md:block">分类管理</button>}
        </div>

        {loading ? <div className="py-16 text-center text-sm text-gray-400"><Loader2 size={18} className="mx-auto mb-2 animate-spin" />加载中...</div>
          : filtered.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">暂无符合条件的材料</div>
          : <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[880px] text-left">
                <thead><tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500"><th className="px-4 py-3 font-medium">材料</th><th className="px-4 py-3 font-medium">分类</th><th className="px-4 py-3 font-medium">品牌</th><th className="px-4 py-3 font-medium">库存</th><th className="px-4 py-3 font-medium">备注</th>{isAdmin && <th className="px-4 py-3 text-right font-medium">操作</th>}</tr></thead>
                <tbody className="divide-y divide-gray-100">{filtered.map((material) => {
                  const path = resolveMaterialCategory(material, categories);
                  const low = Number(material.stock || 0) <= 10;
                  return <tr key={material._id} onClick={() => navigate(`/materials/${material._id}`, { state: { from: returnPath } })} className="cursor-pointer hover:bg-gray-50/70">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><MaterialImage fileID={getMaterialImageID(material)} className="h-12 w-12 rounded-md" onWebPreview={showPreview} /><div className="min-w-0"><p className="max-w-[220px] truncate text-sm font-semibold text-gray-900">{material.spec || '未填写型号'} {material.color && <span className="text-amber-600">#{material.color}</span>}</p>{material.name && <p className="mt-0.5 max-w-[220px] truncate text-xs text-gray-400">{material.name}</p>}</div></div></td>
                    <td className="px-4 py-3"><p className="text-sm text-gray-700">{path.primaryName || '-'}</p><p className="text-xs text-gray-400">{path.secondaryName || '-'}</p></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{material.brand || '-'}</td>
                    <td className={`px-4 py-3 text-sm font-semibold ${low ? 'text-amber-600' : 'text-gray-900'}`}>{material.stock || 0} <span className="font-normal text-gray-400">{material.unit || ''}</span></td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-sm text-gray-500">{material.remark || '-'}</td>
                    {isAdmin && <td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={(event) => { event.stopPropagation(); openInventory(material, 'in'); }} className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-600">入库</button><button onClick={(event) => { event.stopPropagation(); openInventory(material, 'out'); }} className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-500">出库</button><button onClick={(event) => { event.stopPropagation(); openEdit(material); }} className="p-1.5 text-gray-400 hover:text-gray-700"><Edit3 size={15} /></button><button onClick={(event) => { event.stopPropagation(); handleDelete(material._id); }} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button></div></td>}
                  </tr>;
                })}</tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 md:hidden">{filtered.map((material) => {
              const path = resolveMaterialCategory(material, categories);
              const low = Number(material.stock || 0) <= 10;
              const open = swipedId === material._id;
              return <div key={material._id} className="relative overflow-hidden">
                {isAdmin && <div className="absolute inset-y-0 right-0 flex"><button onClick={() => openEdit(material)} className="flex w-[72px] flex-col items-center justify-center gap-1 bg-gray-800 text-xs text-white"><Edit3 size={17} />编辑</button><button onClick={() => handleDelete(material._id)} className="flex w-[72px] flex-col items-center justify-center gap-1 bg-red-500 text-xs text-white"><Trash2 size={17} />删除</button></div>}
                <article onTouchStart={isAdmin ? (event) => handleTouchStart(event, material._id) : undefined} onTouchMove={isAdmin ? handleTouchMove : undefined} onTouchEnd={isAdmin ? (event) => handleTouchEnd(event, material._id) : undefined} onClick={() => open ? setSwipedId(null) : navigate(`/materials/${material._id}`, { state: { from: returnPath } })} className="relative bg-white p-3.5" style={{ transform: activeSwipeId === material._id && isDragging ? `translateX(${swipeOffset}px)` : open ? `translateX(-${ACTION_WIDTH}px)` : 'translateX(0)', transition: isDragging ? 'none' : 'transform .24s ease' }}>
                  <div className="flex items-start gap-3"><MaterialImage fileID={getMaterialImageID(material)} className="h-[72px] w-[72px] rounded-md" onWebPreview={showPreview} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-base font-semibold text-gray-900">{material.spec || '未填写型号'} {material.color && <span className="text-amber-600">#{material.color}</span>}</p><p className="mt-1 truncate text-xs text-gray-500">{path.primaryName || '未分类'} / {path.secondaryName || '未分类'}{material.brand ? ` · ${material.brand}` : ''}</p></div><div className="shrink-0 text-right"><p className={`text-lg font-bold ${low ? 'text-amber-600' : 'text-gray-900'}`}>{material.stock || 0}</p><p className="text-xs text-gray-400">{material.unit || '片'}</p></div></div>{material.remark && <p className="mt-1.5 line-clamp-1 text-xs text-gray-400">{material.remark}</p>}</div></div>
                  {isAdmin && <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3"><button onClick={(event) => { event.stopPropagation(); openInventory(material, 'in'); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-50 py-2 text-xs font-medium text-emerald-600"><ArrowDownCircle size={14} />入库</button><button onClick={(event) => { event.stopPropagation(); openInventory(material, 'out'); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-50 py-2 text-xs font-medium text-red-500"><ArrowUpCircle size={14} />出库</button></div>}
                </article>
              </div>;
            })}</div>
          </>}
      </section>

      <MaterialEditorModal open={showEditor} material={editingItem} categories={categories} saving={submitting} onClose={() => { setShowEditor(false); setEditingItem(null); }} onSubmit={handleSave} onManageCategories={() => setShowCategoryManager(true)} onWebPreview={showPreview} />
      <InventoryCategoryManager open={showCategoryManager} categories={categories} materials={materials} saving={savingCategories} onClose={() => setShowCategoryManager(false)} onSave={handleCategorySave} />
      {previewImages.length > 0 && <ImagePreviewModal images={previewImages} index={0} onIndexChange={() => {}} onClose={() => setPreviewImages([])} />}

      {showInventory && inventoryMaterial && <div className="fixed inset-0 z-[65] flex items-end bg-black/45 md:items-center md:justify-center md:p-4" onClick={() => setShowInventory(false)}><div className="w-full rounded-t-lg bg-white md:max-w-sm md:rounded-lg" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-gray-100 p-4"><h2 className="font-bold text-gray-900">{inventoryType === 'in' ? '材料入库' : '材料出库'}</h2><button onClick={() => setShowInventory(false)} className="p-1 text-gray-400"><X size={18} /></button></div><div className="space-y-3 p-4"><div className="flex items-center gap-3 rounded-md bg-gray-50 p-3"><PackageOpen size={18} className="text-gray-400" /><div><p className="text-sm font-medium">{inventoryMaterial.spec || inventoryMaterial.name}</p><p className="text-xs text-gray-400">当前库存 {inventoryMaterial.stock || 0} {inventoryMaterial.unit || ''}</p></div></div><label className="block text-xs text-gray-500">数量 *<input type="number" min="1" value={inventoryQty} onChange={(event) => setInventoryQty(event.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm outline-none" autoFocus /></label><label className="block text-xs text-gray-500">备注<input value={inventoryRemark} onChange={(event) => setInventoryRemark(event.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm outline-none" placeholder="采购来源或出库原因" /></label></div><div className="flex justify-end gap-2 border-t border-gray-100 p-4"><button onClick={() => setShowInventory(false)} className="rounded-md border border-gray-200 px-4 py-2 text-sm">取消</button><button onClick={handleInventory} className={`rounded-md px-4 py-2 text-sm font-medium text-white ${inventoryType === 'in' ? 'bg-emerald-600' : 'bg-red-500'}`}>确认{inventoryType === 'in' ? '入库' : '出库'}</button></div></div></div>}
    </div>
  );
}
