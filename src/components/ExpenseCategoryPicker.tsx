import type { ExpenseCategory } from '@/services/expenseCategories';

type CategorySelection = {
  primaryId: string;
  secondaryId: string;
  secondaryName: string;
};

interface ExpenseCategoryPickerProps {
  categories: ExpenseCategory[];
  primaryId: string;
  secondaryId: string;
  onChange: (selection: CategorySelection) => void;
}

export default function ExpenseCategoryPicker({
  categories,
  primaryId,
  secondaryId,
  onChange,
}: ExpenseCategoryPickerProps) {
  const primary = categories.find((category) => category.id === primaryId) || categories[0];
  const secondaryOptions = primary?.children || [];

  const selectPrimary = (nextPrimaryId: string) => {
    const nextPrimary = categories.find((category) => category.id === nextPrimaryId) || categories[0];
    const nextSecondary = nextPrimary?.children[0];
    onChange({
      primaryId: nextPrimary?.id || '',
      secondaryId: nextSecondary?.id || '',
      secondaryName: nextSecondary?.name || '',
    });
  };

  const selectSecondary = (nextSecondaryId: string) => {
    const nextSecondary = secondaryOptions.find((child) => child.id === nextSecondaryId);
    onChange({
      primaryId: primary?.id || '',
      secondaryId: nextSecondary?.id || '',
      secondaryName: nextSecondary?.name || '',
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">一级分类</span>
        <span className="text-[11px] text-gray-400">用于费用大类归集</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => selectPrimary(category.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              category.id === primary?.id
                ? 'bg-gold-100 text-gold-700 ring-1 ring-gold-300'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">二级分类</span>
          <span className="text-[11px] text-gray-400">用于具体支出明细</span>
        </div>
        <div className="flex flex-wrap gap-2">
        {secondaryOptions.length > 0 ? (
          secondaryOptions.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => selectSecondary(child.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                child.id === secondaryId
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {child.name}
            </button>
          ))
        ) : (
          <span className="text-xs text-gray-400">请先在支出类别管理中添加二级分类</span>
        )}
        </div>
      </div>
    </div>
  );
}
