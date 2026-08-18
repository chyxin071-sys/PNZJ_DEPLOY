import type { Role } from '@/store/authStore';

const DEVICE_TOKEN_KEY = 'pnzj_operations_screen_device_token';

export interface OperationsScreenData {
  generatedAt: string;
  stats: {
    totalCustomers: number;
    monthCustomers: number;
    signedCustomers: number;
    lostCustomers: number;
    totalProjects: number;
    activeProjects: number;
    updatedToday: number;
    pendingTodos: number;
    overdueTodos: number;
    arrivalsNext7Days: number;
  };
  projects: Array<{
    id: string;
    address: string;
    status: string;
    progress: number;
    currentStage: string;
    nextStage: string;
    startDate: string;
    expectedEndDate: string;
    people: string[];
    pendingTodos: number;
    todoItems: Array<{
      id: string;
      title: string;
      dueDate: string;
      assignees: string[];
      overdue: boolean;
    }>;
    updatedAt: string;
  }>;
  stageDistribution: Array<{ name: string; value: number }>;
  schedules: Array<{
    id: string;
    workerName: string;
    projectAddress: string;
    stageName: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
}

export interface ScreenDevice {
  id: string;
  name: string;
  status: string;
  approvedByName: string;
  createdAt: string;
  lastSeenAt: string;
}

interface AdminIdentity {
  id: string;
  authVersion?: string;
  role?: Role;
  roles?: Role[];
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || '请求失败') as Error & { code?: string; status?: number };
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

function adminHeaders(user: AdminIdentity) {
  return {
    'x-erp-user-id': user.id,
    'x-erp-auth-version': user.authVersion || '',
  };
}

export function getScreenDeviceToken() {
  return window.localStorage.getItem(DEVICE_TOKEN_KEY) || '';
}

export function saveScreenDeviceToken(token: string) {
  window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
}

export function clearScreenDeviceToken() {
  window.localStorage.removeItem(DEVICE_TOKEN_KEY);
}

export async function createScreenPairing() {
  return jsonRequest<{ success: true; pairingId: string; code: string; expiresAt: string }>(
    '/api/operations-screen/pairings',
    { method: 'POST', body: '{}' },
  );
}

export async function getScreenPairing(pairingId: string) {
  return jsonRequest<{ success: boolean; status: string; deviceToken?: string }>(
    `/api/operations-screen/pairings/${encodeURIComponent(pairingId)}`,
  );
}

export async function approveScreenPairing(user: AdminIdentity, code: string, name: string) {
  return jsonRequest<{ success: boolean; message: string }>('/api/operations-screen/approve', {
    method: 'POST',
    headers: adminHeaders(user),
    body: JSON.stringify({ code, name }),
  });
}

export async function loadScreenDevices(user: AdminIdentity) {
  return jsonRequest<{ success: boolean; devices: ScreenDevice[] }>('/api/operations-screen/devices', {
    headers: adminHeaders(user),
  });
}

export async function revokeScreenDevice(user: AdminIdentity, deviceId: string) {
  return jsonRequest<{ success: boolean }>(`/api/operations-screen/devices/${encodeURIComponent(deviceId)}/revoke`, {
    method: 'POST',
    headers: adminHeaders(user),
    body: '{}',
  });
}

export async function loadOperationsScreenData(token: string) {
  return jsonRequest<{ success: boolean; data: OperationsScreenData }>('/api/operations-screen/data', {
    headers: { authorization: `Bearer ${token}` },
  });
}
