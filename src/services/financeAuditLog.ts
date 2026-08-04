import { financeOperationLogsAPI } from '@/db/api';
import { createNotificationEventSafely, stableOperationId } from '@/services/notificationService';

type FinanceAuditAction = 'delete' | 'void' | 'reverse' | 'edit' | 'create';
type FinanceAuditModule = 'receipt' | 'expense' | 'reimbursement';

type FinanceAuditInput = {
  module: FinanceAuditModule;
  action: FinanceAuditAction;
  recordId: string;
  recordName?: string;
  amount?: number;
  reason?: string;
  operatorId?: string;
  operatorName?: string;
  before?: unknown;
  after?: unknown;
};

const ACTION_LABEL: Record<FinanceAuditAction, string> = {
  create: '新增',
  edit: '编辑',
  delete: '删除',
  void: '作废',
  reverse: '冲销',
};

const MODULE_LABEL: Record<FinanceAuditModule, string> = {
  expense: '支出记录',
  receipt: '收款记录',
  reimbursement: '报销记录',
};

export async function recordFinanceAuditAction(input: FinanceAuditInput) {
  try {
    await financeOperationLogsAPI.add({
      ...input,
      moduleLabel: MODULE_LABEL[input.module],
      actionLabel: ACTION_LABEL[input.action],
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[finance-audit] write log failed', input.module, input.action, error);
  }
}

export async function notifyFinanceAuditAction(input: FinanceAuditInput & {
  recipientUserIds: string[];
}) {
  const recipients = [...new Set(input.recipientUserIds.map(String).filter(Boolean))];
  if (!recipients.length) return;

  const moduleLabel = MODULE_LABEL[input.module];
  const actionLabel = ACTION_LABEL[input.action];
  const name = input.recordName || input.recordId;
  const reason = input.reason ? `，原因：${input.reason}` : '';

  await createNotificationEventSafely({
    operationId: stableOperationId('finance-audit', input.module, input.action, input.recordId, Date.now()),
    eventType: `finance-${input.module}-${input.action}`,
    actorUserId: input.operatorId || '',
    recipientUserIds: recipients,
    category: 'system',
    title: `${moduleLabel}${actionLabel}`,
    content: `${input.operatorName || '财务人员'}${actionLabel}了${moduleLabel}「${name}」${reason}`,
    link: input.module === 'expense' ? '/expense' : input.module === 'receipt' ? '/income' : '/reimbursement',
    miniProgramPage: input.module === 'expense'
      ? '/pages/index/index?erpPath=%2Fexpense'
      : input.module === 'receipt'
        ? '/pages/index/index?erpPath=%2Fincome'
        : '/pages/index/index?erpPath=%2Freimbursement',
    relatedTo: { type: input.module, id: input.recordId, name },
    channels: ['station', 'wechat'],
  });
}
