import { systemConfigsAPI } from '@/db/api';
import { generateId } from '@/utils/format';

export type ExpenseSubcategory = {
  id: string;
  name: string;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  children: ExpenseSubcategory[];
};

export type ExpenseCategoryPath = {
  primaryId: string;
  primaryName: string;
  secondaryId: string;
  secondaryName: string;
};

export type ExpenseCategorySource = {
  primaryCategoryId?: string;
  primaryCategory?: string;
  secondaryCategoryId?: string;
  secondaryCategory?: string;
  category?: string;
};

type RawCategory = { id?: unknown; name?: unknown; children?: unknown };
type RawSubcategory = { id?: unknown; name?: unknown };

export const EXPENSE_CATEGORY_CONFIG_ID = 'expense_categories_v1';

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'expense-primary-material',
    name: '材料费',
    children: [
      { id: 'expense-secondary-main-material', name: '主材采购' },
      { id: 'expense-secondary-aux-material', name: '辅材耗材' },
      { id: 'expense-secondary-equipment-material', name: '设备材料' },
    ],
  },
  {
    id: 'expense-primary-labor',
    name: '人工费',
    children: [
      { id: 'expense-secondary-construction-labor', name: '施工人工' },
      { id: 'expense-secondary-installation-labor', name: '安装人工' },
      { id: 'expense-secondary-temporary-labor', name: '临时用工' },
    ],
  },
  {
    id: 'expense-primary-outsourcing',
    name: '外包费',
    children: [
      { id: 'expense-secondary-special-outsourcing', name: '专项外包' },
      { id: 'expense-secondary-design-outsourcing', name: '设计外包' },
      { id: 'expense-secondary-service-outsourcing', name: '服务外包' },
    ],
  },
  {
    id: 'expense-primary-management',
    name: '管理费',
    children: [
      { id: 'expense-secondary-office-management', name: '办公行政' },
      { id: 'expense-secondary-transport-management', name: '交通差旅' },
      { id: 'expense-secondary-site-management', name: '现场管理' },
    ],
  },
  {
    id: 'expense-primary-other',
    name: '其他',
    children: [
      { id: 'expense-secondary-other', name: '其他支出' },
    ],
  },
];

function cloneCategories(categories: ExpenseCategory[]) {
  return categories.map((category) => ({
    ...category,
    children: category.children.map((child) => ({ ...child })),
  }));
}

export function normalizeExpenseCategories(value: unknown): ExpenseCategory[] {
  if (!Array.isArray(value)) return cloneCategories(DEFAULT_EXPENSE_CATEGORIES);
  const categories = value
    .map((categoryValue) => {
      const category = categoryValue as RawCategory;
      return ({
        id: String(category?.id || generateId()),
        name: String(category?.name || '').trim(),
        children: Array.isArray(category?.children)
          ? category.children
            .map((childValue) => {
              const child = childValue as RawSubcategory;
              return ({
                id: String(child?.id || generateId()),
                name: String(child?.name || '').trim(),
              });
            })
            .filter((child: ExpenseSubcategory) => child.name)
          : [],
      });
    })
    .filter((category: ExpenseCategory) => category.name);
  return categories.length ? categories : cloneCategories(DEFAULT_EXPENSE_CATEGORIES);
}

export async function loadExpenseCategories() {
  const doc = await systemConfigsAPI.doc(EXPENSE_CATEGORY_CONFIG_ID).get();
  return normalizeExpenseCategories(doc?.categories);
}

export async function saveExpenseCategories(categories: ExpenseCategory[]) {
  const normalized = normalizeExpenseCategories(categories);
  await systemConfigsAPI.doc(EXPENSE_CATEGORY_CONFIG_ID).set({
    categories: normalized,
    updatedAt: new Date().toISOString(),
  });
  return normalized;
}

export function resolveExpenseCategory(
  expense: ExpenseCategorySource,
  categories: ExpenseCategory[],
): ExpenseCategoryPath {
  const primaryById = categories.find((category) => category.id === expense?.primaryCategoryId);
  if (primaryById) {
    const secondaryById = primaryById.children.find((child) => child.id === expense?.secondaryCategoryId);
    if (secondaryById) {
      return {
        primaryId: primaryById.id,
        primaryName: primaryById.name,
        secondaryId: secondaryById.id,
        secondaryName: secondaryById.name,
      };
    }
  }

  const legacyPrimaryName = String(expense?.primaryCategory || '').trim();
  const legacySecondaryName = String(expense?.secondaryCategory || expense?.category || '').trim();
  const primaryByName = categories.find((category) => category.name === legacyPrimaryName);
  const candidateCategories = primaryByName ? [primaryByName] : categories;
  for (const category of candidateCategories) {
    const exactChild = category.children.find((child) => child.name === legacySecondaryName);
    if (exactChild) {
      return {
        primaryId: category.id,
        primaryName: category.name,
        secondaryId: exactChild.id,
        secondaryName: exactChild.name,
      };
    }
    if (category.name === legacySecondaryName) {
      const firstChild = category.children[0];
      return {
        primaryId: category.id,
        primaryName: category.name,
        secondaryId: firstChild?.id || '',
        secondaryName: firstChild?.name || category.name,
      };
    }
  }

  const fallback = categories[0];
  const fallbackChild = fallback?.children[0];
  return {
    primaryId: primaryByName?.id || fallback?.id || '',
    primaryName: legacyPrimaryName || primaryByName?.name || fallback?.name || '',
    secondaryId: fallbackChild?.id || '',
    secondaryName: legacySecondaryName || fallbackChild?.name || '',
  };
}

export function expenseCategoryPayload(path: ExpenseCategoryPath) {
  return {
    primaryCategoryId: path.primaryId,
    primaryCategory: path.primaryName,
    secondaryCategoryId: path.secondaryId,
    secondaryCategory: path.secondaryName,
    category: path.secondaryName,
  };
}
