import { create } from 'zustand';
import { usersAPI } from '@/db/api';
import { cloudDB } from '@/db/cloudbase';
import type { UserRecord } from '@/db/index';
import { notifyMiniProgramAuthState, returnToMiniProgramAfterLogout } from '@/utils/miniProgramPreview';

export type Role = 'admin' | 'finance' | 'sales' | 'designer' | 'manager' | 'employee';
const LOGIN_TIMEOUT_MS = 10000;
const ERP_SESSION_KEY = 'pnzj_erp_user';
const PORTAL_SESSION_KEY = 'pnzj_user';
const TOKEN_KEY = 'token';

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
  createdAt: string;
}

interface SharedPortalUser {
  _id?: string;
  id?: string;
  account?: string;
  phone?: string;
  name?: string;
  role?: string;
  accessRole?: string;
  bizTypes?: string[];
  createdAt?: string;
  joinDate?: string;
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
  const role = mapSharedRole(portalUser);
  return {
    id: portalUser._id || portalUser.id || portalUser.account || portalUser.phone || portalUser.name,
    username: portalUser.account || portalUser.phone || portalUser.name,
    password: '',
    name: portalUser.name,
    role,
    bizTypes: (portalUser.bizTypes && portalUser.bizTypes.length > 0) ? portalUser.bizTypes : getDefaultBizTypes(role),
    createdAt: portalUser.createdAt || new Date().toISOString(),
  };
}

function getInitialUser(): User | null {
  const portalUser = getStorageItem<SharedPortalUser>('pnzj_user') || getStorageItem<SharedPortalUser>('userInfo');
  return buildUserFromSharedPortal(portalUser) || getStorageItem<User>(ERP_SESSION_KEY);
}

function buildSharedPortalUser(user: User) {
  const accessRole = user.role === 'admin' ? 'admin' : user.role === 'finance' ? 'finance' : 'staff';
  return {
    _id: user.id,
    name: user.name,
    phone: user.phone || '',
    role: user.role,
    accessRole,
    status: user.status || 'active',
    account: user.account || user.username,
    joinDate: user.joinDate || user.createdAt,
    avatarUrl: user.avatarUrl || '',
    bizTypes: user.bizTypes || [],
    defaultEntry: accessRole === 'finance' ? '/erp/' : '/',
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

      const user: User = {
        id: matchedUser._id || matchedUser.id || '',
        username: matchedUser.account || matchedUser.username || matchedUser.name || '',
        account: matchedUser.account || '',
        phone: matchedUser.phone || '',
        password: matchedUser.password || '',
        passwordPlain: matchedUser.passwordPlain || '',
        passwordHash: matchedUser.passwordHash || '',
        name: matchedUser.name || '',
        role: (matchedUser.role || 'employee') as Role,
        department: matchedUser.department || '',
        bizTypes: (matchedUser.bizTypes && matchedUser.bizTypes.length > 0) ? matchedUser.bizTypes : getDefaultBizTypes(matchedUser.role || 'employee'),
        joinDate: matchedUser.joinDate || '',
        status: (matchedUser.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
        avatarUrl: matchedUser.avatarUrl || '',
        createdAt: matchedUser.createdAt || matchedUser.createTime || new Date().toISOString(),
      };
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
    }
    set({ user: null, isLoggedIn: false });
    returnToMiniProgramAfterLogout();
  },

  loadUsers: async () => {
    const list = await usersAPI.toArray();
    const processed = list.map((u: any) => ({
      ...u,
      id: u._id || u.id,
      bizTypes: (u.bizTypes && u.bizTypes.length > 0) ? u.bizTypes : getDefaultBizTypes(u.role || 'employee'),
    }));
    set({ users: processed as User[] });
  },

  addUser: async (u) => {
    const record: UserRecord = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
      ...u,
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
    await usersAPI.update(id, { role });
    await get().loadUsers();
  },

  updateUser: async (id, data) => {
    await usersAPI.update(id, data);
    await get().loadUsers();
  },

  resetPassword: async (id) => {
    await usersAPI.update(id, { password: '888888', passwordPlain: '888888' });
  },

  changePassword: async (id, oldPassword, newPassword) => {
    const allUsers = await usersAPI.toArray();
    const user = allUsers.find(u => u.id === id);
    if (!user) return false;
    let isMatch = false;
    if (user.password === oldPassword || user.passwordPlain === oldPassword) {
      isMatch = true;
    }
    if (!isMatch) return false;
    await usersAPI.update(id, { password: newPassword, passwordPlain: newPassword });
    return true;
  },
}));

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 6,
  finance: 5,
  sales: 4,
  designer: 3,
  manager: 2,
  employee: 1,
};

export function hasRole(roles: Role[] | undefined, targetRole: Role, defaultRole?: Role): boolean {
  if (roles && roles.length > 0) {
    return roles.includes(targetRole);
  }
  return defaultRole === targetRole;
}

export function canViewFinancialData(roles: Role[] | undefined, defaultRole?: Role): boolean {
  return hasRole(roles, 'admin', defaultRole) || hasRole(roles, 'finance', defaultRole);
}

export function getHighestRole(roles: Role[]): Role {
  if (!roles || roles.length === 0) return 'employee';
  return roles.reduce((highest, role) =>
    (ROLE_HIERARCHY[role] || 0) > (ROLE_HIERARCHY[highest] || 0) ? role : highest, 'employee' as Role);
}

export const menuPermissions: Record<Role, string[]> = {
  admin: ['/', '/contracts', '/income', '/expense', '/receivable', '/payable', '/projects', '/cashflow', '/reimbursement', '/reports', '/leads', '/signed-contracts', '/todos', '/projects-biz', '/template-library', '/materials', '/inventory-records', '/quotes-biz', '/quotation-builder', '/notifications', '/employees', '/profile'],
  finance: ['/', '/contracts', '/income', '/expense', '/receivable', '/payable', '/projects', '/cashflow', '/reimbursement', '/reports', '/todos', '/materials', '/inventory-records', '/notifications', '/profile'],
  sales: ['/', '/leads', '/signed-contracts', '/todos', '/quotes-biz', '/quotation-builder', '/projects-biz', '/reimbursement', '/income', '/expense', '/contracts', '/materials', '/inventory-records', '/notifications', '/profile'],
  designer: ['/', '/leads', '/signed-contracts', '/todos', '/projects-biz', '/quotes-biz', '/quotation-builder', '/reimbursement', '/income', '/expense', '/contracts', '/materials', '/inventory-records', '/notifications', '/profile'],
  manager: ['/', '/signed-contracts', '/todos', '/projects-biz', '/template-library', '/materials', '/inventory-records', '/reimbursement', '/income', '/expense', '/contracts', '/notifications', '/profile'],
  employee: ['/', '/leads', '/signed-contracts', '/projects-biz', '/reimbursement', '/income', '/expense', '/contracts', '/materials', '/inventory-records', '/notifications', '/profile'],
};
