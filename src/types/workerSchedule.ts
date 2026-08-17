export const WORKER_TRADES = ['开工', '拆除', '水电', '地暖', '瓦工', '防水', '木工', '油漆', '安装', '保洁', '其他'] as const;

export type WorkerTrade = typeof WORKER_TRADES[number];
export type WorkerStatus = 'available' | 'busy' | 'resting' | 'inactive';
export type WorkerScheduleStatus = 'planned' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface Worker {
  _id?: string;
  id?: string;
  name: string;
  phone?: string;
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

export function dateRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}
