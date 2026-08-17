import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileText,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calculator,
  ArrowLeftRight,
  ClipboardList,
  FileSpreadsheet,
  BarChart3,
  Users,
  HardHat,
  Bell,
  ListTodo,
  UserCog,
  TrendingUp,
  Package,
  Settings,
  LayoutTemplate,
  CalendarRange,
} from 'lucide-react';
import type { BizType } from '@/types';
import type { Role } from '@/store/authStore';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  bizTypes?: BizType[];
}

export interface NavGroup {
  group: string;
  icon: LucideIcon;
  bizTypes?: BizType[];
  items: NavItem[];
}

export const ERP_NAV_TOP_ITEM: NavItem = {
  path: '/', icon: LayoutDashboard, label: '全局看板', roles: ['admin', 'finance', 'operations', 'sales', 'designer', 'manager', 'employee'], bizTypes: ['家装'],
};

export const ERP_NAV_GROUPS: NavGroup[] = [
  {
    group: '业务中心',
    icon: Users,
    bizTypes: ['家装'],
    items: [
      { path: '/todos', icon: ListTodo, label: '团队待办', roles: ['admin', 'finance', 'operations', 'sales', 'designer', 'manager'] },
      { path: '/leads', icon: Users, label: '客户管理', roles: ['admin', 'operations', 'sales', 'designer', 'manager', 'employee'] },
      { path: '/contracts', icon: FileText, label: '合同管理', roles: ['admin', 'finance'] },
      { path: '/projects-biz', icon: HardHat, label: '工地管理', roles: ['admin', 'operations', 'sales', 'designer', 'manager', 'employee'] },
      { path: '/worker-schedule', icon: CalendarRange, label: '工人排期', roles: ['admin', 'manager'] },
      { path: '/materials', icon: Package, label: '库存管理', roles: ['admin', 'manager'] },
    ],
  },
  {
    group: '财务中心',
    icon: TrendingUp,
    items: [
      { path: '/reports', icon: BarChart3, label: '财务报表', roles: ['admin', 'finance'] },
      { path: '/cashflow', icon: ArrowLeftRight, label: '资金流水', roles: ['admin', 'finance'] },
      { path: '/income', icon: ArrowDownToLine, label: '收入管理', roles: ['admin', 'finance'] },
      { path: '/expense', icon: ArrowUpFromLine, label: '支出管理', roles: ['admin', 'finance'] },
      { path: '/projects', icon: Calculator, label: '项目成本', roles: ['admin', 'finance'], bizTypes: ['家装'] },
      { path: '/reimbursement', icon: FileSpreadsheet, label: '费用报销', roles: ['admin', 'finance', 'operations', 'sales', 'designer', 'manager', 'employee'], bizTypes: ['家装'] },
      { path: '/finance-logs', icon: ClipboardList, label: '操作日志', roles: ['admin', 'finance'] },
    ],
  },
  {
    group: '系统设置',
    icon: Settings,
    items: [
      { path: '/template-library', icon: LayoutTemplate, label: '工地模板库', roles: ['admin'], bizTypes: ['家装'] },
      { path: '/employees', icon: Users, label: '组织架构', roles: ['admin'] },
      { path: '/profile', icon: UserCog, label: '个人中心', roles: ['admin', 'finance', 'operations', 'sales', 'designer', 'manager', 'employee'] },
    ],
  },
];

export const NAV_BOTTOM_ITEMS: NavItem[] = [
  { path: '/notifications', icon: Bell, label: '消息通知', roles: ['admin', 'finance', 'operations', 'sales', 'designer', 'manager', 'employee'], bizTypes: ['家装'] },
];

// 检查用户是否拥有某个角色（兼容单角色和多角色）
function userHasRole(userRoles: Role[] | undefined, userRole: string, role: string): boolean {
  if (userRoles && userRoles.length > 0) {
    return userRoles.includes(role as Role);
  }
  return userRole === role;
}

export function getErpVisibleNavGroups(role: string, bizType?: BizType, userBizTypes?: BizType[], userRoles?: Role[]): NavGroup[] {
  return ERP_NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.roles.some(r => userHasRole(userRoles, role, r))) return false;
        if (item.bizTypes && userBizTypes && !item.bizTypes.some(b => userBizTypes.includes(b))) return false;
        if (item.bizTypes && bizType && !item.bizTypes.includes(bizType)) return false;
        return true;
      }),
    }))
    .filter((group) => {
      if (group.items.length === 0) return false;
      if (group.bizTypes && bizType && !group.bizTypes.includes(bizType)) return false;
      if (group.bizTypes && userBizTypes && !group.bizTypes.some(b => userBizTypes.includes(b))) return false;
      return true;
    });
}

export function getErpVisibleBottomItems(role: string, userRoles?: Role[], bizType?: BizType): NavItem[] {
  return NAV_BOTTOM_ITEMS.filter((item) => {
    if (!item.roles.some(r => userHasRole(userRoles, role, r))) return false;
    if (item.bizTypes && bizType && !item.bizTypes.includes(bizType)) return false;
    return true;
  });
}

export function getErpVisibleNavItems(role: string, bizType?: BizType, userRoles?: Role[]): NavItem[] {
  return getErpVisibleNavGroups(role, bizType, undefined, userRoles).flatMap((group) => group.items);
}

export function getErpDefaultPath(role: string, bizType: BizType, userBizTypes?: BizType[], userRoles?: Role[]): string {
  const canUseTopItem = ERP_NAV_TOP_ITEM.roles.some(r => userHasRole(userRoles, role, r))
    && (!ERP_NAV_TOP_ITEM.bizTypes || ERP_NAV_TOP_ITEM.bizTypes.includes(bizType))
    && (!ERP_NAV_TOP_ITEM.bizTypes || !userBizTypes || ERP_NAV_TOP_ITEM.bizTypes.some((b) => userBizTypes.includes(b)));

  if (canUseTopItem) {
    return ERP_NAV_TOP_ITEM.path;
  }

  const firstNavItem = getErpVisibleNavGroups(role, bizType, userBizTypes, userRoles)
    .flatMap((group) => group.items)[0];

  if (firstNavItem) {
    return firstNavItem.path;
  }

  const firstBottomItem = getErpVisibleBottomItems(role, userRoles, bizType)[0];
  return firstBottomItem?.path || '/';
}
