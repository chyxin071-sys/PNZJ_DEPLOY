import { create } from 'zustand';
import { usersAPI } from '@/db/api';
import { cloudDB } from '@/db/cloudbase';
import type { UserRecord } from '@/db/index';
import { notifyMiniProgramAuthState, returnToMiniProgramAfterLogout } from '@/utils/miniProgramPreview';
import { clearQueryCache } from '@/db/queryCache';

export type Role = 'admin' | 'finance' | 'operations' | 'sales' | 'designer' | 'manager' | 'employee';
const VALID_ROLES: Role[] = ['admin', 'finance', 'operations', 'sales', 'designer', 'manager', 'employee'];
const LOGIN_TIMEOUT_MS = 10000;
const ERP_SESSION_KEY = 'pnzj_erp_user';
const PORTAL_SESSION_KEY = 'pnzj_user';
const TOKEN_KEY = 'token';
const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 6,
  finance: 5,
  operations: 4,
  sales: 4,
  designer: 3,
  manager: 2,
  employee: 1,
};

function withTimeout<T>(promise: Promise<T>, message: string, timeout = LOGIN_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeout);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

interface User {
  id: string;
  username: string;
  account?: string;
  phone?: string;
  password: string;
  passwordPlain?: string;
  passwordHash?: string;
  name: string;
  role: Role;
  roles?: Role[];
  department?: string;
  bizTypes?: string[];
  joinDate?: string;
  status?: 'active' | 'inactive';
  avatarUrl?: string;
  authVersion?: string;
  createdAt: string;
}

interface SharedPortalUser {
  _id?: string;
  id?: string;
  account?: string;
  phone?: string;
  name?: string;
  role?: string;
  roles?: Role[];
  accessRole?: string;
  bizTypes?: string[];
  createdAt?: string;
  joinDate?: string;
  authVersion?: string;
}

export function normalizeRoles(roles?: unknown, fallback: Role = 'employee'): Role[] {
  const values = Array.isArray(roles) ? roles : [];
  const normalized = values.filter((role): role is Role => VALID_ROLES.includes(role as Role));
  return Array.from(new Set(normalized.length > 0 ? normalized : [fallback]));
}

function resolveStoredRoles(roles: unknown, legacyRole: Role = 'employee'): Role[] {
  const normalized = normalizeRoles(roles, legacyRole);
  // Older employee editing only updated `role`, leaving a stale single-item `roles` array.
  if (Array.isArray(roles) && normalized.length > 0 && !normalized.includes(legacyRole)) return [legacyRole];
  return normalized;
}

function createAuthVersion() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStorageItem<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function mapSharedRole(user?: SharedPortalUser | null): Role {
  if (!user) return 'employee';
  if (user.accessRole === 'admin' || user.role === 'admin') return 'admin';
  if (user.accessRole === 'finance' || user.role === 'finance') return 'finance';
  if (user.role === 'operations') return 'operations';
  if (user.role === 'sales') return 'sales';
  if (user.role === 'designer') return 'designer';
  if (user.role === 'manager') return 'manager';
  return 'employee';
}

function getDefaultBizTypes(role: string): string[] {
  if (role === 'admin' || role === 'finance') return ['家装', '工装'];
  return ['家装'];
}

function buildUserFromSharedPortal(portalUser?: SharedPortalUser | null): User | null {
  if (!portalUser?.name) return null;
  const roles = resolveStoredRoles(portalUser.roles, mapSharedRole(portalUser));
  const role = getHighestRole(roles);
  return {
    id: portalUser._id || portalUser.id || portalUser.account || portalUser.phone || portalUser.name,
    username: portalUser.account || portalUser.phone || portalUser.name,
    password: '',
    name: portalUser.name,
    role,
    roles,
    bizTypes: (portalUser.bizTypes && portalUser.bizTypes.length > 0) ? portalUser.bizTypes : getDefaultBizTypes(role),
    createdAt: portalUser.createdAt || new Date().toISOString(),
    authVersion: portalUser.authVersion,
  };
}

function getInitialUser(): User | null {
  const erpUser = getStorageItem<User>(ERP_SESSION_KEY);
  if (erpUser) {
    const roles = resolveStoredRoles(erpUser.roles, erpUser.role || 'employee');
    return { ...erpUser, roles, role: getHighestRole(roles) };
  }
  const portalUser = getStorageItem<SharedPortalUser>('pnzj_user') || getStorageItem<SharedPortalUser>('userInfo');
  return buildUserFromSharedPortal(portalUser);
}

function buildSharedPortalUser(user: User) {
  const accessRole = user.role === 'admin' ? 'admin' : user.role === 'finance' ? 'finance' : 'staff';
  return {
    _id: user.id,
    name: user.name,
    phone: user.phone || '',
    role: user.role,
    roles: normalizeRoles(user.roles, user.role),
    accessRole,
    status: user.status || 'active',
    account: user.account || user.username,
    joinDate: user.joinDate || user.createdAt,
    avatarUrl: user.avatarUrl || '',
    bizTypes: user.bizTypes || [],
    authVersion: user.authVersion,
    defaultEntry: accessRole === 'finance' ? '/erp/' : '/',
  };
}

function buildUserFromRecord(record: UserRecord): User {
  const raw = record as UserRecord & Record<string, any>;
  const roles = resolveStoredRoles(raw.roles, (raw.role || 'employee') as Role);
  const primaryRole = getHighestRole(roles);
  return {
    id: raw._id || raw.id || '',
    username: raw.account || raw.username || raw.name || '',
    account: raw.account || '',
    phone: raw.phone || '',
    password: raw.password || '',
    passwordPlain: raw.passwordPlain || '',
    passwordHash: raw.passwordHash || '',
    name: raw.name || '',
    role: primaryRole,
    roles,
    department: raw.department || '',
    bizTypes: (raw.bizTypes && raw.bizTypes.length > 0) ? raw.bizTypes : getDefaultBizTypes(primaryRole),
    joinDate: raw.joinDate || '',
    status: raw.status === 'inactive' ? 'inactive' : 'active',
    avatarUrl: raw.avatarUrl || '',
    authVersion: raw.authVersion || '',
    createdAt: raw.createdAt || raw.createTime || new Date().toISOString(),
  };
}

function persistSession(user: User | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    const serializedUser = JSON.stringify(user);
    const portalUser = JSON.stringify(buildSharedPortalUser(user));
    window.localStorage.setItem(ERP_SESSION_KEY, serializedUser);
    window.localStorage.setItem(PORTAL_SESSION_KEY, portalUser);
    window.localStorage.setItem('userInfo', portalUser);
    window.localStorage.setItem('pnzj_finance_return_to', '/');
    return;
  }
  window.localStorage.removeItem(ERP_SESSION_KEY);
  window.localStorage.removeItem(PORTAL_SESSION_KEY);
  window.localStorage.removeItem('userInfo');
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem('pnzj_finance_return_to');
}

const initialUser = getInitialUser();

interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  users: User[];
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadUsers: () => Promise<void>;
  addUser: (u: Omit<User, 'id' | 'createdAt'> & { createdAt?: string }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  updateUserRole: (id: string, role: Role) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  resetPassword: (id: string) => Promise<void>;
  changePassword: (id: string, oldPassword: string, newPassword: string) => Promise<boolean>;
  validateSession: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initialUser,
  isLoggedIn: Boolean(initialUser),
  users: [],

  login: async (username: string, password: string) => {
    try {
      const input = username.trim();
      if (!input) throw new Error('请输入账号');
      if (!password) throw new Error('请输入密码');

      // Query by username, account, or phone from CloudBase users collection
      const _ = cloudDB.command;
      const { data } = await cloudDB.collection('users')
        .where(_.or([
          { account: input },
          { phone: input },
          { username: input }
        ]))
        .limit(1)
        .get();
        
      const matchedUser = data && data.length > 0 ? data[0] : null;

      if (!matchedUser) {
        throw new Error('账号不存在，请检查后重试（或检查数据库users集合的读写权限是否为“所有用户可读”）');
      }

      // Check status
      if (matchedUser.status === 'inactive') {
        throw new Error('该账号已被停用，请联系管理员');
      }

      // Check password (support password, passwordPlain, passwordHash)
      let isMatch = false;
      if (matchedUser.password === password || matchedUser.passwordPlain === password) {
        isMatch = true;
      } else if (matchedUser.passwordHash) {
        try {
          isMatch = matchedUser.passwordHash === password;
        } catch {
          isMatch = false;
        }
      }

      if (!isMatch) {
        throw new Error('密码错误，请重试');
      }

      const user = buildUserFromRecord(matchedUser as UserRecord);
      persistSession(user);
      set({ user, isLoggedIn: true });
      notifyMiniProgramAuthState(true, user);
      return true;
    } catch (err) {
      if (err instanceof Error && ['请输入账号', '请输入密码', '账号不存在', '已被停用', '密码错误'].some(m => err.message.includes(m))) {
        throw err;
      }
      console.error('ERP 登录失败:', err);
      throw new Error('登录失败，请稍后重试');
    }
  },

  logout: () => {
    persistSession(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('pnzj:cloud-temp-urls:v1');
    }
    void clearQueryCache();
    set({ user: null, isLoggedIn: false });
    returnToMiniProgramAfterLogout();
  },

  loadUsers: async () => {
    const list = await usersAPI.toArray();
    const processed = list.map((u: any) => ({
      ...u,
      id: u._id || u.id,
      roles: resolveStoredRoles(u.roles, (u.role || 'employee') as Role),
      role: getHighestRole(resolveStoredRoles(u.roles, (u.role || 'employee') as Role)),
      bizTypes: (u.bizTypes && u.bizTypes.length > 0) ? u.bizTypes : getDefaultBizTypes(u.role || 'employee'),
    }));
    set({ users: processed as User[] });
  },

  addUser: async (u) => {
    const roles = normalizeRoles(u.roles, u.role);
    const record: UserRecord = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
      ...u,
      role: getHighestRole(roles),
      roles,
      authVersion: createAuthVersion(),
      createdAt: new Date().toISOString(),
    };
    await usersAPI.add(record);
    await get().loadUsers();
  },

  deleteUser: async (id) => {
    await usersAPI.delete(id);
    await get().loadUsers();
  },

  updateUserRole: async (id, role) => {
    await usersAPI.update(id, { role, roles: [role], authVersion: createAuthVersion() });
    await get().loadUsers();
  },

  updateUser: async (id, data) => {
    const currentRecord = await usersAPI.getById(id);
    if (!currentRecord) throw new Error('员工账号不存在或已被删除');
    const nextData: Partial<User> = { ...data };
    if (data.roles || data.role) {
      const roles = normalizeRoles(data.roles, data.role || 'employee');
      nextData.roles = roles;
      nextData.role = getHighestRole(roles);
    }
    const currentRoles = resolveStoredRoles(currentRecord.roles, (currentRecord.role || 'employee') as Role);
    const nextRoles = (data.roles || data.role)
      ? normalizeRoles(nextData.roles, (nextData.role || currentRecord.role || 'employee') as Role)
      : currentRoles;
    const rolesChanged = currentRoles.slice().sort().join('|') !== nextRoles.slice().sort().join('|');
    const currentAccount = currentRecord.account || currentRecord.username || '';
    const nextAccount = nextData.account || nextData.username || currentAccount;
    const accountChanged = nextAccount !== currentAccount;
    const statusChanged = Boolean(nextData.status) && nextData.status !== currentRecord.status;
    const passwordChanged = ['password', 'passwordPlain', 'passwordHash'].some(key => key in data);
    if (rolesChanged || accountChanged || statusChanged || passwordChanged) {
      nextData.authVersion = createAuthVersion();
    }
    await usersAPI.update(id, nextData);
    const saved = await usersAPI.getById(id);
    if (!saved) throw new Error('员工资料保存后未能读取，请稍后重试');
    const savedRoles = resolveStoredRoles(saved.roles, (saved.role || 'employee') as Role);
    if (savedRoles.slice().sort().join('|') !== nextRoles.slice().sort().join('|')) {
      throw new Error('员工角色未保存成功，请刷新后重试');
    }
    await get().loadUsers();
  },

  resetPassword: async (id) => {
    await usersAPI.update(id, { password: '888888', passwordPlain: '888888', authVersion: createAuthVersion() });
  },

  changePassword: async (id, oldPassword, newPassword) => {
    const allUsers = await usersAPI.toArray();
    const user = allUsers.find(u => (u._id || u.id) === id);
    if (!user) return false;
    let isMatch = false;
    if (user.password === oldPassword || user.passwordPlain === oldPassword) {
      isMatch = true;
    }
    if (!isMatch) return false;
    await usersAPI.update(id, { password: newPassword, passwordPlain: newPassword, authVersion: createAuthVersion() });
    return true;
  },

  validateSession: async () => {
    const current = get().user;
    if (!current?.id) return false;
    try {
      const latest = await usersAPI.getById(current.id);
      if (!latest || latest.status === 'inactive') {
        get().logout();
        return false;
      }
      if (!current.authVersion && latest.authVersion) {
        const refreshed = buildUserFromRecord(latest);
        persistSession(refreshed);
        set({ user: refreshed, isLoggedIn: true });
        notifyMiniProgramAuthState(true, refreshed);
        return true;
      }
      const latestRoles = resolveStoredRoles(latest.roles, (latest.role || 'employee') as Role);
      const currentRoles = normalizeRoles(current.roles, current.role);
      const rolesChanged = latestRoles.slice().sort().join('|') !== currentRoles.slice().sort().join('|');
      const accountChanged = (latest.account || latest.username || '') !== (current.account || current.username || '');
      const versionChanged = Boolean(latest.authVersion) && latest.authVersion !== current.authVersion;
      if (rolesChanged || accountChanged || versionChanged) {
        get().logout();
        return false;
      }
      return true;
    } catch (error) {
      console.warn('[auth] session validation failed', error);
      // Temporary connectivity problems must not invalidate a valid local session.
      return true;
    }
  },
}));

export function hasRole(roles: Role[] | undefined, targetRole: Role, defaultRole?: Role): boolean {
  if (roles && roles.length > 0) {
    return roles.includes(targetRole);
  }
  return defaultRole === targetRole;
}

export function canViewFinancialData(roles: Role[] | undefined, defaultRole?: Role): boolean {
  return hasRole(roles, 'admin', defaultRole) || hasRole(roles, 'finance', defaultRole);
}

export function canManageAllCustomers(roles: Role[] | undefined, defaultRole?: Role): boolean {
  return hasRole(roles, 'admin', defaultRole) || hasRole(roles, 'operations', defaultRole);
}

export function getHighestRole(roles: Role[]): Role {
  if (!roles || roles.length === 0) return 'employee';
  return roles.reduce((highest, role) =>
    (ROLE_HIERARCHY[role] || 0) > (ROLE_HIERARCHY[highest] || 0) ? role : highest, 'employee' as Role);
}

export const menuPermissions: Record<Role, string[]> = {
  admin: ['/', '/contracts', '/income', '/expense', '/receivable', '/payable', '/projects', '/cashflow', '/reimbursement', '/finance-logs', '/reports', '/leads', '/signed-contracts', '/todos', '/projects-biz', '/template-library', '/materials', '/inventory-records', '/quotes-biz', '/quotation-builder', '/notifications', '/employees', '/profile'],
  finance: ['/', '/contracts', '/income', '/expense', '/receivable', '/payable', '/projects', '/cashflow', '/reimbursement', '/finance-logs', '/reports', '/todos', '/notifications', '/profile'],
  operations: ['/', '/leads', '/signed-contracts', '/todos', '/quotes-biz', '/quotation-builder', '/projects-biz', '/reimbursement', '/materials', '/inventory-records', '/notifications', '/profile'],
  sales: ['/', '/leads', '/signed-contracts', '/todos', '/quotes-biz', '/quotation-builder', '/projects-biz', '/reimbursement', '/income', '/expense', '/contracts', '/materials', '/inventory-records', '/notifications', '/profile'],
  designer: ['/', '/leads', '/signed-contracts', '/todos', '/projects-biz', '/quotes-biz', '/quotation-builder', '/reimbursement', '/income', '/expense', '/contracts', '/materials', '/inventory-records', '/notifications', '/profile'],
  manager: ['/', '/signed-contracts', '/todos', '/projects-biz', '/template-library', '/materials', '/inventory-records', '/reimbursement', '/income', '/expense', '/contracts', '/notifications', '/profile'],
  employee: ['/', '/leads', '/signed-contracts', '/projects-biz', '/reimbursement', '/income', '/expense', '/contracts', '/materials', '/inventory-records', '/notifications', '/profile'],
};
