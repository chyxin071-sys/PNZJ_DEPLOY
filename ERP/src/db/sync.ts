import { cloudDB, COLLECTIONS } from './cloudbase';
import {
  leadsAPI, projectsAPI, quotesAPI, followUpsAPI,
  projectLogsAPI, projectInspectionsAPI, todosAPI,
  contractsAPI, receiptsAPI, expensesAPI, reimbursementsAPI,
  generalIncomesAPI, generalExpensesAPI, notificationsAPI,
  materialsAPI, quotationsAPI,
} from './api';

type Updates = Record<string, any>;

const sanitize = (payload: any) => JSON.parse(JSON.stringify(payload));

const replaceText = (value: string, oldName: string, newName: string) => (
  value.includes(oldName) ? value.split(oldName).join(newName) : value
);

const replaceInValue = (value: any, oldName: string, newName: string): { changed: boolean; result: any } => {
  if (Array.isArray(value)) {
    const result = value.map((item) => replaceInValue(item, oldName, newName).result);
    return { changed: JSON.stringify(value) !== JSON.stringify(result), result };
  }

  if (typeof value === 'string') {
    const result = replaceText(value, oldName, newName);
    return { changed: result !== value, result };
  }

  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = replaceInValue(item, oldName, newName).result;
    }
    return { changed: JSON.stringify(value) !== JSON.stringify(result), result };
  }

  return { changed: false, result: value };
};

const collectFieldUpdates = (item: any, fields: string[], oldName: string, newName: string) => {
  const updates: Updates = {};
  for (const field of fields) {
    const { changed, result } = replaceInValue(item[field], oldName, newName);
    if (changed) updates[field] = result;
  }
  return updates;
};

const saveDoc = async (api: any, item: any, updates: Updates, collectionName?: string) => {
  const id = item?._id || item?.id;
  if (!id || Object.keys(updates).length === 0) return false;

  try {
    if (typeof api.update === 'function') {
      await api.update(id, sanitize(updates));
    } else if (typeof api.put === 'function') {
      await api.put(sanitize({ ...item, ...updates }));
    } else if (collectionName) {
      await cloudDB.collection(collectionName).doc(id).update(sanitize(updates));
    } else {
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[syncName] update failed: ${id}`, error);
    return false;
  }
};

const syncCollection = async ({
  label,
  api,
  fields,
  oldName,
  newName,
  collectionName,
  getItems,
}: {
  label: string;
  api: any;
  fields: string[];
  oldName: string;
  newName: string;
  collectionName?: string;
  getItems?: () => Promise<any[]>;
}) => {
  let affected = 0;
  try {
    const items = getItems ? await getItems() : await api.toArray();
    for (const item of items) {
      const updates = collectFieldUpdates(item, fields, oldName, newName);
      if (await saveDoc(api, item, updates, collectionName)) affected++;
    }
  } catch (error) {
    console.error(`[syncName] ${label} failed:`, error);
  }
  return affected;
};

export async function syncEmployeeName(oldName: string, newName: string): Promise<number> {
  const oldClean = oldName?.trim();
  const newClean = newName?.trim();
  if (!oldClean || !newClean || oldClean === newClean) return 0;

  let totalAffected = 0;

  totalAffected += await syncCollection({
    label: 'leads',
    api: leadsAPI,
    fields: ['sales', 'designer', 'manager', 'creatorName', 'signer', 'lastFollowBy', 'updatedBy', 'files'],
    oldName: oldClean,
    newName: newClean,
  });

  totalAffected += await syncCollection({
    label: 'projects',
    api: projectsAPI,
    fields: ['sales', 'designer', 'manager', 'creatorName', 'updatedBy', 'sections', 'nodes', 'files'],
    oldName: oldClean,
    newName: newClean,
  });

  for (const api of [quotesAPI, quotationsAPI]) {
    totalAffected += await syncCollection({
      label: 'quotes',
      api,
      fields: ['sales', 'designer', 'manager', 'creatorName', 'createdBy', 'updatedBy', 'attachments'],
      oldName: oldClean,
      newName: newClean,
    });
  }

  totalAffected += await syncCollection({
    label: 'followUps',
    api: followUpsAPI,
    fields: ['createdBy', 'creatorName', 'content', 'attachments'],
    oldName: oldClean,
    newName: newClean,
  });

  totalAffected += await syncCollection({
    label: 'projectLogs',
    api: projectLogsAPI,
    fields: ['createdBy', 'creatorName', 'content', 'attachments'],
    oldName: oldClean,
    newName: newClean,
    getItems: () => projectLogsAPI.where({}).toArray(),
  });

  totalAffected += await syncCollection({
    label: 'projectInspections',
    api: projectInspectionsAPI,
    fields: ['createdBy', 'creatorName', 'inspector', 'attachments'],
    oldName: oldClean,
    newName: newClean,
    getItems: () => projectInspectionsAPI.where({}).toArray(),
  });

  totalAffected += await syncCollection({
    label: 'todos',
    api: todosAPI,
    fields: ['createdBy', 'creatorName', 'assignedTo', 'assignees', 'relatedTo', 'attachments'],
    oldName: oldClean,
    newName: newClean,
  });

  totalAffected += await syncCollection({
    label: 'contracts',
    api: contractsAPI,
    fields: ['sales', 'designer', 'manager', 'projectManager', 'signer', 'createdBy', 'creatorName', 'updatedBy', 'attachments'],
    oldName: oldClean,
    newName: newClean,
  });

  totalAffected += await syncCollection({
    label: 'receipts',
    api: receiptsAPI,
    fields: ['createdBy', 'creatorName', 'paidBy', 'handler', 'attachments'],
    oldName: oldClean,
    newName: newClean,
  });

  totalAffected += await syncCollection({
    label: 'expenses',
    api: expensesAPI,
    fields: ['createdBy', 'creatorName', 'paidBy', 'handler', 'attachments'],
    oldName: oldClean,
    newName: newClean,
  });

  totalAffected += await syncCollection({
    label: 'reimbursements',
    api: reimbursementsAPI,
    fields: ['applicant', 'createdBy', 'creatorName', 'approver', 'attachments'],
    oldName: oldClean,
    newName: newClean,
  });

  totalAffected += await syncCollection({
    label: 'generalIncomes',
    api: generalIncomesAPI,
    fields: ['createdBy', 'creatorName', 'handler', 'attachments'],
    oldName: oldClean,
    newName: newClean,
    collectionName: COLLECTIONS.generalIncomes,
  });

  totalAffected += await syncCollection({
    label: 'generalExpenses',
    api: generalExpensesAPI,
    fields: ['createdBy', 'creatorName', 'handler', 'attachments'],
    oldName: oldClean,
    newName: newClean,
    collectionName: COLLECTIONS.generalExpenses,
  });

  totalAffected += await syncCollection({
    label: 'notifications',
    api: notificationsAPI,
    fields: ['from', 'to', 'title', 'content'],
    oldName: oldClean,
    newName: newClean,
    getItems: () => notificationsAPI.orderBy('createdAt', 'desc').toArray(),
    collectionName: COLLECTIONS.notifications,
  });

  totalAffected += await syncCollection({
    label: 'materials',
    api: materialsAPI,
    fields: ['createdBy', 'creatorName', 'updatedBy', 'uploader', 'attachments'],
    oldName: oldClean,
    newName: newClean,
  });

  console.log(`[syncName] ${oldClean} -> ${newClean}, affected ${totalAffected} records`);
  return totalAffected;
}
