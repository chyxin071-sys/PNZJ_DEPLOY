import { cloudApp, cloudDB } from '@/db/cloudbase';
import { readCloudFunctionResult } from '@/utils/cloudFunctionResult';

export type NotificationChannel = 'station' | 'wechat';

export type NotificationEventInput = {
  operationId: string;
  eventType: string;
  actorUserId: string;
  recipientUserIds?: string[];
  recipientRoles?: string[];
  category: 'lead' | 'project' | 'todo' | 'contract' | 'system';
  title: string;
  content: string;
  link?: string;
  miniProgramPage?: string;
  relatedTo?: { type: string; id: string; name?: string };
  channels?: NotificationChannel[];
  templateId?: string;
  templateData?: Record<string, { value: string }>;
  miniprogramState?: 'developer' | 'trial' | 'formal';
};

export type NotificationEventResult = {
  success: boolean;
  code?: string;
  message?: string;
  eventId?: string;
  duplicateEvent?: boolean;
  results?: Array<{
    personId: string;
    userIds: string[];
    stationCreated: boolean;
    wechatStatus: string;
    wechatErrorCode?: string;
  }>;
};

export const TODO_NOTIFICATION_TEMPLATE_ID = '4Q1FEem5Y-aOYcXN92aLg1kCfBuENtu0zedLmi6PSuA';

export function stableOperationId(...parts: Array<string | number | null | undefined>) {
  return parts.map(part => String(part ?? '').trim()).join(':');
}

function splitNames(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : [value || ''];
  return values
    .flatMap(item => String(item).split(/[,，、;/\s]+/))
    .map(item => item.trim())
    .filter(item => item && item !== '未分配' && item !== '-');
}

export async function resolveUserIdsByNames(...values: Array<string | string[] | null | undefined>) {
  const names = [...new Set(values.flatMap(splitNames))];
  if (!names.length) return [];

  const users: any[] = [];
  for (let index = 0; index < names.length; index += 20) {
    const result = await cloudDB.collection('users')
      .where({ name: cloudDB.command.in(names.slice(index, index + 20)) })
      .limit(100)
      .get();
    users.push(...((result as { data?: any[] }).data || []));
  }

  return [...new Set(users
    .filter(user => user.status !== 'inactive' && user.isActive !== false)
    .map(user => user._id || user.id)
    .filter(Boolean))];
}

export async function resolveProjectParticipantUserIds(project?: any, lead?: any) {
  const directIds = [
    project?.managerId,
    project?.projectManagerId,
    project?.ownerId,
    project?.responsiblePersonId,
    project?.salesId,
    project?.designerId,
    project?.creatorId,
    ...(Array.isArray(project?.managerIds) ? project.managerIds : []),
    ...(Array.isArray(project?.responsiblePersonIds) ? project.responsiblePersonIds : []),
  ].filter(Boolean);

  const resolvedByName = await resolveUserIdsByNames(
    project?.manager,
    project?.projectManager,
    project?.owner,
    project?.responsiblePerson,
    project?.sales,
    project?.designer,
    project?.creatorName,
    lead?.manager,
    lead?.sales,
    lead?.designer,
  );

  return [...new Set([...directIds, ...resolvedByName].map(String).filter(Boolean))];
}

export async function createNotificationEvent(input: NotificationEventInput): Promise<NotificationEventResult> {
  const response = await cloudApp.callFunction({
    name: 'notificationService',
    parse: true,
    data: {
      action: 'createEvent',
      ...input,
      channels: input.channels?.length ? input.channels : ['station'],
    },
  });

  const result = readCloudFunctionResult<NotificationEventResult>(response);
  if (!result) return { success: false, code: 'EMPTY_CLOUD_RESPONSE', message: '通知服务未返回结果' };
  return result;
}

export async function createNotificationEventSafely(input: NotificationEventInput) {
  try {
    const result = await createNotificationEvent(input);
    if (!result.success) console.error('[notification] event rejected', input.eventType, result);
    return result;
  } catch (error) {
    console.error('[notification] event call failed', input.eventType, error);
    return { success: false, code: 'CALL_FAILED', message: error instanceof Error ? error.message : String(error) };
  }
}
