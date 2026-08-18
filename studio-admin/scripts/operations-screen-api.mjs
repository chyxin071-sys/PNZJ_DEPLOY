import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axios = require('axios');

// Cloud Hosting itself does not contain the ERP collections. Prefer the
// explicitly configured mini-program CloudBase environment.
const ENV_ID = process.env.NEXT_PUBLIC_TCB_ENV_ID
  || process.env.TCB_ENV_ID
  || process.env.CLOUDBASE_ENV_ID
  || 'cloud1-8grodf5s3006f004';
const WECHAT_APPID = process.env.WECHAT_APPID || '';
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET || '';
const PAIRINGS = 'erp_operation_screen_pairings';
const DEVICES = 'erp_operation_screen_devices';
const PAIRING_TTL_MS = 5 * 60 * 1000;
const pairingRateLimits = new Map();
let screenDataCache = null;
let screenDataBuildPromise = null;
let cachedAccessToken = '';
let accessTokenExpiresAt = 0;

function wechatApiBaseUrl() {
  return process.env.CBR_ENV_ID || process.env.KUBERNETES_SERVICE_HOST
    ? 'http://api.weixin.qq.com'
    : 'https://api.weixin.qq.com';
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && cachedAccessToken && Date.now() < accessTokenExpiresAt) {
    return cachedAccessToken;
  }
  if (!WECHAT_APPID || !WECHAT_APPSECRET) {
    throw new Error('WECHAT_CONFIG_MISSING');
  }
  const response = await axios.get(`${wechatApiBaseUrl()}/cgi-bin/token`, {
    params: {
      grant_type: 'client_credential',
      appid: WECHAT_APPID,
      secret: WECHAT_APPSECRET,
    },
    timeout: 8_000,
  });
  if (!response.data?.access_token) {
    throw new Error(`WECHAT_TOKEN_FAILED:${response.data?.errcode || 'unknown'}`);
  }
  cachedAccessToken = response.data.access_token;
  accessTokenExpiresAt = Date.now() + Math.max(60, Number(response.data.expires_in || 7200) - 600) * 1000;
  return cachedAccessToken;
}

async function requestCloudDatabase(action, query, retry = true) {
  const accessToken = await getAccessToken();
  const response = await axios.post(
    `${wechatApiBaseUrl()}/tcb/${action}`,
    { env: ENV_ID, query },
    { params: { access_token: accessToken }, timeout: 12_000 },
  );
  const data = response.data || {};
  if (retry && [40001, 40014, 42001].includes(Number(data.errcode))) {
    cachedAccessToken = '';
    accessTokenExpiresAt = 0;
    return requestCloudDatabase(action, query, false);
  }
  if (Number(data.errcode || 0) !== 0) {
    throw new Error(`TCB_${action.toUpperCase()}_${data.errcode}:${data.errmsg || 'unknown error'}`);
  }
  return data;
}

function parseQueryRecords(records) {
  return (records || []).map((record) => {
    if (typeof record !== 'string') return record;
    try {
      return JSON.parse(record);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function queryValue(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

class CloudDatabaseCollection {
  constructor(name) {
    this.name = name;
    this.filter = null;
    this.documentId = '';
    this.queryLimit = 100;
    this.querySkip = 0;
  }

  where(filter) {
    this.filter = filter;
    return this;
  }

  doc(id) {
    this.documentId = String(id || '');
    return this;
  }

  limit(limit) {
    this.queryLimit = Math.max(1, Math.min(100, Number(limit) || 100));
    return this;
  }

  skip(skip) {
    this.querySkip = Math.max(0, Number(skip) || 0);
    return this;
  }

  baseQuery() {
    let query = `db.collection(${queryValue(this.name)})`;
    if (this.documentId) return `${query}.doc(${queryValue(this.documentId)})`;
    if (this.filter) query += `.where(${queryValue(this.filter)})`;
    if (this.querySkip) query += `.skip(${this.querySkip})`;
    return `${query}.limit(${this.queryLimit})`;
  }

  async get() {
    const data = await requestCloudDatabase('databasequery', `${this.baseQuery()}.get()`);
    return { data: parseQueryRecords(data.data) };
  }

  async add(record) {
    return requestCloudDatabase(
      'databaseadd',
      `db.collection(${queryValue(this.name)}).add({data:${queryValue(record)}})`,
    );
  }

  async update(record) {
    if (!this.documentId && !this.filter) throw new Error('TCB_UPDATE_TARGET_MISSING');
    return requestCloudDatabase('databaseupdate', `${this.baseQuery()}.update({data:${queryValue(record)}})`);
  }
}

const restDb = {
  collection(name) {
    return new CloudDatabaseCollection(name);
  },
};

function getDb() {
  return restDb;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 64 * 1024) throw new Error('请求内容过大');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
}

function normalizeRoles(record) {
  const roles = Array.isArray(record?.roles) ? record.roles : [record?.role];
  return roles.filter(Boolean).map(String);
}

async function findUser(db, userId) {
  if (!userId) return null;
  try {
    const result = await db.collection('users').doc(userId).get();
    if (result?.data) return Array.isArray(result.data) ? result.data[0] : result.data;
  } catch {
    // Older user records may use a generated document id and store `id` separately.
  }
  const byId = await db.collection('users').where({ id: userId }).limit(1).get();
  if (byId?.data?.[0]) return byId.data[0];
  const byAccount = await db.collection('users').where({ account: userId }).limit(1).get();
  return byAccount?.data?.[0] || null;
}

async function requireAdmin(req, res, db) {
  const userId = String(req.headers['x-erp-user-id'] || '').trim();
  const authVersion = String(req.headers['x-erp-auth-version'] || '').trim();
  const user = await findUser(db, userId);
  if (!user || user.status === 'inactive' || !normalizeRoles(user).includes('admin')) {
    sendJson(res, 403, { success: false, message: '仅管理员可以管理大屏设备' });
    return null;
  }
  if (user.authVersion && user.authVersion !== authVersion) {
    sendJson(res, 401, { success: false, message: '账号信息已更新，请重新登录后操作' });
    return null;
  }
  return user;
}

async function getAll(db, collection, limit = 1000) {
  const records = [];
  const pageSize = 100;
  while (records.length < limit) {
    const result = await db.collection(collection).skip(records.length).limit(Math.min(pageSize, limit - records.length)).get();
    const page = result?.data || [];
    records.push(...page);
    if (page.length < pageSize) break;
  }
  return records;
}

function hasStarted(item) {
  if (!item) return false;
  return ['current', 'in_progress', 'completed', 'awaiting_signature'].includes(String(item.status || ''))
    || item.submitted || item.actualStartDate || item.startedAt || item.submitTime || item.updateTime
    || item.acceptanceRecord?.startedAt || item.acceptanceRecord?.completedAt
    || Boolean(item.acceptanceRecord?.photos?.length);
}

function isCompleted(item) {
  return Boolean(item && (['completed', 'awaiting_signature'].includes(String(item.status || '')) || item.submitted));
}

function progressForProject(project) {
  const nodes = Array.isArray(project?.nodesData) ? project.nodesData : [];
  const stages = nodes.map((node, index) => {
    let total = 0;
    let completed = 0;
    let progressed = 0;
    let started = hasStarted(node);
    for (const section of node?.sections || []) {
      const subs = Array.isArray(section?.subNodes) ? section.subNodes : [];
      const sectionDone = isCompleted(section);
      started ||= hasStarted(section);
      const checks = subs.length > 0 ? subs : [section];
      for (const check of checks) {
        total += 1;
        if (sectionDone || isCompleted(check)) completed += 1;
        if (sectionDone || hasStarted(check)) progressed += 1;
        started ||= hasStarted(check);
      }
    }
    return {
      name: String(node?.name || `阶段${index + 1}`),
      status: total > 0 && completed >= total ? 'completed' : (completed > 0 || started ? 'current' : 'pending'),
      total,
      completed,
      progressed,
    };
  });
  let currentIndex = stages.reduce((last, stage, index) => stage.status !== 'pending' ? index : last, -1);
  if (currentIndex < 0 && stages.length > 0) currentIndex = 0;
  const total = stages.reduce((sum, stage) => sum + stage.total, 0);
  const progressed = stages.reduce((sum, stage) => sum + stage.progressed, 0);
  const completed = stages.reduce((sum, stage) => sum + stage.completed, 0);
  const completedProject = ['已完工', 'completed', 'finished'].includes(String(project?.status || project?.projectStatus || ''));
  return {
    progress: completedProject ? 100 : (total > 0 ? Math.min(completed >= total ? 100 : 99, Math.round(progressed / total * 100)) : 0),
    currentStage: completedProject ? '已完工' : (stages[currentIndex]?.name || '待开工'),
    nextStage: completedProject ? '-' : (stages[currentIndex + 1]?.name || '-'),
  };
}

function projectStatus(project, progress) {
  const raw = String(project?.status || project?.projectStatus || '');
  if (['已完工', 'completed', 'finished'].includes(raw) || progress >= 100) return '已完工';
  if (['已暂停', 'paused'].includes(raw)) return '已暂停';
  if (['未开工', 'pending', 'not_started'].includes(raw)) return '未开工';
  return '施工中';
}

function projectPeople(project) {
  const values = [project?.manager, project?.projectManager, project?.sales, project?.designer, project?.engineer];
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).map((value) => (
    typeof value === 'object' ? value.name : String(value)
  )))].slice(0, 4);
}

function linkedProjectId(todo) {
  if (todo?.relatedTo?.type === 'project') return String(todo.relatedTo.id || '');
  return String(todo?.projectId || '');
}

async function buildScreenData(db) {
  const [leads, projects, todos, workers, schedules] = await Promise.all([
    getAll(db, 'leads'),
    getAll(db, 'projects'),
    getAll(db, 'todos'),
    getAll(db, 'erp_workers'),
    getAll(db, 'erp_worker_schedules'),
  ]);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const isCurrentPeriod = (value, withMonth = false) => {
    const date = new Date(value || 0);
    return !Number.isNaN(date.getTime())
      && date.getFullYear() === currentYear
      && (!withMonth || date.getMonth() === currentMonth);
  };
  const teamLeads = leads.filter((lead) => !lead._placeholder);
  const yearLeads = teamLeads.filter((lead) => isCurrentPeriod(lead.createdAt));
  const yearProjects = projects.filter((project) => !project._placeholder && isCurrentPeriod(project.createdAt));
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const inSevenDays = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const activeTodos = todos.filter((todo) => todo.status !== 'completed');
  const pendingByProject = activeTodos.reduce((map, todo) => {
    const id = linkedProjectId(todo);
    if (id) map.set(id, (map.get(id) || 0) + 1);
    return map;
  }, new Map());
  const overdueTodos = activeTodos.filter((todo) => todo.dueDate && todo.dueDate < todayKey).length;

  const safeProjects = projects.map((project) => {
    const id = String(project._id || project.id || '');
    const progress = progressForProject(project);
    const status = projectStatus(project, progress.progress);
    return {
      id,
      address: String(project.address || '未填写地址'),
      status,
      progress: progress.progress,
      currentStage: progress.currentStage,
      nextStage: progress.nextStage,
      startDate: String(project.actualStartDate || project.startDate || project.constructionStartDate || ''),
      expectedEndDate: String(project.expectedEndDate || project.endDate || ''),
      people: projectPeople(project),
      pendingTodos: pendingByProject.get(id) || 0,
      updatedAt: String(project.updatedAt || project.updateTime || project.createdAt || ''),
    };
  });
  const activeProjects = safeProjects.filter((project) => !['已完工', '已暂停'].includes(project.status));

  const workerMap = new Map(workers.map((worker) => [String(worker._id || worker.id || ''), worker]));
  const upcomingSchedules = schedules
    .filter((item) => !['completed', 'cancelled'].includes(item.status) && item.endDate >= todayKey && item.startDate <= inSevenDays)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
    .slice(0, 10)
    .map((item) => ({
      id: String(item._id || item.id || ''),
      workerName: String(workerMap.get(String(item.workerId))?.name || item.workerName || '未指定工人'),
      projectAddress: String(item.projectAddress || '未填写工地'),
      stageName: String(item.stageName || item.trade || ''),
      startDate: String(item.startDate || ''),
      endDate: String(item.endDate || ''),
      status: String(item.status || 'planned'),
    }));

  const stageDistribution = Object.entries(activeProjects.reduce((map, project) => {
    map[project.currentStage] = (map[project.currentStage] || 0) + 1;
    return map;
  }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalCustomers: yearLeads.length,
      monthCustomers: yearLeads.filter((lead) => isCurrentPeriod(lead.createdAt, true)).length,
      signedCustomers: yearLeads.filter((lead) => lead.status === '已签单').length,
      lostCustomers: yearLeads.filter((lead) => lead.status === '已流失').length,
      totalProjects: yearProjects.length,
      activeProjects: activeProjects.length,
      updatedToday: safeProjects.filter((project) => project.updatedAt.startsWith(todayKey)).length,
      pendingTodos: activeTodos.length,
      overdueTodos,
      arrivalsNext7Days: upcomingSchedules.filter((item) => item.startDate >= tomorrow).length,
    },
    projects: activeProjects.sort((a, b) => {
      const updatedA = new Date(a.updatedAt || 0).getTime() || 0;
      const updatedB = new Date(b.updatedAt || 0).getTime() || 0;
      return updatedB - updatedA || a.address.localeCompare(b.address, 'zh-CN');
    }),
    stageDistribution,
    schedules: upcomingSchedules,
  };
}

async function getScreenData(db) {
  if (screenDataCache && Date.now() - screenDataCache.createdAt < 4_000) return screenDataCache.data;
  if (!screenDataBuildPromise) {
    screenDataBuildPromise = buildScreenData(db)
      .then((data) => {
        screenDataCache = { createdAt: Date.now(), data };
        return data;
      })
      .finally(() => { screenDataBuildPromise = null; });
  }
  return screenDataBuildPromise;
}

async function findPairingByCode(db, code) {
  const result = await db.collection(PAIRINGS).where({ code, status: 'pending' }).limit(1).get();
  return result?.data?.[0] || null;
}

async function createPairing(db) {
  let code = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    code = String(randomInt(100000, 1000000));
    const existing = await findPairingByCode(db, code);
    if (!existing) break;
  }
  const pairingId = makeId('pair');
  const now = new Date();
  const record = {
    _id: pairingId,
    code,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PAIRING_TTL_MS).toISOString(),
  };
  await db.collection(PAIRINGS).add(record);
  return record;
}

function canCreatePairing(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key = forwarded || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (pairingRateLimits.get(key) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 10) return false;
  recent.push(now);
  pairingRateLimits.set(key, recent);
  return true;
}

async function authenticateDevice(req, res, db) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    sendJson(res, 401, { success: false, code: 'DEVICE_AUTH_REQUIRED' });
    return null;
  }
  const result = await db.collection(DEVICES).where({ tokenHash: hash(token), status: 'active' }).limit(1).get();
  const device = result?.data?.[0] || null;
  if (!device) {
    sendJson(res, 401, { success: false, code: 'DEVICE_REVOKED' });
    return null;
  }
  return device;
}

export async function handleOperationsScreenApi(req, res, url) {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/operations-screen/')) return false;

  try {
    const db = getDb();
    if (req.method === 'POST' && pathname === '/api/operations-screen/pairings') {
      if (!canCreatePairing(req)) {
        sendJson(res, 429, { success: false, message: '授权码生成过于频繁，请稍后再试' });
        return true;
      }
      const pairing = await createPairing(db);
      sendJson(res, 201, { success: true, pairingId: pairing._id, code: pairing.code, expiresAt: pairing.expiresAt });
      return true;
    }

    const pairingMatch = pathname.match(/^\/api\/operations-screen\/pairings\/([^/]+)$/);
    if (req.method === 'GET' && pairingMatch) {
      const result = await db.collection(PAIRINGS).doc(pairingMatch[1]).get();
      const pairing = Array.isArray(result?.data) ? result.data[0] : result?.data;
      if (!pairing) {
        sendJson(res, 404, { success: false, status: 'expired' });
        return true;
      }
      if (pairing.expiresAt < new Date().toISOString() && pairing.status === 'pending') {
        sendJson(res, 410, { success: false, status: 'expired' });
        return true;
      }
      if (pairing.status === 'approved' && pairing.deliveryToken) {
        sendJson(res, 200, { success: true, status: 'approved', deviceToken: pairing.deliveryToken });
        await db.collection(PAIRINGS).doc(pairing._id).update({ deliveryToken: '', status: 'delivered', deliveredAt: new Date().toISOString() });
        return true;
      }
      sendJson(res, 200, { success: true, status: pairing.status || 'pending' });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/operations-screen/approve') {
      const admin = await requireAdmin(req, res, db);
      if (!admin) return true;
      const body = await readJson(req);
      const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
      const pairing = await findPairingByCode(db, code);
      if (!pairing || pairing.expiresAt < new Date().toISOString()) {
        sendJson(res, 410, { success: false, message: '授权码已失效，请在大屏上重新生成' });
        return true;
      }
      const rawToken = randomBytes(32).toString('base64url');
      const deviceId = makeId('screen');
      const now = new Date().toISOString();
      await db.collection(DEVICES).add({
        _id: deviceId,
        name: String(body.name || '公司运营大屏').trim().slice(0, 30) || '公司运营大屏',
        tokenHash: hash(rawToken),
        status: 'active',
        approvedBy: String(admin._id || admin.id || ''),
        approvedByName: String(admin.name || ''),
        createdAt: now,
        lastSeenAt: '',
      });
      await db.collection(PAIRINGS).doc(pairing._id).update({
        status: 'approved',
        approvedAt: now,
        deviceId,
        deliveryToken: rawToken,
      });
      sendJson(res, 200, { success: true, message: '大屏已授权' });
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/operations-screen/devices') {
      const admin = await requireAdmin(req, res, db);
      if (!admin) return true;
      const devices = (await getAll(db, DEVICES)).map((device) => ({
        id: String(device._id || ''),
        name: String(device.name || '运营大屏'),
        status: String(device.status || 'active'),
        approvedByName: String(device.approvedByName || ''),
        createdAt: String(device.createdAt || ''),
        lastSeenAt: String(device.lastSeenAt || ''),
      })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      sendJson(res, 200, { success: true, devices });
      return true;
    }

    const revokeMatch = pathname.match(/^\/api\/operations-screen\/devices\/([^/]+)\/revoke$/);
    if (req.method === 'POST' && revokeMatch) {
      const admin = await requireAdmin(req, res, db);
      if (!admin) return true;
      await db.collection(DEVICES).doc(revokeMatch[1]).update({ status: 'revoked', revokedAt: new Date().toISOString() });
      sendJson(res, 200, { success: true });
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/operations-screen/data') {
      const device = await authenticateDevice(req, res, db);
      if (!device) return true;
      const now = new Date().toISOString();
      const lastSeen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
      if (!lastSeen || Date.now() - lastSeen > 5 * 60 * 1000) {
        await db.collection(DEVICES).doc(device._id).update({ lastSeenAt: now });
      }
      sendJson(res, 200, { success: true, data: await getScreenData(db) });
      return true;
    }

    sendJson(res, 404, { success: false, message: '接口不存在' });
    return true;
  } catch (error) {
    console.error('[operations-screen]', error);
    sendJson(res, 500, { success: false, message: '运营大屏服务暂时不可用' });
    return true;
  }
}
