import { cloudDB, COLLECTIONS } from './cloudbase';
import type { Worker, WorkerSchedule, WorkerScheduleConflict } from '@/types/workerSchedule';
import { dateRangesOverlap, scheduleIdOf, workerIdOf } from '@/types/workerSchedule';

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const workersAPI = {
  toArray: async (): Promise<Worker[]> => {
    const { data } = await cloudDB.collection(COLLECTIONS.workers).limit(1000).get();
    return (data || []) as Worker[];
  },
  add: async (worker: Omit<Worker, '_id' | 'id'>): Promise<Worker> => {
    const _id = makeId('worker');
    const record = { ...clean(worker), _id };
    await cloudDB.collection(COLLECTIONS.workers).add(record as any);
    return record;
  },
  update: async (id: string, changes: Partial<Worker>): Promise<void> => {
    const payload = clean(changes) as any;
    delete payload._id;
    delete payload.id;
    await cloudDB.collection(COLLECTIONS.workers).doc(id).update(payload);
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.workers).doc(id).remove();
  },
};

export const workerSchedulesAPI = {
  toArray: async (): Promise<WorkerSchedule[]> => {
    const { data } = await cloudDB.collection(COLLECTIONS.workerSchedules).limit(1000).get();
    return (data || []) as WorkerSchedule[];
  },
  byProject: async (projectId: string): Promise<WorkerSchedule[]> => {
    const { data } = await cloudDB.collection(COLLECTIONS.workerSchedules).where({ projectId }).limit(200).get();
    return (data || []) as WorkerSchedule[];
  },
  add: async (schedule: Omit<WorkerSchedule, '_id' | 'id'>): Promise<WorkerSchedule> => {
    const _id = makeId('schedule');
    const record = { ...clean(schedule), _id };
    await cloudDB.collection(COLLECTIONS.workerSchedules).add(record as any);
    return record;
  },
  update: async (id: string, changes: Partial<WorkerSchedule>): Promise<void> => {
    const payload = clean(changes) as any;
    delete payload._id;
    delete payload.id;
    await cloudDB.collection(COLLECTIONS.workerSchedules).doc(id).update(payload);
  },
  delete: async (id: string): Promise<void> => {
    await cloudDB.collection(COLLECTIONS.workerSchedules).doc(id).remove();
  },
  syncWorkerName: async (workerId: string, workerName: string): Promise<void> => {
    const { data } = await cloudDB.collection(COLLECTIONS.workerSchedules).where({ workerId }).limit(1000).get();
    await Promise.all((data || []).map((schedule: any) => {
      const id = String(schedule._id || schedule.id || '');
      return id ? cloudDB.collection(COLLECTIONS.workerSchedules).doc(id).update({ workerName }) : Promise.resolve();
    }));
  },
};

export function findScheduleConflicts(
  worker: Worker,
  candidate: Pick<WorkerSchedule, 'startDate' | 'endDate'>,
  schedules: WorkerSchedule[],
  excludeScheduleId?: string,
): WorkerScheduleConflict[] {
  const workerId = workerIdOf(worker);
  const active = schedules.filter((item) => (
    item.workerId === workerId
    && scheduleIdOf(item) !== excludeScheduleId
    && !['completed', 'cancelled'].includes(item.status)
    && dateRangesOverlap(candidate.startDate, candidate.endDate, item.startDate, item.endDate)
  ));
  if (active.length < Math.max(1, worker.maxConcurrent || 1)) return [];
  return active.map((schedule) => ({ workerId, workerName: worker.name, schedule }));
}

export function stageScheduleKey(projectId: string, stageId: string): string {
  return `${projectId}::${stageId}`;
}
