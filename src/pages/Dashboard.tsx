import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Target, TrendingUp, TrendingDown, Calendar,
  Clock, ChevronRight, Layers, ArrowUpRight,
  PieChart, Award, Star, Filter, HelpCircle, Plus, FileText, Receipt, BarChart3, User as UserIcon,
  CheckCircle2, Package, PenTool, HardHat, Grid3X3,
} from 'lucide-react';
import { leadsAPI, todosAPI, projectsAPI, usersAPI, followUpsAPI, projectLogsAPI } from '@/db/api';
import { useAuthStore } from '@/store/authStore';
import { useBizStore } from '@/store/bizStore';
import { getErpVisibleNavGroups, getErpVisibleBottomItems } from '@/components/navConfig';
import Select from '@/components/Select';
import Modal from '@/components/Modal';
import Tooltip from '@/components/Tooltip';

const GROUP_TONE: Record<string, string> = {
  '业务中心': 'bg-blue-50 text-blue-600',
  '财务中心': 'bg-emerald-50 text-emerald-600',
  '系统设置': 'bg-slate-100 text-slate-700',
};

const STATUS_COLORS: Record<string, string> = {
  '跟进中': 'bg-blue-50 text-blue-600',
  '已签单': 'bg-emerald-50 text-emerald-600',
  '已流失': 'bg-rose-50 text-rose-600',
};

const currentYear = new Date().getFullYear();
const MONTHS_12 = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` }));

function getDateRange(year: number, monthFrom: number, monthTo: number) {
  return {
    start: new Date(year, monthFrom - 1, 1),
    end: new Date(year, monthTo, 0, 23, 59, 59),
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { currentBizType } = useBizStore();
  const role = user?.role || 'employee';
  const roles = user?.roles;
  const userBizTypes = user?.bizTypes as any;
  const isAdmin = user?.role === 'admin';
  const myName = user?.name || '';
  const ROLE_MAP: Record<string, string> = { admin: '管理', sales: '销售', designer: '设计', manager: '项目经理', finance: '财务', employee: '普通' };
  const includesPerson = (val: any, name: string): boolean => {
    if (!val) return false;
    if (Array.isArray(val)) return val.some((v: any) => (typeof v === 'string' ? v : v?.name || '') === name);
    return String(val).split('、').includes(name);
  };
  const employeeHasRole = (emp: any, targetRole: string) => {
    const roleList = Array.isArray(emp.roles) ? emp.roles : [emp.role].filter(Boolean);
    return roleList.includes(targetRole);
  };
  const isActiveEmployee = (emp: any) => (
    emp.status !== 'inactive' &&
    emp.status !== 'disabled' &&
    emp.disabled !== true &&
    emp.isDisabled !== true &&
    emp.enabled !== false
  );

  const [leads, setLeads] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [recentFollowUpsData, setRecentFollowUpsData] = useState<any[]>([]);
  const [projectLogs, setProjectLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeYear, setTimeYear] = useState(currentYear);
  const [timeMonthFrom, setTimeMonthFrom] = useState(1);
  const [timeMonthTo, setTimeMonthTo] = useState(12);
  const [chartTimeScale, setChartTimeScale] = useState<'day' | 'week' | 'month'>('day');
  const [showEmployeeRankingModal, setShowEmployeeRankingModal] = useState(false);
  const [showEmployeePerformanceModal, setShowEmployeePerformanceModal] = useState(false);
  const [showManagerPerformanceModal, setShowManagerPerformanceModal] = useState(false);
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [showAllFunctions, setShowAllFunctions] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, todosRes, projectsRes, employeesRes, followUpsRes, logsRes, recentFollowUpsRes] = await Promise.all([
        leadsAPI.toArray(), todosAPI.toArray(), projectsAPI.toArray(),
        usersAPI.toArray(), followUpsAPI.toArray(), projectLogsAPI.where({}).toArray(),
        // 单独按创建时间倒序取最新跟进，避免 toArray 默认按 _id 返回早期数据
        followUpsAPI.where({}).orderBy('createdAt', 'desc').toArray(),
      ]);
      setLeads(leadsRes); setTodos(todosRes); setProjects(projectsRes);
      setEmployees(employeesRes); setFollowUps(followUpsRes); setProjectLogs(logsRes);
      setRecentFollowUpsData(recentFollowUpsRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 窗口重新聚焦 / 标签页切回时自动刷新最新数据
  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [fetchData]);

  const { start: rangeStart, end: rangeEnd } = getDateRange(timeYear, timeMonthFrom, timeMonthTo);
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();

  const filteredLeads = leads.filter(l => {
    const t = new Date(l.createdAt || 0).getTime();
    return t >= rangeStartMs && t <= rangeEndMs;
    // 非管理员只看自己相关的客户
  }).filter(l => isAdmin || l.creatorName === myName || includesPerson(l.sales, myName) || includesPerson(l.designer, myName) || includesPerson(l.manager, myName));
  const filteredFollowUps = followUps.filter(f => {
    const t = new Date(f.createdAt || 0).getTime();
    return t >= rangeStartMs && t <= rangeEndMs;
  }).filter(f => isAdmin || f.creatorName === myName || includesPerson(f.relatedPerson, myName));
  const filteredProjects = projects.filter(p => {
    const t = new Date(p.createdAt || 0).getTime();
    return t >= rangeStartMs && t <= rangeEndMs;
  }).filter(p => isAdmin || p.creatorName === myName || ((typeof p.manager === 'object') ? p.manager?.name : p.manager) === myName);

  // ====== 核心统计 ======
  const totalLeads = filteredLeads.length;
  const followUpLeads = filteredLeads.filter(l => l.status === '跟进中').length;
  const signedLeads = filteredLeads.filter(l => l.status === '已签单').length;
  const lostLeads = filteredLeads.filter(l => l.status === '已流失').length;
  const convRate = totalLeads > 0 ? ((signedLeads / totalLeads) * 100).toFixed(1) : '0.0';
  const myTodos = isAdmin ? todos : todos.filter(t => (t.assignees || []).some((a: any) => a.name === myName));
  const pendingTodos = myTodos.filter(t => t.status !== 'completed').length;
  const overdueTodos = myTodos.filter(t => {
    if (t.status === 'completed' || !t.dueDate) return false;
    return new Date(t.dueDate.replace(/-/g, '/')).getTime() < new Date().setHours(0,0,0,0);
  }).length;

  // ====== 快捷入口 ======
  const employeeActions = [
    { label: '新建客户', action: 'newLead', icon: Plus, tone: 'bg-blue-50 text-blue-600' },
    { label: '新增收款', action: 'newIncome', icon: ArrowUpRight, tone: 'bg-emerald-50 text-emerald-600' },
    { label: '新建工地', action: 'newProject', icon: HardHat, tone: 'bg-amber-50 text-amber-600' },
    { label: '新建待办', action: 'newTodo', icon: CheckCircle2, tone: 'bg-violet-50 text-violet-600' },
    { label: '报销', action: 'reimbursement', icon: Receipt, tone: 'bg-orange-50 text-orange-600' },
    { label: '合同', action: 'contracts', icon: FileText, tone: 'bg-indigo-50 text-indigo-600' },
    { label: '库存', action: 'materials', icon: Package, tone: 'bg-cyan-50 text-cyan-700' },
    { label: '个人中心', action: 'profile', icon: UserIcon, tone: 'bg-slate-100 text-slate-700' },
  ];

  const adminActions = [
    { label: '新建客户', action: 'newLead', icon: Plus, tone: 'bg-blue-50 text-blue-600' },
    { label: '新增合同', action: 'newContract', icon: FileText, tone: 'bg-indigo-50 text-indigo-600' },
    { label: '新增收款', action: 'newIncome', icon: ArrowUpRight, tone: 'bg-emerald-50 text-emerald-600' },
    { label: '新建支出', action: 'newExpense', icon: Receipt, tone: 'bg-orange-50 text-orange-600' },
    { label: '合同', action: 'contracts', icon: FileText, tone: 'bg-indigo-50 text-indigo-600' },
    { label: '客户', action: 'leads', icon: Users, tone: 'bg-blue-50 text-blue-600' },
    { label: '工地', action: 'projects', icon: HardHat, tone: 'bg-amber-50 text-amber-600' },
    { label: '库存', action: 'materials', icon: Package, tone: 'bg-cyan-50 text-cyan-700' },
    { label: '财务报表', action: 'reports', icon: BarChart3, tone: 'bg-emerald-50 text-emerald-600' },
    { label: '资金流水', action: 'cashflow', icon: TrendingUp, tone: 'bg-sky-50 text-sky-600' },
    { label: '费用报销', action: 'reimbursement', icon: Receipt, tone: 'bg-rose-50 text-rose-600' },
    { label: '个人中心', action: 'profile', icon: UserIcon, tone: 'bg-slate-100 text-slate-700' },
  ];

  const quickActions = isAdmin ? adminActions : employeeActions;

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'newLead': navigate('/leads?action=new'); break;
      case 'signedContracts': navigate('/signed-contracts'); break;
      case 'newContract': navigate('/contracts?action=new'); break;
      case 'newIncome': navigate('/income?action=create'); break;
      case 'newExpense': navigate('/expense?action=create'); break;
      case 'reimbursement': navigate('/reimbursement'); break;
      case 'contracts': navigate('/contracts'); break;
      case 'leads': navigate('/leads'); break;
      case 'materials': navigate('/materials'); break;
      case 'newProject': navigate('/projects-biz?action=new'); break;
      case 'projects': navigate('/projects-biz'); break;
      case 'newTodo': navigate('/todos?action=new'); break;
      case 'myTodos': navigate('/todos'); break;
      case 'reports': navigate('/reports'); break;
      case 'cashflow': navigate('/cashflow'); break;
      case 'profile': navigate('/profile'); break;
    }
  };

  const ongoingProjects = (isAdmin ? projects : projects.filter(p => p.creatorName === myName || ((typeof p.manager === 'object') ? p.manager?.name : p.manager) === myName)).filter(p => p.status === '进行中').length;

  // 本月/本周新增
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthLeads = leads.filter(l => {
    if (!isAdmin && l.creatorName !== myName && !includesPerson(l.sales, myName) && !includesPerson(l.designer, myName) && !includesPerson(l.manager, myName)) return false;
    const d = l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 7) : '';
    return d === thisMonth;
  }).length;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekLeads = leads.filter(l => {
    if (!isAdmin && l.creatorName !== myName && !includesPerson(l.sales, myName) && !includesPerson(l.designer, myName) && !includesPerson(l.manager, myName)) return false;
    return new Date(l.createdAt || 0).getTime() >= weekStart.getTime();
  }).length;

  // 员工签约排名与表现数据：停用员工不进入排名，但他们经手的数据仍然留在全局统计中
  const activeEmployees = employees.filter(isActiveEmployee);
  const buildLeadPerformance = (roleKey: 'sales' | 'designer') => activeEmployees
    .filter((emp) => employeeHasRole(emp, roleKey))
    .map((emp) => {
      const assigned = filteredLeads.filter((l) => includesPerson(l[roleKey], emp.name));
      const signed = assigned.filter((l) => l.status === '已签单').length;
      const total = assigned.length;
      const rate = total > 0 ? Number(((signed / total) * 100).toFixed(1)) : 0;
      return { name: emp.name, role: roleKey, signed, total, rate, department: emp.department };
    })
    .sort((a, b) => b.signed - a.signed || b.total - a.total);

  const salesStats = buildLeadPerformance('sales');
  const designerStats = buildLeadPerformance('designer');
  const employeeSigned = [...salesStats, ...designerStats].sort((a, b) => b.signed - a.signed || b.total - a.total);

  // 项目经理表现数据
  const managerStats = activeEmployees.filter(e => employeeHasRole(e, 'manager')).map(emp => {
    const myProjects = filteredProjects.filter(p => {
      return includesPerson(p.manager, emp.name);
    });
    const projectCount = myProjects.length;

    // 施工日志数（在时间范围内的）
    const logCount = projectLogs.filter(l => {
      const t = new Date(l.createdAt || 0).getTime();
      return (l.creatorName === emp.name) && t >= rangeStartMs && t <= rangeEndMs;
    }).length;

    // 已完成子节点数
    let completedSubNodes = 0;
    myProjects.forEach(p => {
      (p.nodesData || []).forEach((node: any) => {
        (node.sections || []).forEach((sec: any) => {
          (sec.subNodes || []).forEach((sn: any) => {
            if (sn.status === 'completed') completedSubNodes++;
          });
        });
      });
    });

    // 按时完工率（按已完成工序的 actualEndDate ≤ endDate 计算）
    let onTimeSections = 0;
    let totalCompletedSections = 0;
    myProjects.forEach(p => {
      (p.nodesData || []).forEach((node: any) => {
        (node.sections || []).forEach((sec: any) => {
          if (sec.status === 'completed' && sec.actualEndDate && sec.endDate) {
            totalCompletedSections++;
            if (new Date(sec.actualEndDate).getTime() <= new Date(sec.endDate).getTime()) {
              onTimeSections++;
            }
          }
        });
      });
    });
    const onTimeRate = totalCompletedSections > 0
      ? Math.round((onTimeSections / totalCompletedSections) * 100)
      : 0;

    return {
      name: emp.name, role: emp.role, department: emp.department,
      projectCount, logCount, completedSubNodes, onTimeRate,
    };
  }).sort((a, b) => b.projectCount - a.projectCount);

  const performanceSections = [
    { key: 'sales', title: '销售', items: salesStats, target: 'leads' as const, metricLabel: '签单', rateLabel: '转化率' },
    { key: 'designer', title: '设计', items: designerStats, target: 'leads' as const, metricLabel: '签单', rateLabel: '转化率' },
    { key: 'manager', title: '项目经理', items: managerStats, target: 'projects' as const, metricLabel: '工地', rateLabel: '按时完工' },
  ];

  const openEmployeeWorkList = (target: 'leads' | 'projects', name: string) => {
    if (target === 'projects') {
      navigate(`/projects-biz?employee=${encodeURIComponent(name)}`);
    } else {
      navigate(`/leads?employee=${encodeURIComponent(name)}`);
    }
  };

  // 客户来源
  const sources = [...new Set(filteredLeads.map(l => l.source).filter(Boolean))].map(s => ({
    name: s, count: filteredLeads.filter(l => l.source === s).length,
    signed: filteredLeads.filter(l => l.source === s && l.status === '已签单').length,
  })).sort((a, b) => b.count - a.count);

  // 评级分布
  const ratingDist = { A: 0, B: 0, C: 0, D: 0 };
  filteredLeads.forEach(l => { if (ratingDist.hasOwnProperty(l.rating)) ratingDist[l.rating as keyof typeof ratingDist]++; });

  // 每日新增
  const dailyNew: Record<string, number> = {};
  const dailySigned: Record<string, number> = {};
  filteredLeads.forEach(l => {
    const dateStr = l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : '';
    if (!dateStr) return;
    
    let key = dateStr;
    if (chartTimeScale === 'month') {
      key = dateStr.slice(0, 7); // YYYY-MM
    } else if (chartTimeScale === 'week') {
      const d = new Date(dateStr);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d.setDate(diff));
      key = weekStart.toISOString().slice(0, 10) + '周';
    }

    dailyNew[key] = (dailyNew[key] || 0) + 1;
    if (l.status === '已签单') dailySigned[key] = (dailySigned[key] || 0) + 1;
  });
  const sortedDays = Object.keys(dailyNew).sort();

  // 流失原因分布
  const lostReasonDist: Record<string, number> = {};
  filteredLeads.filter(l => l.status === '已流失').forEach(l => {
    const reason = l.lostReason || '其他';
    lostReasonDist[reason] = (lostReasonDist[reason] || 0) + 1;
  });

  // 平均转化周期 (从录入到签单的天数)
  let totalConversionDays = 0;
  let validSignedCount = 0;
  filteredLeads.filter(l => l.status === '已签单' && l.createdAt && l.updatedAt).forEach(l => {
    const created = new Date(l.createdAt || 0).getTime();
    const updated = new Date(l.updatedAt || 0).getTime(); // assuming updatedAt is close to sign date
    const days = (updated - created) / (1000 * 60 * 60 * 24);
    if (days >= 0) {
      totalConversionDays += days;
      validSignedCount++;
    }
  });
  const avgConversionDays = validSignedCount > 0 ? (totalConversionDays / validSignedCount).toFixed(1) : '0.0';

  // 平均施工周期 (从开工到竣工的天数)
  let totalConstructionDays = 0;
  let validProjectCount = 0;
  projects.filter(p => p.status === '已完工' && p.startDate && p.endDate).forEach(p => {
    const start = new Date(p.startDate).getTime();
    const end = new Date(p.endDate).getTime();
    const days = (end - start) / (1000 * 60 * 60 * 24);
    if (days > 0) {
      totalConstructionDays += days;
      validProjectCount++;
    }
  });
  const avgConstructionDays = validProjectCount > 0 ? (totalConstructionDays / validProjectCount).toFixed(1) : '0.0';

  // 工地节点耗时分析（按大节点聚合）
  // 实际耗时 = 实际完工 - 实际开工；逾期 = 实际完工 晚于 计划完工
  const DAY_MS = 1000 * 60 * 60 * 24;
  const stageStats: Record<string, { totalDays: number; count: number; delays: number; totalDelayDays: number }> = {};
  const templateNodeOrder: string[] = []; // 按模板（节点首次出现）顺序记录节点名
  projects.forEach(p => {
    if (!p.nodesData || !Array.isArray(p.nodesData)) return;

    p.nodesData.forEach((node: any) => {
      // 记录模板顺序
      if (node.name && !templateNodeOrder.includes(node.name)) templateNodeOrder.push(node.name);

      // 收集该大节点下所有「已完工」的工序（section）
      const completedSections = (node.sections || []).filter((sec: any) =>
        sec.status === 'completed' && sec.actualStartDate && sec.actualEndDate
      );
      if (completedSections.length === 0) return;

      // 节点实际开工 / 实际完工 / 计划完工
      const actualStarts = completedSections.map((s: any) => new Date(s.actualStartDate).getTime()).filter((t: number) => !isNaN(t));
      const actualEnds = completedSections.map((s: any) => new Date(s.actualEndDate).getTime()).filter((t: number) => !isNaN(t));
      const planEnds = completedSections.map((s: any) => s.endDate ? new Date(s.endDate).getTime() : NaN).filter((t: number) => !isNaN(t));
      if (actualStarts.length === 0 || actualEnds.length === 0) return;

      const nodeStart = Math.min(...actualStarts);
      const nodeEnd = Math.max(...actualEnds);
      const nodePlanEnd = planEnds.length > 0 ? Math.max(...planEnds) : 0;

      // 仅统计实际完工落在所选时间范围内的节点
      if (nodeEnd < rangeStartMs || nodeEnd > rangeEndMs) return;

      const days = (nodeEnd - nodeStart) / DAY_MS;
      if (days < 0) return;

      if (!stageStats[node.name]) stageStats[node.name] = { totalDays: 0, count: 0, delays: 0, totalDelayDays: 0 };
      stageStats[node.name].totalDays += days;
      stageStats[node.name].count += 1;

      // 逾期：实际完工晚于计划完工
      if (nodePlanEnd > 0 && nodeEnd > nodePlanEnd) {
        const delayDays = (nodeEnd - nodePlanEnd) / DAY_MS;
        stageStats[node.name].delays += 1;
        stageStats[node.name].totalDelayDays += delayDays;
      }
    });
  });

  const constructionStages = Object.entries(stageStats).map(([name, stat]) => ({
    name,
    avgDays: stat.count > 0 ? (stat.totalDays / stat.count).toFixed(1) : '0',
    delays: stat.delays,
    avgDelayDays: stat.delays > 0 ? (stat.totalDelayDays / stat.delays).toFixed(1) : '0',
  })).sort((a, b) => {
    // 按模板（节点首次出现）顺序排列
    const ia = templateNodeOrder.indexOf(a.name);
    const ib = templateNodeOrder.indexOf(b.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  // 设计阶段耗时分析
  const designStats: Record<string, { totalDays: number; count: number }> = {};
  leads.forEach(l => {
    if (!l.designNodes || !Array.isArray(l.designNodes)) return;
    let prevDate = l.createdAt ? new Date(l.createdAt).getTime() : 0;
    
    // 按时间顺序对已完成节点排序，以便计算相对耗时
    const completedNodes = l.designNodes
      .filter((n: any) => n.status === 'completed' && n.actualEndDate)
      .sort((a: any, b: any) => new Date(a.actualEndDate).getTime() - new Date(b.actualEndDate).getTime());

    completedNodes.forEach((node: any) => {
      const completedAt = new Date(node.actualEndDate).getTime();
      // 如果节点的完成时间在所选的时间范围内，则纳入统计
      if (completedAt >= rangeStartMs && completedAt <= rangeEndMs && prevDate > 0 && completedAt >= prevDate) {
        const days = (completedAt - prevDate) / (1000 * 60 * 60 * 24);
        if (!designStats[node.name]) designStats[node.name] = { totalDays: 0, count: 0 };
        designStats[node.name].totalDays += days;
        designStats[node.name].count += 1;
      }
      prevDate = completedAt;
    });
  });

  const designStages = Object.entries(designStats).map(([name, stat]) => ({
    name,
    avgDays: stat.count > 0 ? (stat.totalDays / stat.count).toFixed(1) : '0'
  })).sort((a, b) => parseFloat(b.avgDays) - parseFloat(a.avgDays));

  // 最近跟进：使用单独 orderBy('createdAt','desc') 取到的最新数据，再本地兜底排序
  const recentFollowUps = [...(recentFollowUpsData.length ? recentFollowUpsData : followUps)].sort((a, b) => {
    const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bT - aT;
  }).slice(0, 10);

  // 全部功能（管理员弹窗）
  const navGroups = getErpVisibleNavGroups(role, currentBizType, userBizTypes, roles);
  const navBottomItems = getErpVisibleBottomItems(role, roles);
  const mapNavItem = (item: { label: string; path: string; icon: any }) => ({ label: item.label, icon: item.icon, path: item.path });
  const allMobileFunctions = navGroups.map((group) => ({ group: group.group, items: group.items.map(mapNavItem) }));
  if (navBottomItems.length > 0) {
    const bm = navBottomItems.map(mapNavItem);
    const sg = allMobileFunctions.find((g) => g.group === '系统设置');
    if (sg) sg.items = [...bm, ...sg.items];
    else allMobileFunctions.push({ group: '系统设置', items: bm });
  }

  return (
    <div className="erp-page-spaced">
      {/* 标题行 + 时间筛选（统一一行） */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base md:text-lg font-bold text-gray-900">全局看板</h1>
          <p className="mt-1 text-gold-500 text-xs md:text-sm">实时查看业务数据和团队动态</p>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowTimeFilter(!showTimeFilter)}
            className={`erp-filter-button ${showTimeFilter ? 'erp-filter-button-active' : 'erp-filter-button-idle'}`}
          >
            <span className="font-medium">{timeYear}</span>
            <svg className={`w-3 h-3 transition-transform ${showTimeFilter ? 'rotate-180' : ''}`} viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l4 4 4-4" /></svg>
          </button>
          {showTimeFilter && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg p-3 w-[220px]">
              <select value={timeYear} onChange={e => setTimeYear(Number(e.target.value))} className="erp-select text-sm w-full mb-2">
                {Array.from({ length: 11 }, (_, i) => currentYear - 5 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <select value={timeMonthFrom} onChange={e => setTimeMonthFrom(Number(e.target.value))} className="erp-select text-sm flex-1">
                  {MONTHS_12.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <span className="text-xs text-gray-400 shrink-0">至</span>
                <select value={timeMonthTo} onChange={e => setTimeMonthTo(Number(e.target.value))} className="erp-select text-sm flex-1">
                  {MONTHS_12.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
        <button onClick={() => navigate('/leads')} className="bg-white rounded-xl p-2.5 md:p-4 border border-gray-100 text-left hover:shadow-md hover:border-gray-200 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-1.5 md:mb-2">
            <Users size={16} className="text-blue-500" />
            <span className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded-full ${monthLeads > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>本月+{monthLeads}</span>
          </div>
          <p className="text-lg md:text-2xl font-bold text-gray-900">{totalLeads}</p>
          <p className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">客户总数</p>
        </button>
        <button onClick={() => navigate('/leads?filter=monthNew')} className="bg-white rounded-xl p-2.5 md:p-4 border border-gray-100 text-left hover:shadow-md hover:border-gray-200 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-1.5 md:mb-2">
            <Calendar size={16} className="text-indigo-500" />
            <span className="text-[10px] md:text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 truncate max-w-[60px] md:max-w-none">本周 {weekLeads}</span>
          </div>
          <p className="text-lg md:text-2xl font-bold text-gray-900">{monthLeads}</p>
          <p className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">本月新增</p>
        </button>
        <button onClick={() => navigate('/leads?filter=signed')} className="bg-white rounded-xl p-2.5 md:p-4 border border-gray-100 text-left hover:shadow-md hover:border-gray-200 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-1.5 md:mb-2">
            <Target size={16} className="text-emerald-500" />
            <span className="text-[10px] md:text-xs px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">{convRate}%</span>
          </div>
          <p className="text-lg md:text-2xl font-bold text-gray-900">{signedLeads}</p>
          <p className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">已签约</p>
        </button>
        <button onClick={() => navigate('/leads?filter=lost')} className="bg-white rounded-xl p-2.5 md:p-4 border border-gray-100 text-left hover:shadow-md hover:border-gray-200 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-1.5 md:mb-2">
            <TrendingDown size={16} className="text-rose-500" />
            <span className="text-[10px] md:text-xs px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">{totalLeads > 0 ? ((lostLeads / totalLeads) * 100).toFixed(0) : 0}%</span>
          </div>
          <p className="text-lg md:text-2xl font-bold text-gray-900">{lostLeads}</p>
          <p className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">已流失</p>
        </button>
        <button onClick={() => navigate('/projects-biz')} className="bg-white rounded-xl p-2.5 md:p-4 border border-gray-100 text-left hover:shadow-md hover:border-gray-200 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-1.5 md:mb-2">
            <Layers size={16} className="text-amber-500" />
            <span className="text-[10px] md:text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 truncate max-w-[60px] md:max-w-none">进行中 {ongoingProjects}</span>
          </div>
          <p className="text-lg md:text-2xl font-bold text-gray-900">{projects.length}</p>
          <p className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">工地总数</p>
        </button>
        <button onClick={() => navigate('/todos')} className="bg-white rounded-xl p-2.5 md:p-4 border border-gray-100 text-left hover:shadow-md hover:border-gray-200 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-1.5 md:mb-2">
            <Clock size={16} className={overdueTodos > 0 ? 'text-rose-500' : 'text-blue-500'} />
            {overdueTodos > 0 && <span className="text-[10px] md:text-xs px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 truncate max-w-[50px] md:max-w-none">逾期{overdueTodos}</span>}
          </div>
          <p className="text-lg md:text-2xl font-bold text-gray-900">{pendingTodos}</p>
          <p className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">待办事项</p>
        </button>
      </div>

      {/* 常用功能快捷入口 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400">常用功能</h3>
          {isAdmin && (
            <button
              onClick={() => setShowAllFunctions(true)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center"
            >
              全部功能 <ChevronRight size={12} />
            </button>
          )}
        </div>
        <div className={`grid gap-2 ${isAdmin ? 'grid-cols-4' : 'grid-cols-4 md:grid-cols-5 lg:grid-cols-8'}`}>
          {quickActions.map((item) => {
            const Icon = item.icon;
            const tone = item.tone;
            return (
              <button
                key={item.label}
                onClick={() => handleQuickAction(item.action)}
                className="md:min-h-[80px] min-h-[64px] rounded-xl border border-gray-100 bg-white p-2 text-center hover:shadow-md hover:border-gray-200 transition-all cursor-pointer active:scale-[0.98]"
              >
                <span className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
                  <Icon size={18} />
                </span>
                <span className="mt-1.5 block text-xs font-medium text-gray-900 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {isAdmin && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
            {/* 客户来源与转化 */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <h3 className="text-sm font-semibold text-gray-800">客户来源与转化</h3>
                <Tooltip content="各渠道来源的客户数量及签单转化率。">
                  <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                </Tooltip>
              </div>
              <div className="space-y-2">
                {sources.slice(0, 5).map(s => (
                  <button key={s.name} onClick={() => navigate(`/leads?source=${encodeURIComponent(s.name)}`)} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 w-full text-left transition-all cursor-pointer">
                    <span className="text-sm text-gray-700 w-24 truncate">{s.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-400 h-full rounded-full" style={{ width: `${sources[0]?.count > 0 ? (s.count / sources[0].count * 100) : 0}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right">{s.count}客 / {s.signed}签</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.count > 0 && (s.signed / s.count * 100) >= 30 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
                      {s.count > 0 ? ((s.signed / s.count) * 100).toFixed(0) : 0}%
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 员工表现详情（销售 / 设计 / 项目经理） */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Award size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-gray-800">员工表现详情</h3>
                  <Tooltip content="只显示启用员工的排名；停用员工经手的数据仍然计入全局统计。销售/设计点击进入客户列表，项目经理点击进入工地列表。">
                    <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                  </Tooltip>
                </div>
                <button onClick={() => setShowEmployeePerformanceModal(true)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">查看全部 <ChevronRight size={12} /></button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {performanceSections.map((section) => (
                  <div key={section.key} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-600">{section.title}</span>
                      <span className="text-[10px] text-gray-400">{section.items.length} 人</span>
                    </div>
                    <div className="space-y-2">
                      {section.items.length === 0 ? (
                        <p className="py-4 text-center text-xs text-gray-400">暂无数据</p>
                      ) : section.items.slice(0, 3).map((item: any, idx) => (
                        <button
                          key={`${section.key}-${item.name}`}
                          onClick={() => openEmployeeWorkList(section.target, item.name)}
                          className="flex w-full items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-left transition-colors hover:bg-gray-100"
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${idx < 3 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>{idx + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-gray-900">{item.name}</span>
                            <span className="mt-0.5 block text-[10px] text-gray-400">
                              {section.target === 'projects' ? `${item.projectCount} 工地 · ${item.logCount} 日志` : `${item.total} 客户 · ${item.signed} 签单`}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className={`block text-xs font-bold ${(section.target === 'projects' ? item.onTimeRate : item.rate) >= 50 ? 'text-emerald-600' : 'text-gray-500'}`}>
                              {section.target === 'projects' ? item.onTimeRate : item.rate}%
                            </span>
                            <span className="block text-[10px] text-gray-400">{section.rateLabel}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 流失原因分布 */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <h3 className="text-sm font-semibold text-gray-800">流失原因分布</h3>
                <Tooltip content="统计已流失客户的原因占比。">
                  <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                </Tooltip>
              </div>
              <div className="space-y-2">
                {Object.keys(lostReasonDist).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">暂无流失数据</p>
                ) : Object.entries(lostReasonDist).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                  <div key={reason} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
                    <span className="text-sm text-gray-700 w-24 truncate">{reason}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-rose-400 h-full rounded-full" style={{ width: `${(count / Object.values(lostReasonDist).reduce((a, b) => a + b, 0)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-12 text-right">{count} 人</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">
                      {((count / Object.values(lostReasonDist).reduce((a, b) => a + b, 0)) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 每日新增趋势 */}
            {sortedDays.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-gray-800">新增客户趋势</h3>
                    <Tooltip content="统计不同时间维度新增客户数量及当日录入的客户后续成功签单的数量。">
                      <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                    </Tooltip>
                  </div>
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    {['day', 'week', 'month'].map(scale => (
                      <button key={scale} onClick={() => setChartTimeScale(scale as any)}
                        className={`text-xs px-2.5 py-1 rounded-md transition-colors ${chartTimeScale === scale ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                        {scale === 'day' ? '日' : scale === 'week' ? '周' : '月'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end gap-1.5 md:gap-2 h-56 pt-6 pb-2">
                  {(() => {
                    let displayDays = sortedDays;
                    if (chartTimeScale === 'day') displayDays = sortedDays.slice(-7);
                    else if (chartTimeScale === 'week') displayDays = sortedDays.slice(-7);
                    else if (chartTimeScale === 'month') displayDays = sortedDays.slice(-6);

                    // 统一刻度：按「新增数 + 签单数」总和归一化
                    const maxTotal = Math.max(...displayDays.map(d => (dailyNew[d] || 0) + (dailySigned[d] || 0)), 1);

                    // 横坐标标签：日=MM-DD，周=周起MM-DD，月=YY-MM
                    const fmtLabel = (day: string) => {
                      if (chartTimeScale === 'day') return day.slice(5);
                      if (chartTimeScale === 'week') return day.slice(5, 10);
                      return day.slice(2); // YYYY-MM -> YY-MM
                    };

                    return displayDays.map(day => {
                      const newCount = dailyNew[day] || 0;
                      const signedCount = dailySigned[day] || 0;
                      const newHeight = (newCount / maxTotal) * 100;
                      const signedHeight = (signedCount / maxTotal) * 100;
                      return (
                        <div key={day} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                          <div className="w-full flex flex-col justify-end items-center" style={{ height: '160px' }}>
                            {/* 签单数（堆叠在上，绿色） */}
                            {signedCount > 0 && (
                              <div className="w-full bg-emerald-500/90 rounded-t-sm transition-all hover:bg-emerald-600 flex items-center justify-center" style={{ height: `${Math.max(signedHeight, 4)}%` }}>
                                <span className="text-[10px] text-white font-bold leading-none">{signedCount}</span>
                              </div>
                            )}
                            {/* 新增数（堆叠在下，蓝色） */}
                            <div className={`w-full bg-blue-500/80 transition-all hover:bg-blue-600 flex items-center justify-center ${signedCount > 0 ? '' : 'rounded-t-sm'}`} style={{ height: `${Math.max(newHeight, 4)}%` }}>
                              <span className="text-[10px] text-white font-bold leading-none">{newCount}</span>
                            </div>
                          </div>
                          <span className="text-[9px] md:text-[10px] text-gray-400 w-full text-center leading-tight" title={day}>
                            {fmtLabel(day)}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500/80" /> 新增数</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/90" /> 签单数</span>
                </div>
              </div>
            )}
          </div>

          {/* 右侧 */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col justify-center items-center text-center">
                <div className="flex items-center gap-1.5 mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">平均转化周期</h3>
                  <Tooltip content="统计客户从系统录入到最终签单所经历的平均天数。">
                    <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                  </Tooltip>
                </div>
                <div className="flex items-end justify-center gap-1 my-2">
                  <span className="text-3xl font-bold text-gold-600">{avgConversionDays}</span>
                  <span className="text-sm text-gray-500 mb-1">天</span>
                </div>
                <p className="text-[10px] text-gray-400">基于 {validSignedCount} 个签单</p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col justify-center items-center text-center">
                <div className="flex items-center gap-1.5 mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">平均施工周期</h3>
                  <Tooltip content="统计工地从开工到完工所经历的平均天数。">
                    <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                  </Tooltip>
                </div>
                <div className="flex items-end justify-center gap-1 my-2">
                  <span className="text-3xl font-bold text-emerald-600">{avgConstructionDays}</span>
                  <span className="text-sm text-gray-500 mb-1">天</span>
                </div>
                <p className="text-[10px] text-gray-400">基于 {validProjectCount} 个工地</p>
              </div>
            </div>

            {/* 工地 & 设计阶段耗时分析 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 设计阶段耗时 */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">设计阶段平均耗时</h3>
                  <Tooltip content="各设计阶段的平均完成天数。">
                    <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                  </Tooltip>
                </div>
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {designStages.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">暂无设计阶段数据</p>
                  ) : designStages.map(s => (
                    <div key={s.name} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <span className="text-sm font-medium text-gray-900">{s.avgDays} 天</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 工地阶段耗时 */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">施工节点平均耗时与逾期</h3>
                  <Tooltip content="按大节点统计：平均耗时 = 该节点（实际完工日 − 实际开工日）的平均天数；逾期 = 实际完工晚于计划完工，显示逾期次数与平均逾期天数。">
                    <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                  </Tooltip>
                </div>
                <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
                  <div className="space-y-3 min-w-max">
                    {constructionStages.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">暂无施工节点数据</p>
                    ) : constructionStages.map(s => (
                      <div key={s.name} className="flex items-center justify-between gap-4 min-w-[200px]">
                        <span className="text-sm text-gray-700 truncate" title={s.name}>{s.name}</span>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-medium text-gray-900">{s.avgDays} 天</span>
                          {s.delays > 0 && (
                            <div className="text-[10px] text-rose-500">
                              逾期 {s.delays} 次 · 平均晚 {s.avgDelayDays} 天
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <h3 className="text-sm font-semibold text-gray-800">客户评级分布</h3>
                <Tooltip content="统计当前筛选时间范围内各意向评级的客户数量。">
                  <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                </Tooltip>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(ratingDist).map(([rating, count]) => (
                  <div key={rating} className={`rounded-lg p-3 text-center ${rating === 'A' ? 'bg-red-50' : rating === 'B' ? 'bg-orange-50' : rating === 'C' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <p className={`text-xl font-bold ${rating === 'A' ? 'text-red-600' : rating === 'B' ? 'text-orange-600' : rating === 'C' ? 'text-blue-600' : 'text-gray-600'}`}>{count}</p>
                    <p className="text-xs mt-1 font-medium text-gray-500">{rating}级</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-gray-800">最近跟进</h3>
                  <Tooltip content="团队最新的10条跟进记录。">
                    <HelpCircle size={14} className="text-gray-400 cursor-pointer hover:text-gray-600" />
                  </Tooltip>
                </div>
                <button onClick={() => navigate('/leads')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">全部 <ChevronRight size={12} /></button>
              </div>
              <div className="space-y-2">
                {recentFollowUps.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">暂无跟进记录</p>
                ) : recentFollowUps.map(fu => (
                  <div key={fu._id} className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                    <p className="text-xs text-gray-600 truncate mb-1">{fu.content?.split('\n')[0]}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] font-medium text-gray-900 truncate flex-1 mr-2" title={(() => {
                        const lead = leads.find(l => l._id === fu.leadId);
                        return lead ? `${lead.name} - ${lead.address || '暂无地址'}` : '未知客户';
                      })()}>
                        {(() => {
                          const lead = leads.find(l => l._id === fu.leadId);
                          return lead ? `${lead.name} - ${lead.address || '暂无地址'}` : '未知客户';
                        })()}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0">{fu.createdBy || fu.creatorName} · {fu.createdAt ? new Date(fu.createdAt).toISOString().slice(5, 10) : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 管理员：全部功能弹窗 */}
      {isAdmin && (
        <Modal open={showAllFunctions} onClose={() => setShowAllFunctions(false)} title="全部功能" size="lg">
          <div className="space-y-6">
            {allMobileFunctions.map((group) => {
              const tone = GROUP_TONE[group.group] || 'bg-gray-50 text-gray-700';
              return (
                <section key={group.group}>
                  <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                    <Grid3X3 size={13} />
                    {group.group}
                  </div>
                  <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                    {group.items.map((item: any) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.path}
                          onClick={() => { setShowAllFunctions(false); navigate(item.path); }}
                          className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                        >
                          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
                            <Icon size={20} />
                          </span>
                          <span className="block w-full text-center text-[11px] font-medium text-gray-700 leading-tight truncate">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </Modal>
      )}

      {/* 员工排名查看全部弹窗 */}
      <Modal open={showEmployeeRankingModal} onClose={() => setShowEmployeeRankingModal(false)} title="员工签约排名 (全部)" size="lg">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 pb-8">
          <div className="grid grid-cols-12 gap-2 md:gap-4 text-[10px] md:text-xs font-medium text-gray-500 mb-2 px-1 md:px-2">
            <div className="col-span-2 md:col-span-1 text-center">排名</div>
            <div className="col-span-3">员工</div>
            <div className="col-span-4 md:col-span-3 text-center">签单/客户</div>
            <div className="col-span-3 hidden md:block">转化率进度</div>
            <div className="col-span-3 md:col-span-2 text-right">转化率</div>
          </div>
          {employeeSigned.map((emp, idx) => (
            <div key={emp.name} className="grid grid-cols-12 gap-2 md:gap-4 items-center p-2 md:p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="col-span-2 md:col-span-1 flex justify-center">
                <div className={`w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-xs md:text-sm font-bold ${idx === 0 ? 'bg-amber-100 text-amber-600' : idx === 1 ? 'bg-gray-200 text-gray-600' : idx === 2 ? 'bg-orange-100 text-orange-600' : 'bg-white text-gray-500'}`}>
                  {idx + 1}
                </div>
              </div>
              <div className="col-span-3 flex flex-col min-w-0">
                <span className="text-xs md:text-sm font-medium text-gray-900 truncate">{emp.name}</span>
                <span className="text-[10px] md:text-xs text-gray-400 truncate">{ROLE_MAP[emp.role] || emp.role}</span>
              </div>
              <div className="col-span-4 md:col-span-3 text-center flex flex-col">
                <span className="text-xs md:text-sm font-bold text-emerald-600">{emp.signed}</span>
                <span className="text-[10px] md:text-xs text-gray-400">/ {emp.total}</span>
              </div>
              <div className="col-span-3 hidden md:block">
                <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${emp.rate}%` }} />
                </div>
              </div>
              <div className="col-span-3 md:col-span-2 text-right">
                <span className={`text-xs md:text-sm font-bold ${emp.rate >= 30 ? 'text-emerald-600' : 'text-gray-600'}`}>{emp.rate}%</span>
              </div>
            </div>
          ))}
        </div>
      </Modal>
      {/* 员工表现详情查看全部弹窗 */}
      <Modal open={showEmployeePerformanceModal} onClose={() => setShowEmployeePerformanceModal(false)} title="员工表现详情" size="xl" mobileFullScreen>
        <div className="space-y-6 pb-4">
          {performanceSections.map((section) => (
            <section key={section.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{section.title}</span>
                <span className="text-xs text-gray-400">
                  {section.target === 'projects' ? '点击进入工地列表' : '点击进入客户列表'}
                </span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              {section.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">暂无数据</div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                  {section.items.map((item: any, idx) => {
                    const rate = section.target === 'projects' ? item.onTimeRate : item.rate;
                    const primaryCount = section.target === 'projects' ? item.projectCount : item.total;
                    const secondaryCount = section.target === 'projects' ? item.logCount : item.signed;
                    const tertiaryCount = section.target === 'projects' ? item.completedSubNodes : `${item.rate}%`;
                    return (
                      <button
                        key={`${section.key}-${item.name}`}
                        type="button"
                        onClick={() => {
                          setShowEmployeePerformanceModal(false);
                          openEmployeeWorkList(section.target, item.name);
                        }}
                        className="grid w-full grid-cols-[34px_minmax(0,1fr)_58px_58px_58px] items-center gap-2 border-b border-gray-50 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50 active:bg-gold-50/40 md:grid-cols-[42px_minmax(0,1fr)_90px_90px_90px_82px]"
                      >
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${idx < 3 ? 'bg-amber-100 text-amber-600' : 'bg-gray-50 text-gray-500'}`}>
                          {idx + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-gray-900">{item.name}</span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, rate)}%` }} />
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-[10px] text-gray-400">{section.target === 'projects' ? '工地' : '客户'}</span>
                          <span className="block text-sm font-semibold text-gray-800">{primaryCount}</span>
                        </span>
                        <span className="text-right">
                          <span className="block text-[10px] text-gray-400">{section.target === 'projects' ? '日志' : '签单'}</span>
                          <span className="block text-sm font-semibold text-gray-800">{secondaryCount}</span>
                        </span>
                        <span className="text-right">
                          <span className="block text-[10px] text-gray-400">{section.target === 'projects' ? '节点' : '转化'}</span>
                          <span className={`block text-sm font-bold ${rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-gray-500'}`}>
                            {tertiaryCount}
                          </span>
                        </span>
                        <span className={`hidden text-right text-sm font-bold md:block ${rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {rate}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </Modal>
    </div>
  );
}
