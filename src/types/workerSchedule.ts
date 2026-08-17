export const WORKER_TRADES = ['开工', '拆除', '水电', '地暖', '瓦工', '防水', '木工', '油漆', '安装', '保洁', '其他'] as const;

export type WorkerTrade = typeof WORKER_TRADES[number];
export type WorkerStatus = 'available' | 'busy' | 'resting' | 'inactive';
export type WorkerScheduleStatus = 'planned' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface Worker {
  _id?: string;
  id?: string;
  name: string;
  phone?: string;
  photoFileID?: string;
  trades: string[];
  maxConcurrent: number;
  status: WorkerStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerSchedule {
  _id?: string;
  id?: string;
  workerId: string;
  workerName: string;
  projectId: string;
  projectAddress: string;
  customerName?: string;
  stageId: string;
  stageName: string;
  trade: string;
  startDate: string;
  endDate: string;
  status: WorkerScheduleStatus;
  note?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerScheduleConflict {
  workerId: string;
  workerName: string;
  schedule: WorkerSchedule;
}

export function workerIdOf(worker: Worker): string {
  return String(worker._id || worker.id || '');
}

export function scheduleIdOf(schedule: WorkerSchedule): string {
  return String(schedule._id || schedule.id || '');
}

const TRADE_ALIASES: Array<[WorkerTrade, string[]]> = [
  ['开工', ['开工']],
  ['拆除', ['拆除', '拆改']],
  ['水电', ['水电', '电工']],
  ['地暖', ['地暖']],
  ['瓦工', ['瓦工', '泥瓦']],
  ['防水', ['防水']],
  ['木工', ['木工']],
  ['油漆', ['油漆', '乳胶漆', '涂料']],
  ['安装', ['安装', '定制安装']],
  ['保洁', ['保洁']],
];

export function tradeForStage(stageName: string): WorkerTrade {
  const normalized = String(stageName || '').trim();
  return TRADE_ALIASES.find(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))?.[0] || '其他';
}

export function workerMatchesStage(worker: Worker, stageName: string): boolean {
  return worker.trades.includes(tradeForStage(stageName));
}

export function stageTradeLabel(stageName: string): string {
  const trade = tradeForStage(stageName);
  return String(stageName || '').trim() === trade ? trade : `${stageName} · ${trade}`;
}

export function dateRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}
