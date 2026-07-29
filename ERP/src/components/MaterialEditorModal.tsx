import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Trash2, Upload, X } from 'lucide-react';
import MaterialImage from '@/components/MaterialImage';
import Select from '@/components/Select';
import type { InventoryCategory, MaterialRecord } from '@/services/inventoryCategories';
import { getMaterialImageID, resolveMaterialCategory } from '@/services/inventoryCategories';

export type MaterialEditorDraft = {
  name: string;
  brand: string;
  spec: string;
  color: string;
  unit: string;
  price: string;
  stock: string;
  supplier: string;
  remark: string;
  status: string;
  primaryCategoryName: string;
  secondaryCategoryName: string;
  imageFileID: string;
  imageFile: File | null;
};

type Props = {
  open: boolean;
  material?: MaterialRecord | null;
  categories: InventoryCategory[];
  saving?: boolean;
  onClose: () => void;
  onSubmit: (draft: MaterialEditorDraft) => Promise<void>;
  onManageCategories: () => void;
  onWebPreview: (url: string) => void;
};

const inputClass = 'w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-500';

export default function MaterialEditorModal({
  open, material, categories, saving, onClose, onSubmit, onManageCategories, onWebPreview,
}: Props) {
  const [draft, setDraft] = useState<MaterialEditorDraft | null>(null);
  const [localPreview, setLocalPreview] = useState('');
  const [error, setError] = useState('');
  const [customPrimary, setCustomPrimary] = useState(false);
  const [customSecondary, setCustomSecondary] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fallbackPrimary = categories[0];
    const fallbackSecondary = fallbackPrimary?.children[0];
    const path = material ? resolveMaterialCategory(material, categories) : null;
    setDraft({
      name: material?.name || '',
      brand: material?.brand || '',
      spec: material?.spec || '',
      color: material?.color || '',
      unit: material?.unit || '片',
      price: String(material?.price || ''),
      stock: String(material?.stock ?? ''),
      supplier: material?.supplier || '',
      remark: material?.remark || '',
      status: material?.status || 'active',
      primaryCategoryName: path?.primaryName || fallbackPrimary?.name || '',
      secondaryCategoryName: path?.secondaryName || fallbackSecondary?.name || '',
      imageFileID: getMaterialImageID(material),
      imageFile: null,
    });
    setLocalPreview('');
    setError('');
    setCustomPrimary(Boolean(path?.primaryName && !categories.some((category) => category.name === path.primaryName)));
    setCustomSecondary(Boolean(path?.secondaryName && !categories.some((category) => category.children.some((child) => child.name === path.secondaryName))));
  }, [open, material, categories]);

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const secondaryOptions = useMemo(() => {
    if (!draft) return [];
    return categories.find((category) => category.name === draft.primaryCategoryName)?.children || [];
  }, [categories, draft]);
  const selectedPrimary = draft
    ? categories.find((category) => category.name === draft.primaryCategoryName)
    : undefined;
  const selectedSecondary = draft
    ? secondaryOptions.find((child) => child.name === draft.secondaryCategoryName)
    : undefined;

  if (!open || !draft) return null;

  const update = <K extends keyof MaterialEditorDraft>(field: K, value: MaterialEditorDraft[K]) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const chooseImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(URL.createObjectURL(file));
    setDraft((current) => current ? { ...current, imageFile: file } : current);
    setError('');
  };
  const clearImage = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview('');
    setDraft((current) => current ? { ...current, imageFile: null, imageFileID: '' } : current);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.spec.trim()) return setError('请填写型号');
    if (!draft.primaryCategoryName.trim() || !draft.secondaryCategoryName.trim()) return setError('请填写一级和二级分类');
    setError('');
    await onSubmit(draft);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/45 md:items-center md:justify-center md:p-5" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-lg bg-white md:max-w-2xl md:rounded-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">{material ? '编辑材料' : '新增材料'}</h2>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700" aria-label="关闭"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-800">材料图片 <span className="font-normal text-gray-400">（选填）</span></label>
              {(draft.imageFileID || draft.imageFile) && <button type="button" onClick={clearImage} className="flex items-center gap-1 text-xs text-red-500"><Trash2 size={13} /> 移除</button>}
            </div>
            <div className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 p-3">
              {localPreview ? (
                <button type="button" onClick={() => onWebPreview(localPreview)} className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-white"><img src={localPreview} alt="待上传材料图片" className="h-full w-full object-cover" /></button>
              ) : (
                <MaterialImage fileID={draft.imageFileID} className="h-20 w-20 rounded-md" onWebPreview={onWebPreview} />
              )}
              <div className="min-w-0 flex-1">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {draft.imageFileID || draft.imageFile ? <Upload size={15} /> : <ImagePlus size={15} />}
                  {draft.imageFileID || draft.imageFile ? '更换图片' : '上传图片'}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => chooseImage(event.target.files?.[0])} />
                </label>
                <p className="mt-1.5 text-xs text-gray-400">支持常见图片格式；不上传也可保存材料。</p>
              </div>
            </div>
          </section>

          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-800">材料分类</h3>
              <button type="button" onClick={onManageCategories} className="text-xs font-medium text-amber-600">分类管理</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="text-xs text-gray-500">一级分类 *
                <Select
                  value={customPrimary ? '__custom__' : selectedPrimary?.id || ''}
                  onChange={(value) => {
                    if (value === '__custom__') {
                      setCustomPrimary(true); setCustomSecondary(true);
                      setDraft((current) => current ? { ...current, primaryCategoryName: '', secondaryCategoryName: '' } : current);
                      return;
                    }
                    const category = categories.find((item) => item.id === value);
                    setCustomPrimary(false); setCustomSecondary(false);
                    setDraft((current) => current ? { ...current, primaryCategoryName: category?.name || '', secondaryCategoryName: category?.children[0]?.name || '' } : current);
                  }}
                  options={[...categories.map((category) => ({ value: category.id, label: category.name, description: `${category.children.length} 个二级分类` })), { value: '__custom__', label: '＋ 新建一级分类' }]}
                  placeholder="选择一级分类"
                  sheetTitle="选择一级分类"
                  className="mt-1"
                />
                {customPrimary && <input autoFocus value={draft.primaryCategoryName} onChange={(event) => update('primaryCategoryName', event.target.value)} className={`${inputClass} mt-2`} placeholder="输入新一级分类名称" />}
              </div>
              <div className="text-xs text-gray-500">二级分类 *
                <Select
                  value={customSecondary ? '__custom__' : selectedSecondary?.id || ''}
                  onChange={(value) => {
                    if (value === '__custom__') {
                      setCustomSecondary(true); update('secondaryCategoryName', ''); return;
                    }
                    const child = secondaryOptions.find((item) => item.id === value);
                    setCustomSecondary(false); update('secondaryCategoryName', child?.name || '');
                  }}
                  options={[...secondaryOptions.map((child) => ({ value: child.id, label: child.name })), { value: '__custom__', label: '＋ 新建二级分类' }]}
                  placeholder="选择二级分类"
                  sheetTitle="选择二级分类"
                  className="mt-1"
                />
                {customSecondary && <input autoFocus value={draft.secondaryCategoryName} onChange={(event) => update('secondaryCategoryName', event.target.value)} className={`${inputClass} mt-2`} placeholder="输入新二级分类名称" />}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">选择“新建分类”可输入名称，保存材料后会自动沉淀到分类库。</p>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-500">型号 *<input value={draft.spec} onChange={(event) => update('spec', event.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-gray-500">色号<input value={draft.color} onChange={(event) => update('color', event.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-gray-500">材料名称<input value={draft.name} onChange={(event) => update('name', event.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-gray-500">品牌<input value={draft.brand} onChange={(event) => update('brand', event.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-gray-500">库存<input type="number" min="0" value={draft.stock} onChange={(event) => update('stock', event.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-gray-500">单位<input value={draft.unit} onChange={(event) => update('unit', event.target.value)} className={`${inputClass} mt-1`} placeholder="片/箱/件" /></label>
            <label className="text-xs text-gray-500">参考单价<input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => update('price', event.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-gray-500">供应商<input value={draft.supplier} onChange={(event) => update('supplier', event.target.value)} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs text-gray-500 md:col-span-2">备注<textarea value={draft.remark} onChange={(event) => update('remark', event.target.value)} rows={3} className={`${inputClass} mt-1 resize-none`} /></label>
          </section>
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-gray-100 bg-white px-5 py-4">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600">取消</button>
            <button type="submit" disabled={saving} className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中...' : '确认保存'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
