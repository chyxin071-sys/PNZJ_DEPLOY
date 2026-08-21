import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import type { ExpenseCategory, ExpenseCategorySource, FinanceCategoryKind } from '@/services/expenseCategories';
import { resolveExpenseCategory } from '@/services/expenseCategories';
import { useDialogStore } from '@/store/dialogStore';
import { generateId } from '@/utils/format';
import { useOverlayHistory } from '@/hooks/useOverlayHistory';

type Props = {
  open: boolean;
  categories: ExpenseCategory[];
  incomeCategories?: ExpenseCategory[];
  expenses: ExpenseCategorySource[];
  incomes?: ExpenseCategorySource[];
  initialKind?: FinanceCategoryKind;
  saving?: boolean;
  onClose: () => void;
  onSave: (categories: ExpenseCategory[]) => Promise<void>;
  onSaveIncome?: (categories: ExpenseCategory[]) => Promise<void>;
};

export default function ExpenseCategoryManager({ open, categories, incomeCategories, expenses, incomes = [], initialKind = 'expense', saving, onClose, onSave, onSaveIncome }: Props) {
  const { showConfirm } = useDialogStore();
  const [kind, setKind] = useState<FinanceCategoryKind>(initialKind);
  const [draft, setDraft] = useState<ExpenseCategory[]>([]);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState('');
  const [newPrimary, setNewPrimary] = useState('');
  const [newSecondary, setNewSecondary] = useState('');
  const [error, setError] = useState('');
  const requestClose = useOverlayHistory(open, onClose, 'pnzjExpenseCategoryManagerId');

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
  }, [open, initialKind]);

  const activeCategories = kind === 'income' ? (incomeCategories || categories) : categories;
  const activeRecords = kind === 'income' ? incomes : expenses;
  const activeLabel = kind === 'income' ? '收入' : '支出';

  useEffect(() => {
    if (!open) return;
    const next = activeCategories.map((category) => ({ ...category, children: category.children.map((child) => ({ ...child })) }));
    setDraft(next);
    setSelectedPrimaryId(next[0]?.id || '');
    setNewPrimary('');
    setNewSecondary('');
    setError('');
  }, [open, activeCategories, kind]);

  const categorySignature = (items: ExpenseCategory[]) => JSON.stringify(items.map((category) => ({
    id: category.id,
    name: category.name,
    children: category.children.map((child) => ({ id: child.id, name: child.name })),
  })));
  const hasUnsavedChanges = categorySignature(draft) !== categorySignature(activeCategories);
  const usage = useMemo(() => {
    const primary = new Map<string, number>();
    const secondary = new Map<string, number>();
    activeRecords.forEach((expense) => {
      const path = resolveExpenseCategory(expense, activeCategories);
      if (path.primaryId) primary.set(path.primaryId, (primary.get(path.primaryId) || 0) + 1);
      if (path.secondaryId) secondary.set(path.secondaryId, (secondary.get(path.secondaryId) || 0) + 1);
    });
    return { primary, secondary };
  }, [activeCategories, activeRecords]);

  if (!open) return null;

  const addPrimary = () => {
    const name = newPrimary.trim();
    if (!name) return;
    if (draft.some((category) => category.name === name)) {
      setError('一级分类名称不能重复');
      return;
    }
    const category = { id: generateId(), name, children: [] };
    setDraft((current) => [...current, category]);
    setSelectedPrimaryId(category.id);
    setNewPrimary('');
    setError('');
  };

  const addSecondaryToCategory = (categoryId: string) => {
    const name = newSecondary.trim();
    const category = draft.find((item) => item.id === categoryId);
    if (!name || !category) return;
    if (category.children.some((child) => child.name === name)) {
      setError('同一一级分类下，二级分类名称不能重复');
      return;
    }
    setDraft((current) => current.map((item) => item.id === categoryId
      ? { ...item, children: [...item.children, { id: generateId(), name }] }
      : item));
    setSelectedPrimaryId(categoryId);
    setNewSecondary('');
    setError('');
  };

  const deletePrimary = (category: ExpenseCategory) => {
    if (usage.primary.get(category.id)) {
      setError(`“${category.name}”下已有${activeLabel}记录，需先调整${activeLabel}分类后才能删除`);
      return;
    }
    const next = draft.filter((item) => item.id !== category.id);
    setDraft(next);
    setSelectedPrimaryId(next[0]?.id || '');
  };

  const deleteSecondary = (categoryId: string, id: string, name: string) => {
    if (usage.secondary.get(id)) {
      setError(`“${name}”下已有${activeLabel}记录，需先调整${activeLabel}分类后才能删除`);
      return;
    }
    setDraft((current) => current.map((category) => category.id === categoryId
      ? { ...category, children: category.children.filter((child) => child.id !== id) }
      : category));
    setSelectedPrimaryId(categoryId);
  };

  const updatePrimaryName = (id: string, name: string) => {
    setDraft((current) => current.map((category) => category.id === id ? { ...category, name } : category));
  };

  const saveDraft = async () => {
    const normalized = draft.map((category) => ({
      ...category,
      name: category.name.trim(),
      children: category.children.map((child) => ({ ...child, name: child.name.trim() })),
    }));
    if (!normalized.length || normalized.some((category) => !category.name || !category.children.length || category.children.some((child) => !child.name))) {
      setError('每个一级分类至少需要一个名称完整的二级分类');
      return false;
    }
    const primaryNames = normalized.map((category) => category.name);
    if (new Set(primaryNames).size !== primaryNames.length) {
      setError('一级分类名称不能重复');
      return false;
    }
    if (normalized.some((category) => new Set(category.children.map((child) => child.name)).size !== category.children.length)) {
      setError('同一一级分类下，二级分类名称不能重复');
      return false;
    }
    setError('');
    if (kind === 'income') await (onSaveIncome || onSave)(normalized);
    else await onSave(normalized);
    return true;
  };

  const submit = async () => {
    try {
      if (await saveDraft()) onClose();
    } catch {
      // 保存失败由页面提示，弹窗保持打开。
    }
  };

  const switchKind = async (nextKind: FinanceCategoryKind) => {
    if (nextKind === kind || saving) return;
    if (newPrimary.trim() || newSecondary.trim()) {
      setError('还有未添加的分类名称，请先点击“添加”后再保存并切换');
      return;
    }
    if (!hasUnsavedChanges) {
      setKind(nextKind);
      return;
    }
    const confirmed = await showConfirm(
      `当前${activeLabel}类别有未保存的修改，是否保存后切换到${nextKind === 'income' ? '收入类别' : '支出类别'}？`,
      { title: '保存分类修改', confirmText: '保存并切换', cancelText: '继续编辑' },
    );
    if (!confirmed) return;
    try {
      if (await saveDraft()) setKind(nextKind);
    } catch {
      // 保存失败由页面提示，保留当前草稿供继续处理。
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/45 md:items-center md:justify-center md:p-5" onClick={requestClose}>
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg bg-white md:max-w-3xl md:rounded" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">收支类别管理</h2>
            <p className="mt-0.5 text-xs text-gray-400">收入和支出分开维护，一级用于归集，二级用于录入和明细分析</p>
          </div>
          <button type="button" onClick={requestClose} className="p-2 text-gray-400 hover:text-gray-700" aria-label="关闭收支类别管理"><X size={18} /></button>
        </div>

        <div className="flex gap-2 border-b border-gray-100 px-5 py-3">
          {(['income', 'expense'] as FinanceCategoryKind[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void switchKind(item)}
              disabled={saving}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${kind === item ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              {item === 'income' ? '收入类别' : '支出类别'}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex gap-2">
            <input
              value={newPrimary}
              onChange={(event) => setNewPrimary(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addPrimary(); } }}
              placeholder="新增一级分类"
              className="min-w-0 flex-1 rounded border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
            <button type="button" onClick={addPrimary} className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-900 text-white" aria-label="添加一级分类"><Plus size={16} /></button>
          </div>

          <div className="space-y-2">
            {draft.map((category) => (
              <div key={category.id} className="rounded border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={category.name}
                    onFocus={() => setSelectedPrimaryId(category.id)}
                    onChange={(event) => updatePrimaryName(category.id, event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-800 outline-none"
                    aria-label="一级分类名称"
                  />
                  <span className="shrink-0 text-[11px] text-gray-400">{category.children.length} 类 · {usage.primary.get(category.id) || 0} 笔</span>
                  <button
                    type="button"
                    onClick={() => deletePrimary(category)}
                    className="p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-40"
                    disabled={draft.length <= 1}
                    aria-label="删除一级分类"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {category.children.map((child) => (
                    <div key={child.id} className="flex items-center gap-2 rounded bg-white px-2 py-1.5">
                      <input
                        value={child.name}
                        onFocus={() => setSelectedPrimaryId(category.id)}
                        onChange={(event) => {
                          setSelectedPrimaryId(category.id);
                          setDraft((current) => current.map((item) => item.id === category.id
                            ? { ...item, children: item.children.map((nextChild) => nextChild.id === child.id ? { ...nextChild, name: event.target.value } : nextChild) }
                            : item));
                        }}
                        className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 outline-none"
                        aria-label="二级分类名称"
                      />
                      <span className="shrink-0 text-[11px] text-gray-400">{usage.secondary.get(child.id) || 0} 笔</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPrimaryId(category.id);
                          deleteSecondary(category.id, child.id, child.name);
                        }}
                        className="p-1 text-gray-300 hover:text-red-500"
                        aria-label="删除二级分类"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    value={selectedPrimaryId === category.id ? newSecondary : ''}
                    onFocus={() => setSelectedPrimaryId(category.id)}
                    onChange={(event) => {
                      setSelectedPrimaryId(category.id);
                      setNewSecondary(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addSecondaryToCategory(category.id);
                      }
                    }}
                    placeholder={`给“${category.name || '该分类'}”添加二级分类`}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addSecondaryToCategory(category.id);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white text-gray-700 ring-1 ring-gray-200"
                    aria-label="添加二级分类"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <div className="border-t border-red-100 bg-red-50 px-5 py-2.5 text-xs text-red-600">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={requestClose} className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600">取消</button>
          <button type="button" onClick={submit} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? '保存中...' : <><Check size={15} /> 保存分类</>}
          </button>
        </div>
      </div>
    </div>
  );
}
