import { materialsAPI, systemConfigsAPI } from '@/db/api';
import { generateId } from '@/utils/format';

export type InventorySubcategory = {
  id: string;
  name: string;
};

export type InventoryCategory = {
  id: string;
  name: string;
  children: InventorySubcategory[];
};

export type MaterialCategoryPath = {
  primaryId: string;
  primaryName: string;
  secondaryId: string;
  secondaryName: string;
};

export type MaterialCategorySource = {
  _id?: string;
  primaryCategoryId?: string;
  primaryCategory?: string;
  secondaryCategoryId?: string;
  secondaryCategory?: string;
  category?: string;
  imageFileID?: string;
  image?: string;
  images?: string[];
};

export type MaterialRecord = MaterialCategorySource & {
  _id: string;
  name?: string;
  brand?: string;
  spec?: string;
  color?: string;
  unit?: string;
  price?: number;
  stock?: number;
  supplier?: string;
  remark?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RawCategory = { id?: unknown; name?: unknown; children?: unknown };
type RawSubcategory = { id?: unknown; name?: unknown };

export const INVENTORY_CATEGORY_CONFIG_ID = 'inventory_categories_v1';

export const DEFAULT_INVENTORY_CATEGORIES: InventoryCategory[] = [
  {
    id: 'inventory-primary-tiles',
    name: '瓷砖',
    children: [
      { id: 'inventory-secondary-large-floor-tile', name: '大地砖' },
      { id: 'inventory-secondary-small-floor-tile', name: '小地砖' },
      { id: 'inventory-secondary-wall-tile', name: '墙砖' },
    ],
  },
];

function cloneCategories(categories: InventoryCategory[]) {
  return categories.map((category) => ({
    ...category,
    children: category.children.map((child) => ({ ...child })),
  }));
}

export function normalizeInventoryCategories(value: unknown): InventoryCategory[] {
  if (!Array.isArray(value)) return cloneCategories(DEFAULT_INVENTORY_CATEGORIES);
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
          .filter((child: InventorySubcategory) => child.name)
        : [],
      });
    })
    .filter((category: InventoryCategory) => category.name);
  return categories.length ? categories : cloneCategories(DEFAULT_INVENTORY_CATEGORIES);
}

export async function loadInventoryCategories() {
  const doc = await systemConfigsAPI.doc(INVENTORY_CATEGORY_CONFIG_ID).get();
  return normalizeInventoryCategories(doc?.categories);
}

export async function saveInventoryCategories(categories: InventoryCategory[]) {
  const normalized = normalizeInventoryCategories(categories);
  await systemConfigsAPI.doc(INVENTORY_CATEGORY_CONFIG_ID).set({
    categories: normalized,
    updatedAt: new Date().toISOString(),
  });
  return normalized;
}

export async function saveCategoriesAndMigrateMaterials(
  previous: InventoryCategory[],
  categories: InventoryCategory[],
  materials: MaterialCategorySource[],
) {
  const normalized = await saveInventoryCategories(categories);
  await Promise.all(materials.map(async (material) => {
    const oldPath = resolveMaterialCategory(material, previous);
    const primary = normalized.find((category) => category.id === oldPath.primaryId);
    const secondary = primary?.children.find((child) => child.id === oldPath.secondaryId);
    if (!primary || !secondary) return;
    const nextPath = {
      primaryId: primary.id,
      primaryName: primary.name,
      secondaryId: secondary.id,
      secondaryName: secondary.name,
    };
    if (material._id) await materialsAPI.update(material._id, categoryPayload(nextPath));
  }));
  return normalized;
}

export function resolveMaterialCategory(
  material: MaterialCategorySource,
  categories: InventoryCategory[],
): MaterialCategoryPath {
  const primaryById = categories.find((category) => category.id === material?.primaryCategoryId);
  if (primaryById) {
    const secondaryById = primaryById.children.find((child) => child.id === material?.secondaryCategoryId);
    if (secondaryById) {
      return {
        primaryId: primaryById.id,
        primaryName: primaryById.name,
        secondaryId: secondaryById.id,
        secondaryName: secondaryById.name,
      };
    }
  }

  const legacySecondaryName = String(material?.secondaryCategory || material?.category || '').trim();
  const legacyPrimaryName = String(material?.primaryCategory || '').trim();
  const primaryByName = categories.find((category) => category.name === legacyPrimaryName);
  const candidateCategories = primaryByName ? [primaryByName] : categories;
  for (const category of candidateCategories) {
    const child = category.children.find((item) => item.name === legacySecondaryName);
    if (child) {
      return {
        primaryId: category.id,
        primaryName: category.name,
        secondaryId: child.id,
        secondaryName: child.name,
      };
    }
  }

  return {
    primaryId: primaryByName?.id || '',
    primaryName: legacyPrimaryName || primaryByName?.name || '',
    secondaryId: '',
    secondaryName: legacySecondaryName,
  };
}

export function ensureCategoryPath(
  categories: InventoryCategory[],
  primaryNameInput: string,
  secondaryNameInput: string,
) {
  const primaryName = primaryNameInput.trim();
  const secondaryName = secondaryNameInput.trim();
  const next = cloneCategories(categories);
  let primary = next.find((category) => category.name === primaryName);
  if (!primary) {
    primary = { id: generateId(), name: primaryName, children: [] };
    next.push(primary);
  }
  let secondary = primary.children.find((child) => child.name === secondaryName);
  if (!secondary) {
    secondary = { id: generateId(), name: secondaryName };
    primary.children.push(secondary);
  }
  return {
    categories: next,
    path: {
      primaryId: primary.id,
      primaryName: primary.name,
      secondaryId: secondary.id,
      secondaryName: secondary.name,
    } satisfies MaterialCategoryPath,
  };
}

export function categoryPayload(path: MaterialCategoryPath) {
  return {
    primaryCategoryId: path.primaryId,
    primaryCategory: path.primaryName,
    secondaryCategoryId: path.secondaryId,
    secondaryCategory: path.secondaryName,
    category: path.secondaryName,
  };
}

export function getMaterialImageID(material?: MaterialCategorySource | null) {
  return String(
    material?.imageFileID
    || material?.image
    || (Array.isArray(material?.images) ? material.images[0] : '')
    || '',
  );
}
