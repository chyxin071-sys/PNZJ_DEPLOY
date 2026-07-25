import dayjs from 'dayjs';

// 金额格式化 ¥
export function formatMoney(amount: number): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '¥0.00';
  if (amount === 0) return '¥0.00';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}¥${abs.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 简化金额格式化（万元）
export function formatMoneyWan(amount: number): string {
  const wan = amount / 10000;
  return `¥${wan.toFixed(2)}万`;
}

// 百分比格式化
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// 日期格式化
export function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD');
}

export function formatDateTime(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

// 生成唯一ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// 报销状态标签
export function getReimbursementStatusLabel(status: string): string {
  const map: Record<string, string> = {
    '待审核': '待审核',
    '已审核': '已审核',
    '已打款': '已打款',
    '已驳回': '已驳回',
  };
  return map[status] || status;
}

export function getReimbursementStatusColor(status: string): string {
  const map: Record<string, string> = {
    '待审核': 'bg-amber-50 text-amber-600',
    '已审核': 'bg-blue-50 text-blue-600',
    '已打款': 'bg-emerald-50 text-emerald-600',
    '已驳回': 'bg-red-50 text-red-500',
  };
  return map[status] || 'bg-gray-100 text-gray-500';
}

// 地址规范化：去除多余空格、统一中英文标点
export function normalizeAddress(addr: string): string {
  return addr
    .replace(/\s+/g, ' ')           // 多个空格→单个
    .replace(/–/g, '-')             // 全角短横→半角连字符
    .replace(/—/g, '-')             // 全角长横→半角连字符
    .replace(/－/g, '-')            // 全角减号→半角连字符
    .replace(/，/g, ',')            // 中文逗号→英文逗号
    .trim();
}

export function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}