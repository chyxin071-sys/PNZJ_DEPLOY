export const INACTIVE_FINANCE_STATUSES = ['deleted', 'voided', 'reversed'] as const;

export function isActiveFinanceRecord(record: { lifecycleStatus?: string } | null | undefined) {
  return !INACTIVE_FINANCE_STATUSES.includes(record?.lifecycleStatus as any);
}
