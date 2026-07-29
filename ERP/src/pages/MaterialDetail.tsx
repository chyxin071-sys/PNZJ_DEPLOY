import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowDownCircle, ArrowLeft, ArrowUpCircle, Loader2, PackageOpen, X } from 'lucide-react';
import { inventoryRecordsAPI, materialsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';
import { useSmartBack } from '@/hooks/useSmartBack';
import { uploadFile } from '@/utils/cloudStorage';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import InventoryCategoryManager from '@/components/InventoryCategoryManager';
import MaterialEditorModal, { type MaterialEditorDraft } from '@/components/MaterialEditorModal';
import MaterialImage from '@/components/MaterialImage';
import {
  categoryPayload, ensureCategoryPath, getMaterialImageID, inventoryErrorMessage, loadInventoryCategories,
  resolveMaterialCategory, saveCategoriesAndMigrateMaterials, saveInventoryCategories,
  type InventoryCategory, type MaterialRecord,
} from '@/services/inventoryCategories';

type InventoryRecord = {
  _id?: string;
  id?: number;
  type: 'in' | 'out';
  qty?: number;
  stockAfter?: number;
  remark?: string;
  operator?: string;
  createdAt: string;
};

export default function MaterialDetail() {
  const { id } = useParams();
  const smartBack = useSmartBack('/materials');
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [material, setMaterial] = useState<MaterialRecord | null>(null);
  const [allMaterials, setAllMaterials] = useState<MaterialRecord[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [inventoryType, setInventoryType] = useState<'in' | 'out'>('in');
  const [inventoryQty, setInventoryQty] = useState('');
  const [inventoryRemark, setInventoryRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [current, materials, tree, recordList] = await Promise.all([
      materialsAPI.get(id as string), materialsAPI.toArray(), loadInventoryCategories(),
      inventoryRecordsAPI.where({ materialId: id }).toArray().catch(() => []),
    ]);
    setMaterial(current); setAllMaterials(materials); setCategories(tree); setRecords(recordList);
    setLoading(false);
  }, [id]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const saveMaterial = async (draft: MaterialEditorDraft) => {
    if (!material) return;
    setSubmitting(true);
    try {
      const ensured = ensureCategoryPath(categories, draft.primaryCategoryName, draft.secondaryCategoryName);
      if (JSON.stringify(ensured.categories) !== JSON.stringify(categories)) {
        setCategories(await saveInventoryCategories(ensured.categories));
      }
      let imageFileID = draft.imageFileID;
      if (draft.imageFile) imageFileID = (await uploadFile(draft.imageFile, `inventory/materials/${material._id}`)).fileID;
      await materialsAPI.update(material._id, {
        name: draft.name.trim(), brand: draft.brand.trim(), spec: draft.spec.trim(), color: draft.color.trim(),
        unit: draft.unit.trim() || '片', price: Number(draft.price) || 0, stock: Number(draft.stock) || 0,
        supplier: draft.supplier.trim(), remark: draft.remark.trim(), status: draft.status,
        imageFileID, ...categoryPayload(ensured.path), updatedAt: new Date().toISOString(),
      });
      setShowEdit(false);
      await fetchData();
    } catch (error: unknown) {
      alert(inventoryErrorMessage(error, '保存失败'));
    } finally { setSubmitting(false); }
  };
  const saveCategories = async (next: InventoryCategory[]) => {
    setSavingCategories(true);
    try {
      setCategories(await saveCategoriesAndMigrateMaterials(categories, next, allMaterials));
      setShowCategoryManager(false);
      await fetchData();
    } catch (error: unknown) { alert(inventoryErrorMessage(error, '分类保存失败')); }
    finally { setSavingCategories(false); }
  };
  const openInventory = (type: 'in' | 'out') => {
    setInventoryType(type); setInventoryQty(''); setInventoryRemark(''); setShowInventory(true);
  };
  const handleInventory = () => {
    if (!material) return;
    const qty = Number(inventoryQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const newStock = inventoryType === 'in' ? Number(material.stock || 0) + qty : Math.max(0, Number(material.stock || 0) - qty);
    const record = {
      id: Date.now(), materialId: material._id, materialName: material.name, category: material.category || '',
      brand: material.brand || '', spec: material.spec || '', color: material.color || '', type: inventoryType,
      qty, stockAfter: newStock, remark: inventoryRemark, operator: user?.name || '未知', createdAt: new Date().toISOString(),
    };
    setMaterial({ ...material, stock: newStock }); setRecords((current) => [record, ...current]); setShowInventory(false);
    inventoryRecordsAPI.add(record).catch(() => {});
    materialsAPI.update(material._id, { stock: newStock }).catch(fetchData);
  };

  if (loading) return <div className="erp-page flex justify-center py-24"><Loader2 size={26} className="animate-spin text-gray-400" /></div>;
  if (!material) return <div className="erp-page"><div className="flex items-center gap-3"><button onClick={() => smartBack()} className="p-2"><ArrowLeft size={19} /></button><h1 className="font-bold">材料不存在</h1></div></div>;

  const path = resolveMaterialCategory(material, categories);
  const inTotal = records.filter((record) => record.type === 'in').reduce((sum, record) => sum + Number(record.qty || 0), 0);
  const outTotal = records.filter((record) => record.type === 'out').reduce((sum, record) => sum + Number(record.qty || 0), 0);
  const low = Number(material.stock || 0) <= 10;
  const showPreview = (url: string) => setPreviewImages([url]);

  return (
    <div className="erp-page">
      <header className="mb-4 flex items-center gap-2">
        <button onClick={() => smartBack()} className="rounded-md p-2 text-gray-600 hover:bg-gray-100"><ArrowLeft size={19} /></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-base font-bold text-gray-900 md:text-lg">{material.spec || '未填写型号'} {material.color && <span className="text-amber-600">#{material.color}</span>}</h1><p className="truncate text-xs text-gray-400">{path.primaryName || '未分类'} / {path.secondaryName || '未分类'}{material.brand ? ` · ${material.brand}` : ''}</p></div>
        {isAdmin && <button onClick={() => setShowEdit(true)} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">编辑</button>}
      </header>

      <section className="mb-4 rounded-md border border-gray-100 bg-white p-4">
        <div className="flex items-start gap-4">
          <MaterialImage fileID={getMaterialImageID(material)} className="h-24 w-24 rounded-md md:h-32 md:w-32" onWebPreview={showPreview} />
          <div className="min-w-0 flex-1"><p className="text-xs text-gray-400">当前库存</p><p className={`mt-1 text-3xl font-bold ${low ? 'text-amber-600' : 'text-gray-900'}`}>{material.stock || 0}<span className="ml-1 text-sm font-normal text-gray-400">{material.unit || '片'}</span></p>{low && <p className="mt-1 text-xs text-amber-600">库存不足</p>}{material.name && <p className="mt-3 truncate text-sm text-gray-700">{material.name}</p>}{material.supplier && <p className="mt-1 truncate text-xs text-gray-400">供应商：{material.supplier}</p>}</div>
          {isAdmin && <div className="hidden gap-2 md:flex"><button onClick={() => openInventory('in')} className="flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-600"><ArrowDownCircle size={14} />入库</button><button onClick={() => openInventory('out')} className="flex items-center gap-1 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-500"><ArrowUpCircle size={14} />出库</button></div>}
        </div>
        {isAdmin && <div className="mt-4 flex gap-2 md:hidden"><button onClick={() => openInventory('in')} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-50 py-2.5 text-xs font-medium text-emerald-600"><ArrowDownCircle size={14} />入库</button><button onClick={() => openInventory('out')} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-50 py-2.5 text-xs font-medium text-red-500"><ArrowUpCircle size={14} />出库</button></div>}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-4">{[['累计入库', inTotal, 'text-emerald-600'], ['累计出库', outTotal, 'text-red-500'], ['操作次数', records.length, 'text-gray-900']].map(([label, value, color]) => <div key={String(label)} className="rounded-md bg-gray-50 p-3"><p className="truncate text-[11px] text-gray-400">{label}</p><p className={`mt-1 text-lg font-bold ${color}`}>{value}</p></div>)}</div>
        {material.remark && <p className="mt-4 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500">备注：{material.remark}</p>}
      </section>

      <section><h2 className="mb-3 text-sm font-semibold text-gray-900">出入库记录</h2>{records.length === 0 ? <div className="rounded-md border border-gray-100 bg-white py-12 text-center text-sm text-gray-400">暂无出入库记录</div> : <div className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-100 bg-white">{records.map((record) => <article key={record._id || record.id} className="p-3.5"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2.5"><div className={`flex h-8 w-8 items-center justify-center rounded-md ${record.type === 'in' ? 'bg-emerald-50' : 'bg-red-50'}`}>{record.type === 'in' ? <ArrowDownCircle size={16} className="text-emerald-500" /> : <ArrowUpCircle size={16} className="text-red-500" />}</div><div><p className="text-sm font-medium text-gray-900">{record.type === 'in' ? '入库' : '出库'} {record.qty} {material.unit || '片'}</p><p className="mt-0.5 text-xs text-gray-400">{new Date(record.createdAt).toLocaleString()}</p></div></div><div className="text-right"><p className="text-[11px] text-gray-400">操作后库存</p><p className="text-sm font-semibold text-gray-700">{record.stockAfter ?? '-'}</p></div></div>{record.remark && <p className="mt-2 text-xs text-gray-500">{record.remark}</p>}<p className="mt-1 text-xs text-gray-400">操作人：{record.operator || '未知'}</p></article>)}</div>}</section>

      <MaterialEditorModal open={showEdit} material={material} categories={categories} saving={submitting} onClose={() => setShowEdit(false)} onSubmit={saveMaterial} onManageCategories={() => setShowCategoryManager(true)} onWebPreview={showPreview} />
      <InventoryCategoryManager open={showCategoryManager} categories={categories} materials={allMaterials} saving={savingCategories} onClose={() => setShowCategoryManager(false)} onSave={saveCategories} />
      {previewImages.length > 0 && <ImagePreviewModal images={previewImages} index={0} onIndexChange={() => {}} onClose={() => setPreviewImages([])} />}
      {showInventory && <div className="fixed inset-0 z-[65] flex items-end bg-black/45 md:items-center md:justify-center md:p-4" onClick={() => setShowInventory(false)}><div className="w-full rounded-t-lg bg-white md:max-w-sm md:rounded-lg" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-gray-100 p-4"><h2 className="font-bold">{inventoryType === 'in' ? '材料入库' : '材料出库'}</h2><button onClick={() => setShowInventory(false)} className="text-gray-400"><X size={18} /></button></div><div className="space-y-3 p-4"><div className="flex items-center gap-3 rounded-md bg-gray-50 p-3"><PackageOpen size={18} className="text-gray-400" /><div><p className="text-sm font-medium">{material.spec}</p><p className="text-xs text-gray-400">当前库存 {material.stock || 0} {material.unit || ''}</p></div></div><label className="block text-xs text-gray-500">数量 *<input type="number" min="1" value={inventoryQty} onChange={(event) => setInventoryQty(event.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm outline-none" autoFocus /></label><label className="block text-xs text-gray-500">备注<input value={inventoryRemark} onChange={(event) => setInventoryRemark(event.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm outline-none" /></label></div><div className="flex justify-end gap-2 border-t border-gray-100 p-4"><button onClick={() => setShowInventory(false)} className="rounded-md border border-gray-200 px-4 py-2 text-sm">取消</button><button onClick={handleInventory} className={`rounded-md px-4 py-2 text-sm font-medium text-white ${inventoryType === 'in' ? 'bg-emerald-600' : 'bg-red-500'}`}>确认{inventoryType === 'in' ? '入库' : '出库'}</button></div></div></div>}
    </div>
  );
}
