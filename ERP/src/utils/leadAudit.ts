import { followUpsAPI, leadsAPI } from '@/db/api';
import { formatDateTime, generateId } from '@/utils/format';
import { createNotificationEventSafely, resolveUserIdsByNames, stableOperationId } from '@/services/notificationService';

type LeadLike = {
  _id?: string;
  id?: string;
  name?: string;
  sales?: unknown;
  designer?: unknown;
  manager?: unknown;
};

const roleLabel: Record<string, string> = {
  sales: '销售',
  designer: '设计',
  manager: '工程',
};

export function namesText(value: unknown) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\s，、]+/)
      : [];
  const cleaned = list.map(String).map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join('、') : '未分配';
}

export function describeLeadChanges(before: Record<string, any> | undefined, after: Record<string, any>, fields: Array<{ key: string; label: string; type?: 'people' }>) {
  return fields
    .map(({ key, label, type }) => {
      const oldValue = type === 'people' ? namesText(before?.[key]) : String(before?.[key] || '未填写');
      const nextValue = type === 'people' ? namesText(after?.[key]) : String(after?.[key] || '未填写');
      return oldValue === nextValue ? '' : `${label}：${oldValue} -> ${nextValue}`;
    })
    .filter(Boolean);
}

export async function addLeadAuditFollowUp(input: {
  leadId?: string;
  lead?: LeadLike | null;
  actorName: string;
  content: string;
  method?: string;
  createdAt?: string;
  updateLead?: boolean;
}) {
  const leadId = input.leadId || input.lead?._id || input.lead?.id;
  if (!leadId || !input.content.trim()) return;
  const now = input.createdAt || new Date().toISOString();
  await followUpsAPI.add({
    _id: generateId(),
    leadId,
    content: input.content.trim(),
    method: input.method || '系统记录',
    createdBy: input.actorName || '系统',
    createdAt: now,
    displayTime: formatDateTime(now),
    editedAt: '',
    editedBy: '',
  });
  if (input.updateLead !== false) {
    await leadsAPI.update(leadId, {
      lastFollowUp: formatDateTime(now),
      lastFollowUpAt: new Date(now).getTime(),
      updatedAt: now,
    });
  }
}

export async function notifyLeadEvent(input: {
  operationParts: Array<string | number | undefined>;
  eventType: string;
  actorUserId?: string;
  actorName: string;
  leadId?: string;
  lead?: LeadLike | null;
  title: string;
  content: string;
  recipientUserIds?: string[];
  recipientRoles?: string[];
}) {
  const leadId = input.leadId || input.lead?._id || input.lead?.id;
  if (!leadId) return;
  await createNotificationEventSafely({
    operationId: stableOperationId(...input.operationParts.filter(Boolean).map(String)),
    eventType: input.eventType,
    actorUserId: input.actorUserId || '',
    recipientUserIds: input.recipientUserIds,
    recipientRoles: input.recipientRoles,
    category: 'lead',
    title: input.title,
    content: input.content,
    link: `/leads/${leadId}`,
    relatedTo: { type: 'lead', id: leadId, name: input.lead?.name || '客户' },
    channels: ['station', 'wechat'],
  });
}

export async function notifyLeadAssignment(input: {
  lead: LeadLike;
  actorUserId?: string;
  actorName: string;
  field?: string;
  previous?: unknown;
  next: unknown;
  assignedOnly?: boolean;
  operationSuffix?: string;
}) {
  const leadId = input.lead._id || input.lead.id;
  if (!leadId) return;
  const nextNames = namesText(input.next);
  const previousNames = namesText(input.previous);
  const label = input.field ? (roleLabel[input.field] || input.field) : '跟进人员';
  const content = input.assignedOnly
    ? `${input.actorName}将客户“${input.lead.name || '客户'}”分配给：${nextNames}`
    : `${input.actorName}将客户“${input.lead.name || '客户'}”的${label}从“${previousNames}”调整为“${nextNames}”`;
  const recipientUserIds = await resolveUserIdsByNames(
    namesText(input.next).split('、').filter((name) => name && name !== '未分配'),
  );
  await notifyLeadEvent({
    operationParts: ['lead-assignment-detail', leadId, input.field, input.operationSuffix || Date.now()],
    eventType: 'LEAD_ASSIGNED',
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    lead: input.lead,
    title: '客户分配更新',
    content,
    recipientUserIds,
    recipientRoles: ['admin'],
  });
}
