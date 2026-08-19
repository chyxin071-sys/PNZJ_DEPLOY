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
  kind?: 'income' | 'expense';
  onChange: (selection: CategorySelection) => void;
}

export default function ExpenseCategoryPicker({
  categories,
  primaryId,
  secondaryId,
  kind = 'expense',
  onChange,
}: ExpenseCategoryPickerProps) {
  const primary = categories.find((category) => category.id === primaryId) || categories[0];
  const secondaryOptions = primary?.children || [];
  const isCompact = categories.length <= 1 && secondaryOptions.length <= 3;

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

  if (isCompact) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-400">
          <span>{primary?.name || (kind === 'income' ? '收入类别' : '费用类别')}</span>
          {secondaryOptions.length > 1 ? <span>选择明细</span> : null}
        </div>
        {secondaryOptions.length > 0 ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(secondaryOptions.length, 3)}, minmax(0, 1fr))` }}>
            {secondaryOptions.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => selectSecondary(child.id)}
                className={`rounded-md px-3 py-2 text-left text-xs font-medium leading-5 transition-colors ${
                  child.id === secondaryId
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {child.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3 text-center text-xs leading-5 text-gray-400">请先在类别管理中添加二级分类</div>
        )}
      </div>
    );
  }

  return (
    <div className="grid min-h-[220px] grid-cols-[minmax(120px,0.42fr)_minmax(0,0.58fr)] overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="min-w-0 border-r border-gray-200 bg-gray-50/60">
        <div className="border-b border-gray-100 px-3 py-2.5">
          <div className="text-xs font-medium text-gray-600">一级分类</div>
          <div className="mt-0.5 text-[11px] text-gray-400">{kind === 'income' ? '收入大类' : '费用大类'}</div>
        </div>
        <div className="max-h-[280px] space-y-1 overflow-y-auto p-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => selectPrimary(category.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-xs font-medium leading-5 transition-colors ${
                category.id === primary?.id
                  ? 'bg-gold-100 text-gold-700 ring-1 ring-inset ring-gold-300'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <div className="border-b border-gray-100 px-3 py-2.5">
          <div className="text-xs font-medium text-gray-600">二级分类</div>
          <div className="mt-0.5 truncate text-[11px] text-gray-400" title={primary?.name}>
            {primary?.name ? `${primary.name}下的明细` : '具体收支明细'}
          </div>
        </div>
        <div className="max-h-[280px] space-y-1 overflow-y-auto p-2">
          {secondaryOptions.length > 0 ? (
            secondaryOptions.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => selectSecondary(child.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-xs font-medium leading-5 transition-colors ${
                  child.id === secondaryId
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {child.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-xs leading-5 text-gray-400">请先在类别管理中添加二级分类</div>
          )}
        </div>
      </div>
    </div>
  );
}
