import { systemConfigsAPI } from '@/db/api';
import { generateId } from '@/utils/format';
import type { ExpenseCategory, ExpenseCategoryPath } from '@/services/expenseCategories';
import { normalizeFinanceCategories } from '@/services/expenseCategories';

export const REIMBURSEMENT_PAYMENT_TYPE_CONFIG_ID = 'reimbursement_types_v1';

export const DEFAULT_REIMBURSEMENT_PAYMENT_TYPES: ExpenseCategory[] = [
  {
    id: 'reimbursement-primary-base',
    name: '基装',
    children: [
      { id: 'reimbursement-secondary-base-water-electric', name: '水电' },
      { id: 'reimbursement-secondary-base-carpentry', name: '木工' },
      { id: 'reimbursement-secondary-base-masonry', name: '瓦工' },
      { id: 'reimbursement-secondary-base-paint', name: '油漆' },
      { id: 'reimbursement-secondary-base-other', name: '其他基装' },
    ],
  },
  {
    id: 'reimbursement-primary-material',
    name: '主材',
    children: [
      { id: 'reimbursement-secondary-material-tile', name: '瓷砖' },
      { id: 'reimbursement-secondary-material-floor', name: '地板' },
      { id: 'reimbursement-secondary-material-bath', name: '洁具' },
      { id: 'reimbursement-secondary-material-light', name: '灯具' },
      { id: 'reimbursement-secondary-material-other', name: '其他主材' },
    ],
  },
  {
    id: 'reimbursement-primary-custom',
    name: '定制',
    children: [
      { id: 'reimbursement-secondary-custom-order', name: '定制下单' },
      { id: 'reimbursement-secondary-custom-install', name: '定制安装' },
      { id: 'reimbursement-secondary-custom-other', name: '其他定制' },
    ],
  },
  {
    id: 'reimbursement-primary-fee',
    name: '费用',
    children: [
      { id: 'reimbursement-secondary-fee-travel', name: '差旅费' },
      { id: 'reimbursement-secondary-fee-traffic', name: '交通费' },
      { id: 'reimbursement-secondary-fee-entertainment', name: '业务招待费' },
      { id: 'reimbursement-secondary-fee-purchase', name: '采购费' },
      { id: 'reimbursement-secondary-fee-other', name: '其他' },
    ],
  },
];

export function paymentTypeDisplay(path: Pick<ExpenseCategoryPath, 'primaryName' | 'secondaryName'>) {
  return [path.primaryName, path.secondaryName].map((item) => String(item || '').trim()).filter(Boolean).join('-');
}

function legacyTypesToCategories(types: unknown): ExpenseCategory[] | null {
  if (!Array.isArray(types)) return null;
  const children = [...new Set(types.map((item) => String(item || '').trim()).filter(Boolean))]
    .map((name) => ({ id: `reimbursement-secondary-${generateId()}`, name }));
  if (!children.length) return null;
  return [{ id: 'reimbursement-primary-fee', name: '费用', children }];
}

export function normalizeReimbursementPaymentTypes(doc: any): ExpenseCategory[] {
  const categories = Array.isArray(doc) ? doc : doc?.categories;
  if (Array.isArray(categories)) {
    return normalizeFinanceCategories(categories, DEFAULT_REIMBURSEMENT_PAYMENT_TYPES);
  }
  return legacyTypesToCategories(doc?.types) || normalizeFinanceCategories(undefined, DEFAULT_REIMBURSEMENT_PAYMENT_TYPES);
}

export async function loadReimbursementPaymentTypes() {
  const doc = await systemConfigsAPI.doc(REIMBURSEMENT_PAYMENT_TYPE_CONFIG_ID).get();
  return normalizeReimbursementPaymentTypes(doc);
}

export async function saveReimbursementPaymentTypes(categories: ExpenseCategory[], updatedBy?: string) {
  const normalized = normalizeFinanceCategories(categories, DEFAULT_REIMBURSEMENT_PAYMENT_TYPES);
  await systemConfigsAPI.doc(REIMBURSEMENT_PAYMENT_TYPE_CONFIG_ID).set({
    categories: normalized,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || '',
  });
  return normalized;
}

export function resolveReimbursementPaymentType(value: string | undefined, categories: ExpenseCategory[]): ExpenseCategoryPath {
  const text = String(value || '').trim();
  const [primaryText, secondaryText] = text.includes('-') ? text.split('-', 2).map((item) => item.trim()) : ['', text];
  const primaryByName = primaryText ? categories.find((category) => category.name === primaryText) : null;
  const candidates = primaryByName ? [primaryByName] : categories;

  for (const category of candidates) {
    const child = category.children.find((item) => item.name === secondaryText);
    if (child) {
      return {
        primaryId: category.id,
        primaryName: category.name,
        secondaryId: child.id,
        secondaryName: child.name,
      };
    }
  }

  const fallback = categories[0];
  const fallbackChild = fallback?.children[0];
  return {
    primaryId: primaryByName?.id || fallback?.id || '',
    primaryName: primaryText || primaryByName?.name || fallback?.name || '',
    secondaryId: fallbackChild?.id || '',
    secondaryName: secondaryText || fallbackChild?.name || '',
  };
}
